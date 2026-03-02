// src/server/config/setupDev.ts

import validcheckmates from '../../shared/chess/util/validcheckmates.js';

import { giveRole } from '../controllers/roles.js';
import { generateAccount } from '../controllers/createAccountController.js';
import { ensureSelfSignedCertificate } from './generateCert.js';
import { isUsernameTaken, updateMemberColumns } from '../database/memberManager.js';

import 'dotenv/config'; // Imports all properties of process.env, if it exists

export function initDevEnvironment(): void {
	if (process.env['NODE_ENV'] === 'production') return;

	ensureSelfSignedCertificate();

	ensureDevelopmentAccounts();

	// Display the url to the page
	console.log(`Local website is hosted at https://localhost:${process.env['HTTPSPORT_LOCAL']}/`);
}

async function ensureDevelopmentAccounts(): Promise<void> {
	if (!isUsernameTaken('owner')) {
		const user_id = await generateAccount({
			username: 'Owner',
			email: 'email1',
			password: '1',
			autoVerify: true,
		});
		giveRole(user_id, 'owner');
		giveRole(user_id, 'admin');

		// Give Owner checkmate progression for debugging purposes
		// Bronze
		// const checkmates_beaten = Object.values(validcheckmates.validCheckmates.easy).toString()
		// 	+ "," + Object.values(validcheckmates.validCheckmates.medium).toString();
		// Silver
		// const checkmates_beaten = Object.values(validcheckmates.validCheckmates.easy).toString()
		// 	+ "," + Object.values(validcheckmates.validCheckmates.medium).toString()
		// 	+ "," + Object.values(validcheckmates.validCheckmates.hard).toString();
		// Gold
		const checkmates_beaten = Object.values(validcheckmates.validCheckmates).flat().join(',');
		updateMemberColumns(user_id, { checkmates_beaten });
	}
	if (!isUsernameTaken('admin')) {
		const user_id = await generateAccount({
			username: 'Admin',
			email: 'email5',
			password: '1',
			autoVerify: true,
		});
		giveRole(user_id, 'admin');
	}
	if (!isUsernameTaken('patron')) {
		const user_id = await generateAccount({
			username: 'Patron',
			email: 'email2',
			password: '1',
			autoVerify: true,
		});
		giveRole(user_id, 'patron');
	}
	if (!isUsernameTaken('member')) {
		await generateAccount({
			username: 'Member',
			email: 'email3',
			password: '1',
			autoVerify: true,
		});
	}

	// Populate leaderboard with dummy accounts for testing
	// for (let i = 0; i < 230; i++) {
	// 	if (!doesMemberOfUsernameExist(`Player${i}`)) {
	// 		const user_id = (await generateAccount({ username: `Player${i}`, email: `playeremail${i}`, password: "1", autoVerify: true })).user_id;
	// 		addUserToLeaderboard(user_id, Leaderboards.INFINITY);
	// 		updatePlayerLeaderboardRating(user_id, Leaderboards.INFINITY, 1800 - 10 * i, 100 + i);
	// 	}
	// }
}
