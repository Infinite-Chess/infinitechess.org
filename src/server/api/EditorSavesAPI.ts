// src/server/api/EditorSavesAPI.ts

/**
 * API endpoints for managing saved positions in the editor.
 */

import * as z from 'zod';

import type { IdentifiedRequest } from '../types.js';
import type { Response } from 'express';

import { getAllSavedPositionsForUser, addSavedPosition, getSavedPositionIcn, getSavedPositionCount, deleteSavedPosition, renameSavedPosition } from '../database/editorSavesManager.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';


// Constants ---------------------------------------------------------------------------------


/** Maximum length for a position name */
export const MAX_NAME_LENGTH = 100;

/** Maximum length for ICN notation (also determines max size) */
export const MAX_ICN_LENGTH = 1_000_000;

/** Maximum number of saved positions per user */
export const MAX_SAVED_POSITIONS = 50;


// Zod Schemas -------------------------------------------------------------------------------


/**
 * Schema for validating the body of POST /api/editor-saves (save position)
 * @internal Type exported for documentation purposes
 */
const SavePositionBodySchema = z.object({
	name: z.string().min(1, 'Name is required').max(MAX_NAME_LENGTH, `Name must be ${MAX_NAME_LENGTH} characters or less`),
	icn: z.string().min(1, 'ICN is required').max(MAX_ICN_LENGTH, `ICN must be ${MAX_ICN_LENGTH} characters or less`),
});
// eslint-disable-next-line no-unused-vars
type SavePositionBody = z.infer<typeof SavePositionBodySchema>;

/**
 * Schema for validating the body of PATCH /api/editor-saves/:position_id (rename position)
 * @internal Type exported for documentation purposes
 */
const RenamePositionBodySchema = z.object({
	name: z.string().min(1, 'Name is required').max(MAX_NAME_LENGTH, `Name must be ${MAX_NAME_LENGTH} characters or less`),
});
// eslint-disable-next-line no-unused-vars
type RenamePositionBody = z.infer<typeof RenamePositionBodySchema>;

/**
 * Schema for validating position_id in URL params
 * @internal Type exported for documentation purposes
 */
const PositionIdParamSchema = z.object({
	position_id: z.string().refine((val: string) => {
		const num = Number(val);
		return !isNaN(num) && num > 0;
	}, { message: 'Invalid position_id' }).transform((val: string) => Number(val)),
});
// eslint-disable-next-line no-unused-vars
type PositionIdParam = z.infer<typeof PositionIdParamSchema>;


// API Endpoints -----------------------------------------------------------------------------


/**
 * API endpoint to get all saved positions for the current user.
 * Returns { saves: EditorSavesListRecord[] } with position_id, name, and size.
 * Requires authentication.
 */
function getSavedPositions(req: IdentifiedRequest, res: Response): void {
	// Check if user is authenticated
	if (!req.memberInfo || !req.memberInfo.signedIn) {
		res.status(401).json({ error: 'Must be signed in' });
		return;
	}

	const userId = req.memberInfo.user_id;

	try {
		// Get all saved positions for this user
		const saves = getAllSavedPositionsForUser(userId);
		res.json({ saves });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error retrieving saved positions for user_id ${userId}: ${message}`, 'errLog.txt');
		res.status(500).json({ error: 'Failed to retrieve saved positions' });
	}
}

/**
 * API endpoint to save a new position for the current user.
 * Expects { name: string, icn: string } in request body.
 * Returns { success: true, position_id: number } on success.
 * Requires authentication.
 */
function savePosition(req: IdentifiedRequest, res: Response): void {
	// Check if user is authenticated
	if (!req.memberInfo || !req.memberInfo.signedIn) {
		res.status(401).json({ error: 'Must be signed in' });
		return;
	}

	const userId = req.memberInfo.user_id;

	// Validate request body with Zod
	const parseResult = SavePositionBodySchema.safeParse(req.body);
	if (!parseResult.success) {
		const firstError = parseResult.error.issues[0];
		const errorMessage = firstError?.message || 'Invalid request body';
		res.status(400).json({ error: errorMessage });
		return;
	}

	const { name, icn } = parseResult.data;

	// Calculate size from ICN length
	const size = icn.length;

	try {
		// Check if user has exceeded the quota
		const currentCount = getSavedPositionCount(userId);
		if (currentCount >= MAX_SAVED_POSITIONS) {
			res.status(403).json({ error: `Maximum of ${MAX_SAVED_POSITIONS} saved positions exceeded` });
			return;
		}

		// Add the saved position to the database
		const result = addSavedPosition(userId, name, size, icn);

		// Return success with the auto-generated position_id
		res.status(201).json({ success: true, position_id: result.lastInsertRowid });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error saving position for user_id ${userId}: ${message}`, 'errLog.txt');
		res.status(500).json({ error: 'Failed to save position' });
	}
}

