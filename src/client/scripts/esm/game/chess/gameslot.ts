/**
 * Whether we're in a local game, online game, analysis board, or board editor,
 * what they ALL have in common is a gamefile! This script stores THAT gamefile!
 *
 * It also has the loader and unloader methods for the gamefile.
 */

import type { MetaData } from '../../../../../shared/chess/util/metadata.js';
import type { Player } from '../../../../../shared/chess/util/typeutil.js';
import type { Mesh } from '../rendering/piecemodels.js';
import type { PresetAnnotes } from '../../../../../shared/chess/logic/icn/icnconverter.js';
import type { Additional, FullGame } from '../../../../../shared/chess/logic/gamefile.js';

import bd from '@naviary/bigdecimal';
import guinavigation from '../gui/guinavigation.js';
import guipromotion from '../gui/guipromotion.js';
import spritesheet from '../rendering/spritesheet.js';
import movesequence from './movesequence.js';
import gamefileutility from '../../../../../shared/chess/util/gamefileutility.js';
import moveutil from '../../../../../shared/chess/util/moveutil.js';
import piecemodels from '../rendering/piecemodels.js';
import movepiece from '../../../../../shared/chess/logic/movepiece.js';
import miniimage from '../rendering/miniimage.js';
import arrows from '../rendering/arrows/arrows.js';
import clock from '../../../../../shared/chess/logic/clock.js';
import guigameinfo from '../gui/guigameinfo.js';
import onlinegame from '../misc/onlinegame/onlinegame.js';
import imagecache from '../../chess/rendering/imagecache.js';
import boardutil from '../../../../../shared/chess/util/boardutil.js';
import boardpos from '../rendering/boardpos.js';
import texturecache from '../../chess/rendering/texturecache.js';
import guiclock from '../gui/guiclock.js';
import drawsquares from '../rendering/highlights/annotations/drawsquares.js';
import drawrays from '../rendering/highlights/annotations/drawrays.js';
import gamefile from '../../../../../shared/chess/logic/gamefile.js';
import winconutil from '../../../../../shared/chess/util/winconutil.js';
import copygame from './copygame.js';
import pastegame from './pastegame.js';
import board from '../rendering/boardtiles.js';
import Transition from '../rendering/transitions/Transition.js';
import perspective from '../rendering/perspective.js';
import area from '../rendering/area.js';
import gamesound from '../misc/gamesound.js';
import meshes from '../rendering/meshes.js';
import starfield from '../rendering/starfield.js';
import { players } from '../../../../../shared/chess/util/typeutil.js';
import { animateMove } from './graphicalchanges.js';
import { gl } from '../rendering/webgl.js';
import { GameBus } from '../GameBus.js';

// Type Definitions ----------------------------------------------------------

/** Options for loading a game. */
interface LoadOptions {
	/** The metadata of the game */
	metadata: MetaData;
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
	return youAreColor === players.WHITE;
}

/**
 * Loads a gamefile onto the board.
 *
 * This loads the logical stuff first, then returns a PROMISE that resolves
 * when the GRAPHICAL stuff is finished loading (such as the spritesheet).
 */
function loadGamefile(loadOptions: LoadOptions): Promise<void> {
	if (loadedGamefile) throw new Error('Must unloadGame() before loading a new one.');
	// console.log("Loading gamefile...");

	// console.log('Started loading game...');

	// The game should be considered loaded once the LOGICAL stuff is finished,
	// but the loading animation should only be closed when
	// both the LOGICAL and GRAPHICAL stuff are finished.

	// First load the LOGICAL stuff...
	loadLogical(loadOptions);
	// console.log('Finished loading LOGICAL game stuff.');

	// Play the start game sound once LOGICAL stuff is finished loading,
	// so that the sound will still play in chrome, with the tab hidden, and
	// someone accepts your invite. (In that scenario, the graphical loading is blocked)
	gamesound.playGamestart();

	/**
	 * Next start loading the GRAPHICAL stuff...
	 *
	 * This returns a promise that resolves when it's fully loaded,
	 * since the graphics loading is asynchronious.
	 */
	return loadGraphical(loadOptions);
}

/** Loads all of the logical components of a game */
function loadLogical(loadOptions: LoadOptions): void {
	loadedGamefile = gamefile.initFullGame(loadOptions.metadata, loadOptions.additional);

	youAreColor = loadOptions.viewWhitePerspective ? players.WHITE : players.BLACK;

	const pieceCount = boardutil.getPieceCountOfGame(loadedGamefile.boardsim.pieces);
	// Disable miniimages if there's too many pieces
	if (pieceCount > miniimage.pieceCountToDisableMiniImages) miniimage.disable();
	// Disable arrows if there's too many pieces or lines in the game
	if (
		pieceCount > arrows.pieceCountToDisableArrows ||
		loadedGamefile.boardsim.pieces.slides.length > arrows.lineCountToDisableArrows
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
	perspective.resetRotations(loadOptions.viewWhitePerspective);

	await imagecache.initImagesForGame(loadedGamefile!.boardsim);
	await spritesheet.initSpritesheetForGame(gl, loadedGamefile!.boardsim);
	texturecache.initTexturesForGame(gl, loadedGamefile!.boardsim);

	// MUST BE AFTER creating the spritesheet, as we won't have the SVGs fetched before then.
	guipromotion.initUI(loadedGamefile!.basegame.gameRules.promotionsAllowed);

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
	const amount = bd.fromNumber(1.75); // We start 1.75x zoomed in then normal, then transition into 1x
	const startScale = bd.multiply(centerArea.scale, amount);
	boardpos.setBoardScale(startScale);
	guinavigation.recenter();
	Transition.eraseTelHist();
}

/** Called when a game is loaded, loads the event listeners for when we are in a game. */
function initCopyPastGameListeners(): void {
	document.addEventListener('copy', callbackCopy);
	document.addEventListener('paste', pastegame.callbackPaste);
}

/** Called when a game is unloaded, closes the event listeners for being in a game. */
function removeCopyPasteGameListeners(): void {
	document.removeEventListener('copy', callbackCopy);
	document.removeEventListener('paste', pastegame.callbackPaste);
}

function callbackCopy(_event: Event): void {
	if (document.activeElement !== document.body) return; // Don't copy if the user is typing in an input field
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

	const victor: Player | undefined = winconutil.getVictorAndConditionFromGameConclusion(
		basegame.gameConclusion,
	).victor; // undefined if aborted
	const delayToPlayConcludeSoundSecs = 0.65;
	if (!onlinegame.areInOnlineGame()) {
		if (victor !== players.NEUTRAL) gamesound.playWin(delayToPlayConcludeSoundSecs);
		else gamesound.playDraw(delayToPlayConcludeSoundSecs);
	} else {
		// In online game
		if (!onlinegame.doWeHaveRole() || victor === onlinegame.getOurColor())
			gamesound.playWin(delayToPlayConcludeSoundSecs);
		else if (victor === players.NEUTRAL || !victor)
			gamesound.playDraw(delayToPlayConcludeSoundSecs);
		else gamesound.playLoss(delayToPlayConcludeSoundSecs);
	}

	// Set the Result and Condition metadata
	gamefileutility.setTerminationMetadata(basegame);
}

/** Undoes the conclusion of the game. */
function unConcludeGame(): void {
	delete loadedGamefile!.basegame.gameConclusion;
	// Delete the Result and Condition metadata
	gamefileutility.eraseTerminationMetadata(loadedGamefile!.basegame);
	board.resetColor();
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

export type { LoadOptions, PresetAnnotes, Additional };
