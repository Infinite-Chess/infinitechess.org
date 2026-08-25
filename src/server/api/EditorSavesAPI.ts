// src/server/api/EditorSavesAPI.ts

/**
 * API endpoints for managing saved positions in the editor.
 */

import type { Request, Response } from 'express';

import * as z from 'zod';

import jsutil from '../../shared/util/jsutil.js';
import gamelimits from '../../shared/chess/util/gamelimits.js';

import zodlogger from '../utility/zodlogger.js';
import logEvents from '../utility/logEvents.js';
import editorSavesManager from '../database/editorSavesManager.js';

// Constants ---------------------------------------------------------------------------------

/** Maximum number of saved positions allowed per user */
const MAX_SAVED_POSITIONS = 50;

// Zod Schemas -------------------------------------------------------------------------------

/** Schema for validating the body of POST /api/editor-saves (save position) */
const SavePositionBodySchema = z.strictObject({
	name: z
		.string()
		.trim()
		.min(1, 'Name is required')
		.max(
			gamelimits.MAX_POSITION_NAME_LENGTH,
			`Name must be ${gamelimits.MAX_POSITION_NAME_LENGTH} characters or less`,
		),
	piece_count: z
		.number()
		.int('Piece count must be an integer')
		.nonnegative('Piece count must be 0+'),
	timestamp: z.number().int('Timestamp must be an integer').nonnegative('Timestamp must be 0+'),
	icn: z
		.string()
		.min(1, 'ICN is required')
		.max(
			gamelimits.MAX_ICN_LENGTH,
			`ICN must be ${gamelimits.MAX_ICN_LENGTH} characters or less`,
		),
	compression: z.enum(['none', 'deflate-raw']),
	// undefined represents the indeterminate (third) state
	pawn_double_push: z.boolean().optional(),
	castling: z.boolean().optional(),
});

/** Schema for validating position_name in URL params */
const PositionNameParamSchema = z.strictObject({
	position_name: z
		.string()
		.trim()
		.min(1, 'Position name is required')
		.max(
			gamelimits.MAX_POSITION_NAME_LENGTH,
			`Position name must be ${gamelimits.MAX_POSITION_NAME_LENGTH} characters or less`,
		),
});

// API Endpoints -----------------------------------------------------------------------------

/** `GET /api/editor-saves` — returns `{ saves }` (position_id, name, size) for the signed-in user. */
function getSavedPositions(req: Request, res: Response): void {
	const userId = getSignedInUserIdOrRespond(req, res);
	if (userId === undefined) return; // Response already sent

	try {
		// Get all saved positions for this user
		const saves = editorSavesManager.getAllForUser(userId);
		res.json({ saves });
	} catch (error: unknown) {
		const message = jsutil.getErrorMessage(error);
		logEvents.addAndPrint(
			`Error retrieving saved positions for user_id ${userId}: ${message}`,
			'errLog',
		);
		res.status(500).json({
			message: req.t.responses.editor_saves.server_error,
		});
	}
}

/**
 * `POST /api/editor-saves` — saves a position for the signed-in user (overwriting any of the
 * same name) and returns `{ saves }`. Body: `{ name, piece_count, timestamp, icn, pawn_double_push?, castling? }`.
 */
function savePosition(req: Request, res: Response): void {
	const userId = getSignedInUserIdOrRespond(req, res);
	if (userId === undefined) return; // Response already sent

	// Validate request body with Zod
	const parseResult = SavePositionBodySchema.safeParse(req.body);
	if (!parseResult.success) {
		// Not localized: unreachable via the client, only a hand-crafted request lands here.
		res.status(400).json({ message: 'The request was invalid.' });
		zodlogger.log(req.body, parseResult.error, `Invalid save position request body.`);
		return;
	}

	const { name, piece_count, timestamp, icn, compression, pawn_double_push, castling } =
		parseResult.data;

	try {
		// Enforce the per-user quota, if it's a new (not existing) position.
		const atLimit = editorSavesManager.getCount(userId) >= MAX_SAVED_POSITIONS;
		const isExistingPosition = editorSavesManager.doesExist(userId, name);
		if (atLimit && !isExistingPosition) {
			res.status(403).json({
				message: req.t.responses.editor_saves.limit_reached,
			});
			return;
		}

		// Add the saved position to the database
		editorSavesManager.add(
			userId,
			name,
			piece_count,
			timestamp,
			icn,
			compression,
			pawn_double_push,
			castling,
		);

		const saves = editorSavesManager.getAllForUser(userId);
		res.status(201).json({ saves });
	} catch (error: unknown) {
		const message = jsutil.getErrorMessage(error);
		logEvents.addAndPrint(`Error saving position for user_id ${userId}: ${message}`, 'errLog');
		res.status(500).json({
			message: req.t.responses.editor_saves.server_error,
		});
	}
}

