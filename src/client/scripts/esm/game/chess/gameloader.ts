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

import type { MetaData } from '../../../../../shared/chess/util/metadata.js';
import type {
	ParticipantState,
	ServerGameMoveMessage,
} from '../../../../../server/game/gamemanager/gameutility.js';
import type { ServerGameInfo } from '../misc/onlinegame/onlinegamerouter.js';
import type { Additional } from '../../../../../shared/chess/logic/gamefile.js';
import type { VariantOptions } from '../../../../../shared/chess/logic/initvariant.js';
import type { EngineConfig, validEngineName } from '../misc/enginegame.js';
import type { Player } from '../../../../../shared/chess/util/typeutil.js';
import type { PresetAnnotes } from '../../../../../shared/chess/logic/icn/icnconverter.js';
import type { ClockValues } from '../../../../../shared/chess/logic/clock.js';

import perspective from '../rendering/perspective.js';
import Transition from '../rendering/transitions/Transition.js';
import gui from '../gui/gui.js';
import gameslot from './gameslot.js';
import timeutil from '../../../../../shared/util/timeutil.js';
import gamefileutility from '../../../../../shared/chess/util/gamefileutility.js';
import enginegame, { engineWorldBorderDict } from '../misc/enginegame.js';
import loadingscreen from '../gui/loadingscreen.js';
import { players } from '../../../../../shared/chess/util/typeutil.js';
import guigameinfo from '../gui/guigameinfo.js';
import guinavigation from '../gui/guinavigation.js';
import onlinegame from '../misc/onlinegame/onlinegame.js';
import localstorage from '../../util/localstorage.js';
import boardpos from '../rendering/boardpos.js';
import guiclock from '../gui/guiclock.js';
import boardeditor from '../boardeditor/boardeditor.js';
import guiboardeditor from '../gui/boardeditor/guiboardeditor.js';

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
function getTypeOfGameWeIn(): typeof typeOfGameWeAreIn {
	return typeOfGameWeAreIn;
}

function areInLocalGame(): boolean {
	return typeOfGameWeAreIn === 'local';
}

function isItOurTurn(color?: Player): boolean {
	if (typeOfGameWeAreIn === undefined)
		throw Error("Can't tell if it's our turn when we're not in a game!");
	if (typeOfGameWeAreIn === 'online') return onlinegame.isItOurTurn();
	else if (typeOfGameWeAreIn === 'engine') return enginegame.isItOurTurn();
	else if (typeOfGameWeAreIn === 'editor') return true;
	else if (typeOfGameWeAreIn === 'local')
		return gameslot.getGamefile()!.basegame.whosTurn === color;
	else
		throw Error(
			"Don't know how to tell if it's our turn in this type of game: " + typeOfGameWeAreIn,
		);
}

function getOurColor(): Player | undefined {
	if (typeOfGameWeAreIn === undefined)
		throw Error("Can't get our color when we're not in a game!");
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
function update(): void {
	if (typeOfGameWeAreIn === 'online') onlinegame.update();
}

// Start Game --------------------------------------------------------------------

/** Starts a local game according to the options provided. */
async function startLocalGame(options: {
	/** Must be one of the valid variants in variant.ts */
	Variant: string;
	TimeControl: MetaData['TimeControl'];
}): Promise<void> {
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
		UTCTime: timeutil.getCurrentUTCTime(),
	};

	gameslot
		.loadGamefile({
			metadata,
			viewWhitePerspective: true,
			allowEditCoords: true,
			/**
			 * Enable to tell the gamefile to include large amounts of undefined slots for every single piece type in the game.
			 * This lets us board edit without worry of regenerating the mesh every time we add a piece.
			 */
			// additional: { editor: true }
			// Enable to test world border in local games
			// additional: { worldBorder: BigInt(Number.MAX_SAFE_INTEGER) }
			// additional: { worldBorder: BigInt(15) }
		})
		.then((_result: any) => onFinishedLoading())
		.catch((err: Error) => onCatchLoadingError(err));

	// Open the gui stuff AFTER initiating the logical stuff,
	// because the gui DEPENDS on the other stuff.

	openGameinfoBarAndConcludeGameIfOver(metadata, false);
}

