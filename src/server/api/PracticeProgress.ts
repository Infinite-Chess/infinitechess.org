// src/server/api/PracticeProgress.ts

/**
 * This script updates the checkmates_beaten list in the database when a user submits a newly completed checkmate.
 * (The checkmates_beaten cookie itself is owned by controllers/practiceProgressCookie.ts.)
 */

import type { Request, Response } from 'express';

import validcheckmates from '../../shared/chess/util/validcheckmates.js';

import practiceProgressCookie from '../controllers/practiceProgressCookie.js';
import { updateMemberColumns } from '../database/memberManager.js';
import { logEvents, logEventsAndPrint } from '../utility/logEvents.js';

/** `PUT /api/checkmates-progress` — records a checkmate the signed-in user has beaten. */
function postCheckmateBeaten(req: Request, res: Response): void {
	if (!req.memberInfo?.signedIn) {
		logEventsAndPrint(
			"User tried to save checkmates_beaten when they weren't signed in!",
			'errLog',
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
		let checkmates_beaten: string = practiceProgressCookie.get(user_id);
		const checkmates_beaten_array: string[] = practiceProgressCookie.toArray(checkmates_beaten);

		if (checkmates_beaten_array.includes(new_checkmate_beaten)) {
			// Already beaten
			res.sendStatus(204);
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
		practiceProgressCookie.create(res, checkmates_beaten);
		res.status(200).json({ message: 'Checkmate recorded successfully' });
	} catch {
		res.status(500).json({ message: 'Server error updating practice checkmate' });
	}
}

export { postCheckmateBeaten };
