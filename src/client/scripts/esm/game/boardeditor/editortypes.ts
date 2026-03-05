// src/client/scripts/esm/game/boardeditor/editortypes.ts

/**
 * All TypeScript types, constants, and Zod schemas for the board editor save system.
 *
 * Centralized here to avoid circular-dependency issues — this file only uses
 * type-only imports from other modules, so it can never be part of a circular
 * dependency chain at runtime.
 */

import type { VariantOptions } from '../../../../../shared/chess/logic/initvariant.js';
import type { ActivePosition } from './boardeditor.js';

import * as z from 'zod';

// Constants ------------------------------------------------------------------

/** All valid storage locations for a saved editor position */
const STORAGE_TYPES = ['local', 'cloud'] as const;

// Types ------------------------------------------------------------------

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

/**
 * Complete save state as written by the autosave.
 * active_position is optional because the user may not have a named/saved position open.
 */
export interface EditorAutosaveState extends EditorPositionData {
	active_position?: ActivePosition;
}

// Zod Schemas --------------------------------------------------------------------

/** Shared Zod fields for EditorSaveState and EditorAutosaveState */
const positionDataFields = {
	// z.coerce.number() handles legacy saves where timestamp was stored as a string
	timestamp: z.coerce.number(),
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
});

/** Schema for validating a SaveState */
const SaveStateSchema = z.strictObject({
	position_name: positionNameSchema,
	...positionDataFields,
});

/** Schema for validating an AutosaveState */
const AutosaveStateSchema = z.strictObject({
	active_position: z.object({ name: z.string(), storage_type: z.enum(STORAGE_TYPES) }).optional(),
	...positionDataFields,
});

// Exports --------------------------------------------------------------------

export default {
	STORAGE_TYPES,

	positionDataFields,
	AbridgedSaveStateSchema,
	SaveStateSchema,
	AutosaveStateSchema,
};