/** Starts an online game according to the options provided by the server. */
async function startOnlineGame(options: {
	gameInfo: ServerGameInfo;
	/** The metadata of the game, including the TimeControl, player names, date, etc.. */
	metadata: MetaData;
	gameConclusion?: string;
	/** Existing moves, if any, to forward to the front of the game. Should be specified if reconnecting to an online. Each move should be in the most compact notation, e.g., `['1,2>3,4','10,7>10,8Q']`. */
	moves: ServerGameMoveMessage[];
	clockValues?: ClockValues;
	youAreColor?: Player;
	participantState?: ParticipantState;
	/** If the server us restarting soon for maintenance, this is the time (on the server's machine) that it will be restarting. */
	serverRestartingAt?: number;
}): Promise<void> {
	// console.log("Starting online game with invite options:");
	// console.log(jsutil.deepCopyObject(options));

	typeOfGameWeAreIn = 'online';
	gameLoading = true;

	// Has to be awaited to give the document a chance to repaint.
	await loadingscreen.open();

	const storageKey = onlinegame.getKeyForOnlineGameVariantOptions(options.gameInfo.id);
	const additional: Additional = {
		moves: options.moves,
		variantOptions: localstorage.loadItem(storageKey) as VariantOptions,
		gameConclusion: options.gameConclusion,
		// If the clock values are provided, adjust the timer of whos turn it is depending on ping.
		clockValues: options.clockValues,
	};

	gameslot
		.loadGamefile({
			metadata: options.metadata,
			viewWhitePerspective: options.youAreColor === players.WHITE,
			allowEditCoords: false,
			additional,
		})
		.then((_result: any) => onFinishedLoading())
		.catch((err: Error) => onCatchLoadingError(err));

	onlinegame.initOnlineGame({
		gameInfo: options.gameInfo,
		youAreColor: options.youAreColor,
		participantState: options.participantState,
		serverRestartingAt: options.serverRestartingAt,
	});

	// We need this here because otherwise if we reconnect to the page after refreshing, the sound effects don't play.
	// IF THIS DOES NOT COME AFTER onlinegame.initOnlineGame(), then guiclock inaccurately thinks it's a local game,
	// THUS playing the drum sound effect for our opponent.
	const basegame = gameslot.getGamefile()!.basegame;
	if (!basegame.untimed) guiclock.rescheduleSoundEffects(basegame.clocks);

	// Open the gui stuff AFTER initiating the logical stuff,
	// because the gui DEPENDS on the other stuff.

	openGameinfoBarAndConcludeGameIfOver(options.metadata, false);
}

/** Starts an engine game according to the options provided. */
async function startEngineGame(options: {
	/** The "Event" string of the game's metadata */
	Event: string;
	/** If it's not a practice checkmate, this is the "Variant" string of the game's metadata.
	 * MUTUALLY EXCLUSIVE with variantOptions. */
	Variant?: string;
	/** MUTUALLY EXCLUSIVE with Variant. */
	variantOptions?: VariantOptions;
	/** Time control string for the game (e.g. "600+5"), or '-' for untimed. */
	TimeControl?: MetaData['TimeControl'];
	youAreColor: Player;
	currentEngine: validEngineName;
	engineConfig: EngineConfig;
	/** Whether to show the Undo and Restart buttons on the gameinfo bar. For checkmate practice games. */
	showGameControlButtons?: true;
}): Promise<void> {
	if (options.Variant && options.variantOptions)
		throw Error(
			"Can't provide both Variant and variantOptions at the same time when starting an engine game. They are mutually exclusive.",
		);
	if (!options.Variant && !options.variantOptions)
		throw Error('Must provide either Variant or variantOptions when starting an engine game.');

	typeOfGameWeAreIn = 'engine';
	gameLoading = true;

	// Has to be awaited to give the document a chance to repaint.
	await loadingscreen.open();

	const metadata: MetaData = {
		Event: options.Event,
		Site: 'https://www.infinitechess.org/',
		Round: '-',
		TimeControl: options.TimeControl ?? '-',
		White:
			options.youAreColor === players.WHITE
				? translations['you_indicator']
				: translations['engine_indicator'],
		Black:
			options.youAreColor === players.BLACK
				? translations['you_indicator']
				: translations['engine_indicator'],
		UTCDate: timeutil.getCurrentUTCDate(),
		UTCTime: timeutil.getCurrentUTCTime(),
	};
	if (options.Variant) metadata.Variant = options.Variant;

	/** A promise that resolves when the GRAPHICAL (spritesheet) part of the game has finished loading. */
	const graphicalPromise: Promise<void> = gameslot.loadGamefile({
		metadata,
		viewWhitePerspective: options.youAreColor === players.WHITE,
		allowEditCoords: false,
		additional: {
			variantOptions: options.variantOptions,
			worldBorderDist: engineWorldBorderDict[options.currentEngine],
		},
	});

	/** A promise that resolves when the engine script has been fetched. */
	const enginePromise: Promise<void> = enginegame
		.initEngineGame(options)
		.then(() => enginegame.onMovePlayed()); // Without this, the engine won't start calculating moves if it's first to move.

	/**
	 * This resolves when BOTH the graphical and engine promises resolve,
	 * OR rejects immediately when one of them rejects!
	 */
	Promise.all([graphicalPromise, enginePromise])
		.then((_results: any[]) => onFinishedLoading())
		.catch((err: Error) => onCatchLoadingError(err));

	openGameinfoBarAndConcludeGameIfOver(metadata, options.showGameControlButtons);
}

