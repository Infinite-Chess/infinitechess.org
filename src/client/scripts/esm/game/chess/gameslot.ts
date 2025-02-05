
/**
 * Whether we're in a local game, online game, analysis board, or board editor,
 * what they ALL have in common is a gamefile! This script stores THAT gamefile!
 * 
 * It also has the loader and unloader methods for the gamefile.
 */


import type { MetaData } from "../../chess/util/metadata.js";
import type { ClockValues } from "../../chess/logic/clock.js";
import type { Coords, CoordsKey } from "../../chess/util/coordutil.js";
// @ts-ignore
import type { GameRules } from "../../chess/variants/gamerules.js";


import guinavigation from "../gui/guinavigation.js";
import guipromotion from "../gui/guipromotion.js";
import loadingscreen from "../gui/loadingscreen.js";
import spritesheet from "../rendering/spritesheet.js";
import selection from "./selection.js";
import movesequence from "./movesequence.js";
import gamefileutility from "../../chess/util/gamefileutility.js";
// @ts-ignore
import gamefile from "../../chess/logic/gamefile.js";
// @ts-ignore
import movepiece from "../../chess/logic/movepiece.js";
// @ts-ignore
import { gl } from "../rendering/webgl.js";
// @ts-ignore
import sound from "../misc/sound.js";
// @ts-ignore
import copypastegame from "./copypastegame.js";
// @ts-ignore
import onlinegame from "../misc/onlinegame/onlinegame.js";
// @ts-ignore
import piecesmodel from "../rendering/piecesmodel.js";
// @ts-ignore
import options from "../rendering/options.js";
// @ts-ignore
import transition from "../rendering/transition.js";
// @ts-ignore
import board from "../rendering/board.js";
// @ts-ignore
import guiclock from "../gui/guiclock.js";
// @ts-ignore
import miniimage from "../rendering/miniimage.js";
// @ts-ignore
import area from "../rendering/area.js";
// @ts-ignore
import movement from "../rendering/movement.js";
// @ts-ignore
import arrows from "../rendering/arrows/arrows.js";
// @ts-ignore
import moveutil from "../../chess/util/moveutil.js";
// @ts-ignore
import clock from "../../chess/logic/clock.js";
// @ts-ignore
import guigameinfo from "../gui/guigameinfo.js";
// @ts-ignore
import guipause from "../gui/guipause.js";
// @ts-ignore
import perspective from "../rendering/perspective.js";


// Type Definitions ----------------------------------------------------------


/** Options for loading a game. */
interface LoadOptions {
	/** The metadata of the game */
	metadata: MetaData,
	/** True if we should be viewing the game from white's perspective, false for black's perspective. */
	viewWhitePerspective: boolean,
	/** Whether the coordinate field box should be editable. */
	allowEditCoords: boolean,
	additional?: Additional
}

/** Additional options that may go into the gamefile constructor.
 * Typically used if we're pasting a game, or reloading an online one. */
interface Additional {
	/** Existing moves, if any, to forward to the front of the game. Should be specified if reconnecting to an online game or pasting a game. Each move should be in the most compact notation, e.g., `['1,2>3,4','10,7>10,8Q']`. */
	moves?: string[],
	/** If a custom position is needed, for instance, when pasting a game, then these options should be included. */
	variantOptions?: VariantOptions,
	/** The conclusion of the game, if loading an online game that has already ended. */
	gameConclusion?: string | false,
	/** Any already existing clock values for the gamefile. */
	clockValues?: ClockValues,
}

/**
 * Variant options that can be used to load a custom game,
 * whether local or online, instead of one of the default variants.
 */
interface VariantOptions {
	/**
	 * The full move number of the turn at the provided position. Default: 1.
	 * Can be higher if you copy just the positional information in a game with some moves played already.
	 */
	fullMove: number,
	/** The square enpassant capture is allowed, in the starting position specified (not after all moves are played). */
	enpassant?: Coords,
	gameRules: GameRules,
	/** If the move moveRule gamerule is present, this is a string of its current state and the move rule number (e.g. `"0/100"`) */
	moveRule?: `${number}/${number}`,
	/** A position in ICN notation (e.g. `"P1,2+|P2,2+|..."`) */
	positionString: string,
	/**
	 * The starting position object, containing the pieces organized by key.
	 * The key of the object is the coordinates of the piece as a string,
	 * and the value is the type of piece on that coordinate (e.g. `"pawnsW"`)
	 */
	startingPosition: { [key: CoordsKey]: string }
	/** The special rights object of the gamefile at the starting position provided, NOT after the moves provided have been played. */
	specialRights: { [key: CoordsKey]: true },
}


// Variables ---------------------------------------------------------------


/** True when the gamefile is currently loading the logical stuff (ignores graphics such as the spritesheet). */
let logicLoading: boolean = false;

