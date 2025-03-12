
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

import type { MetaData } from "../../chess/util/metadata.js";
import type { JoinGameMessage } from "../misc/onlinegame/onlinegamerouter.js";
import type { Additional, VariantOptions } from "./gameslot.js";
import type { EngineConfig } from "../misc/enginegame.js";
import type { Player } from "../../chess/util/typeutil.js";


import gui from "../gui/gui.js";
import gameslot from "./gameslot.js";
import clock from "../../chess/logic/clock.js";
import timeutil from "../../util/timeutil.js";
import typeutil from "../../chess/util/typeutil.js";
import gamefileutility from "../../chess/util/gamefileutility.js";
import enginegame from "../misc/enginegame.js";
import loadingscreen from "../gui/loadingscreen.js";
// @ts-ignore
import guigameinfo from "../gui/guigameinfo.js";
// @ts-ignore
import guinavigation from "../gui/guinavigation.js";
// @ts-ignore
import onlinegame from "../misc/onlinegame/onlinegame.js";
// @ts-ignore
import localstorage from "../../util/localstorage.js";
// @ts-ignore
import perspective from "../rendering/perspective.js";
// @ts-ignore
import movement from "../rendering/movement.js";
// @ts-ignore
import transition from "../rendering/transition.js";

import { players } from "../../chess/config.js";

// Variables --------------------------------------------------------------------


/** The type of game we are in, whether local or online, if we are in a game. */
let typeOfGameWeAreIn: undefined | 'local' | 'online' | 'engine' | 'editor';

/**
 * True when the gamefile is currently loading either the graphical
 * (such as the SVG requests and spritesheet generation) or engine script.
 * 
 * If so, the spinny pawn loading animation will be open.
 */
let gameLoading: boolean = false;


// Getters --------------------------------------------------------------------


/**
 * Returns true if we are in ANY type of game, whether local, online, engine, analysis, or editor.
 * 
 * If we're on the title screen or the lobby, this will be false.
 */
function areInAGame(): boolean {
	return typeOfGameWeAreIn !== undefined;
}

/** Returns the type of game we are in. */
function getTypeOfGameWeIn() {
	return typeOfGameWeAreIn;
}

function areInLocalGame(): boolean {
	return typeOfGameWeAreIn === 'local';
}

function isItOurTurn(color?: Player): boolean {
	if (typeOfGameWeAreIn === undefined) throw Error("Can't tell if it's our turn when we're not in a game!");
	if (typeOfGameWeAreIn === 'online') return onlinegame.isItOurTurn();
	else if (typeOfGameWeAreIn === 'engine') return enginegame.isItOurTurn();
	else if (typeOfGameWeAreIn === 'local') return gameslot.getGamefile()!.whosTurn === color;
	else throw Error("Don't know how to tell if it's our turn in this type of game: " + typeOfGameWeAreIn);
}

function getOurColor(): Player {
	if (typeOfGameWeAreIn === undefined) throw Error("Can't get our color when we're not in a game!");
	if (typeOfGameWeAreIn === 'online') return onlinegame.getOurColor();
	else if (typeOfGameWeAreIn === 'engine') return enginegame.getOurColor();
	throw Error("Can't get our color in this type of game: " + typeOfGameWeAreIn);
}

/**
 * Returns true if either the graphics (spritesheet generating),
 * or engine script, of the gamefile are currently being loaded.
 * 
 * If so, the spinny pawn loading animation will be open.
 */
function areWeLoadingGame(): boolean {
	return gameLoading;
}

/**
 * Updates whatever game is currently loaded, for what needs to be updated.
 */
function update() {
	if (typeOfGameWeAreIn === 'online') onlinegame.update();
}


// Start Game --------------------------------------------------------------------


