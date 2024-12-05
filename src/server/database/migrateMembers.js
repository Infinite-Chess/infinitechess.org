import { readFileSync } from 'fs';
import { logEvents } from '../middleware/logEvents.js';
import db from './database.js';
import { genUniqueUserID } from './memberManager.js';
import timeutil from '../../client/scripts/esm/util/timeutil.js';
import { addTokenToRefreshTokens } from '../controllers/authenticationTokens/refreshTokenObject.js';

'use strict';

function migrateUsers() {
	// The table looks like:
	// CREATE TABLE IF NOT EXISTS members (
	// 	user_id INTEGER PRIMARY KEY,               
	// 	username TEXT UNIQUE NOT NULL COLLATE NOCASE,
	// 	email TEXT UNIQUE NOT NULL,                
	// 	hashed_password TEXT NOT NULL,             
	// 	roles TEXT,        
	// 	joined TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	// 	last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,                         
	// 	login_count INTEGER NOT NULL DEFAULT 0,                        
	// 	preferences TEXT,
	// 	refresh_tokens TEXT,                          
	// 	verification TEXT, 
	// 	username_history TEXT
	// );

	console.log("Migrating members to SQLite database...");

	let members;
	try {
		// Attempt to read and parse the members.json file
		members = JSON.parse(readFileSync('./database/members.json'));
	} catch (error) {
		// Catch any errors and log them
		console.error("Error reading or parsing members.json:", error.message);
	}

	if (members === undefined) {
		console.error("Unable to migrate members, unable to read members.json file.");
		return;
	}
	// console.log(members);


	for (const member of Object.values(members)) {

		// What members look like in the members.json file:

		// "naviaryfan101": {
		// 		"username": "NaviaryFan101",
		// 		"email": "testemail5@test.com",
		// 		"password": "$2b$10$pwL574b4364SGcy6RG6VgubimAtM1ueoODhW1prU9KjP3BoGGJAru",
		// 		"refreshTokens": [
		// 			"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6Im5hdmlhcnlmYW4xMDEiLCJpYXQiOjE3MzE4OTEwOTgsImV4cCI6MTczMjMyMzA5OH0.34C2Fh5q4VS2DsFHtpoXZMYtd3592pZxjkPwBfuXPws"
		// 		],
		// 		"joined": "2024-11-18T00:51:38.081Z",
		// 		"logins": 1,
		// 		"seen": "2024-11-18T00:51:38.199Z",
		// 		"elo": 1200,
		// 		"verified": [
		// 			false,
		// 			"zsfip9y5lcpuo4wjhd8h5mb9"
		// 		]
		// }

		const user_id = genUniqueUserID();
		// eslint-disable-next-line prefer-const
		let { username, email, password: hashed_password, refreshTokens, joined, seen: last_seen, logins: login_count, verified } = member;

		// Convert each of them to the correct format...
		joined = timeutil.isoToSQLite(joined);
		last_seen = timeutil.isoToSQLite(last_seen);

		let refresh_tokens = [];
		refreshTokens.forEach(oldToken => {
			// This function already exists, sorry about that >.<
			// THIS WILL NO LONGER WORK WITHOUT THE REQUEST OBJECT PROVIDED!!
			// addTokenToRefreshTokens(undefined, refresh_tokens, oldToken);
		});
		if (refreshTokens.length === 0) refreshTokens = null;
		refresh_tokens = refreshTokens === null ? null : JSON.stringify(refresh_tokens);

		// A modern verification object looks like: { verified (bool), notified (bool), code }.
		let verification = verified === undefined ? undefined : {
			verified: verified[0],
			notified: verified[0] ? false : undefined,
			code: verified[0] ? undefined : verified[1],
		};
		verification = JSON.stringify(verification);



		// SQL query to insert a new user into the 'members' table
		const query = `
			INSERT INTO members (
			user_id,
			username,
			email,
			hashed_password,
			joined,
			last_seen,
			login_count,
			refresh_tokens,
			verification
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`;

		try {
			// Execute the query with the provided values
			db.run(query, [user_id, username, email, hashed_password, joined, last_seen, login_count, refresh_tokens, verification]); // { changes: 1, lastInsertRowid: 7656846 }

		} catch (error) {
			// Log the error for debugging purposes
			logEvents(`Error migrating user "${username}": ${error.message}`, 'errLog.txt', { print: true });
			console.error("STOPPED migrating all users. Please fix the error above.");
			return;
		}
	}

	console.log("Finished migrating all users!");
}

export {
	migrateUsers
};