/** Initializes the board editor. */
async function startBoardEditor(): Promise<void> {
	typeOfGameWeAreIn = 'editor';
	gameLoading = true;

	await loadingscreen.open();

	const metadata: MetaData = {
		Variant: 'Classical',
		TimeControl: '-',
		Event: `Position created using ingame board editor`,
		Site: 'https://www.infinitechess.org/',
		Round: '-',
		UTCDate: timeutil.getCurrentUTCDate(),
		UTCTime: timeutil.getCurrentUTCTime(),
	};

	gameslot
		.loadGamefile({
			metadata,
			viewWhitePerspective: true,
			allowEditCoords: true,
			/**
			 * Enable to tell the gamefile to include large amounts of undefined slots for every single piece type in the game.
			 * This lets us board edit without worry of regenerating the mesh every time we add a piece.
			 *
			 * This flag triggers the gamefile to add images for EVERY single piece in the spritesheet!
			 * If that also includes all COLORS, then loading a game can take a few seconds...
			 */
			additional: { editor: true },
		})
		.then((_result: any) => onFinishedLoading())
		.catch((err: Error) => onCatchLoadingError(err));

	await guiboardeditor.initUI();
	boardeditor.initBoardEditor();
}

/** Initializes a local game from a custom position. */
async function startCustomLocalGame(options: {
	metadata: MetaData;
	additional: {
		moves?: ServerGameMoveMessage[];
		variantOptions: VariantOptions;
	};
	presetAnnotes?: PresetAnnotes;
}): Promise<void> {
	typeOfGameWeAreIn = 'local';
	gameLoading = true;

	// Has to be awaited to give the document a chance to repaint.
	await loadingscreen.open();

	gameslot
		.loadGamefile({
			...options,
			viewWhitePerspective: true,
			allowEditCoords: true,
		})
		.then((_result: any) => onFinishedLoading())
		.catch((err: Error) => onCatchLoadingError(err));

	// Open the gui stuff AFTER initiating the logical stuff,
	// because the gui DEPENDS on the other stuff.

	openGameinfoBarAndConcludeGameIfOver(options.metadata, false);
}

/** Starts an engine game according to the options provided. */
async function startCustomEngineGame(options: {
	metadata: MetaData;
	additional: {
		moves?: ServerGameMoveMessage[];
		variantOptions: VariantOptions;
	};
	presetAnnotes?: PresetAnnotes;
	TimeControl?: MetaData['TimeControl'];
	youAreColor: Player;
	currentEngine: validEngineName;
	engineConfig: EngineConfig;
	/** Whether to show the Undo and Restart buttons on the gameinfo bar. For checkmate practice games. */
	showGameControlButtons?: true;
}): Promise<void> {
	typeOfGameWeAreIn = 'engine';
	gameLoading = true;

	// Has to be awaited to give the document a chance to repaint.
	await loadingscreen.open();

	/** A promise that resolves when the GRAPHICAL (spritesheet) part of the game has finished loading. */
	const graphicalPromise: Promise<void> = gameslot.loadGamefile({
		metadata: options.metadata,
		viewWhitePerspective: options.youAreColor === players.WHITE,
		allowEditCoords: false,
		additional: {
			variantOptions: options.additional.variantOptions,
			worldBorderDist: engineWorldBorderDict[options.currentEngine],
		},
	});

	/** A promise that resolves when the engine script has been fetched. */
	const enginePromise: Promise<void> = enginegame
		.initEngineGame(options)
		.then(() => enginegame.onMovePlayed()); // Without this, the engine won't start calculating moves if it's first to move.

	/**
	 * This resolves when BOTH the graphical and engine promises resolve,
	 * OR rejects immediately when one of them rejects!
	 */
	Promise.all([graphicalPromise, enginePromise])
		.then((_results: any[]) => onFinishedLoading())
		.catch((err: Error) => onCatchLoadingError(err));

	openGameinfoBarAndConcludeGameIfOver(options.metadata, options.showGameControlButtons);
}

