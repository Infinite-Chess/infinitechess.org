// src/server/controllers/practiceProgressCookie.ts

/**
 * Owns the user 'checkmates_beaten' cookie: sets it for signed-in members on HTML
 * requests from their stored checkmate progression, and removes it on logout.
 *
 * The API for recording new checkmates lives in api/PracticeProgress.ts.
 */

import type { Request, Response } from 'express';

import memberManager from '../database/memberManager.js';
import memberInfoCookie from './authenticationTokens/memberInfoCookie.js';

// Constants --------------------------------------------------------------------------------------

/** The options the `checkmates_beaten` cookie is created with. */
const COOKIE_OPTIONS = { httpOnly: false, sameSite: 'lax' as const, secure: true };

// Functions --------------------------------------------------------------------------------------

/**
 * Sets the checkmates_beaten cookie for logged-in users based on their memberInfo cookie.
 *
 * It is possible for the memberInfo cookie to be tampered with, but checkmates_beaten can be public information anyway.
 * We are reading the memberInfo cookie instead of verifying their session token
 * because that could take a little bit longer as it requires a database look up.
 */
function set(req: Request, res: Response): void {
	// We give everyone this cookie as soon as they login.
	// Since it is modifiable by JavaScript it's possible for them to
	// grab checkmates_beaten of other users this way, but there's no harm in that.
	const cookie = memberInfoCookie.read(req);
	if (cookie === undefined) return; // Not signed in, or the cookie was tampered (already logged).

	try {
		const checkmates_beaten = get(cookie.user_id); // Fetch their checkmates_beaten from the database
		create(res, checkmates_beaten);
	} catch {
		// DB read failed (already logged). The cookie is skipped.
	}
}

/**
 * Sets the checkmates_beaten cookie for the user.
 * @param res - The Express response object.
 * @param checkmates_beaten - The checkmates_beaten object to be saved in the cookie.
 */
function create(res: Response, checkmates_beaten: string): void {
	// Set or update the checkmates_beaten cookie
	res.cookie('checkmates_beaten', checkmates_beaten, COOKIE_OPTIONS);
}

/**
 * Deletes the checkmates_beaten progress cookie for the user.
 * Typically called when they log out. Clearing is still helpful even though the
 * browser would drop it on its own eventually.
 */
function remove(res: Response): void {
	res.clearCookie('checkmates_beaten', COOKIE_OPTIONS);
}

/**
 * Fetches the checkmates_beaten for a given user from the database, as a delimited string.
 * @param userId - The ID of the user whose checkmates_beaten are to be fetched.
 * @returns - Returns the checkmates_beaten string if found, otherwise undefined. (e.g. "2Q-1k,3R-1k,1Q1R1B-1k")
 * @throws If a database error occurs.
 */
function get(userId: number): string {
	const record = memberManager.getDataByCriteria(['checkmates_beaten'], 'user_id', userId);
	return record?.checkmates_beaten ?? '';
}

/** Converts a string of checkmates_beaten delimited by commas into an array of strings. */
function toArray(checkmates_beaten: string): string[] {
	return checkmates_beaten.match(/[^,]+/g) || []; // match() returns null if no matches
}

// Exports ----------------------------------------------------------------------------------------

export default { set, create, remove, get, toArray };
