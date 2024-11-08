
/*
 * This module handles create account form data,
 * verifying the data, creating the account,
 * and sending them a verification email.
 * 
 * It also answers requests for whether
 * a specific username or email is available.
 */


		/*&@@@@@@@@@@@@@@@@&#/         
      #&#/#@@@@@/&@%@@(@%&@@@*%@/      
     @@%((*@&@&@@&,/*%@@#&@@@/#%@(     
    @@&#((/@&&@@@@@%@@@&%@&@((#%%@(    
   &@&##(((#&&&&%,* @,%#&&@(((##%&@/   
  &@&&#((((##(@&&&&&&&&&&%#(((##%%@@   
  @&@%##########&%%##%((########%#&&@  
 (@&&#######%###&&&&&&%%%#######%%%&@, 
 @&@%##%#%#%%%##@&&%&&%%%%######%%%&@/ 
 @&%%##########%&&&&&&%%%###(###%%%&&& 
.@&%#(/((####%%%&&&&&&###(///*-/(#%&@@ 
,%%#(/((((((((((#####%(((((/////(((##& 
.&%(./@&%#(/** ##*,,,,.*#(.-/(*#%&&.%@ 
.&%(.@&&%%%%%%&&@@#/((&@@&%%%%%* (&*%@ 
.&%#/ #&&@@&&@%#@&@%@@@ . &%&@,..#.%%@ 
.&%#( @ ..... @%@#, ,@@   &% ... @,%%@ 
.&%%#/* . @.. &.. @ . @.. @ ..@..&*(%& 
.&%%#(, .... #@*../.. @ . @ ..@..%/(%& 
.&%%#(/.. @ ..*..#@...@ . &. .. .%(#%& 
.&%%##(.. @ ..*..,... @   @%%%(*%/##%& 
,&%%###.,(%@@&&%@@#... @&&%%&#@,((##*/


import bcrypt from 'bcrypt';
import { getTranslationForReq } from '../../utility/translate.js';
import { addUser, isUsernameTaken, isEmailTaken } from './memberController.js';
import uuid from '../../../client/scripts/game/misc/uuid.js';

import { isEmailBanned } from '../../middleware/banned.js';
import { logEvents } from '../../middleware/logEvents.js';
import { sendEmailConfirmation } from './sendMail.js';


/**
 * Usernames that are reserved. New members cannot use these are their name.
 * 
 * However, the following have been used:
 * admin
 */