/** Starts a local game according to the options provided. */
async function startLocalGame(options: {
	/** Must be one of the valid variants in variant.ts */
	Variant: string,
	TimeControl: MetaData['TimeControl'],
}) {
	typeOfGameWeAreIn = 'local';
	gameLoading = true;

	// Has to be awaited to give the document a chance to repaint.
	await loadingscreen.open();

	const metadata = {
		...options,
		Event: `Casual local ${translations[options.Variant]} infinite chess game`,
		Site: 'https://www.infinitechess.org/' as 'https://www.infinitechess.org/',
		Round: '-' as '-',
		UTCDate: timeutil.getCurrentUTCDate(),
		UTCTime: timeutil.getCurrentUTCTime()
	};

	gameslot.loadGamefile({
		metadata,
		viewWhitePerspective: true,
		allowEditCoords: true,
		/**
		 * Enable to tell the gamefile to include large amounts of undefined slots for every single piece type in the game.
		 * This lets us board edit without worry of regenerating the mesh every time we add a piece.
		 */
		// additional: { editor: true }
	})
		.then((result: any) => onFinishedLoading())
		.catch((err: Error) => loadingscreen.onError());

	// Open the gui stuff AFTER initiating the logical stuff,
	// because the gui DEPENDS on the other stuff.

	openGameinfoBarAndConcludeGameIfOver(metadata, false);
}

/** Starts an online game according to the options provided by the server. */
async function startOnlineGame(options: JoinGameMessage) {
	// console.log("Starting online game with invite options:");
	// console.log(jsutil.deepCopyObject(options));

	typeOfGameWeAreIn = 'online';
	gameLoading = true;
	
	// Has to be awaited to give the document a chance to repaint.
	await loadingscreen.open();

	const additional: Additional = {
		moves: options.moves,
		variantOptions: localstorage.loadItem(options.id) as VariantOptions,
		gameConclusion: options.gameConclusion,
		// If the clock values are provided, adjust the timer of whos turn it is depending on ping.
		clockValues: options.clockValues ? clock.adjustClockValuesForPing(options.clockValues) : undefined,
	};

	gameslot.loadGamefile({
		metadata: options.metadata,
		viewWhitePerspective: options.youAreColor === 'white',
		allowEditCoords: false,
		additional
	})
		.then((result: any) => onFinishedLoading())
		.catch((err: Error) => loadingscreen.onError());

	onlinegame.initOnlineGame(options);
	
	// Open the gui stuff AFTER initiating the logical stuff,
	// because the gui DEPENDS on the other stuff.

	openGameinfoBarAndConcludeGameIfOver(options.metadata, false);
}

/** Starts an engine game according to the options provided. */
async function startEngineGame(options: {
	/** The "Event" string of the game's metadata */
	Event: string,
	youAreColor: Player,
	currentEngine: 'engineCheckmatePractice', // Expand to a union type when more engines are added
	engineConfig: EngineConfig,
	variantOptions: VariantOptions,
	/** Whether to show the Undo and Restart buttons on the gameinfo bar. For checkmate practice games. */
	showGameControlButtons?: true
}) {
	typeOfGameWeAreIn = 'engine';
	gameLoading = true;

	// Has to be awaited to give the document a chance to repaint.
	await loadingscreen.open();

	const metadata: MetaData = {
		Event: options.Event,
		Site: 'https://www.infinitechess.org/',
		Round: '-',
		TimeControl: '-',
		White: options.youAreColor === players.WHITE ? '(You)' : 'Engine',
		Black: options.youAreColor === players.BLACK ? '(You)' : 'Engine',
		UTCDate: timeutil.getCurrentUTCDate(),
		UTCTime: timeutil.getCurrentUTCTime()
	};

	/** A promise that resolves when the GRAPHICAL (spritesheet) part of the game has finished loading. */
	const graphicalPromise: Promise<void> = gameslot.loadGamefile({
		metadata,
		viewWhitePerspective: options.youAreColor === players.WHITE,
		allowEditCoords: false,
		additional: { variantOptions: options.variantOptions }
	});

	/** A promise that resolves when the engine script has been fetched. */
	const enginePromise: Promise<void> = enginegame.initEngineGame(options);

	/**
	 * This resolves when BOTH the graphical and engine promises resolve,
	 * OR rejects immediately when one of them rejects!
	 */
	Promise.all([graphicalPromise, enginePromise])
		.then((results: any[]) => onFinishedLoading())
		.catch((err: Error) => loadingscreen.onError());

	openGameinfoBarAndConcludeGameIfOver(metadata, options.showGameControlButtons);
}

