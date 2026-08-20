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

// Types ------------------------------------------------------------------

/** Whether a position is stored locally (IndexedDB) or on the server (cloud) */
export type StorageType = 'local' | 'cloud';

/** Minimal information about a saved position — used for display in the saved positions list */
export interface EditorAbridgedSaveState {
	position_name: string;
	timestamp: number;
	piece_count: number;
}

/** Position data shared between normal saves and autosaves */
export interface EditorPositionData {
	timestamp: number;
	piece_count: number;
	variantOptions: VariantOptions;
	pawnDoublePush?: boolean;
	castling?: boolean;
}

/** Complete information about a saved position (local or cloud) */
export interface EditorSaveState extends EditorPositionData {
	position_name: string;
}

// Zod Schemas --------------------------------------------------------------------

/** Shared Zod fields for EditorSaveState and EditorAutosaveState */
const positionDataFields = {
	timestamp: z.number(),
	piece_count: z.number().int('Piece count must be an integer'),
	variantOptions: z
		.object()
		.loose()
		.transform((v) => v as unknown as VariantOptions), // Workaround for lack of VariantOptions schema
	pawnDoublePush: z.boolean().optional(),
	castling: z.boolean().optional(),
};

/** Shared position_name schema */
const positionNameSchema = z.string().min(1, 'Position name is required');

/** Schema for validating an AbridgedSaveState */
const AbridgedSaveStateSchema = z.strictObject({
	position_name: positionNameSchema,
	timestamp: positionDataFields.timestamp,
	piece_count: positionDataFields.piece_count,
}) satisfies z.ZodType<EditorAbridgedSaveState>;

/** Schema for validating a SaveState */
const SaveStateSchema = z.strictObject({
	position_name: positionNameSchema,
	...positionDataFields,
}) satisfies z.ZodType<EditorSaveState>;

// Exports --------------------------------------------------------------------

export default {
	positionDataFields,
	AbridgedSaveStateSchema,
	SaveStateSchema,
};
