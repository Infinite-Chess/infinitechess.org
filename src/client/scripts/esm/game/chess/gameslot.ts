// src/client/scripts/esm/game/chess/gameslot.ts

/**
 * Whether we're in a local game, online game, analysis board, or board editor,
 * what they ALL have in common is a gamefile! This script stores THAT gamefile!
 *
 * It also has the loader and unloader methods for the gamefile.
 */

import type { Mesh } from '../rendering/piecemodels.js';
import type { Player } from '../../../../../shared/chess/util/typeutil.js';
import type { TimeControl } from '../../../../../shared/types.js';
import type { VariantCode } from '../../../../../shared/chess/variants/variantregistry.js';
import type { PresetAnnotes } from '../../../../../shared/chess/logic/icn/icnconverter.js';
import type { Additional, GameFile } from '../../../../../shared/chess/logic/gamefile.js';

import clock from '../../../../../shared/chess/logic/clock.js';
import moveutil from '../../../../../shared/chess/util/moveutil.js';
import gamefile from '../../../../../shared/chess/logic/gamefile.js';
import movepiece from '../../../../../shared/chess/logic/movepiece.js';
import boardutil from '../../../../../shared/chess/util/boardutil.js';
import gamerules from '../../../../../shared/chess/util/gamerules.js';
import { players as p } from '../../../../../shared/chess/util/typeutil.js';

import arrows from '../rendering/arrows/arrows.js';
import { gl } from '../rendering/webgl.js';
import camera from '../rendering/camera.js';
import guiclock from '../gui/guiclock.js';
import drawrays from '../rendering/highlights/annotations/drawrays.js';
import miniimage from '../rendering/miniimage.js';
import starfield from '../rendering/starfield.js';
import imagecache from '../../chess/rendering/imagecache.js';
import piecemodels from '../rendering/piecemodels.js';
import drawsquares from '../rendering/highlights/annotations/drawsquares.js';
import { GameBus } from '../GameBus.js';
import guipromotion from '../gui/guipromotion.js';
import movesequence from './movesequence.js';
import texturecache from '../../chess/rendering/texturecache.js';
import { animateMove } from './graphicalchanges.js';
import miniimagerenderer from '../rendering/miniimagerenderer.js';

// Types ---------------------------------------------------------------------

/** Options for loading a game. */
interface LoadOptions {
	/** The time control of the game (e.g. `"600+5"`, or `"-"` for untimed). */
	timeControl: TimeControl;
	/** The variant code. Pass undefined for custom/unknown positions. */
	variant: VariantCode | undefined;
	/** The game's start timestamp in milliseconds since epoch. */
	dateTimestamp: number;
	/** True if we should be viewing the game from white's perspective, false for black's perspective. */
	viewWhitePerspective: boolean;
	/** Preset ray overrides for the variant's rays. */
	presetAnnotes?: PresetAnnotes;
	additional?: Additional;
}

// Variables ---------------------------------------------------------------

/** The currently loaded game. */
let loadedGamefile: GameFile | undefined;

/** The mesh of the gamefile, if it is loaded. */
let mesh: Mesh | undefined;

/** The player color we are viewing the perspective of in the current loaded game. */
let viewColor: Player;

/**
 * The timeout id of the timer that animates the latest-played
 * move when rejoining a game, after a short delay
 */
let animateLastMoveTimeoutID: ReturnType<typeof setTimeout> | undefined;
/**
 * The delay, in millis, until the latest-played
 * move is animated, after rejoining a game.
 */
const delayOfLatestMoveAnimationOnRejoinMillis = 150;

// Listeners ---------------------------------------------------------------

// Regenerate piece textures and rebuild the promotion UI whenever the theme changes.
document.addEventListener('theme-change', () => {
	const gamefile = loadedGamefile;
	if (!gamefile) return;
	imagecache.deleteImageCache();
	// texturecache.deleteTextureCache(gl);
	imagecache.initImagesForGame(gamefile).then(() => {
		// Regenerate piece textures with the new tinted images
		texturecache.initTexturesForGame(gl, gamefile);
		piecemodels.regenAll(gamefile, mesh!);
	});
	// Reinit the promotion UI
	guipromotion.resetUI();
	const uniquePlayers = gamerules.getUniquePlayersInTurnOrder(gamefile.gameRules.turnOrder);
	guipromotion.initUI(gamefile.gameRules.promotion?.pieces, uniquePlayers);
});

// Functions ---------------------------------------------------------------

/**  Returns the gamefile currently loaded */
function getGamefile(): GameFile | undefined {
	return loadedGamefile;
}

/** Returns the mesh of the gamefile currently loaded */
function getMesh(): Mesh | undefined {
	return mesh;
}

function areInGame(): boolean {
	return loadedGamefile !== undefined;
}

function areViewingWhite(): boolean {
	if (!loadedGamefile)
		throw Error(
			"Cannot ask if loaded game is from white's perspective when there isn't a loaded game.",
		);
	return viewColor === p.WHITE;
}

/**
 * Loads a gamefile onto the board.
 * Returns a promise that resolves once the LOGICAL stuff is finished loading.
 * The resolved value is `{ graphical }` — a second promise that resolves when
 * the GRAPHICAL stuff (piece textures, mesh generation, etc.) finishes.
 *
 * Note: Returning a plain object `{ graphical }` rather than returning the inner
 * promise directly is intentional — JavaScript automatically flattens a promise
 * resolved *with* another promise, collapsing the two stages into one.
 */
