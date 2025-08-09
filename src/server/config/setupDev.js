import { DEV_BUILD } from './config.js';
import { ensureSelfSignedCertificate } from './generateCert.js';
import { doesMemberOfUsernameExist, updateMemberColumns } from '../database/memberManager.js';
import { generateAccount } from '../controllers/createAccountController.js';
import { giveRole } from '../controllers/roles.js';
import validcheckmates from '../../client/scripts/esm/chess/util/validcheckmates.js';
import { addUserToLeaderboard, updatePlayerLeaderboardRating } from '../database/leaderboardsManager.js';
import { Leaderboards } from '../../client/scripts/esm/chess/variants/validleaderboard.js';

function initDevEnvironment() {
	if (!DEV_BUILD) return; // Production

	if (ensureSelfSignedCertificate()) { 
		// Let's also display the url to the page!
		// console.log(`Website is hosted at https://localhost:${process.env.HTTPSPORT_LOCAL}/`);
	}
	createDevelopmentAccounts();
}

async function createDevelopmentAccounts() {
	if (!doesMemberOfUsernameExist("owner")) {
		const user_id = (await generateAccount({ username: "Owner", email: "email1", password: "1", autoVerify: true })).user_id;
		giveRole(user_id, "owner");
		giveRole(user_id, "admin");

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
	if (!doesMemberOfUsernameExist("admin")) {
		const user_id = (await generateAccount({ username: "Admin", email: "email5", password: "1", autoVerify: true })).user_id;
		giveRole(user_id, "admin");
	}
	if (!doesMemberOfUsernameExist("patron")) {
		const user_id = (await generateAccount({ username: "Patron", email: "email2", password: "1", autoVerify: true })).user_id;
		giveRole(user_id, "patron");
	}
	if (!doesMemberOfUsernameExist("member")) {
		const user_id = (await generateAccount({ username: "Member", email: "email3", password: "1", autoVerify: true })).user_id;
	}

	// for (let i = 0; i < 230; i++) {
	// 	if (!doesMemberOfUsernameExist(`Player${i}`)) {
	// 		const user_id = (await generateAccount({ username: `Player${i}`, email: `playeremail${i}`, password: "1", autoVerify: true })).user_id;
	// 		addUserToLeaderboard(user_id, Leaderboards.INFINITY);
	// 		updatePlayerLeaderboardRating(user_id, Leaderboards.INFINITY, 1800 - 10 * i, 100 + i);
	// 	}
	// }
}


export {
	initDevEnvironment
};
