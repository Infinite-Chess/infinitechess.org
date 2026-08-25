// src/server/controllers/prefsCookie.ts

/**
 * Owns the user 'preferences' cookie: sets it for signed-in members on HTML requests
 * from their stored preferences, and removes it on logout.
 *
 * The API for changing preferences lives in api/Prefs.ts, which shares this schema.
 */

import type { Request, Response } from 'express';

import z from 'zod';

import themes from '../../shared/components/header/themes.js';

import memberManager from '../database/memberManager.js';
import memberInfoCookie from './authenticationTokens/memberInfoCookie.js';

// Types ------------------------------------------------------------------------------------------

export type Preferences = z.infer<typeof PreferencesSchema>;

// Constants --------------------------------------------------------------------------------------

/** The client has this long to read the cookie and update preferences in memory. */
const LIFETIME_MS = 1000 * 10; // 10 seconds

/** The options the `preferences` cookie is created with. */
const COOKIE_OPTIONS = { httpOnly: false, sameSite: 'lax' as const, secure: true };

/** Zod schema to validate preferences object structure. */
const PreferencesSchema = z
	.strictObject({
		theme: z.string().refine((val) => themes.isThemeValid(val)),
		legal_moves: z.enum(['squares', 'dots']),
		animations: z.boolean(),
		lingering_annotations: z.boolean(),
	})
	.partial();

// Functions --------------------------------------------------------------------------------------

/**
 * Sets the preferences cookie for logged-in users based on their memberInfo cookie.
 *
 * It is possible for the memberInfo cookie to be tampered with, but preferences can be public information anyway.
 * We are reading the memberInfo cookie instead of verifying their session token
 * because that could take a little bit longer as it requires a database look up.
 */
function set(req: Request, res: Response): void {
	// We give everyone this cookie as soon as they login.
	// Since it is modifiable by JavaScript it's possible for them to
	// grab preferences of other users this way, but there's no harm in that.
	const cookie = memberInfoCookie.read(req);
	if (cookie === undefined) return; // Not signed in, or the cookie was tampered (already logged).

	try {
		const preferences = get(cookie.user_id); // Fetch their preferences from the database
		if (preferences) create(res, preferences);
		// else no preferences set for this user, or the user doesn't exist.
	} catch {
		// DB read failed (already logged), or stored preferences weren't valid JSON.
		// The cookie is skipped.
	}
}

/**  Sets the preferences cookie for the user. */
function create(res: Response, preferences: Preferences): void {
	// Set or update the preferences cookie
	res.cookie('preferences', JSON.stringify(preferences), {
		...COOKIE_OPTIONS,
		maxAge: LIFETIME_MS,
	});
}

/**
 * Deletes the preferences cookie for the user.
 * Typically called when they log out.
 * Even though the cookie only lasts 10 seconds, this is still helpful
 */
function remove(res: Response): void {
	res.clearCookie('preferences', COOKIE_OPTIONS);
}

/**
 * Fetches the preferences for a given user from the database.
 * @param userId - The ID of the user whose preferences are to be fetched.
 * @returns The preferences object if found, otherwise undefined.
 * @throws If there is a database error or if the stored preferences are not valid JSON.
 */
function get(userId: number): Preferences | undefined {
	const record = memberManager.getDataByCriteria(['preferences'], 'user_id', userId);
	if (record === undefined) return;
	if (record.preferences === null) return;
	return JSON.parse(record.preferences);
}

// Exports ----------------------------------------------------------------------------------------

export default {
	set,
	create,
	remove,
	get,
	PreferencesSchema,
};
