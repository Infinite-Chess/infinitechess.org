// src/client/scripts/esm/game/chess/gameslot.ts

/**
 * Whether we're in a local game, online game, analysis board, or board editor,
 * what they ALL have in common is a gamefile! This script stores THAT gamefile!
 *
 * It also has the loader and unloader methods for the gamefile.
 */

import type { Mesh } from '../rendering/piecemodels.js';
import type { Player } from '../../../../../shared/chess/util/typeutil.js';
import type { MetaData } from '../../../../../shared/types.js';
import type { VariantCode } from '../../../../../shared/chess/variants/variantregistry.js';
import type { PresetAnnotes } from '../../../../../shared/chess/logic/icn/icnconverter.js';
import type { Additional, FullGame } from '../../../../../shared/chess/logic/fullgame.js';

import bd from '@naviary/bigdecimal';

import clock from '../../../../../shared/chess/logic/clock.js';
import moveutil from '../../../../../shared/chess/util/moveutil.js';
import fullgame from '../../../../../shared/chess/logic/fullgame.js';
import movepiece from '../../../../../shared/chess/logic/movepiece.js';
import boardutil from '../../../../../shared/chess/util/boardutil.js';
import gamerules from '../../../../../shared/chess/util/gamerules.js';
import gamefileutility from '../../../../../shared/chess/util/gamefileutility.js';
import { players as p } from '../../../../../shared/chess/util/typeutil.js';

import area from '../rendering/area.js';
import arrows from '../rendering/arrows/arrows.js';
import meshes from '../rendering/meshes.js';
import { gl } from '../rendering/webgl.js';
import boardpos from '../rendering/boardpos.js';
import guiclock from '../gui/guiclock.js';
import drawrays from '../rendering/highlights/annotations/drawrays.js';
import copygame from './copygame.js';
import miniimage from '../rendering/miniimage.js';
import pastegame from './pastegame.js';
import gamesound from '../misc/gamesound.js';
import starfield from '../rendering/starfield.js';
import imagecache from '../../chess/rendering/imagecache.js';
import Transition from '../rendering/transitions/Transition.js';
import gameloader from './gameloader.js';
import piecemodels from '../rendering/piecemodels.js';
import guigameinfo from '../gui/guigameinfo.js';
import drawsquares from '../rendering/highlights/annotations/drawsquares.js';
import { GameBus } from '../GameBus.js';
import preferences from '../../components/header/preferences.js';
import guipromotion from '../gui/guipromotion.js';
import movesequence from './movesequence.js';
import texturecache from '../../chess/rendering/texturecache.js';
import guinavigation from '../gui/guinavigation.js';
import { animateMove } from './graphicalchanges.js';
import miniimagerenderer from '../rendering/miniimagerenderer.js';

// Types ---------------------------------------------------------------------

/** Options for loading a game. */
interface LoadOptions {
	/** The metadata of the game */
	metadata: MetaData;
	/** The variant code. Pass undefined for custom/unknown positions. */
	variant: VariantCode | undefined;
	/** The game's start timestamp in milliseconds since epoch. */
	dateTimestamp: number;
	/** True if we should be viewing the game from white's perspective, false for black's perspective. */
	viewWhitePerspective: boolean;
	/** Whether the coordinate field box should be editable. */
	allowEditCoords: boolean;
	/** Preset ray overrides for the variant's rays. */
	presetAnnotes?: PresetAnnotes;
	additional?: Additional;
}

// Variables ---------------------------------------------------------------

/** The currently loaded game. */
let loadedGamefile: FullGame | undefined;

/** The mesh of the gamefile, if it is loaded. */
let mesh: Mesh | undefined;

/** The player color we are viewing the perspective of in the current loaded game. */
let youAreColor: Player;

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
	imagecache.initImagesForGame(gamefile.boardsim).then(() => {
		// Regenerate piece textures with the new tinted images
		texturecache.initTexturesForGame(gl, gamefile.boardsim);
		piecemodels.regenAll(gamefile.boardsim, mesh!);
	});
	// Reinit the promotion UI
	guipromotion.resetUI();
	const uniquePlayers = gamerules.getUniquePlayersInTurnOrder(
		gamefile.basegame.gameRules.turnOrder,
	);
	guipromotion.initUI(gamefile.basegame.gameRules.promotion?.pieces, uniquePlayers);
});

// Functions ---------------------------------------------------------------

