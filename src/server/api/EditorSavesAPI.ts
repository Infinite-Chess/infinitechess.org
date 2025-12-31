// src/server/api/EditorSavesAPI.ts

/**
 * API endpoints for managing saved positions in the editor.
 */

import * as z from 'zod';

import type { Request, Response } from 'express';

import editorSavesManager from '../database/editorSavesManager.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import { logZodError } from '../utility/zodlogger.js';

// Constants ---------------------------------------------------------------------------------

/** Maximum length for a position name */
export const MAX_NAME_LENGTH = 100;

/** Maximum length for ICN notation (also determines max size) */
export const MAX_ICN_LENGTH = 1_000_000;

// Zod Schemas -------------------------------------------------------------------------------

/** Schema for validating the body of POST /api/editor-saves (save position) */
const SavePositionBodySchema = z.strictObject({
	name: z
		.string()
		.min(1, 'Name is required')
		.max(MAX_NAME_LENGTH, `Name must be ${MAX_NAME_LENGTH} characters or less`),
	icn: z
		.string()
		.min(1, 'ICN is required')
		.max(MAX_ICN_LENGTH, `ICN must be ${MAX_ICN_LENGTH} characters or less`),
});

/** Schema for validating the body of PATCH /api/editor-saves/:position_id (rename position) */
const RenamePositionBodySchema = z.strictObject({
	name: z
		.string()
		.min(1, 'Name is required')
		.max(MAX_NAME_LENGTH, `Name must be ${MAX_NAME_LENGTH} characters or less`),
});

/** Schema for validating position_id in URL params */
const PositionIdParamSchema = z.strictObject({
	position_id: z
		.string()
		.refine(
			(val: string) => {
				const num = Number(val);
				return !isNaN(num) && num > 0;
			},
			{ message: 'Invalid position_id' },
		)
		.transform((val: string) => Number(val)),
});

// API Endpoints -----------------------------------------------------------------------------

/**
 * API endpoint to get all saved positions for the current user.
 * Returns { saves: EditorSavesListRecord[] } with position_id, name, and size.
 * Requires authentication.
 */
function getSavedPositions(req: Request, res: Response): void {
	if (!req.memberInfo) {
		res.status(500).json({ error: 'Server error' }); // `memberInfo` should have been set by auth middleware, even if not signed in
		return;
	}

	// Check if user is authenticated
	if (!req.memberInfo.signedIn) {
		res.status(401).json({ error: 'Must be signed in' });
		return;
	}

	const userId = req.memberInfo.user_id;

	try {
		// Get all saved positions for this user
		const saves = editorSavesManager.getAllSavedPositionsForUser(userId);
		res.json({ saves });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error retrieving saved positions for user_id ${userId}: ${message}`,
			'errLog.txt',
		);
		res.status(500).json({ error: 'Failed to retrieve saved positions' });
	}
}

/**
 * API endpoint to save a new position for the current user.
 * Expects { name: string, icn: string } in request body.
 * Returns { success: true, position_id: number } on success.
 * Requires authentication.
 */
function savePosition(req: Request, res: Response): void {
	if (!req.memberInfo) {
		res.status(500).json({ error: 'Server error' }); // memberInfo should have been set by auth middleware, even if not signed in
		return;
	}

	// Check if user is authenticated
	if (!req.memberInfo.signedIn) {
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
		logZodError(req.body, parseResult.error, `Invalid save position request body.`);
		return;
	}

	const { name, icn } = parseResult.data;

	// Calculate size from ICN length
	const size = icn.length;

	try {
		// Add the saved position to the database (throws on quota exceeded)
		const result = editorSavesManager.addSavedPosition(userId, name, size, icn);

		res.status(201).json({ success: true, position_id: result.lastInsertRowid });
	} catch (error: unknown) {
		// Handle the specific quota error
		if (error instanceof Error && error.message === editorSavesManager.QUOTA_EXCEEDED_ERROR) {
			res.status(403).json({ error: `Maximum saved positions exceeded` });
			return;
		}

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
function getPosition(req: Request, res: Response): void {
	if (!req.memberInfo) {
		res.status(500).json({ error: 'Server error' }); // memberInfo should have been set by auth middleware, even if not signed in
		return;
	}

	// Check if user is authenticated
	if (!req.memberInfo.signedIn) {
		res.status(401).json({ error: 'Must be signed in' });
		return;
	}

	const userId = req.memberInfo.user_id;

	// Validate position_id from URL params with Zod
	const parseResult = PositionIdParamSchema.safeParse(req.params);
	if (!parseResult.success) {
		res.status(400).json({ error: 'Invalid position_id' });
		logZodError(req.params, parseResult.error, `Invalid get position request params.`);
		return;
	}

	const positionId = parseResult.data.position_id;

	try {
		// Get the position from the database (filtered by user_id)
		const position = editorSavesManager.getSavedPositionICN(positionId, userId);

		if (!position) {
			res.status(404).json({ error: 'Position not found' });
			return;
		}

		res.json({ icn: position.icn });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error retrieving position for position_id ${positionId}: ${message}`,
			'errLog.txt',
		);
		res.status(500).json({ error: 'Failed to retrieve position' });
	}
}