/**
 * True when the gamefile is currently loading the graphical stuff,
 * such as the SVG requests and spritesheet generation.
 */
let graphicsLoading: boolean = false;

/** The currently loaded game. */
let loadedGamefile: gamefile | undefined;

/** True if we're viewing the game from white's perspective, false for black's perspective. */
let youAreColor: string;

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


/**
 * Returns the gamefile currently loaded
 * @returns {gamefile} The current gamefile
 */
function getGamefile(): gamefile | undefined {
	return loadedGamefile;
}

function areInGame(): boolean {
	return loadedGamefile !== undefined;
}

/** Returns true if the gamefile is currently loading logically (doesn't care about graphics). */
function areWeLoadingLogical(): boolean {
	return logicLoading;
}

/**
 * Returns true if the graphics of the gamefile are currently being loaded (spritesheet generating).
 * 
 * We know the gamefile is finished loading once the graphics are done, because they are last.
 */
function areWeLoadingGraphics(): boolean {
	return graphicsLoading;
}

/** Returns what color we are viewing the current loaded game by default. */
function getOurColor(): string {
	return youAreColor;
}

function isLoadedGameViewingWhitePerspective() {
	if (!loadedGamefile) throw Error("Cannot ask if loaded game is from white's perspective when there isn't a loaded game.");
	return youAreColor === 'white';
};



/**
 * Loads a gamefile onto the board.
 */
async function loadGamefile(loadOptions: LoadOptions) {
	if (loadedGamefile) throw new Error("Must unloadGame() before loading a new one.");

	// console.log('Started loading game...');
	logicLoading = true;
	graphicsLoading = true;
	// Has to be awaited to give the document a chance to repaint.
	await loadingscreen.open();
	
	// The game should be considered loaded once the LOGICAL stuff is finished,
	// but the loading animation should only be closed when
	// both the LOGICAL and GRAPHICAL stuff are finished.

	// First load the LOGICAL stuff...
	loadLogical(loadOptions);
	// console.log('Finished loading LOGICAL game stuff.');
	logicLoading = false;
	// Play the start game sound once LOGICAL stuff is finished loading,
	// so that the sound will still play in chrome, with the tab hidden, and
	// someone accepts your invite. (In that scenario, the graphical loading is blocked)
	sound.playSound_gamestart();

	// Next start loading the GRAPHICAL stuff...
	/*
	 * The reason we attach a .then() to this instead of just 'await'ing,
	 * is because we need loadGamefile() to return as soon as the logical
	 * stuff has finished loading. The graphics may finish on its own time.
	 */
	loadGraphical(loadOptions).then(async() => {
		// console.log('Finished loading GRAPHICAL game stuff.');
		graphicsLoading = false;
	
		// Logical and Graphical loadings are done!
		// We can now close the loading screen.
	
		// I don't think this one has to be awaited since we're pretty much
		// done with loading, there's not gonna be another lag spike..
		loadingscreen.close();
		startStartingTransition();
	});
}

/** Loads all of the logical components of a game */
function loadLogical(loadOptions: LoadOptions) {

	const newGamefile = new gamefile(loadOptions.metadata, loadOptions.additional);

	youAreColor = loadOptions.viewWhitePerspective ? 'white' : 'black';

	// If the game has more lines than this, then we turn off arrows at the start to prevent a lag spike.
	const lineCountToDisableArrows = 16;

	// Disable miniimages and arrows if there's over 50K pieces. They render too slow.
	if (newGamefile.startSnapshot.pieceCount >= gamefileutility.pieceCountToDisableCheckmate) {
		miniimage.disable();
		arrows.setMode(0); // Disable arrows too
	} else if (newGamefile.startSnapshot.slidingPossible.length > lineCountToDisableArrows) { // Also disable arrows if there's too many lines in the game (they will really lag!)
		arrows.setMode(0);
	}

	initCopyPastGameListeners();

	// Immediately conclude the game if we loaded a game that's over already
	loadedGamefile = newGamefile;
}