/**  Returns the gamefile currently loaded */
function getGamefile(): FullGame | undefined {
	return loadedGamefile;
}

/** Returns the mesh of the gamefile currently loaded */
function getMesh(): Mesh | undefined {
	return mesh;
}

function areInGame(): boolean {
	return loadedGamefile !== undefined;
}

function isLoadedGameViewingWhitePerspective(): boolean {
	if (!loadedGamefile)
		throw Error(
			"Cannot ask if loaded game is from white's perspective when there isn't a loaded game.",
		);
	return youAreColor === p.WHITE;
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
		// console.log('Finished loading LOGICAL game stuff.');

		// Play the start game sound once LOGICAL stuff is finished loading,
		// so that the sound will still play in chrome, with the tab hidden, and
		// someone accepts your invite. (In that scenario, the graphical loading is blocked)
		gamesound.playGamestart();

		// Start GRAPHICAL loading immediately and hand its promise to the caller.
		return { graphical: loadGraphical(loadOptions) };
	});
}

/** Loads all of the logical components of a game */
async function loadLogical(loadOptions: LoadOptions): Promise<void> {
	loadedGamefile = await fullgame.initFullGame(
		loadOptions.metadata,
		loadOptions.dateTimestamp,
		loadOptions.variant,
		loadOptions.additional,
	);

	youAreColor = loadOptions.viewWhitePerspective ? p.WHITE : p.BLACK;

	const pieceCount = boardutil.getPieceCountOfGame(loadedGamefile.boardsim.pieces);
	// Disable miniimages if there's too many pieces
	if (pieceCount > miniimagerenderer.pieceCountToDisableMiniImages) miniimage.disable();
	// Disable arrows if there's too many pieces or lines in the game
	if (
		pieceCount > arrows.MAX_PIECES ||
		loadedGamefile.boardsim.pieces.slides.length > arrows.MAX_LINES
	)
		arrows.setMode(0);

	initCopyPastGameListeners();

	// If custom preset rays are specified, initiate them in drawrays.ts
	if (loadOptions.presetAnnotes?.squares)
		drawsquares.setPresetOverrides(loadOptions.presetAnnotes.squares);
	if (loadOptions.presetAnnotes?.rays)
		drawrays.setPresetOverrides(loadOptions.presetAnnotes.rays);

	GameBus.dispatch('game-loaded');
}

/** Loads all of the graphical components of a game */
async function loadGraphical(loadOptions: LoadOptions): Promise<void> {
	// Opening the guinavigation needs to be done in gameslot.ts instead of gameloader.ts so pasting games still opens it
	guinavigation.open({ allowEditCoords: loadOptions.allowEditCoords }); // Editing your coords allowed in local games
	guiclock.set(loadedGamefile!.basegame);

	await imagecache.initImagesForGame(loadedGamefile!.boardsim);
	texturecache.initTexturesForGame(gl, loadedGamefile!.boardsim);

	// MUST BE AFTER imagecache.initImagesForGame(), as we need SVGs fetched before then.
	const uniquePlayers = gamerules.getUniquePlayersInTurnOrder(
		loadedGamefile!.basegame.gameRules.turnOrder,
	);
	guipromotion.initUI(loadedGamefile!.basegame.gameRules.promotion?.pieces, uniquePlayers);

	// Rewind one move so that we can, after a short delay, animate the most recently played move.
	const lastmove = moveutil.getLastMove(loadedGamefile!.boardsim.moves);
	if (lastmove !== undefined) movepiece.applyMove(loadedGamefile!, lastmove, false); // Rewind one move

	// Initialize the mesh empty
	mesh = {
		offset: [0n, 0n],
		inverted: false,
		types: {},
	};

	// Generate the mesh of every piece type
	piecemodels.regenAll(loadedGamefile!.boardsim, mesh);

	// NEEDS TO BE AFTER generating the mesh, since this makes a graphical change.
	if (lastmove !== undefined)
		animateLastMoveTimeoutID = setTimeout(() => {
			// A small delay to animate the most recently played move.
			if (moveutil.areWeViewingLatestMove(loadedGamefile!.boardsim)) return; // Already viewing the lastest move
			movesequence.viewFront(loadedGamefile!, mesh!); // Updates to front even when they view different moves
			animateMove(lastmove.changes, true);
		}, delayOfLatestMoveAnimationOnRejoinMillis);

	// Init the star field void animation
	starfield.init();
}

