// src/client/scripts/esm/game/chess/gameloader.ts

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

import type { Player } from '../../../../../shared/chess/util/typeutil.js';
import type { VariantCode } from '../../../../../shared/chess/variants/variantregistry.js';
import type { EngineConfig } from '../misc/enginegame.js';
import type { PresetAnnotes } from '../../../../../shared/chess/logic/icn/icnconverter.js';
import type { VariantOptions } from '../../../../../shared/chess/logic/gamefile.js';
import type { MovePacket, TimeControl } from '../../../../../shared/types.js';

import jsutil from '../../../../../shared/util/jsutil.js';
import { players as p } from '../../../../../shared/chess/util/typeutil.js';
import { engineDictionary, ValidEngine } from '../../../../../shared/chess/engines/engine.js';

import gameslot from './gameslot.js';
import enginegame from '../misc/enginegame.js';
import guipalette from '../gui/boardeditor/guipalette.js';
import gamesession from './gamesession.js';
import boardeditor from '../boardeditor/boardeditor.js';

// Start Game --------------------------------------------------------------------

/** Starts an engine game according to the options provided. */
async function startEngineGame(options: {
	/** The 'Event' string of the game's metadata. */
	event: string;
	/** Time control string for the game (e.g. `'600+5'`), or `'-'` for untimed. */
	timeControl: TimeControl;
	/** If it's not a practice checkmate, this is the variant code.
	 * MUTUALLY EXCLUSIVE with variantOptions. */
	variant: VariantCode | undefined;
	/** MUTUALLY EXCLUSIVE with Variant. */
	variantOptions?: VariantOptions;
	youAreColor: Player;
	currentEngine: ValidEngine;
	engineConfig: EngineConfig;
	/** Whether to show the Undo and Restart buttons on the gameinfo bar. For checkmate practice games. */
	showGameControlButtons?: true;
}): Promise<void> {
	if (options.variant && options.variantOptions)
		throw Error(
			"Can't provide both Variant and variantOptions at the same time when starting an engine game. They are mutually exclusive.",
		);
	if (!options.variant && !options.variantOptions)
		throw Error('Must provide either Variant or variantOptions when starting an engine game.');

	gamesession.setSessionGame({ type: 'engine', role: options.youAreColor });

	const dateTimestamp = Date.now();

	const viewWhitePerspective = options.youAreColor === p.WHITE;

	gameslot
		.loadGamefile({
			timeControl: options.timeControl,
			variant: options.variant,
			dateTimestamp,
			viewWhitePerspective,
			additional: {
				variantOptions: options.variantOptions,
				worldBorderDist: engineDictionary[options.currentEngine].worldBorder,
			},
		})
		.then(async ({ graphical }) => {
			// Logical loaded, return graphical promise
			gamesession.concludeGameIfOver();

			/** A promise that resolves when the engine script has been fetched. */
			await enginegame.initEngineGame(options);

			return graphical;
		})
		.then(() => gamesession.markLoadingDone()) // Both the engine and graphical promises have resolved
		.catch((err: Error) => gamesession.onCatchLoadingError(err));
}

/** Initializes the board editor. */
async function startBoardEditor(): Promise<void> {
	gamesession.setSessionGame({ type: 'editor' });

	const dateTimestamp = Date.now();
	const variantCode: VariantCode = 'Classical';

	const viewWhitePerspective = true;

	gameslot
		.loadGamefile({
			timeControl: '-',
			variant: variantCode,
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
		})
		.then(({ graphical }) => graphical) // Logical loaded, return graphical promise
		.then(() => gamesession.markLoadingDone()) // Graphical loaded
		.catch((err: Error) => gamesession.onCatchLoadingError(err));

	await guipalette.initUI();
	boardeditor.initBoardEditor(true); // Dirty position since its a new unsaved position being loaded
}

/** Initializes a local game from a custom position. */
async function startCustomLocalGame(options: {
	additional: {
		moves?: MovePacket[];
		variantOptions: VariantOptions;
	};
	presetAnnotes?: PresetAnnotes;
}): Promise<void> {
	gamesession.setSessionGame({ type: 'analysis' });

	const dateTimestamp = Date.now();

	const viewWhitePerspective = true;

	gameslot
		.loadGamefile({
			...options,
			timeControl: '-',
			dateTimestamp,
			variant: undefined, // Not specified for custom position
			viewWhitePerspective,
		})
		.then(({ graphical }) => {
			// Logical loaded, return graphical promise
			gamesession.concludeGameIfOver();
			return graphical;
		})
		.then(() => gamesession.markLoadingDone()) // Graphical loaded
		.catch((err: Error) => gamesession.onCatchLoadingError(err));
}

/** Starts an engine game from a custom position. */
async function startCustomEngineGame(options: {
	timeControl: TimeControl;
	additional: {
		moves?: MovePacket[];
		variantOptions: VariantOptions;
	};
	presetAnnotes?: PresetAnnotes;
	youAreColor: Player;
	currentEngine: ValidEngine;
	engineConfig: EngineConfig;
	/** Whether to show the Undo and Restart buttons on the gameinfo bar. For checkmate practice games. */
	showGameControlButtons?: true;
}): Promise<void> {
	gamesession.setSessionGame({ type: 'engine', role: options.youAreColor });

	const dateTimestamp = Date.now();

	const viewWhitePerspective = options.youAreColor === p.WHITE;

	gameslot
		.loadGamefile({
			timeControl: options.timeControl,
			variant: undefined, // Not specified for custom position
			dateTimestamp,
			viewWhitePerspective,
			additional: {
				variantOptions: options.additional.variantOptions,
				worldBorderDist: engineDictionary[options.currentEngine].worldBorder,
			},
		})
		.then(async ({ graphical }) => {
			// Logical loaded, return graphical promise
			gamesession.concludeGameIfOver();

			/** A promise that resolves when the engine script has been fetched. */
			await enginegame.initEngineGame(options);

			return graphical;
		})
		.then(() => gamesession.markLoadingDone()) // Both the engine and graphical promises have resolved
		.catch((err: Error) => gamesession.onCatchLoadingError(err));
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

	gameslot
		.loadGamefile({
			timeControl: '-',
			variant: undefined, // Not specified for custom position
			dateTimestamp,
			viewWhitePerspective,
			// See comment in startBoardEditor for why "editor: true" is needed
			additional: { ...options.additional, editor: true },
			presetAnnotes: options.presetAnnotes,
		})
		.then(({ graphical }) => graphical) // Logical loaded, return graphical promise
		.then(() => gamesession.markLoadingDone()) // Graphical loaded
		.catch((err: Error) => gamesession.onCatchLoadingError(err));

	// Open the gui stuff AFTER initiating the logical stuff,
	// because the gui DEPENDS on the other stuff.

	await guipalette.initUI();
	boardeditor.initBoardEditor(dirty, variantOptionsCopy, pawnDoublePush, castling);
}

// Exports --------------------------------------------------------------------

export default {
	startEngineGame,
	startBoardEditor,
	startCustomLocalGame,
	startCustomEngineGame,
	startBoardEditorFromCustomPosition,
};
