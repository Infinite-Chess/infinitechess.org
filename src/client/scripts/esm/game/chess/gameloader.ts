
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


import gui from "../gui/gui.js";
import gameslot from "./gameslot.js";
import clock from "../../chess/logic/clock.js";
import timeutil from "../../util/timeutil.js";
import gamefileutility from "../../chess/util/gamefileutility.js";
import enginegame from "../misc/enginegame.js";
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


// Variables --------------------------------------------------------------------


/** The type of game we are in, whether local or online, if we are in a game. */
let typeOfGameWeAreIn: undefined | 'local' | 'online' | 'engine';


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

function isItOurTurn(color?: string): boolean {
	if (typeOfGameWeAreIn === undefined) throw Error("Can't tell if it's our turn when we're not in a game!");
	if (typeOfGameWeAreIn === 'online') return onlinegame.isItOurTurn();
	else if (typeOfGameWeAreIn === 'engine') return enginegame.isItOurTurn();
	else if (typeOfGameWeAreIn === 'local') return gameslot.getGamefile()!.whosTurn === color;
	else throw Error("Don't know how to tell if it's our turn in this type of game: " + typeOfGameWeAreIn);
}

function getOurColor(): 'white' | 'black' {
	if (typeOfGameWeAreIn === undefined) throw Error("Can't get our color when we're not in a game!");
	if (typeOfGameWeAreIn === 'online') return onlinegame.getOurColor();
	else if (typeOfGameWeAreIn === 'engine') return enginegame.getOurColor();
	throw Error("Can't get our color in this type of game: " + typeOfGameWeAreIn);
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
	const metadata = {
		...options,
		Event: `Casual local ${translations[options.Variant]} infinite chess game`,
		Site: 'https://www.infinitechess.org/' as 'https://www.infinitechess.org/',
		Round: '-' as '-',
		UTCDate: timeutil.getCurrentUTCDate(),
		UTCTime: timeutil.getCurrentUTCTime()
	};

	await gameslot.loadGamefile({
		metadata,
		viewWhitePerspective: true,
		allowEditCoords: true,
	});
	typeOfGameWeAreIn = 'local';

	// Open the gui stuff AFTER initiating the logical stuff,
	// because the gui DEPENDS on the other stuff.

	openGameinfoBarAndConcludeGameIfOver(metadata);
}

/** Starts an online game according to the options provided by the server. */
async function startOnlineGame(options: JoinGameMessage) {
	// console.log("Starting online game with invite options:");
	// console.log(jsutil.deepCopyObject(options));

	const additional: Additional = {
		moves: options.moves,
		variantOptions: localstorage.loadItem(options.id) as VariantOptions,
		gameConclusion: options.gameConclusion,
		// If the clock values are provided, adjust the timer of whos turn it is depending on ping.
		clockValues: options.clockValues ? clock.adjustClockValuesForPing(options.clockValues) : undefined,
	};

	await gameslot.loadGamefile({
		metadata: options.metadata,
		viewWhitePerspective: options.youAreColor === 'white',
		allowEditCoords: false,
		additional
	});
	typeOfGameWeAreIn = 'online';
	onlinegame.initOnlineGame(options);
	
	// Open the gui stuff AFTER initiating the logical stuff,
	// because the gui DEPENDS on the other stuff.

	openGameinfoBarAndConcludeGameIfOver(options.metadata);
}

/** Starts an engine game according to the options provided. */
async function startEngineGame(options: {
	/** The "Event" string of the game's metadata */
	Event: string,
	youAreColor: 'white' | 'black',
	currentEngine: 'engineCheckmatePractice', // Expand to a union type when more engines are added
	engineConfig: EngineConfig,
	variantOptions: VariantOptions
}) {
	const metadata: MetaData = {
		Event: options.Event,
		Site: 'https://www.infinitechess.org/',
		Round: '-',
		TimeControl: '-',
		White: options.youAreColor === 'white' ? '(You)' : 'Engine',
		Black: options.youAreColor === 'black' ? '(You)' : 'Engine',
		UTCDate: timeutil.getCurrentUTCDate(),
		UTCTime: timeutil.getCurrentUTCTime()
	};

	await gameslot.loadGamefile({
		metadata,
		viewWhitePerspective: options.youAreColor === 'white',
		allowEditCoords: false,
		additional: { variantOptions: options.variantOptions }
	});
	typeOfGameWeAreIn = 'engine';
	enginegame.initEngineGame(options);

	openGameinfoBarAndConcludeGameIfOver(metadata);
}



/** These items must be done after the logical parts of the gamefile are fully loaded. */
function openGameinfoBarAndConcludeGameIfOver(metadata: MetaData) {
	guigameinfo.open(metadata);
	if (gamefileutility.isGameOver(gameslot.getGamefile()!)) gameslot.concludeGame();
}

function unloadGame() {
	if (typeOfGameWeAreIn === 'online') onlinegame.closeOnlineGame();
	else if (typeOfGameWeAreIn === 'engine') enginegame.closeEngineGame();
	
	guinavigation.close();
	guigameinfo.close();
	gameslot.unloadGame();
	perspective.disable();
	gui.prepareForOpen();
	typeOfGameWeAreIn = undefined;
}


// Exports --------------------------------------------------------------------


export default {
	areInAGame,
	areInLocalGame,
	isItOurTurn,
	getOurColor,
	getTypeOfGameWeIn,
	update,
	startLocalGame,
	startOnlineGame,
	startEngineGame,
	openGameinfoBarAndConcludeGameIfOver,
	unloadGame,
};