/**
 * API endpoint to delete a specific saved position by position_id.
 * Returns { success: true } on success.
 * Requires authentication and ownership of the position.
 */
function deletePosition(req: Request, res: Response): void {
	if (!req.memberInfo) {
		res.status(500).json({ error: 'Server error' }); // memberInfo should have been set by auth middleware, even if not signed in
		return;
	}

	// Check if user is authenticated
	if (!req.memberInfo.signedIn) {
		res.status(401).json({ error: 'Must be signed in' });
		return;
	}

	const userId = req.memberInfo.user_id;

	// Validate position_id from URL params with Zod
	const parseResult = PositionIdParamSchema.safeParse(req.params);
	if (!parseResult.success) {
		res.status(400).json({ error: 'Invalid position_id' });
		logZodError(req.params, parseResult.error, `Invalid delete position request params.`);
		return;
	}

	const positionId = parseResult.data.position_id;

	try {
		// Delete the position from the database (filtered by user_id)
		const result = editorSavesManager.deleteSavedPosition(positionId, userId);

		if (result.changes === 0) {
			res.status(404).json({ error: 'Position not found' });
			return;
		}

		res.json({ success: true });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error deleting position for position_id ${positionId}: ${message}`,
			'errLog.txt',
		);
		res.status(500).json({ error: 'Failed to delete position' });
	}
}

/**
 * API endpoint to rename a specific saved position by position_id.
 * Expects { name: string } in request body.
 * Returns { success: true } on success.
 * Requires authentication and ownership of the position.
 */
function renamePosition(req: Request, res: Response): void {
	if (!req.memberInfo) {
		res.status(500).json({ error: 'Server error' }); // memberInfo should have been set by auth middleware, even if not signed in
		return;
	}

	// Check if user is authenticated
	if (!req.memberInfo.signedIn) {
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
		logZodError(req.body, bodyParseResult.error, `Invalid rename position request body.`);
		return;
	}

	const { name } = bodyParseResult.data;

	try {
		// Rename the position in the database (filtered by user_id)
		const result = editorSavesManager.renameSavedPosition(positionId, userId, name);

		if (result.changes === 0) {
			res.status(404).json({ error: 'Position not found' });
			return;
		}

		res.json({ success: true });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error renaming position for position_id ${positionId}: ${message}`,
			'errLog.txt',
		);
		res.status(500).json({ error: 'Failed to rename position' });
	}
}

// Exports -----------------------------------------------------------------------------------

export default {
	// Constants
	MAX_NAME_LENGTH,
	MAX_ICN_LENGTH,
	// Endpoints
	getSavedPositions,
	savePosition,
	getPosition,
	deletePosition,
	renamePosition,
};