/** `GET /api/editor-saves/:position_name` — returns the signed-in user's saved position of that name. */
function getPosition(req: Request, res: Response): void {
	const userId = getSignedInUserIdOrRespond(req, res);
	if (userId === undefined) return; // Response already sent

	// Validate position_name from URL params with Zod
	const parseResult = PositionNameParamSchema.safeParse(req.params);
	if (!parseResult.success) {
		// Not localized: unreachable via the client (the name comes from the validated saved list).
		res.status(400).json({ message: 'The position name is invalid.' });
		zodlogger.log(req.params, parseResult.error, `Invalid get position request params.`);
		return;
	}

	const positionName = parseResult.data.position_name;

	try {
		// Get the position from the database (filtered by user_id)
		const position = editorSavesManager.getICN(positionName, userId);

		if (!position) {
			res.status(404).json({
				message: req.t.responses.editor_saves.position_not_found,
			});
			return;
		}

		res.json({
			timestamp: position.timestamp,
			icn: position.icn,
			compression: position.compression,
			// Decode tristate: -1 → undefined, 0 → false, 1 → true
			pawn_double_push:
				position.pawn_double_push === -1 ? undefined : Boolean(position.pawn_double_push),
			castling: position.castling === -1 ? undefined : Boolean(position.castling),
		});
	} catch (error: unknown) {
		const message = jsutil.getErrorMessage(error);
		logEvents.addAndPrint(
			`Error retrieving position for name "${positionName}": ${message}`,
			'errLog',
		);
		res.status(500).json({
			message: req.t.responses.editor_saves.server_error,
		});
	}
}

/** `DELETE /api/editor-saves/:position_name` — deletes the signed-in user's saved position of that name; returns `{ saves }`. */
function deletePosition(req: Request, res: Response): void {
	const userId = getSignedInUserIdOrRespond(req, res);
	if (userId === undefined) return; // Response already sent

	// Validate position_name from URL params with Zod
	const parseResult = PositionNameParamSchema.safeParse(req.params);
	if (!parseResult.success) {
		// Not localized: unreachable via the client (the name comes from the validated saved list).
		res.status(400).json({ message: 'The position name is invalid.' });
		zodlogger.log(req.params, parseResult.error, `Invalid delete position request params.`);
		return;
	}

	const positionName = parseResult.data.position_name;

	try {
		// Delete the position from the database (filtered by user_id)
		const result = editorSavesManager.remove(positionName, userId);

		if (result.changes === 0) {
			res.status(404).json({
				message: req.t.responses.editor_saves.position_not_found,
			});
			return;
		}

		const saves = editorSavesManager.getAllForUser(userId);
		res.json({ saves });
	} catch (error: unknown) {
		const message = jsutil.getErrorMessage(error);
		logEvents.addAndPrint(
			`Error deleting position "${positionName}" for user_id ${userId}: ${message}`,
			'errLog',
		);
		res.status(500).json({
			message: req.t.responses.editor_saves.server_error,
		});
	}
}

/**
 * Guards an endpoint to signed-in members only. Responds with the appropriate error
 * (500 if auth middleware failed to set `memberInfo`, 401 if signed out) and returns
 * undefined; otherwise returns the member's user_id.
 */
function getSignedInUserIdOrRespond(req: Request, res: Response): number | undefined {
	if (!req.memberInfo) {
		res.status(500).json({
			message: req.t.responses.editor_saves.server_error,
		});
		return undefined;
	}

	// Check if user is authenticated
	if (!req.memberInfo.signedIn) {
		res.status(401).json({
			message: req.t.responses.editor_saves.must_be_signed_in,
		});
		return undefined;
	}

	return req.memberInfo.user_id;
}

// Exports -----------------------------------------------------------------------------------

export default {
	// Constants
	MAX_SAVED_POSITIONS,
	// Endpoints
	getSavedPositions,
	savePosition,
	getPosition,
	deletePosition,
};
