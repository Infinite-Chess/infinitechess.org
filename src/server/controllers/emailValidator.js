/*
 * Validates an email address to see if it can recieve the verification emails. 
 */

import emailValidator from 'node-email-verifier';

/**
 * Checks an adress's MX records yo see if it can recieve mail
 * 
 * @param {string} email the email to verify
 * @returns {boolean | undefined} returns wether the email can recieve messages (undefined if error)
 */
async function canEmailRecieveMail(email) {
	try {
		const isValid = await emailValidator(email, { checkMx: true });
		return isValid;
	} catch (error) {
		console.error('Error validating email with MX checking:', error);
	}
};

export {
	canEmailRecieveMail
};