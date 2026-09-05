// src/client/scripts/esm/savedpositions/storetypes.ts

/**
 * The TypeScript types and Zod schemas for the board editor save system that
 * are shared beyond the editor page itself.
 *
 * Centralized here to avoid circular-dependency issues — this file only uses
 * type-only imports from other modules, so it can never be part of a circular
 * dependency chain at runtime.
 */

import type { VariantOptions } from '../../../../shared/chess/logic/gamefile.js';

import * as z from 'zod';

// Types -----------------------------------------------------------------------

/** Whether a position is stored locally (IndexedDB) or on the server (cloud) */
export type StorageType = 'local' | 'cloud';

// Zod Schemas -----------------------------------------------------------------

/** Shared Zod fields for EditorSaveState and EditorAutosaveState */
const positionDataFields = {
	timestamp: z.number(),
	piece_count: z.number().int('Piece count must be an integer'),
	/**
	 * Checked for object-ness only. A position holds up to millions of pieces, and walking
	 * it would copy the whole Map — seconds of frozen main thread, and double the heap.
	 */
	variantOptions: z.custom<VariantOptions>((v) => typeof v === 'object' && v !== null),
	pawnDoublePush: z.boolean().optional(),
	castling: z.boolean().optional(),
};

/** Shared position_name schema */
const PositionNameSchema = z.string().min(1, 'Position name is required');

/** Minimal information about a saved position — used for display in the saved positions list */
export type EditorAbridgedSaveState = z.infer<typeof AbridgedSaveStateSchema>;
const AbridgedSaveStateSchema = z.strictObject({
	position_name: PositionNameSchema,
	timestamp: positionDataFields.timestamp,
	piece_count: positionDataFields.piece_count,
});

/** Complete information about a saved position (local or cloud) */
export type EditorSaveState = z.infer<typeof SaveStateSchema>;
const SaveStateSchema = z.strictObject({
	position_name: PositionNameSchema,
	...positionDataFields,
});

// Exports ---------------------------------------------------------------------

export default {
	positionDataFields,
	AbridgedSaveStateSchema,
	SaveStateSchema,
};