/**
 * Reloads the current local, online, or editor game from the provided metadata, existing moves, and variant options.
 */
async function pasteGame(options: {
	metadata: MetaData,
	additional: {
		/** If we're in the board editor, this must be empty. */
		moves?: string[],
		variantOptions: VariantOptions,
	}
}) {
	if (typeOfGameWeAreIn !== 'local' && typeOfGameWeAreIn !== 'online' && typeOfGameWeAreIn !== 'editor') throw Error("Can't paste a game when we're not in a local, online, or editor game.");
	if (typeOfGameWeAreIn === 'editor' && options.additional.moves && options.additional.moves.length > 0) throw Error("Can't paste a game with moves played while in the editor.");

	gameLoading = true;

	// Has to be awaited to give the document a chance to repaint.
	await loadingscreen.open();

	const viewWhitePerspective = gameslot.isLoadedGameViewingWhitePerspective(); // Retain the same perspective as the current loaded game.
	const additionalToUse: Additional = {
		...options.additional,
		editor: gameslot.getGamefile()!.editor, // Retain the same option as the current loaded game.
	};

	gameslot.unloadGame();

	gameslot.loadGamefile({
		metadata: options.metadata,
		viewWhitePerspective,
		allowEditCoords: guinavigation.areCoordsAllowedToBeEdited(),
		additional: additionalToUse,
	})
		.then((result: any) => onFinishedLoading())
		.catch((err: Error) => loadingscreen.onError());
	
	// Open the gui stuff AFTER initiating the logical stuff,
	// because the gui DEPENDS on the other stuff.

	openGameinfoBarAndConcludeGameIfOver(options.metadata, false);
}

/**
 * A function that is executed when a game is FULLY loaded (graphical, spritesheet, engine, etc.)
 * This hides the spinny pawn loading animation that covers the board.
 */
function onFinishedLoading() {
	// console.log('COMPLETELY finished loading game!');
	gameLoading = false;

	// We can now close the loading screen.

	// I don't think this one has to be awaited since we're pretty much
	// done with loading, there's not gonna be another lag spike..
	loadingscreen.close();
	gameslot.startStartingTransition(); // Play the zoom-in animation at the start of games.
}

/**
 * These items must be done after the logical parts of the gamefile are fully loaded
 * @param metadata - The metadata of the gamefile 
 * @param showGameControlButtons - Whether to show the practice game control buttons "Undo Move" and "Retry"
 */
function openGameinfoBarAndConcludeGameIfOver(metadata: MetaData, showGameControlButtons: boolean = false) {
	guigameinfo.open(metadata, showGameControlButtons);
	if (gamefileutility.isGameOver(gameslot.getGamefile()!)) gameslot.concludeGame();
}

function unloadGame() {
	if (typeOfGameWeAreIn === 'online') onlinegame.closeOnlineGame();
	else if (typeOfGameWeAreIn === 'engine') enginegame.closeEngineGame();
	
	guinavigation.close();
	guigameinfo.close();
	gameslot.unloadGame();
	perspective.disable();
	typeOfGameWeAreIn = undefined;
	movement.eraseMomentum();
	transition.terminate();

	gui.prepareForOpen();
}


// Exports --------------------------------------------------------------------


export default {
	areInAGame,
	areInLocalGame,
	isItOurTurn,
	getOurColor,
	areWeLoadingGame,
	getTypeOfGameWeIn,
	update,
	startLocalGame,
	startOnlineGame,
	startEngineGame,
	pasteGame,
	openGameinfoBarAndConcludeGameIfOver,
	unloadGame,
};