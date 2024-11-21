import { refreshTokenExpiryMillis } from '../config/config.js';
import { logEvents } from '../middleware/logEvents.js';
import { readFile } from '../utility/lockFile.js';
import db from './database.js';
import { genUniqueUserID } from './memberManager.js';

'use strict';

async function migrateUsers() {
	// The table looks like:
	// CREATE TABLE IF NOT EXISTS members (
	// 	user_id INTEGER PRIMARY KEY,
	// 	username TEXT UNIQUE NOT NULL COLLATE NOCASE,
	// 	email TEXT UNIQUE NOT NULL,
	// 	hashed_password TEXT NOT NULL,
	// 	roles TEXT,
	// 	joined TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	// 	refresh_tokens TEXT,
	// 	preferences TEXT,
	// 	verification TEXT,
	// 	login_count INTEGER DEFAULT 1,
	// 	last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	// );

	// Declare variables to hold the values
	const members = (await readFile('./database/members.json', 'Unable to read members.json on startup.') ?? null);
	if (members === null) {
		return false;
	}
	console.log(members);
	for (let memberObj of Object.entries(members)) {
		const member = memberObj[1];

		let user_id;
		let username;
		let email;
		let hashed_password;
		let joined;
		let verification;
		let login_count;
		let last_seen;
		let refresh_tokens = member['refreshTokens'];

		username = member['username'];
		email = member['email'];
		hashed_password = member['password'];
		joined = new Date(member['joined']);
		last_seen = new Date(member['seen']);

		refresh_tokens.forEach(function (value, index, array) {
			let currentDate = new Date(Date.now());
			value = { token: value, issued: currentDate, expires: new Date(currentDate.valueOf() + refreshTokenExpiryMillis) };
		});

		login_count = member['logins'];
		verification = member['verified'] ? { verified: member['verified'][0], notified: member['verified'][0], code: member['verified'][1] }
			: { verified: false, notified: false, code: "" };
		verification = JSON.stringify(verification);
		refresh_tokens = JSON.stringify(refresh_tokens);
		joined = joined.toString();
		last_seen = last_seen.toString();

		user_id = genUniqueUserID();

		// SQL query to insert a new user into the 'members' table
		const query = `
	INSERT INTO members (
	user_id,
	username,
	email,
	hashed_password,
	joined,
	verification,
	login_count,
	last_seen,
	refresh_tokens
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`;

		try {
			// Execute the query with the provided values
			db.run(query, [user_id, username, email, hashed_password, joined, verification, login_count, last_seen, refresh_tokens]); // { changes: 1, lastInsertRowid: 7656846 }


		} catch (error) {
			// Log the error for debugging purposes
			logEvents(`Error adding user "${username}": ${error.message}`, 'errLog.txt', { print: true });

			// Return an error message 
		}
	}
	return true;
}

export {
	migrateUsers
};