/**
 * API endpoint to get a specific saved position by position_id.
 * Returns { icn: string } on success.
 * Requires authentication and ownership of the position.
 */
function getPosition(req: IdentifiedRequest, res: Response): void {
	// Check if user is authenticated
	if (!req.memberInfo || !req.memberInfo.signedIn) {
		res.status(401).json({ error: 'Must be signed in' });
		return;
	}

	const userId = req.memberInfo.user_id;

	// Validate position_id from URL params with Zod
	const parseResult = PositionIdParamSchema.safeParse(req.params);
	if (!parseResult.success) {
		res.status(400).json({ error: 'Invalid position_id' });
		return;
	}

	const positionId = parseResult.data.position_id;

	try {
		// Get the position from the database (filtered by user_id)
		const position = getSavedPositionIcn(positionId, userId);

		if (!position) {
			res.status(404).json({ error: 'Position not found' });
			return;
		}

		res.json({ icn: position.icn });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error retrieving position for position_id ${positionId}: ${message}`, 'errLog.txt');
		res.status(500).json({ error: 'Failed to retrieve position' });
	}
}

/**
 * API endpoint to delete a specific saved position by position_id.
 * Returns { success: true } on success.
 * Requires authentication and ownership of the position.
 */
function deletePosition(req: IdentifiedRequest, res: Response): void {
	// Check if user is authenticated
	if (!req.memberInfo || !req.memberInfo.signedIn) {
		res.status(401).json({ error: 'Must be signed in' });
		return;
	}

	const userId = req.memberInfo.user_id;

	// Validate position_id from URL params with Zod
	const parseResult = PositionIdParamSchema.safeParse(req.params);
	if (!parseResult.success) {
		res.status(400).json({ error: 'Invalid position_id' });
		return;
	}

	const positionId = parseResult.data.position_id;

	try {
		// Delete the position from the database (filtered by user_id)
		const result = deleteSavedPosition(positionId, userId);

		if (result.changes === 0) {
			res.status(404).json({ error: 'Position not found' });
			return;
		}

		res.json({ success: true });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error deleting position for position_id ${positionId}: ${message}`, 'errLog.txt');
		res.status(500).json({ error: 'Failed to delete position' });
	}
}

/**
 * API endpoint to rename a specific saved position by position_id.
 * Expects { name: string } in request body.
 * Returns { success: true } on success.
 * Requires authentication and ownership of the position.
 */
function renamePosition(req: IdentifiedRequest, res: Response): void {
	// Check if user is authenticated
	if (!req.memberInfo || !req.memberInfo.signedIn) {
		res.status(401).json({ error: 'Must be signed in' });
		return;
	}

	const userId = req.memberInfo.user_id;

	// Validate position_id from URL params with Zod
	const paramsParseResult = PositionIdParamSchema.safeParse(req.params);
	if (!paramsParseResult.success) {
		res.status(400).json({ error: 'Invalid position_id' });
		return;
	}

	const positionId = paramsParseResult.data.position_id;

	// Validate request body with Zod
	const bodyParseResult = RenamePositionBodySchema.safeParse(req.body);
	if (!bodyParseResult.success) {
		const firstError = bodyParseResult.error.issues[0];
		const errorMessage = firstError?.message || 'Invalid request body';
		res.status(400).json({ error: errorMessage });
		return;
	}

	const { name } = bodyParseResult.data;

	try {
		// Rename the position in the database (filtered by user_id)
		const result = renameSavedPosition(positionId, userId, name);

		if (result.changes === 0) {
			res.status(404).json({ error: 'Position not found' });
			return;
		}

		res.json({ success: true });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error renaming position for position_id ${positionId}: ${message}`, 'errLog.txt');
		res.status(500).json({ error: 'Failed to rename position' });
	}
}


// Exports -----------------------------------------------------------------------------------


export {
	getSavedPositions,
	savePosition,
	getPosition,
	deletePosition,
	renamePosition,
};
