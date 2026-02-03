// src/server/api/Prefs.ts

/**
 * This script sets the preferences cookie on any request to an HTML file.
 * And it has an API for setting your preferences in the database.
 */

import type { NextFunction, Request, Response } from 'express';

import z from 'zod';

import themes from '../../shared/components/header/themes.js';
import jsutil from '../../shared/util/jsutil.js';
import { getMemberDataByCriteria, updateMemberColumns } from '../database/memberManager.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import { logZodError } from '../utility/zodlogger.js';

// Types -------------------------------------------------------------------------------

export type Preferences = z.infer<typeof prefsSchema>;

// Variables -----------------------------------------------------------------------------

/** Zod schema to validate preferences object structure. */
const prefsSchema = z
	.strictObject({
		theme: z.string().refine((val) => themes.isThemeValid(val)),
		legal_moves: z.enum(['squares', 'dots']),
		animations: z.boolean(),
		lingering_annotations: z.boolean(),
	})
	.partial();

/** The client has this long to read the cookie and update preferences in memory. */
const lifetimeOfPrefsCookieMillis = 1000 * 10; // 10 seconds

// Functions -----------------------------------------------------------------------------

/**
 * Middleware to set the preferences cookie for logged-in users based on their memberInfo cookie.
 * Only sets the preferences cookie on HTML requests (requests without an origin header).
 *
 * It is possible for the memberInfo cookie to be tampered with, but preferences can be public information anyway.
 * We are reading the memberInfo cookie instead of verifying their session token
 * because that could take a little bit longer as it requires a database look up.
 */
function setPrefsCookie(req: Request, res: Response, next: NextFunction): void {
	// We don't have to worry about the request being for a resource because those have already been served.
	// The only scenario this request could be for now is an HTML or fetch API request
	// The 'is-fetch-request' header is a custom header we add on all fetch requests to let us know is is a fetch request.
	if (req.headers['is-fetch-request'] === 'true' || !req.accepts('html')) return next(); // Not an HTML request (but a fetch), don't set the cookie

	// We give everyone this cookie as soon as they login.
	// Since it is modifiable by JavaScript it's possible for them to
	// grab preferences of other users this way, but there's no harm in that.
	const cookies = req.cookies;
	const memberInfoCookieStringified = cookies['memberInfo'];
	if (memberInfoCookieStringified === undefined) return next(); // No cookie is present, not logged in

	let memberInfoCookie; // { user_id, username }
	try {
		memberInfoCookie = JSON.parse(memberInfoCookieStringified);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`memberInfo cookie was not JSON parse-able when attempting to set preferences cookie. Maybe it was tampered? The cookie: "${jsutil.ensureJSONString(memberInfoCookieStringified)}" The error: ${message}`,
			'errLog.txt',
		);
		return next(); // Don't set the preferences cookie, but allow their request to continue as normal
	}

	if (typeof memberInfoCookie !== 'object') {
		logEventsAndPrint(
			`memberInfo cookie did not parse into an object when attempting to set preferences cookie. Maybe it was tampered? The cookie: "${jsutil.ensureJSONString(memberInfoCookieStringified)}"`,
			'errLog.txt',
		);
		return next(); // Don't set the preferences cookie, but allow their request to continue as normal
	}

	const user_id = memberInfoCookie.user_id;
	if (typeof user_id !== 'number') {
		logEventsAndPrint(
			`memberInfo cookie user_id property was not a number when attempting to set preferences cookie. Maybe it was tampered? The cookie: "${jsutil.ensureJSONString(memberInfoCookieStringified)}"`,
			'errLog.txt',
		);
		return next(); // Don't set the preferences cookie, but allow their request to continue as normal
	}

	const preferences = getPrefs(user_id); // Fetch their preferences from the database
	if (!preferences) return next(); // No preferences set for this user, or the user doesn't exist.

	createPrefsCookie(res, preferences);

	// console.log(`Set preferences cookie for member "${ensureJSONString(memberInfoCookie.username)}" for url: ` + req.url);

	next();
}

/**  Sets the preferences cookie for the user. */
function createPrefsCookie(res: Response, preferences: Preferences): void {
	// Set or update the preferences cookie
	res.cookie('preferences', JSON.stringify(preferences), {
		httpOnly: false,
		secure: true,
		maxAge: lifetimeOfPrefsCookieMillis,
	});
}

/**
 * Deletes the preferences cookie for the user.
 * Typically called when they log out.
 * Even though the cookie only lasts 10 seconds, this is still helpful
 */
function deletePreferencesCookie(res: Response): void {
	res.clearCookie('preferences', {
		httpOnly: false,
		secure: true,
	});
}

/**
 * Fetches the preferences for a given user from the database.
 * @param userId - The ID of the user whose preferences are to be fetched.
 * @returns The preferences object if found, otherwise undefined.
 */
function getPrefs(userId: number): Preferences | undefined {
	const record = getMemberDataByCriteria(['preferences'], 'user_id', userId);
	if (record === undefined) return;
	if (record.preferences === null) return;
	return JSON.parse(record.preferences);
}

/** Route that Handles a POST request to update user preferences in the database. */
function postPrefs(req: Request, res: Response): void {
	if (!req.memberInfo?.signedIn) {
		logEventsAndPrint(
			"User tried to save preferences when they weren't signed in!",
			'errLog.txt',
		);
		res.status(401).json({ message: "Can't save preferences, not signed in." });
		return;
	}

	const { user_id, username } = req.memberInfo;

	const preferences = req.body.preferences;

	// Validate preferences using Zod schema
	const parseResult = prefsSchema.safeParse(preferences);
	if (!parseResult.success) {
		logZodError(
			preferences,
			parseResult.error,
			`Member "${username}" of id "${user_id}" tried to save invalid preferences to the database.`,
		);
		res.status(400).json({ message: 'Preferences not valid, cannot save on the server.' });
		return;
	}

	try {
		// Update the preferences column in the database
		const result = updateMemberColumns(user_id, {
			preferences: JSON.stringify(parseResult.data),
		});

		// Send appropriate response
		if (result.changeMade) {
			console.log(
				`Successfully saved member "${username}" of id "${user_id}"s user preferences.`,
			);
			res.status(200).json({ message: 'Preferences updated successfully' });
		} else {
			logEventsAndPrint(
				`Failed to save preferences for member "${username}" id "${user_id}". No change made. Do they exist?`,
				'errLog.txt',
			);
			res.status(500).json({ message: 'Failed to update preferences' });
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error occurred while saving preferences for member "${username}" of ID "${user_id}": ${message}`,
			'errLog.txt',
		);
		res.status(500).json({ message: 'Server error while updating preferences' });
	}
}

export { setPrefsCookie, postPrefs, deletePreferencesCookie };
