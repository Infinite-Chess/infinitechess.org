
/**
 * This script updates the checkmates_beaten list in the database when a user submits a newly completed checkmate
 */

import validcheckmates from "../../client/scripts/esm/chess/util/validcheckmates.js";
// @ts-ignore
import { logEvents } from "../middleware/logEvents.js";
// @ts-ignore
import { getMemberDataByCriteria, updateMemberColumns } from '../database/memberManager.js';


import type { CustomRequest } from "../../types.js";
import type { Response } from "express";


// Functions -------------------------------------------------------------

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
 * @param userId - The ID of the user whose checkmates_beaten are to be fetched.
 * @returns - Returns the checkmates_beaten object if found, otherwise undefined.
 */
function getCheckmatesBeaten(userId: number): string {
	const { checkmates_beaten } = getMemberDataByCriteria(['checkmates_beaten'], 'user_id', userId, { skipErrorLogging: true });
	return checkmates_beaten ?? ''; // Could be undefined if no match is found
}

/**
 * Converts a string of checkmates_beaten delimited by commas into an array of strings.
 */
function checkmatesBeatenToStringArray(checkmates_beaten: string): string[] {
	return checkmates_beaten.match(/[^,]+/g) || []; // match() returns null if no matches
}

/**
 * Route that Handles a POST request to update user checkmates_beaten in the database.
 * @param {CustomRequest} req - Express request object
 * @param {Response} res - Express response object
 */
function postCheckmateBeaten(req: CustomRequest, res: Response): void {
	if (!req.memberInfo) { // { user_id, username, roles }
		logEvents("Can't save user checkmates_beaten when req.memberInfo is not defined yet! Move this route below verifyJWT.", 'errLog.txt', { print: true });
		res.status(500).json({ message: "Server Error: No Authorization"});
		return;
	}

	if (!req.memberInfo.signedIn) {
		logEvents("User tried to save checkmates_beaten when they weren't signed in!", 'errLog.txt', { print: true });
		res.status(401).json({ message: "Can't save checkmates_beaten, not signed in."});
		return;
	}

	const { user_id, username } = req.memberInfo;
	const new_checkmate_beaten: string = req.body.new_checkmate_beaten;

	// Validate the new checkmate ID
	if (typeof new_checkmate_beaten !== 'string') { // Not a string
		res.status(400).json({ message: 'Invalid checkmate ID' });
		return;
	}
	if (!Object.values(validcheckmates.validCheckmates).flat().includes(new_checkmate_beaten)) { // Not a valid checkmate
		res.status(400).json({ message: 'Invalid checkmate ID' });
		return;
	}


	// Checkmate is valid...

	let checkmates_beaten: string = getCheckmatesBeaten(user_id);
	const checkmates_beaten_array: string[] = checkmatesBeatenToStringArray(checkmates_beaten);

	if (checkmates_beaten_array.includes(new_checkmate_beaten)) { // Already beaten
		res.status(200).json({ message: 'Checkmate already beaten' });
		return;
	}

	// Checkmate not already beaten (until now)...

	// Update the new list
	checkmates_beaten_array.push(new_checkmate_beaten);
	checkmates_beaten = checkmates_beaten_array.join(',');

	// Save the new list to the database
	const updateSuccess: boolean = updateMemberColumns(user_id, { checkmates_beaten });

	// Send appropriate response
	if (updateSuccess) {
		logEvents(`Member "${username}" of id "${user_id}" has beaten practice checkmate ${new_checkmate_beaten}. New checkmates_beaten: ${checkmates_beaten}`, 'checkmates_beaten.txt', { print: true });
		// Create a new cookie with the updated checkmate list for the user
		createPracticeProgressCookie(res, checkmates_beaten);
		res.status(200).json({ message: 'Checkmate recorded successfully' });
	} else {
		logEvents(`Failed to save new practice checkmate for member "${username}" id "${user_id}". No lines changed. Do they exist?`, 'errLog.txt', { print: true });
		res.status(500).json({ message: 'Failed to update serverside practice checkmate' });
	}
}

export {
	createPracticeProgressCookie,
	deletePracticeProgressCookie,
	getCheckmatesBeaten,
	postCheckmateBeaten
};