const reservedUsernames = [
    'infinitechess',
    'support', 'infinitechesssupport',
    'admin', 'administrator',
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
const profainWords = [
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

// Called when create account form submitted
async function createNewMember(req, res) {
	if (!req.body) {
		console.log(`User sent a bad create account request missing the whole body!`);
		return res.status(400).send(getTranslationForReq("server.javascript.ws-bad_request", req)); // 400 Bad request
	}
	// First make sure we have all 3 variables.
	// eslint-disable-next-line prefer-const
	let { username, email, password } = req.body;
	if (!username || !email || !password) {
		console.error('We received request to create new member without all supplied username, email, and password!');
		return res.status(400).redirect('/400'); // Bad request
	}

	// Make the email lowercase, so we don't run into problems with seeing if capitalized emails are taken!
	email = email.toLowerCase();

	// First we make checks on the username...
	// These 'return's are so that we don't send duplicate responses, AND so we don't create the member anyway.
	if (doUsernameFormatChecks(username, req, res) !== true) return;
	if (doEmailFormatChecks(email, req, res) !== true) return;
	if (doPasswordFormatChecks(password, req, res) !== true) return;

	const result = await generateAccount({ username, email, password }); // { success, message, result }
	const user_id = result.result.lastInsertRowid;

	if (!result.success) return; // Account generation failed because the account already exists. This can happen if they spam the button.

	// SEND EMAIL CONFIRMATION
	sendEmailConfirmation(user_id);

	// GENERATE ACCESS AND REFRESH TOKENS! They just created an account, so log them in!
	// This will handle our response/redirect
	handleLogin(req, res);
};

/**
 * Generate an account only from the provided username, email, and password.
 * Regex tests are skipped.
 * @param {Object} param0 - The object containing account information.
 * @param {string} param0.username - The username for the new account.
 * @param {string} param0.email - The email for the new account.
 * @param {string} param0.password - The password for the new account.
 * @param {boolean} [param0.autoVerify] - Whether to auto-verify this account.
 * @returns {object} - The result of the database operation or an error message. 
 * The result contains:
 *   - {boolean} success - Whether the operation was successful.
 *   - {string} message - A message describing the outcome.
 *   - {object} result - The result of the database operation if successful.
 */
async function generateAccount({ username, email, password, autoVerify }) {
	// Use bcrypt to hash & salt password
	const hashedPassword = await bcrypt.hash(password, 10); // Passes 10 salt rounds. (standard)
	const verification = autoVerify ? undefined : JSON.stringify({ verified: false, code: uuid.generateID(24) });

	const result = addUser(username, email, hashedPassword, { verification }); // { success, message, result }

	if (!result.success) return result; // Failure to create (username taken). If we do proper checks this point should NEVER happen. BUT THIS CAN STILL happen with async stuff, if they spam the create account button, because bcrypt is async.
    
	const logTxt = `Created new member: ${username}`;
	logEvents(logTxt, 'newMemberLog.txt', { print: true });

	return result;
}

// Route
// Returns whether the email parameter is associated with an account.
// True = open. false = in-use
function checkEmailAssociated(req, res) {
	const lowercaseEmail = req.params.email.toLowerCase()
	if (isEmailTaken(lowercaseEmail)) res.json([false]);
	else res.json([true]);
};



/**
 * Route handler to check if a username is available to use (not taken, reserved, or baaaad word).
 * The request parameters MUST contain the username to test! (different from the body)
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} An object containing the properties `allowed` and `reason`.
 */
function checkUsernameAvailable(req, res) {
	const username = req.params.username;
	const usernameLowercase = username.toLowerCase();

	let allowed = true;
	let reason = '';

	if (isUsernameTaken(username)) { allowed = false; reason = getTranslationForReq("server.javascript.ws-username_taken", req); }
	if (checkProfanity(usernameLowercase)) { allowed = false; reason = getTranslationForReq("server.javascript.ws-username_bad_word", req); }
	if (reservedUsernames.includes(usernameLowercase)) { allowed = false; reason = getTranslationForReq("server.javascript.ws-username_reserved", req); } // Code for reserved

	return res.json({
		allowed,
		reason
	});
}

function doUsernameFormatChecks(username, req, res) {
	// First we check the username's length
	if (username.length < 3 || username.length > 20) return res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-username_length", req) });
	// Then the format
	if (!onlyLettersAndNumbers(username)) return res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-username_letters", req) });
	// Then check if the name's taken
	const usernameLowercase = username.toLowerCase();

	// Make sure the username isn't taken!!

	if (isUsernameTaken(username)) return res.status(409).json({ 'conflict': getTranslationForReq("server.javascript.ws-username_taken", req) });
	// Lastly check for profain words
	if (checkProfanity(usernameLowercase)) return res.status(409).json({ 'conflict': getTranslationForReq("server.javascript.ws-username_bad_word", req) });
	// Then check if the name's reserved
	if (reservedUsernames.includes(usernameLowercase)) return res.status(409).json({ 'conflict': getTranslationForReq("server.javascript.ws-username_taken", req) }); // Code for reserved (but the users don't know that!)

	return true; // Everything's good, no conflicts!
};

const onlyLettersAndNumbers = function(string) {
	if (!string) return true;
	return /^[a-zA-Z0-9]+$/.test(string);
};

// Returns true if bad word is found
const checkProfanity = function(string) {
	for (const profanity of profainWords) {
		if (string.includes(profanity)) return true;
	}
	return false;
};

function doEmailFormatChecks(string, req, res) {
	if (string.length > 320) return res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-email_too_long", req) }); // Max email length
	if (!isValidEmail(string)) return res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-email_invalid", req) });
	if (isEmailTaken(string)) return res.status(409).json({ 'conflict': getTranslationForReq("server.javascript.ws-email_in_use", req) });
	if (isEmailBanned(string)) {
		const errMessage = `Banned user with email ${string} tried to recreate their account!`;
		logEvents(errMessage, 'bannedIPLog.txt', { print: true });
		return res.status(409).json({ 'conflict': getTranslationForReq("server.javascript.ws-you_are_banned", req) });
	}
	return true;
};

const isValidEmail = function(string) {
	// Credit for the regex: https://stackoverflow.com/a/201378
	// eslint-disable-next-line no-control-regex
	const regex = /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;
	return regex.test(string);
};

const doPasswordFormatChecks = function(password, req, res) {
	// First we check password length
	if (password.length < 6 || password.length > 72) return res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-password_length", req) });
	if (!isValidPassword(password)) return res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-password_format", req) });
	if (password.toLowerCase() === 'password') return res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-password_password", req) });
	return true;
};

const isValidPassword = function(string) {
	// eslint-disable-next-line no-useless-escape
	const regex = /^[a-zA-Z0-9!@#$%^&*\?]+$/;
	if (regex.test(string) === true) return true;
	return false;
};

export {
	createNewMember,
	checkEmailAssociated,
	checkUsernameAvailable,
	generateAccount
};