/**
 * Reloads the current local or online game from the provided metadata, existing moves, and variant options.
 */
async function pasteGame(options: {
	metadata: MetaData;
	additional: {
		/** If we're in the board editor, this must be empty. */
		moves?: ServerGameMoveMessage[];
		variantOptions: VariantOptions;
	};
	presetAnnotes?: PresetAnnotes;
}): Promise<void> {
	if (typeOfGameWeAreIn !== 'local' && typeOfGameWeAreIn !== 'online')
		throw Error("Can't paste a game when we're not in a local or online game.");

	gameLoading = true;

	// Has to be awaited to give the document a chance to repaint.
	await loadingscreen.open();

	const viewWhitePerspective = gameslot.isLoadedGameViewingWhitePerspective(); // Retain the same perspective as the current loaded game.

	gameslot.unloadGame();

	gameslot
		.loadGamefile({
			metadata: options.metadata,
			viewWhitePerspective,
			allowEditCoords: guinavigation.areCoordsAllowedToBeEdited(),
			presetAnnotes: options.presetAnnotes,
			additional: options.additional,
		})
		.then((_result: any) => onFinishedLoading())
		.catch((err: Error) => onCatchLoadingError(err));

	// Open the gui stuff AFTER initiating the logical stuff,
	// because the gui DEPENDS on the other stuff.

	openGameinfoBarAndConcludeGameIfOver(options.metadata, false);
}

/**
 * A function that is executed when a game is FULLY loaded (graphical, spritesheet, engine, etc.)
 * This hides the spinny pawn loading animation that covers the board.
 */
function onFinishedLoading(): void {
	// console.log('COMPLETELY finished loading game!');
	gameLoading = false;

	// We can now close the loading screen.

	// I don't think this one has to be awaited since we're pretty much
	// done with loading, there's not gonna be another lag spike..
	loadingscreen.close();
	gameslot.startStartingTransition(); // Play the zoom-in animation at the start of games.
}

/**
 * Replaces the loading animation with the words
 * "ERROR. One or more resources failed to load. Please refresh."
 */
function onCatchLoadingError(err: Error): void {
	console.error(err);
	loadingscreen.onError();
}

/**
 * These items must be done after the logical parts of the gamefile are fully loaded
 * @param metadata - The metadata of the gamefile
 * @param showGameControlButtons - Whether to show the practice game control buttons "Undo Move" and "Retry"
 */
function openGameinfoBarAndConcludeGameIfOver(
	metadata: MetaData,
	showGameControlButtons: boolean = false,
): void {
	guigameinfo.open(metadata, showGameControlButtons);
	if (gamefileutility.isGameOver(gameslot.getGamefile()!.basegame)) gameslot.concludeGame();
}

function unloadGame(): void {
	// console.log("Game loader unloading game...");

	if (typeOfGameWeAreIn === 'online') onlinegame.closeOnlineGame();
	else if (typeOfGameWeAreIn === 'engine') enginegame.closeEngineGame();
	else if (typeOfGameWeAreIn === 'editor') boardeditor.closeBoardEditor();

	guinavigation.close();
	guigameinfo.close();
	guigameinfo.clearUsernameContainers();
	guiboardeditor.close();
	gameslot.unloadGame();
	perspective.disable();
	typeOfGameWeAreIn = undefined;
	boardpos.eraseMomentum();
	Transition.terminate();

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
	startBoardEditor,
	startCustomLocalGame,
	startCustomEngineGame,
	pasteGame,
	openGameinfoBarAndConcludeGameIfOver,
	unloadGame,
};
