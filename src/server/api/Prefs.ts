// src/server/api/Prefs.ts

/**
 * This script sets the preferences cookie on any request to an HTML file.
 * And it has an API for setting your preferences in the database.
 */

import type { NextFunction, Request, Response } from 'express';

import z from 'zod';

import themes from '../../shared/components/header/themes.js';

import { logZodError } from '../utility/zodlogger.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import { readMemberInfoCookie } from '../controllers/authenticationTokens/memberInfoCookie.js';
import { getMemberDataByCriteria, updateMemberColumns } from '../database/memberManager.js';

// Types -------------------------------------------------------------------------------

type Preferences = z.infer<typeof prefsSchema>;

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
	// The only scenario this request could be for now is an HTML or fetch API request.
	if (!req.accepts('html')) return next(); // Not an HTML request (but a fetch), don't set the cookie

	// We give everyone this cookie as soon as they login.
	// Since it is modifiable by JavaScript it's possible for them to
	// grab preferences of other users this way, but there's no harm in that.
	const memberInfoCookie = readMemberInfoCookie(req);
	if (memberInfoCookie === undefined) return next(); // Not signed in, or the cookie was tampered (already logged).

	try {
		const preferences = getPrefs(memberInfoCookie.user_id); // Fetch their preferences from the database
		if (preferences) {
			createPrefsCookie(res, preferences);
			// console.log(`Set preferences cookie for member "${jsutil.ensureJSONString(memberInfoCookie.username)}" for url: ` + req.url); // prettier-ignore
		}
		// else no preferences set for this user, or the user doesn't exist.
	} catch {
		// DB read failed (already logged), or stored preferences weren't valid JSON.
		// The cookie is skipped.
	}

	next();
}

/**  Sets the preferences cookie for the user. */
function createPrefsCookie(res: Response, preferences: Preferences): void {
	// Set or update the preferences cookie
	res.cookie('preferences', JSON.stringify(preferences), {
		httpOnly: false,
		sameSite: 'lax',
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
		sameSite: 'lax',
		secure: true,
	});
}

/**
 * Fetches the preferences for a given user from the database.
 * @param userId - The ID of the user whose preferences are to be fetched.
 * @returns The preferences object if found, otherwise undefined.
 * @throws If there is a database error or if the stored preferences are not valid JSON.
 */
function getPrefs(userId: number): Preferences | undefined {
	const record = getMemberDataByCriteria(['preferences'], 'user_id', userId);
	if (record === undefined) return;
	if (record.preferences === null) return;
	return JSON.parse(record.preferences);
}

/** `PUT /api/preferences` — replaces the signed-in user's preferences in the database. */
function putPrefs(req: Request, res: Response): void {
	if (!req.memberInfo?.signedIn) {
		logEventsAndPrint(
			"User tried to save preferences when they weren't signed in!",
			'errLog.txt',
		);
		res.sendStatus(401);
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
		res.sendStatus(400);
		return;
	}

	try {
		// Update the preferences column in the database
		updateMemberColumns(user_id, { preferences: JSON.stringify(parseResult.data) });

		// console.log(`Successfully saved member "${username}" of id "${user_id}"s user preferences.`); // prettier-ignore
		res.sendStatus(200);
	} catch {
		// DB error (already logged)
		res.sendStatus(500);
	}
}

export { setPrefsCookie, putPrefs, deletePreferencesCookie };