/** Loads all of the graphical components of a game */
async function loadGraphical(loadOptions: LoadOptions) {
	// Opening the guinavigation needs to be done in gameslot.ts instead of gameloader.ts so pasting games still opens it
	guinavigation.open({ allowEditCoords: loadOptions.allowEditCoords }); // Editing your coords allowed in local games
	guiclock.set(loadedGamefile);
	perspective.resetRotations(loadOptions.viewWhitePerspective);

	try {
		await spritesheet.initSpritesheetForGame(gl, loadedGamefile!);
	} catch (e) { // An error ocurred during the fetching of piece svgs and spritesheet gen
		await loadingscreen.onError(e as Event);
	}

	// MUST BE AFTER creating the spritesheet, as we won't have the SVGs fetched before then.
	guipromotion.initUI(loadedGamefile!.gameRules.promotionsAllowed);

	// Rewind one move so that we can, after a short delay, animate the most recently played move.
	const lastmove = moveutil.getLastMove(loadedGamefile!.moves);
	if (lastmove !== undefined) {
		// Rewind one move
		movepiece.applyMove(loadedGamefile!, lastmove, false);
		
		// A small delay to animate the most recently played move.
		animateLastMoveTimeoutID = setTimeout(() => {
			if (moveutil.areWeViewingLatestMove(loadedGamefile!)) return; // Already viewing the lastest move
			movesequence.viewFront(loadedGamefile!); // Updates to front even when they view different moves
			movesequence.animateMove(lastmove, true);
		}, delayOfLatestMoveAnimationOnRejoinMillis);
	}

	// Regenerate the mesh of all the pieces.
	await piecesmodel.regenModel(loadedGamefile!, options.getPieceRegenColorArgs());
}

/** The canvas will no longer render the current game */
function unloadGame() {
	if (graphicsLoading) throw Error("Cannot unload current gamefile when the previous one hasn't loaded all the way yet.");
	if (!loadedGamefile) throw Error('Should not be calling to unload game when there is no game loaded.');
	
	// Terminate the mesh algorithm.
	loadedGamefile.mesh.terminateIfGenerating();
	loadedGamefile = undefined;

	selection.unselectPiece();
	transition.eraseTelHist();
	board.updateTheme(); // Resets the board color (the color changes when checkmate happens)
	closeCopyPasteGameListeners();

	// Clock data is unloaded with gamefile now, just need to reset gui. Not our problem ¯\_(ツ)_/¯
	guiclock.resetClocks();

	spritesheet.deleteSpritesheet();
	guipromotion.resetUI();
	// Re-enable them if the previous game turned them off due to too many pieces.
	miniimage.enable();

	// Stop the timer that animates the latest-played move when rejoining a game, after a short delay
	clearTimeout(animateLastMoveTimeoutID);
	animateLastMoveTimeoutID = undefined;
	
	options.disableEM();
}

/**
 * Sets the camera to the recentered position, plus a little zoomed in.
 * THEN transitions to normal zoom.
 */
function startStartingTransition() {
	const centerArea = area.calculateFromUnpaddedBox(loadedGamefile!.startSnapshot.box);
	movement.setPositionToArea(centerArea);
	movement.setBoardScale(movement.getBoardScale() * 1.75);
	guinavigation.recenter();
}

/** Called when a game is loaded, loads the event listeners for when we are in a game. */
function initCopyPastGameListeners() {
	document.addEventListener('copy', copypastegame.callbackCopy);
	document.addEventListener('paste', copypastegame.callbackPaste);
}

/** Called when a game is unloaded, closes the event listeners for being in a game. */
function closeCopyPasteGameListeners() {
	document.removeEventListener('copy', copypastegame.callbackCopy);
	document.removeEventListener('paste', copypastegame.callbackPaste);
}

/**
 * Ends the game. Call this when the game is over by the used win condition.
 * Stops the clocks, darkens the board, displays who won, plays a sound effect.
 */
function concludeGame() {
	if (!loadedGamefile) throw Error("Cannot conclude game when there isn't one loaded");
	if (loadedGamefile.gameConclusion === false) throw Error("Cannot conclude game when the game hasn't ended.");

	clock.endGame(loadedGamefile);
	guiclock.stopClocks(loadedGamefile);
	board.darkenColor();
	guigameinfo.gameEnd(loadedGamefile.gameConclusion);
	onlinegame.onGameConclude();

	const delayToPlayConcludeSoundSecs = 0.65;
	if (!onlinegame.areInOnlineGame()) {
		if (!loadedGamefile.gameConclusion.includes('draw')) sound.playSound_win(delayToPlayConcludeSoundSecs);
		else sound.playSound_draw(delayToPlayConcludeSoundSecs);
	} else { // In online game
		if (loadedGamefile.gameConclusion.includes(onlinegame.getOurColor())) sound.playSound_win(delayToPlayConcludeSoundSecs);
		else if (loadedGamefile.gameConclusion.includes('draw') || loadedGamefile.gameConclusion.includes('aborted')) sound.playSound_draw(delayToPlayConcludeSoundSecs);
		else sound.playSound_loss(delayToPlayConcludeSoundSecs);
	}
	
	// Set the Result and Condition metadata
	gamefileutility.setTerminationMetadata(loadedGamefile);

	selection.unselectPiece();
	guipause.updateTextOfMainMenuButton();
}


export default {
	getGamefile,
	areInGame,
	areWeLoadingLogical,
	areWeLoadingGraphics,
	getOurColor,
	isLoadedGameViewingWhitePerspective,
	loadGamefile,
	unloadGame,
	concludeGame,
};

export type {
	Additional,
	VariantOptions
};