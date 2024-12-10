import { DEV_BUILD } from './config.js';
import { ensureSelfSignedCertificate } from './generateCert.js';
import { doesMemberOfUsernameExist } from '../database/memberManager.js';
import { generateAccount } from '../controllers/createAccountController.js';
import { giveRole } from '../controllers/roles.js';

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
		const user_id = await generateAccount({ username: "Owner", email: "email1", password: "1", autoVerify: true });
		giveRole(user_id, "owner");
		giveRole(user_id, "admin");
	}
	if (!doesMemberOfUsernameExist("patron")) {
		const user_id = await generateAccount({ username: "Patron", email: "email2", password: "1", autoVerify: true });
		giveRole(user_id, "patron");
	}
	if (!doesMemberOfUsernameExist("member")) {
		const user_id = await generateAccount({ username: "Member", email: "email3", password: "1", autoVerify: true });
	}
	// generateAccount({ username: "Member23", email: "email@teste3mail.com", password: "1", autoVerify: false });
}


export {
	initDevEnvironment
};
