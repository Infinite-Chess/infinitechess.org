
/*
 * This module handles create account form data,
 * verifying the data, creating the account,
 * and sending them a verification email.
 * 
 * It also answers requests for whether
 * a specific username or email is available.
 */


import { addUserToLeaderboard, Leaderboards } from '../database/ratingsManager.js';
import uuid from '../../client/scripts/esm/util/uuid.js';
// @ts-ignore
import bcrypt from 'bcrypt';
// @ts-ignore
import { getTranslationForReq } from '../utility/translate.js';
// @ts-ignore
import { isEmailBanned } from '../middleware/banned.js';
// @ts-ignore
import { logEvents } from '../middleware/logEvents.js';
// @ts-ignore
import { sendEmailConfirmation } from './sendMail.js';
// @ts-ignore
import { handleLogin } from './loginController.js';
// @ts-ignore
import { addUser, isEmailTaken, isUsernameTaken } from '../database/memberManager.js';
// @ts-ignore
import emailValidator from 'node-email-verifier';
// @ts-ignore
import { Request, Response } from 'express';
// @ts-ignore
import { addUserToPlayerStatsTable } from '../database/playerStatsManager.js';

// Variables -------------------------------------------------------------------------

/**
 * Usernames that are reserved. New members cannot use these are their name.
 * 
 * However, the following have been used:
 * admin
 */
const reservedUsernames: string[] = [
	'infinitechess',
	'support', 'infinitechesssupport',
	'administrator',
	'amazon', 'amazonsupport', 'aws', 'awssupport',
	'apple', 'applesupport',
	'microsoft', 'microsoftsupport',
	'google', 'googlesupport',
	'adobe', 'adobesupport',
	'youtube', 'facebook', 'tiktok', 'twitter', 'x', 'instagram', 'snapchat',
	'tesla', 'elonmusk', 'meta',
	'walmart', 'costco',
	'valve', 'valvesupport',
	'github',
	'nvidia', 'amd', 'intel', 'msi', 'tsmc', 'gigabyte',
	'roblox',
	'minecraft',
	'fortnite',
	'teamfortress2',
	'amongus', 'innersloth', 'henrystickmin',
	'halflife', 'halflife2', 'gordonfreeman',
	'epic', 'epicgames', 'epicgamessupport',
	'taylorswift', 'kimkardashian', 'tomcruise', 'keanureeves', 'morganfreeman', 'willsmith',
	'office', 'office365',
	'usa', 'america',
	'donaldtrump', 'joebiden'
];
/** Any username cannot contain these words */
const profainWords: string[] = [
	'fuck',
	'fuk',
	'shit',
	'piss',
	// 'ass', // Can't enable because "pass" wouldn't be allowed.
	'penis',
	'bitch',
	'bastard',
	'cunt',
	'penis',
	'vagina',
	'boob',
	'nigger',
	'niger',
	'pussy',
	'buthole',
	'butthole',
	'ohmygod',
	'poop'
];


// Functions -------------------------------------------------------------------------


/**
 * This route is called whenever the user clicks "Create Account"
 */
async function createNewMember(req: Request, res: Response): Promise<void> {
	if (!req.body) {
		console.log(`User sent a bad create account request missing the whole body!`);
		res.status(400).send(getTranslationForReq("server.javascript.ws-bad_request", req)); // 400 Bad request
		return;
	}
	// First make sure we have all 3 variables.
	// eslint-disable-next-line prefer-const
	let { username, email, password }: { username: string, email: string, password: string } = req.body;
	if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
		console.error('We received request to create new member without all supplied username, email, and password!');
		res.status(400).redirect('/400'); // Bad request
		return;
	}

	// Make the email lowercase, so we don't run into problems with seeing if capitalized emails are taken!
	email = email.toLowerCase();

	// First we make checks on the username...
	// These 'return's are so that we don't send duplicate responses, AND so we don't create the member anyway.
	if (!doUsernameFormatChecks(username, req, res)) return;
	if (!doEmailFormatChecks(email, req, res)) return;
	if (!doPasswordFormatChecks(password, req, res)) return;

	await generateAccount({ username, email, password }); // { success, result: { lastInsertRowid } }

	// Create new login session! They just created an account, so log them in!
	// This will handle our response/redirect too for us!
	handleLogin(req, res);
};

