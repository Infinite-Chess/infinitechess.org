// src/client/scripts/esm/game/boardeditor/actions/esave.ts

/**
 * Handles the saving of positions in boardeditor
 */

import * as z from 'zod';

import type { VariantOptions } from '../../../../../../shared/chess/logic/initvariant';

import IndexedDB from '../../../util/IndexedDB';
import boardeditor from '../boardeditor';
import eactions from './eactions';
import egamerules from '../egamerules';
import toast from '../../gui/toast';

// Types ------------------------------------------------------------------

/** Minimal information about a saved position */
interface EditorAbridgedSaveState {
	positionname?: string;
	timestamp: number;
	pieceCount: number;
}

/** Complete information about a saved position */
interface EditorSaveState extends EditorAbridgedSaveState {
	variantOptions: VariantOptions;
	pawnDoublePush?: boolean;
	castling?: boolean;
}

// Constants ----------------------------------------------------------------------

/** Prefix for editor saves in local storage */
const EDITOR_SAVE_PREFIX = 'editor-save-' as const;

/** Prefix for editor saveinfo in local storage */
const EDITOR_SAVEINFO_PREFIX = 'editor-saveinfo-' as const;

// Zod Schemas --------------------------------------------------------------------

/** Schema for validating an EditorAbridgedSaveState */
const EditorAbridgedSaveStateSchema = z.strictObject({
	positionname: z.string().min(1, 'Position name is required').optional(),
	timestamp: z.number(),
	pieceCount: z.number().int('Piece count must be an integer'),
});

/** Schema for validating an EditorSaveState */
const EditorSaveStateSchema = EditorAbridgedSaveStateSchema.extend({
	variantOptions: z
		.object()
		.loose()
		.transform((v) => v as unknown as VariantOptions), // Workaround, for lack of VariantOptions schema
	pawnDoublePush: z.boolean().optional(),
	castling: z.boolean().optional(),
});

// Variables --------------------------------------------------------------------

/** Prevent overlapping IndexedDB saves (single-flight): is save ongoing */
let positionSaveInFlight = false;
/** Prevent overlapping IndexedDB writes (single-flight): is save pending */
let positionSavePending = false;

// Actions ----------------------------------------------------------------------

/** Saves current position under "positionname". */
async function save(positionname: string): Promise<void> {
	if (!boardeditor.areInBoardEditor()) return;

	// Coalesce: if a save is already running, request another and return.
	if (positionSaveInFlight) {
		positionSavePending = true;
		return;
	}

	positionSaveInFlight = true;
	positionSavePending = false;

	try {
		const variantOptions = eactions.getCurrentPositionInformation(false);
		const { pawnDoublePush, castling } = egamerules.getPositionDependentGameRules();
		const timestamp = Date.now();
		const pieceCount = variantOptions.position.size;

		await Promise.all([
			// Save full info for loading purposes
			IndexedDB.saveItem(`${EDITOR_SAVE_PREFIX}${positionname}`, {
				positionname,
				timestamp,
				pieceCount,
				variantOptions,
				pawnDoublePush,
				castling,
			}),
			// Save abridged info for display purposes
			IndexedDB.saveItem(`${EDITOR_SAVEINFO_PREFIX}${positionname}`, {
				positionname,
				timestamp,
				pieceCount,
			}),
		]);
	} catch (err) {
		// Don't crash the editor over failed save
		console.error('Failed to save board editor position:', err);
	} finally {
		positionSaveInFlight = false;

		// If something changed while saving, immediately save again (latest wins).
		if (positionSavePending) {
			positionSavePending = false;
			await save(positionname);
		} else {
			boardeditor.setActivePositionName(positionname);
			toast.showStatus('Position successfully saved in browser.');
		}
	}
}

// Exports --------------------------------------------------------------------

export default {
	EDITOR_SAVE_PREFIX,
	EDITOR_SAVEINFO_PREFIX,

	EditorAbridgedSaveStateSchema,
	EditorSaveStateSchema,

	save,
};

export type { EditorAbridgedSaveState, EditorSaveState };
