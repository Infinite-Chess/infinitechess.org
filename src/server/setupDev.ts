// src/server/setupDev.ts

/**
 * Development-environment bootstrap: seeds local dev/test accounts (owner/admin/patron/member)
 * and prints the local URL. No-ops in production.
 */

import validcheckmates from '../shared/chess/util/validcheckmates.js';

import roles from './controllers/roles.js';
import memberManager from './database/memberManager.js';
import accountSeeder from './controllers/accountSeeder.js';

import 'dotenv/config'; // Imports all properties of process.env, if it exists

// Functions -------------------------------------------------------------------

/** Seeds the dev accounts and prints the local URL. Does nothing in production. */
function init(): void {
	if (process.env['NODE_ENV'] === 'production') return;

	ensureDevelopmentAccounts();

	// Display the url to the page
	console.log(`Local website is hosted at https://localhost:${process.env['HTTPSPORT_LOCAL']}/`);
}

/** Creates the standard development accounts (idempotent). */
async function ensureDevelopmentAccounts(): Promise<void> {
	if (!memberManager.isUsernameTaken('owner')) {
		const user_id = await accountSeeder.generate({
			username: 'Owner',
			email: '4@gmail.com',
			password: '1',
		});
		roles.add(user_id, 'owner');
		roles.add(user_id, 'admin');

		// Give Owner checkmate progression for debugging purposes
		// Bronze
		// const checkmates_beaten = Object.values(validcheckmates.VALID_CHECKMATES.easy).toString()
		// 	+ "," + Object.values(validcheckmates.VALID_CHECKMATES.medium).toString();
		// Silver
		// const checkmates_beaten = Object.values(validcheckmates.VALID_CHECKMATES.easy).toString()
		// 	+ "," + Object.values(validcheckmates.VALID_CHECKMATES.medium).toString()
		// 	+ "," + Object.values(validcheckmates.VALID_CHECKMATES.hard).toString();
		// Gold
		const checkmates_beaten = Object.values(validcheckmates.VALID_CHECKMATES).flat().join(',');
		memberManager.updateColumns(user_id, { checkmates_beaten });
	}
	if (!memberManager.isUsernameTaken('admin')) {
		const user_id = await accountSeeder.generate({
			username: 'Admin',
			email: '3@gmail.com',
			password: '1',
		});
		roles.add(user_id, 'admin');
	}
	if (!memberManager.isUsernameTaken('patron')) {
		const user_id = await accountSeeder.generate({
			username: 'Patron',
			email: '2@gmail.com',
			password: '1',
		});
		roles.add(user_id, 'patron');
	}
	if (!memberManager.isUsernameTaken('member')) {
		await accountSeeder.generate({
			username: 'Member',
			email: '1@gmail.com',
			password: '1',
		});
	}
}

// Exports ---------------------------------------------------------------------

export default { init };
