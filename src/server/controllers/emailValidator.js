/*
 * Validates an email address to see if it can recieve the verification emails. 
 */

import emailValidator from 'node-email-verifier';

async function canEmailRecieveMail(email) {
	console.log(`Checking "${email}" MX records to see if we cand send mail to it...`);
	try {
		const isValid = await emailValidator(email, { checkMx: true });
		console.log("Can we? ", isValid);
		return isValid;
	} catch (error) {
		console.error('Error validating email with MX checking:', error);
	}
};

export {
	canEmailRecieveMail
};