/**
 * Generate an account only from the provided username, email, and password.
 * Regex tests are skipped.
 * @returns If it was a success, the row ID of where the member was inserted. Parent is also the same as their user ID)
 */
async function generateAccount({ username, email, password, autoVerify = false }: { username: string, email: string, password: string, autoVerify?: boolean }): Promise<number | undefined> {
	// Use bcrypt to hash & salt password
	const hashedPassword = await bcrypt.hash(password, 10); // Passes 10 salt rounds. (standard)
	const verification = autoVerify ? undefined : JSON.stringify({ verified: false, code: uuid.generateID_Base62(8) });

	const membersResult = addUser(username, email, hashedPassword, { verification }); // { success, result: { lastInsertRowid } }
	if (!membersResult.success) {
		// Failure to create (username taken). If we do proper checks this point should NEVER happen. BUT THIS MAY STILL happen with async stuff, if they spam the create account button, because bcrypt is async.
		logEvents(`Failed to create new member "${username}".`, 'errLog.txt', { print: true });
		return;
	}
    
	// Add the newly created user to the leaderboards table
	const user_id = membersResult.result.lastInsertRowid;
	const ratingsResult = addUserToLeaderboard(user_id, Leaderboards.INFINITY);
	if (!ratingsResult.success) {
		logEvents(`Failed to add user "${username}" to the INFINITY leaderboard: ${ratingsResult.reason}`, 'errLog.txt', { print: true });
		return;
	}

	// Add the newly created user to the player_stats table
	const playerStatsResult = addUserToPlayerStatsTable(user_id);
	if (!playerStatsResult.success) {
		logEvents(`Failed to add user "${username}" to player_stats table: ${playerStatsResult.reason}`, 'errLog.txt', { print: true });
		return;
	}

	logEvents(`Created new member: ${username}`, 'newMemberLog.txt', { print: true });

	// SEND EMAIL CONFIRMATION
	if (!autoVerify) {
		const user_id = membersResult.result.lastInsertRowid;
		sendEmailConfirmation(user_id);
	}

	return membersResult.result.lastInsertRowid;
}

/**
 * Route that's called whenever the client unfocuses the email input field.
 * This tells them whether the email is valid or not.
 */

async function checkEmailValidity(req: Request, res: Response): Promise<void> {
	const lowercaseEmail = req.params['email']!.toLowerCase();

	if (isEmailTaken(lowercaseEmail)) {
		res.json({ "valid": false, "reason": getTranslationForReq('server.javascript.ws-email_in_use', req) });
		return;
	}
	if (!await isEmailDNSValid(lowercaseEmail)) {
		res.json({ "valid": false, "reason": getTranslationForReq('server.javascript.ws-email_domain_invalid', req) });
		return;
	}

	// Both checks pass
	res.json({ "valid": true });
}




/**
 * Route handler to check if a username is available to use (not taken, reserved, or baaaad word).
 * The request parameters MUST contain the username to test! (different from the body)
 * 
 * We send the client the object: `{ allowed: true, reason: '' } | { allowed: false, reason: string }`
 */
function checkUsernameAvailable(req: Request, res: Response): void {
	const username = req.params['username']!;
	const usernameLowercase = username.toLowerCase();

	let allowed = true;
	let reason = '';

	if (isUsernameTaken(username)) { allowed = false; reason = getTranslationForReq("server.javascript.ws-username_taken", req); }
	if (checkProfanity(usernameLowercase)) { allowed = false; reason = getTranslationForReq("server.javascript.ws-username_bad_word", req); }
	if (reservedUsernames.includes(usernameLowercase)) { allowed = false; reason = getTranslationForReq("server.javascript.ws-username_reserved", req); } // Code for reserved

	res.json({
		allowed,
		reason
	});
	return;
}