function loadGamefile(loadOptions: LoadOptions): Promise<{ graphical: Promise<void> }> {
	if (loadedGamefile) throw new Error('Must unloadGame() before loading a new one.');
	// console.log("Loading gamefile...");

	// The game should be considered loaded once the LOGICAL stuff is finished.
	// Any canvas loading animation should close only when thre GRAPHICAL stuff is finished.

	return loadLogical(loadOptions).then(() => {
		// console.log('LOGICAL loaded.');

		console.warn('Game start sound has not been added yet.');

		// Start GRAPHICAL loading immediately and hand its promise to the caller.
		return { graphical: loadGraphical() };
	});
}

/** Loads all of the logical components of a game */
async function loadLogical(loadOptions: LoadOptions): Promise<void> {
	loadedGamefile = await gamefile.initGameFile(
		loadOptions.timeControl,
		loadOptions.dateTimestamp,
		loadOptions.variant,
		loadOptions.additional,
	);

	viewColor = loadOptions.viewWhitePerspective ? p.WHITE : p.BLACK;

	const pieceCount = boardutil.getPieceCountOfGame(loadedGamefile.pieces);
	// Disable miniimages if there's too many pieces
	if (pieceCount > miniimagerenderer.pieceCountToDisableMiniImages) miniimage.disable();
	// Disable arrows if there's too many pieces or lines in the game
	if (pieceCount > arrows.MAX_PIECES || loadedGamefile.pieces.slides.length > arrows.MAX_LINES)
		arrows.setMode(0);

	// If custom preset rays are specified, initiate them in drawrays.ts
	if (loadOptions.presetAnnotes?.squares)
		drawsquares.setPresetOverrides(loadOptions.presetAnnotes.squares);
	if (loadOptions.presetAnnotes?.rays)
		drawrays.setPresetOverrides(loadOptions.presetAnnotes.rays);

	GameBus.dispatch('game-loaded');
}

/** Loads all of the graphical components of a game */
async function loadGraphical(): Promise<void> {
	camera.setPerspectiveRotation(0, areViewingWhite() ? 0 : 180);
	guiclock.set(loadedGamefile!);

	await imagecache.initImagesForGame(loadedGamefile!);
	texturecache.initTexturesForGame(gl, loadedGamefile!);

	// MUST BE AFTER imagecache.initImagesForGame(), as we need SVGs fetched before then.
	const uniquePlayers = gamerules.getUniquePlayersInTurnOrder(
		loadedGamefile!.gameRules.turnOrder,
	);
	guipromotion.initUI(loadedGamefile!.gameRules.promotion?.pieces, uniquePlayers);

	// Rewind one move so that we can, after a short delay, animate the most recently played move.
	const lastmove = moveutil.getLastMove(loadedGamefile!.moves);
	if (lastmove !== undefined) movepiece.applyMove(loadedGamefile!, lastmove, false); // Rewind one move

	// Initialize the mesh empty
	mesh = {
		offset: [0n, 0n],
		inverted: false,
		types: {},
	};

	// Generate the mesh of every piece type
	piecemodels.regenAll(loadedGamefile!, mesh);

	// NEEDS TO BE AFTER generating the mesh, since this makes a graphical change.
	if (lastmove !== undefined)
		animateLastMoveTimeoutID = setTimeout(() => {
			// A small delay to animate the most recently played move.
			if (moveutil.areWeViewingLatestMove(loadedGamefile!)) return; // Already viewing the lastest move
			movesequence.viewFront(loadedGamefile!, mesh!); // Updates to front even when they view different moves
			animateMove(lastmove.changes, true);
		}, delayOfLatestMoveAnimationOnRejoinMillis);

	// Init the star field void animation
	starfield.init();

	// console.log('GRAPHICAL loaded.');
}

/** The canvas will no longer render the current game */
function unloadGame(): void {
	if (!loadedGamefile)
		throw Error('Should not be calling to unload game when there is no game loaded.');
	// console.error("Unloading gamefile...");

	loadedGamefile = undefined;
	mesh = undefined;

	// Stop the timer that (animates the latest-played move when rejoining a game after a short delay)
	clearTimeout(animateLastMoveTimeoutID);
	animateLastMoveTimeoutID = undefined;

	GameBus.dispatch('game-unloaded');
}

/**
 * Ends the game. Call this when the game is over by the used win condition.
 * Stops the clocks, darkens the board, displays who won, plays a sound effect.
 */
function concludeGame(): void {
	if (!loadedGamefile) throw Error("Cannot conclude game when there isn't one loaded");
	if (loadedGamefile.gameConclusion === undefined)
		throw Error("Cannot conclude game when the game hasn't ended.");

	clock.endGame(loadedGamefile);
	guiclock.stopClocks(loadedGamefile);

	GameBus.dispatch('game-concluded');

	console.warn('Game conclude sound has not been added yet.');
}

export default {
	getGamefile,
	getMesh,
	areInGame,
	areViewingWhite,
	loadGamefile,
	unloadGame,
	concludeGame,
};

export type { PresetAnnotes, Additional };
