
/**
 * This script updates the checkmates_beaten list in the database when a user submits a newly completed checkmate
 */

// @ts-ignore
import { logEvents } from "../middleware/logEvents.js";
// @ts-ignore
import { getMemberDataByCriteria, updateCheckmatesBeaten } from '../database/memberManager.js';
// @ts-ignore
import { ensureJSONString } from "../utility/JSONUtils.js";


import type { CustomRequest } from "../../types.js";
import type { Response } from "express";


// Functions -------------------------------------------------------------

const lifetimeOfCheckmatesCookieMillis = 1000 * 10; // 10 seconds

/**
 * Middleware to set the checkmates_beaten cookie for logged-in users based on their memberInfo cookie.
 * Only sets the checkmates_beaten cookie on HTML requests (requests without an origin header).
 * 
 * It is possible for the memberInfo cookie to be tampered with, but checkmates_beaten can be public information anyway.
 * We are reading the memberInfo cookie instead of verifying their session token
 * because that could take a little bit longer as it requires a database look up.
 * @param {CustomRequest} req - The Express request object.
 * @param {Response} res - The Express response object.
 * @param {Function} next - The Express next middleware function.
 */
function setPracticeProgressCookie(req: CustomRequest, res: Response, next: Function) {
	if (!req.cookies) {
		logEvents("req.cookies must be parsed before setting checkmates_beaten cookie!", 'errLog.txt', { print: true });
		return next();
	}

	// We don't have to worry about the request being for a resource because those have already been served.
	// The only scenario this request could be for now is an HTML or fetch API request
	// The 'is-fetch-request' header is a custom header we add on all fetch requests to let us know is is a fetch request.
	if (req.headers['is-fetch-request'] === 'true' || !req.accepts('html')) return next(); // Not an HTML request (but a fetch), don't set the cookie

	// We give everyone this cookie as soon as they login.
	// Since it is modifiable by JavaScript it's possible for them to
	// grab checkmates_beaten of other users this way, but there's no harm in that.
	const memberInfoCookieStringified = req.cookies.memberInfo;
	if (memberInfoCookieStringified === undefined) return next(); // No cookie is present, not logged in

	let memberInfoCookie: any; // { user_id, username }
	try {
		memberInfoCookie = JSON.parse(memberInfoCookieStringified);
	} catch (error) {
		logEvents(`memberInfo cookie was not JSON parse-able when attempting to set checkmates_beaten cookie. Maybe it was tampered? The cookie: "${ensureJSONString(memberInfoCookieStringified)}" The error: ${(error as any).stack}`, 'errLog.txt', { print: true });
		return next(); // Don't set the checkmates_beaten cookie, but allow their request to continue as normal
	}

	if (typeof memberInfoCookie !== "object") {
		logEvents(`memberInfo cookie did not parse into an object when attempting to set checkmates_beaten cookie. Maybe it was tampered? The cookie: "${ensureJSONString(memberInfoCookieStringified)}"`, 'errLog.txt', { print: true });
		return next(); // Don't set the checkmates_beaten cookie, but allow their request to continue as normal
	}

	const user_id = memberInfoCookie.user_id;
	if (typeof user_id !== 'number') {
		logEvents(`memberInfo cookie user_id property was not a number when attempting to set checkmates_beaten cookie. Maybe it was tampered? The cookie: "${ensureJSONString(memberInfoCookieStringified)}"`, 'errLog.txt', { print: true });
		return next(); // Don't set the checkmates_beaten cookie, but allow their request to continue as normal
	}

	const checkmates_beaten = getCheckmatesBeaten(user_id); // Fetch their checkmates_beaten from the database
	if (!checkmates_beaten) return next(); // No checkmates_beaten set for this user, or the user doesn't exist.

	createPracticeProgressCookie(res, checkmates_beaten);
	
	// console.log(`Set checkmates_beaten cookie for member "${ensureJSONString(memberInfoCookie.username)}" for url: ` + req.url);

	next();
}

/**
 * Sets the checkmates_beaten cookie for the user.
 * @param {Object} res - The Express response object.
 * @param {Object} checkmates_beaten - The checkmates_beaten object to be saved in the cookie.
 */
function createPracticeProgressCookie(res: Response, checkmates_beaten: string) {
	// Set or update the checkmates_beaten cookie
	res.cookie('checkmates_beaten', checkmates_beaten, {
		httpOnly: false,
		secure: true,
		maxAge: lifetimeOfCheckmatesCookieMillis,
	});
}

/**
 * Deletes the checkmates_beaten progress cookie for the user.
 * Typically called when they log out.
 * Even though the cookie only lasts 10 seconds, this is still helpful
 * @param {Object} res - The Express response object.
 */
function deletePracticeProgressCookie(res: Response) {
	res.clearCookie('checkmates_beaten', {
		httpOnly: false,
		secure: true,
	});
}

/**
 * Fetches the checkmates_beaten for a given user from the database.
 * @param {number} userId - The ID of the user whose checkmates_beaten are to be fetched.
 * @returns {string} - Returns the checkmates_beaten object if found, otherwise undefined.
 */
function getCheckmatesBeaten(userId: number): string {
	const { checkmates_beaten } = getMemberDataByCriteria(['checkmates_beaten'], 'user_id', userId, { skipErrorLogging: true });
	return checkmates_beaten;
}

/**
 * Route that Handles a POST request to update user checkmates_beaten in the database.
 * @param {CustomRequest} req - Express request object
 * @param {Response} res - Express response object
 */
async function postCheckmateBeaten(req: CustomRequest, res: Response) {
	if (!req.memberInfo) { // { user_id, username, roles }
		logEvents("Can't save user checkmates_beaten when req.memberInfo is not defined yet! Move this route below verifyJWT.", 'errLog.txt', { print: true });
		return res.status(500).json({ message: "Server Error: No Authorization"});
	}

	if (!req.memberInfo.signedIn) {
		logEvents("User tried to save checkmates_beaten when they weren't signed in!", 'errLog.txt', { print: true });
		return res.status(401).json({ message: "Can't save checkmates_beaten, not signed in."});
	}

	const { user_id, username } = req.memberInfo;

	const new_checkmate_beaten = req.body.new_checkmate_beaten;

	// This method updates the checkmates_beaten entry in the database, if applicable:
	const updateSuccess = updateCheckmatesBeaten(user_id, new_checkmate_beaten);

	// Send appropriate response
	if (updateSuccess) {
		console.log(`Successfully interacted with checkmate list of "${username}" of id "${user_id}".`);
		return res.status(200).json({ message: 'Serverside practice checkmate list interaction successful' });
	} else {
		logEvents(`Failed to save practice checkmate for member "${username}" id "${user_id}". No lines changed. Do they exist?`, 'errLog.txt', { print: true });
		return res.status(500).json({ message: 'Failed to update serverside practice checkmate: user_id not found' });
	}
}

export {
	setPracticeProgressCookie,
	postCheckmateBeaten,
	deletePracticeProgressCookie
};