/** Returns true if the username passes all the checks required before account generation. */
function doUsernameFormatChecks(username: string, req: Request, res: Response): boolean {
	// First we check the username's length
	if (username.length < 3 || username.length > 20) {
		res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-username_length", req) });
		return false;
	}
	// Then the format
	if (!onlyLettersAndNumbers(username)) {
		res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-username_letters", req) });
		return false;
	}
	// Then check if the name's taken
	const usernameLowercase = username.toLowerCase();

	// Make sure the username isn't taken!!

	if (isUsernameTaken(username)) {
		res.status(409).json({ 'conflict': getTranslationForReq("server.javascript.ws-username_taken", req) });
		return false;
	}
	// Lastly check for profain words
	if (checkProfanity(usernameLowercase)) {
		res.status(409).json({ 'conflict': getTranslationForReq("server.javascript.ws-username_bad_word", req) });
		return false;
	}
	// Then check if the name's reserved
	if (reservedUsernames.includes(usernameLowercase)) {
		res.status(409).json({ 'conflict': getTranslationForReq("server.javascript.ws-username_taken", req) }); // Code for reserved (but the users don't know that!)
		return false;
	}

	return true; // Everything's good, no conflicts!
};

function onlyLettersAndNumbers(string: string): boolean {
	if (!string) return true;
	return /^[a-zA-Z0-9]+$/.test(string);
};

// Returns true if bad word is found
function checkProfanity(string: string): boolean {
	for (const profanity of profainWords) {
		if (string.includes(profanity)) return true;
	}
	return false;
};

/** Returns true if the email passes all the checks required for account generation. */
function doEmailFormatChecks(string: string, req: Request, res: Response): boolean {
	if (string.length > 320) {
		res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-email_too_long", req) }); // Max email length
		return false;
	}
	if (!isValidEmail(string)) {
		res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-email_invalid", req) });
		return false;
	}
	if (isEmailTaken(string)) {
		res.status(409).json({ 'conflict': getTranslationForReq("server.javascript.ws-email_in_use", req) });
		return false;
	}
	if (isEmailBanned(string)) {
		const errMessage = `Banned user with email ${string} tried to recreate their account!`;
		logEvents(errMessage, 'bannedIPLog.txt', { print: true });
		res.status(409).json({ 'conflict': getTranslationForReq("server.javascript.ws-you_are_banned", req) });
		return false;
	}
	if (!isEmailDNSValid(string)) {
		res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-email_domain_invalid", req) });
		return false;
	}
	return true;
};

function isValidEmail(string: string): boolean {
	// Credit for the regex: https://stackoverflow.com/a/201378
	// eslint-disable-next-line no-control-regex
	const regex = /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;
	return regex.test(string);
};

/**
 * Checks an email address's MX records to see if it is valid
 */
async function isEmailDNSValid(email: string): Promise<boolean> {
	try {
		return await emailValidator(email, { checkMx: true });
	} catch (error) {
		const err = error as Error; // Type assertion
		logEvents(`Error when validating domain for email "${email}": ${err.stack}`, 'errLog.txt', { print: true });
		return true; // Default to true to avoid blocking users.
	}
}

function doPasswordFormatChecks(password: string, req: Request, res: Response): boolean {
	// First we check password length
	if (password.length < 6 || password.length > 72) {
		res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-password_length", req) });
		return false;
	}
	if (!isValidPassword(password)) {
		res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-password_format", req) });
		return false;
	}
	if (password.toLowerCase() === 'password') {
		res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-password_password", req) });
		return false;
	}
	return true;
};

function isValidPassword(string: string): boolean {
	// eslint-disable-next-line no-useless-escape
	const regex = /^[a-zA-Z0-9!@#$%^&*\?]+$/;
	if (regex.test(string) === true) return true;
	return false;
};



export {
	createNewMember,
	checkEmailValidity,
	checkUsernameAvailable,
	generateAccount
};
