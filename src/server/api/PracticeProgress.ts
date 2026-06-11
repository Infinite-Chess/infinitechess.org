// src/server/api/PracticeProgress.ts

/**
 * This script updates the checkmates_beaten list in the database when a user submits a newly completed checkmate
 */

import type { Request, Response } from 'express';

import validcheckmates from '../../shared/chess/util/validcheckmates.js';

import { readMemberInfoCookie } from '../controllers/authenticationTokens/memberInfoCookie.js';
import { logEvents, logEventsAndPrint } from '../middleware/logEvents.js';
import { getMemberDataByCriteria, updateMemberColumns } from '../database/memberManager.js';

// Functions -------------------------------------------------------------

/**
 * Middleware to set the checkmates_beaten cookie for logged-in users based on their memberInfo cookie.
 * Only sets the checkmates_beaten cookie on HTML requests (requests without an origin header).
 *
 * It is possible for the memberInfo cookie to be tampered with, but checkmates_beaten can be public information anyway.
 * We are reading the memberInfo cookie instead of verifying their session token
 * because that could take a little bit longer as it requires a database look up.
 * @param req - The Express request object.
 * @param res - The Express response object.
 * @param next - The Express next middleware function.
 */
function setPracticeProgressCookie(req: Request, res: Response, next: Function): void {
	// We don't have to worry about the request being for a resource because those have already been served.
	// The only scenario this request could be for now is an HTML or fetch API request.
	if (!req.accepts('html')) return next(); // Not an HTML request (but a fetch), don't set the cookie

	// We give everyone this cookie as soon as they login.
	// Since it is modifiable by JavaScript it's possible for them to
	// grab checkmates_beaten of other users this way, but there's no harm in that.
	const memberInfoCookie = readMemberInfoCookie(req);
	if (memberInfoCookie === undefined) return next(); // Not signed in, or the cookie was tampered (already logged).

	try {
		const checkmates_beaten = getCheckmatesBeaten(memberInfoCookie.user_id); // Fetch their checkmates_beaten from the database
		createPracticeProgressCookie(res, checkmates_beaten);

		// console.log(`Set checkmates_beaten cookie for member "${memberInfoCookie.username}" for url: ` + req.url); // prettier-ignore
	} catch {
		// DB read failed (already logged). The cookie is skipped.
	}

	next();
}

/**
 * Sets the checkmates_beaten cookie for the user.
 * @param res - The Express response object.
 * @param checkmates_beaten - The checkmates_beaten object to be saved in the cookie.
 */
function createPracticeProgressCookie(res: Response, checkmates_beaten: string): void {
	// Set or update the checkmates_beaten cookie
	res.cookie('checkmates_beaten', checkmates_beaten, {
		httpOnly: false,
		sameSite: 'lax',
		secure: true,
	});
}

/**
 * Deletes the checkmates_beaten progress cookie for the user.
 * Typically called when they log out.
 * Even though the cookie only lasts 10 seconds, this is still helpful
 * @param {Object} res - The Express response object.
 */
function deletePracticeProgressCookie(res: Response): void {
	res.clearCookie('checkmates_beaten', {
		httpOnly: false,
		sameSite: 'lax',
		secure: true,
	});
}

/**
 * Fetches the checkmates_beaten for a given user from the database, as a delimited string.
 * @param userId - The ID of the user whose checkmates_beaten are to be fetched.
 * @returns - Returns the checkmates_beaten string if found, otherwise undefined. (e.g. "2Q-1k,3R-1k,1Q1R1B-1k")
 * @throws If a database error occurs.
 */
function getCheckmatesBeaten(userId: number): string {
	const record = getMemberDataByCriteria(['checkmates_beaten'], 'user_id', userId);
	return record?.checkmates_beaten ?? '';
}

/**
 * Converts a string of checkmates_beaten delimited by commas into an array of strings.
 */
function checkmatesBeatenToStringArray(checkmates_beaten: string): string[] {
	return checkmates_beaten.match(/[^,]+/g) || []; // match() returns null if no matches
}

/**
 * Route that Handles a POST request to update user checkmates_beaten in the database.
 * @param req - Express request object
 * @param res - Express response object
 */
function postCheckmateBeaten(req: Request, res: Response): void {
	if (!req.memberInfo?.signedIn) {
		logEventsAndPrint(
			"User tried to save checkmates_beaten when they weren't signed in!",
			'errLog.txt',
		);
		res.status(401).json({ message: "Can't save checkmates_beaten, not signed in." });
		return;
	}

	const { user_id, username } = req.memberInfo;
	const new_checkmate_beaten: string = req.body.new_checkmate_beaten;

	// Validate the new checkmate ID
	if (typeof new_checkmate_beaten !== 'string') {
		// Not a string
		res.status(400).json({ message: 'Invalid checkmate ID' });
		return;
	}
	if (!Object.values(validcheckmates.validCheckmates).flat().includes(new_checkmate_beaten)) {
		// Not a valid checkmate
		res.status(400).json({ message: 'Invalid checkmate ID' });
		return;
	}

	// Checkmate is valid...

	try {
		let checkmates_beaten: string = getCheckmatesBeaten(user_id);
		const checkmates_beaten_array: string[] = checkmatesBeatenToStringArray(checkmates_beaten);

		if (checkmates_beaten_array.includes(new_checkmate_beaten)) {
			// Already beaten
			res.status(204).json({ message: 'Checkmate already beaten' });
			return;
		}

		// Checkmate not already beaten (until now)...

		// Update the new list
		checkmates_beaten_array.push(new_checkmate_beaten);
		checkmates_beaten = checkmates_beaten_array.join(',');

		// Save the new list to the database
		updateMemberColumns(user_id, { checkmates_beaten });

		logEvents(
			`Member "${username}" of id "${user_id}" has beaten practice checkmate ${new_checkmate_beaten}. Beaten count: ${checkmates_beaten_array.length}. New checkmates_beaten: ${checkmates_beaten}`,
			'checkmates_beaten.txt',
		);
		// Create a new cookie with the updated checkmate list for the user
		createPracticeProgressCookie(res, checkmates_beaten);
		res.status(200).json({ message: 'Checkmate recorded successfully' });
	} catch {
		res.status(500).json({ message: 'Server error updating practice checkmate' });
	}
}

export { setPracticeProgressCookie, deletePracticeProgressCookie, postCheckmateBeaten };
