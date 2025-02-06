/*
 * Validates an email address to see if it can recieve the verification emails. 
 */

// @ts-ignore
import emailValidator from 'node-email-verifier';

/**
 * Checks an adress's MX records yo see if it can recieve mail
 * 
 * @param {string} email the email to verify
 * @returns {boolean | undefined} returns wether the email can recieve messages (undefined if error)
 */
async function canEmailRecieveMail(email: string): Promise<boolean> {
	try {
		const isValid = await emailValidator(email, { checkMx: true });
		return isValid;
	} catch (error) {
		console.error('Error validating email with MX checking, defaulting to true', error);
	}
	return true; // here we default to true because we don't want users to be locked out of creating accounts.
};

export {
	canEmailRecieveMail
};