/** The canvas will no longer render the current game */
function unloadGame(): void {
	if (!loadedGamefile)
		throw Error('Should not be calling to unload game when there is no game loaded.');
	// console.error("Unloading gamefile...");

	loadedGamefile = undefined;
	mesh = undefined;

	removeCopyPasteGameListeners();

	// Stop the timer that (animates the latest-played move when rejoining a game after a short delay)
	clearTimeout(animateLastMoveTimeoutID);
	animateLastMoveTimeoutID = undefined;

	GameBus.dispatch('game-unloaded');
}

/**
 * Sets the camera to the recentered position, plus a little zoomed in.
 * THEN transitions to normal zoom.
 */
function startStartingTransition(): void {
	const boxFloating = meshes.expandTileBoundingBoxToEncompassWholeSquare(
		loadedGamefile!.boardsim.startSnapshot.box,
	);
	const centerArea = area.calculateFromUnpaddedBox(boxFloating);
	boardpos.setBoardPos(centerArea.coords);
	const INITIAL_ZOOM_MULTIPLIER = preferences.getFastTransitionsMode() ? 1.4 : 1.75; // We start 1.75x zoomed in then normal, then transition into 1x
	const startScale = bd.multiply(centerArea.scale, bd.fromNumber(INITIAL_ZOOM_MULTIPLIER));
	boardpos.setBoardScale(startScale);
	guinavigation.recenter();
	Transition.eraseTelHist();
}

/** Called when a game is loaded, loads the event listeners for when we are in a game. */
function initCopyPastGameListeners(): void {
	document.addEventListener('copy', callbackCopy);
	document.addEventListener('paste', pastegame.callbackPaste);
	document.addEventListener('copy-game', callbackCopy);
	document.addEventListener('paste-game', pastegame.callbackPaste);
}

/** Called when a game is unloaded, closes the event listeners for being in a game. */
function removeCopyPasteGameListeners(): void {
	document.removeEventListener('copy', callbackCopy);
	document.removeEventListener('paste', pastegame.callbackPaste);
	document.removeEventListener('copy-game', callbackCopy);
	document.removeEventListener('paste-game', pastegame.callbackPaste);
}

function callbackCopy(_event: Event): void {
	if (document.activeElement instanceof HTMLInputElement) return; // Don't copy if the user is typing in an input field
	if (window.getSelection()?.toString()) return; // Don't copy if the user has text selected in the UI
	copygame.copyGame(false);
}

/**
 * Ends the game. Call this when the game is over by the used win condition.
 * Stops the clocks, darkens the board, displays who won, plays a sound effect.
 */
function concludeGame(): void {
	if (!loadedGamefile) throw Error("Cannot conclude game when there isn't one loaded");
	const basegame = loadedGamefile.basegame;
	if (basegame.gameConclusion === undefined)
		throw Error("Cannot conclude game when the game hasn't ended.");

	clock.endGame(basegame);
	guiclock.stopClocks(basegame);
	guigameinfo.gameEnd(basegame.gameConclusion);

	GameBus.dispatch('game-concluded');

	const victor = basegame.gameConclusion.victor; // undefined if aborted, null if draw
	const delayToPlayConcludeSoundSecs = 0.65;
	if (gameloader.areInLocalGame()) {
		if (victor !== null && victor !== undefined) {
			gamesound.playWin(delayToPlayConcludeSoundSecs);
		} else {
			gamesound.playDraw(delayToPlayConcludeSoundSecs);
		}
	} else {
		// In online game or engine game
		const ourRole = gameloader.getOurColor()!;
		if (victor === ourRole) gamesound.playWin(delayToPlayConcludeSoundSecs);
		else if (victor === null || victor === undefined)
			gamesound.playDraw(delayToPlayConcludeSoundSecs);
		else gamesound.playLoss(delayToPlayConcludeSoundSecs);
	}
}

/** Undoes the conclusion of the game. */
function unConcludeGame(): void {
	gamefileutility.setConclusion(loadedGamefile!.basegame, undefined);
}

export default {
	getGamefile,
	getMesh,
	areInGame,
	isLoadedGameViewingWhitePerspective,
	loadGamefile,
	unloadGame,
	startStartingTransition,
	concludeGame,
	unConcludeGame,
};

export type { PresetAnnotes, Additional };
