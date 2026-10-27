// src/client/scripts/views/editor/editorloader.ts

/**
 * The board editor's game loader: the load paths the editor needs — a fresh Classical
 * board, and a custom position — each opening the editor over the loaded board.
 * Requires an active 'editor' session.
 */

import type { VariantOptions } from '../../../../shared/chess/logic/gamefile.js';

import jsutil from '../../../../shared/util/jsutil.js';

import editor from './editor.js';
import servertime from '../../util/servertime.js';
import gamesession from '../../game/chess/gamesession.js';

// Load Paths ------------------------------------------------------------------

/** Loads a fresh Classical board, as a new unsaved position. */
async function loadClassical(): Promise<void> {
	const dateTimestamp = servertime.now();
	await gamesession.loadGame({
		kind: 'construct',
		timeControl: '-',
		variant: { code: 'Classical', dateTimestamp },
		dateTimestamp,
		viewWhitePerspective: true,
		// Reserves a slot for every piece type, so placing one never regenerates the mesh.
		// Costs an image for EVERY piece in the spritesheet, which can take a few seconds.
		additional: { editor: true },
	});
	await editor.init(true);
}

/**
 * Loads a custom position onto the board, replacing the current one.
 * @param dirty - Whether the position has unsaved changes.
 * @param pawnDoublePush - The pawn double push checkbox's state, undefined for indeterminate.
 * @param castling - The castling checkbox's state, undefined for indeterminate.
 */
async function loadVariantOptions(
	variantOptions: VariantOptions,
	dirty: boolean,
	pawnDoublePush?: boolean,
	castling?: boolean,
): Promise<void> {
	// The gamefile adopts these options by reference and the editor edits it in place,
	// so the editor's game rules start from a copy.
	const variantOptionsCopy = jsutil.deepCopyObject(variantOptions);
	await gamesession.loadGame({
		kind: 'construct',
		timeControl: '-',
		variant: undefined, // Custom position — no preset variant; variantOptions drives everything.
		dateTimestamp: servertime.now(),
		viewWhitePerspective: true,
		additional: { variantOptions, editor: true },
	});
	await editor.init(dirty, variantOptionsCopy, pawnDoublePush, castling);
}

// Exports ---------------------------------------------------------------------

export default {
	loadClassical,
	loadVariantOptions,
};
