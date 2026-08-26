// src/client/scripts/esm/views/editor/gameloader.ts

/**
 * This script contains the logic for loading any kind of game onto our game board:
 * * Local
 * * Online
 * * Analysis Board (in the future)
 * * Board Editor (in the future)
 *
 * It not only handles the logic of the gamefile,
 * but also prepares and opens the UI elements for that type of game.
 */

import type { MovePacket } from '../../../../../shared/chess/util/typeschemas.js';
import type { VariantCode } from '../../../../../shared/chess/util/variantcodes.js';
import type { PresetAnnotes } from '../../../../../shared/chess/logic/icn/icnconverter.js';
import type { VariantOptions } from '../../../../../shared/chess/logic/gamefile.js';

import jsutil from '../../../../../shared/util/jsutil.js';

import guipalette from './gui/guipalette.js';
import gamesession from '../../game/chess/gamesession.js';
import boardeditor from './boardeditor.js';

// Start Game ------------------------------------------------------------------

/** Initializes the board editor. */
async function startBoardEditor(): Promise<void> {
	gamesession.setSessionGame({ type: 'editor' });

	const dateTimestamp = Date.now();
	const variantCode: VariantCode = 'Classical';

	const viewWhitePerspective = true;

	gamesession.loadGame({
		timeControl: '-',
		variant: { code: variantCode, dateTimestamp },
		dateTimestamp,
		viewWhitePerspective,
		/**
		 * Enable to tell the gamefile to include large amounts of undefined slots for every single piece type in the game.
		 * This lets us board edit without worry of regenerating the mesh every time we add a piece.
		 *
		 * This flag triggers the gamefile to add images for EVERY single piece in the spritesheet!
		 * If that also includes all COLORS, then loading a game can take a few seconds...
		 */
		additional: { editor: true },
	});

	await guipalette.initUI();
	boardeditor.initBoardEditor(true); // Dirty position since its a new unsaved position being loaded
}

/** Initializes the board editor from a custom position. */
async function startBoardEditorFromCustomPosition(
	options: {
		additional: {
			moves?: MovePacket[];
			variantOptions: VariantOptions;
		};
		presetAnnotes?: PresetAnnotes;
	},
	/** Whether the position has unsaved changes. Defaults to true (dirty). */
	dirty: boolean,
	/** Whether the pawnDoublePush flag should be set for the position in the editor game rules */
	pawnDoublePush?: boolean,
	/** Whether the castling flag should be set for the position in the editor game rules */
	castling?: boolean,
): Promise<void> {
	gamesession.setSessionGame({ type: 'editor' });

	const dateTimestamp = Date.now();

	// Variant options are copied before the gamefile is loaded and this potentially manipualtes them
	const variantOptionsCopy = jsutil.deepCopyObject(options.additional.variantOptions);

	const viewWhitePerspective = true;

	gamesession.loadGame({
		timeControl: '-',
		variant: undefined, // Not specified for custom position
		dateTimestamp,
		viewWhitePerspective,
		// See comment in startBoardEditor for why "editor: true" is needed
		additional: { ...options.additional, editor: true },
		presetAnnotes: options.presetAnnotes,
	});

	// Open the gui stuff AFTER initiating the logical stuff,
	// because the gui DEPENDS on the other stuff.

	await guipalette.initUI();
	boardeditor.initBoardEditor(dirty, variantOptionsCopy, pawnDoublePush, castling);
}

// Exports ---------------------------------------------------------------------

export default {
	startBoardEditor,
	startBoardEditorFromCustomPosition,
};
