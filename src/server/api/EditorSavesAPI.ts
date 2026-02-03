// src/server/api/EditorSavesAPI.ts

/**
 * API endpoints for managing saved positions in the editor.
 */

import * as z from 'zod';

import type { Request, Response } from 'express';

import editorutil from '../../shared/editor/editorutil.js';
import editorSavesManager from '../database/editorSavesManager.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import { logZodError } from '../utility/zodlogger.js';

// Constants ---------------------------------------------------------------------------------

/** Maximum length for ICN notation (also determines max size) */
export const MAX_ICN_LENGTH = 1_000_000;

// Zod Schemas -------------------------------------------------------------------------------

/** Schema for validating the body of POST /api/editor-saves (save position) */
const SavePositionBodySchema = z.strictObject({
	name: z
		.string()
		.min(1, 'Name is required')
		.max(
			editorutil.POSITION_NAME_MAX_LENGTH,
			`Name must be ${editorutil.POSITION_NAME_MAX_LENGTH} characters or less`,
		),
	piece_count: z
		.number()
		.int('Piece count must be an integer')
		.nonnegative('Piece count must be 0+'),
	icn: z
		.string()
		.min(1, 'ICN is required')
		.max(MAX_ICN_LENGTH, `ICN must be ${MAX_ICN_LENGTH} characters or less`),
	timestamp: z.number().int('Timestamp must be an integer').nonnegative('Timestamp must be 0+'),
	pawn_double_push: z.boolean(),
	castling: z.boolean(),
});

/** Schema for validating position_name in URL params */
const PositionNameParamSchema = z.strictObject({
	position_name: z
		.string()
		.min(1, 'Position name is required')
		.max(
			editorutil.POSITION_NAME_MAX_LENGTH,
			`Position name must be ${editorutil.POSITION_NAME_MAX_LENGTH} characters or less`,
		),
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
 * Expects { name: string, piece_count: number, icn: string, timestamp: number, pawn_double_push: boolean, castling: boolean } in request body.
 * Returns { success: true } on success.
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

	const { name, piece_count, icn, timestamp, pawn_double_push, castling } = parseResult.data;

	try {
		// Add the saved position to the database (throws on quota exceeded or name exists)
		editorSavesManager.addSavedPosition(
			userId,
			name,
			piece_count,
			icn,
			timestamp,
			pawn_double_push,
			castling,
		);

		res.status(201).json({ success: true });
	} catch (error: unknown) {
		// Handle the specific quota error
		if (error instanceof Error && error.message === editorSavesManager.QUOTA_EXCEEDED_ERROR) {
			res.status(403).json({ error: `Maximum saved positions exceeded` });
			return;
		}

		// Handle the name already exists error
		if (
			error instanceof Error &&
			error.message === editorSavesManager.NAME_ALREADY_EXISTS_ERROR
		) {
			res.status(409).json({ error: `Position name already exists` });
			return;
		}

		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error saving position for user_id ${userId}: ${message}`, 'errLog.txt');
		res.status(500).json({ error: 'Failed to save position' });
	}
}

/**
 * API endpoint to get a specific saved position by position_name.
 * Returns { icn: string, pawn_double_push: number, castling: number } on success.
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

	// Validate position_name from URL params with Zod
	const parseResult = PositionNameParamSchema.safeParse(req.params);
	if (!parseResult.success) {
		res.status(400).json({ error: 'Invalid position_name' });
		logZodError(req.params, parseResult.error, `Invalid get position request params.`);
		return;
	}

	const positionName = parseResult.data.position_name;

	try {
		// Get the position from the database (filtered by user_id)
		const position = editorSavesManager.getSavedPositionICN(positionName, userId);

		if (!position) {
			res.status(404).json({ error: 'Position not found' });
			return;
		}

		res.json({
			icn: position.icn,
			pawn_double_push: position.pawn_double_push,
			castling: position.castling,
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error retrieving position for name "${positionName}": ${message}`,
			'errLog.txt',
		);
		res.status(500).json({ error: 'Failed to retrieve position' });
	}
}

/**
 * API endpoint to delete a specific saved position by position_name.
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

	// Validate position_name from URL params with Zod
	const parseResult = PositionNameParamSchema.safeParse(req.params);
	if (!parseResult.success) {
		res.status(400).json({ error: 'Invalid position_name' });
		logZodError(req.params, parseResult.error, `Invalid delete position request params.`);
		return;
	}

	const positionName = parseResult.data.position_name;

	try {
		// Delete the position from the database (filtered by user_id)
		const result = editorSavesManager.deleteSavedPosition(positionName, userId);

		if (result.changes === 0) {
			res.status(404).json({ error: 'Position not found' });
			return;
		}

		res.json({ success: true });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error deleting position "${positionName}" for user_id ${userId}: ${message}`,
			'errLog.txt',
		);
		res.status(500).json({ error: 'Failed to delete position' });
	}
}

// Exports -----------------------------------------------------------------------------------

export default {
	// Constants
	MAX_ICN_LENGTH,
	// Endpoints
	getSavedPositions,
	savePosition,
	getPosition,
	deletePosition,
};
