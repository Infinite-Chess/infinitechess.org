
/**
 * The game slot holds a gamefile object, most of the logic stuff, not much GUI.
 * But it will init UI stuff that is common across all types of games.
 * For example, it will init the promotion UI.
 * 
 * A gamefile object could be used for ANY of the following reasons:
 * * Local
 * * Online
 * * Analysis
 * * Board Editor
 * 
 * This also contains the loader and unloader methods for the game slot.
 */

// @ts-ignore
import gamefile from "../../chess/logic/gamefile";
// @ts-ignore
import movepiece from "../../chess/logic/movepiece";
// @ts-ignore
import { gl } from "../rendering/webgl";
// @ts-ignore
import sound from "../misc/sound";
// @ts-ignore
import copypastegame from "./copypastegame";
// @ts-ignore
import gamefileutility from "../../chess/util/gamefileutility";
// @ts-ignore
import onlinegame from "../misc/onlinegame";
// @ts-ignore
import piecesmodel from "../rendering/piecesmodel";
// @ts-ignore
import options from "../rendering/options";
// @ts-ignore
import selection from "./selection";
// @ts-ignore
import transition from "../rendering/transition";
// @ts-ignore
import board from "../rendering/board";
// @ts-ignore
import guiclock from "../gui/guiclock";
// @ts-ignore
import miniimage from "../rendering/miniimage";
// @ts-ignore
import area from "../rendering/area";
// @ts-ignore
import movement from "../rendering/movement";
// @ts-ignore
import arrows from "../rendering/arrows";
// @ts-ignore
import winconutil from "../../chess/util/winconutil";
// @ts-ignore
import moveutil from "../../chess/util/moveutil";
// @ts-ignore
import clock from "../../chess/logic/clock";
// @ts-ignore
import guigameinfo from "../gui/guigameinfo";
// @ts-ignore
import guipause from "../gui/guipause";
import guinavigation from "../gui/guinavigation";
import guipromotion from "../gui/guipromotion";
import loadingscreen from "../gui/loadingscreen";
import spritesheet from "../rendering/spritesheet";


// Type Definitions ---------------------------------------------------------------


import type { MetaData } from "../../chess/util/metadata";


// Variables ---------------------------------------------------------------


/**
 * True when a game is currently loading and SVGs are being requested
 * or the spritesheet is being generated.
 */
let gameIsLoading: boolean = false;

/** The currently loaded game. */
let loadedGamefile: gamefile | undefined;

/** True if we're viewing the game from white's perspective, false for black's perspective. */
let youAreColor: string;

/**
 * The timeout id of the timer that animates the latest-played
 * move when rejoining a game, after a short delay
 */
let animateLastMoveTimeoutID;
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

function areInGame() {
	return loadedGamefile !== undefined;
}

/** Returns true if a new gamefile is currently being loaded */
function areWeLoading() {
	return gameIsLoading;
}

function isLoadedGameViewingWhitePerspective() {
	if (!loadedGamefile) throw Error("Cannot ask if loaded game is from white's perspective when there isn't a loaded game.");
	return youAreColor === 'white';
};

/**
 * Loads a gamefile onto the board.
 * Generates the gamefile and organizes its lines. Inits the promotion UI,
 * mesh of all the pieces, and toggles miniimage rendering. (everything visual)
 * @param {Object} metadata - An object containing the property `Variant`, and optionally `UTCDate` and `UTCTime`, which can be used to extract the version of the variant. Without the date, the latest version will be used.
 * @param {Object} viewWhitePerspective - True if we should be viewing the game from white's perspective, false for black's perspective.
 * @param {Object} [options] - Options for constructing the gamefile.
 * @param {string[]} [options.moves] - Existing moves, if any, to forward to the front of the game. Should be specified if reconnecting to an online game or pasting a game. Each move should be in the most compact notation, e.g., `['1,2>3,4','10,7>10,8Q']`.
 * @param {Object} [options.variantOptions] - If a custom position is needed, for instance, when pasting a game, then these options should be included.
 * @param {Object} [options.gameConclusion] - The conclusion of the game, if loading an online game that has already ended.
 * @param {Object} [options.clockValues] - Any already existing clock values for the gamefile, in the format `{ timerWhite, timerBlack, accountForPing }`
 */
async function loadGamefile(
	metadata: MetaData,
	viewWhitePerspective: boolean,
	{ moves, variantOptions, gameConclusion, clockValues }: {
		moves?: string[],
		variantOptions?: any,
		gameConclusion?: string | false,
		clockValues?: any,
	} = {}
) {

	if (loadedGamefile) throw new Error("Must unloadGame() before loading a new one.");

	console.log('Started loading');
	gameIsLoading = true;
	// Has to be awaited to give the document a chance to repaint.
	await loadingscreen.open();

	const newGamefile = new gamefile(metadata, { moves, variantOptions, gameConclusion, clockValues });

	// Rewind one move so that we can animate the very final move.
	if (newGamefile.moveIndex > -1) movepiece.rewindMove(newGamefile,  { updateData: false, removeMove: false, animate: false });

	try {
		await spritesheet.initSpritesheetForGame(gl, newGamefile);
	} catch (e) { // An error ocurred during the fetching of piece svgs and spritesheet gen
		await loadingscreen.onError(e);
	}
	guipromotion.initUI(newGamefile.gameRules.promotionsAllowed);

	// A small delay to animate the very last move, so the loading screen
	// spinny pawn animation has time to fade away.
	animateLastMoveTimeoutID = setTimeout(movepiece.forwardToFront, delayOfLatestMoveAnimationOnRejoinMillis, newGamefile, { flipTurn: false, updateProperties: false });

	loadedGamefile = newGamefile;
	youAreColor = viewWhitePerspective ? 'white' : 'black';

	// If the game has more lines than this, then we turn off arrows at the start to prevent a lag spike.
	const lineCountToDisableArrows = 16;

	// Disable miniimages and arrows if there's over 50K pieces. They render too slow.
	if (newGamefile.startSnapshot.pieceCount >= gamefileutility.pieceCountToDisableCheckmate) {
		miniimage.disable();
		arrows.setMode(0); // Disable arrows too
	} else if (newGamefile.startSnapshot.slidingPossible.length > lineCountToDisableArrows) { // Also disable arrows if there's too many lines in the game (they will really lag!)
		arrows.setMode(0);
	}

	// Immediately conclude the game if we loaded a game that's over already
	if (gamefileutility.isGameOver(newGamefile)) {
		concludeGame();
		onlinegame.requestRemovalFromPlayersInActiveGames();
	}

	// The only time the document should listen for us pasting a game, is when a game is already loaded.
	// If a game WASN'T loaded, then we wouldn't be on a screen that COULD load a game!!
	initCopyPastGameListeners();

	// Has to be awaited to give the document a chance to repaint.
	await loadingscreen.close();
	startStartingTransition();
	console.log('Finished loading');

	// Regenerate the mesh of all the pieces.
	piecesmodel.regenModel(newGamefile, options.getPieceRegenColorArgs());

	gameIsLoading = false;
}

/** The canvas will no longer render the current game */
function unloadGame() {
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
	guinavigation.recenter(loadedGamefile!);
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

	if (winconutil.isGameConclusionDecisive(loadedGamefile.gameConclusion)) moveutil.flagLastMoveAsMate(loadedGamefile);
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
	areWeLoading,
	isLoadedGameViewingWhitePerspective,
	loadGamefile,
	unloadGame,
	concludeGame,
};
