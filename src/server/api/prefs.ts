// src/server/api/prefs.ts

/**
 * This script has an API for setting your preferences in the database.
 * (The preferences cookie itself is owned by cookies/prefsCookie.ts.)
 */

import type { Request, Response } from 'express';

import zodlogger from '../utility/zodlogger.js';
import logEvents from '../utility/logEvents.js';
import prefsCookie from '../cookies/prefsCookie.js';
import memberManager from '../database/memberManager.js';

/** `PUT /api/preferences` — replaces the signed-in user's preferences in the database. */
function put(req: Request, res: Response): void {
	if (!req.memberInfo?.signedIn) {
		logEvents.addAndPrint(
			"User tried to save preferences when they weren't signed in!",
			'errLog',
		);
		res.sendStatus(401);
		return;
	}

	const { user_id, username } = req.memberInfo;

	const preferences = req.body.preferences;

	// Validate preferences using Zod schema
	const parseResult = prefsCookie.PreferencesSchema.safeParse(preferences);
	if (!parseResult.success) {
		zodlogger.log(
			preferences,
			parseResult.error,
			`Member "${username}" of id "${user_id}" tried to save invalid preferences to the database.`,
		);
		res.sendStatus(400);
		return;
	}

	try {
		// Update the preferences column in the database
		memberManager.updateColumns(user_id, { preferences: JSON.stringify(parseResult.data) });

		res.sendStatus(200);
	} catch {
		// DB error (already logged)
		res.sendStatus(500);
	}
}

// Exports ------------------------------------------------------------------------------------

export default { put };
