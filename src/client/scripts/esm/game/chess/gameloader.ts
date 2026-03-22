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
import type { Additional } from '../../../../../shared/chess/logic/gamefile.js';
import type { ValidEngine } from './engines/engine.js';
import type { VariantCode } from '../../../../../shared/chess/variants/variantdictionary.js';
import type { EngineConfig } from '../misc/enginegame.js';
import type { PresetAnnotes } from '../../../../../shared/chess/logic/icn/icnconverter.js';
import type { VariantOptions } from '../../../../../shared/chess/logic/initvariant.js';
import type { ServerGameInfo } from '../websocket/socketschemas.js';
import type { GameConclusion } from '../../../../../shared/chess/util/winconutil.js';
import type {
	ClockValues,
	MetaData,
	MovePacket,
	ParticipantState,
	TimeControl,
} from '../../../../../shared/types.js';

import jsutil from '../../../../../shared/util/jsutil.js';
import variant from '../../../../../shared/chess/variants/variant.js';
import gamefileutility from '../../../../../shared/chess/util/gamefileutility.js';
import { players as p } from '../../../../../shared/chess/util/typeutil.js';

import gui from '../gui/gui.js';
import gameslot from './gameslot.js';
import boardpos from '../rendering/boardpos.js';
import guiclock from '../gui/guiclock.js';
import IndexedDB from '../../util/IndexedDB.js';
import Transition from '../rendering/transitions/Transition.js';
import onlinegame from '../misc/onlinegame/onlinegame.js';
import enginegame from '../misc/enginegame.js';
import guipalette from '../gui/boardeditor/guipalette.js';
import perspective from '../rendering/perspective.js';
import guigameinfo from '../gui/guigameinfo.js';
import boardeditor from '../boardeditor/boardeditor.js';
import loadingscreen from '../gui/loadingscreen.js';
import guinavigation from '../gui/guinavigation.js';
import guiboardeditor from '../gui/boardeditor/guiboardeditor.js';
import clientmetadatautil from './clientmetadatautil.js';
import { engineDictionary, getFormattedEngineName } from './engines/engine.js';

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
	variant: VariantCode;
	timeControl: TimeControl;
}): Promise<void> {
	typeOfGameWeAreIn = 'local';
	gameLoading = true;

	// Has to be awaited to give the document a chance to repaint.
	await loadingscreen.open();

	const variantName = variant.getVariantName(options.variant);
	const dateTimestamp = Date.now();
	const metadata = clientmetadatautil.buildBaseGameMetadata(
		`Casual local ${variantName} infinite chess game`,
		options.timeControl,
		dateTimestamp,
	);
	metadata.Variant = variantName;

	gameslot
		.loadGamefile({
			metadata,
			variant: options.variant,
			dateTimestamp,
			viewWhitePerspective: true,
			allowEditCoords: true,
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
	gameConclusion?: GameConclusion;
	/** Existing moves, if any, to forward to the front of the game. Should be specified if reconnecting to an online. Each move should be in the most compact notation, e.g., `['1,2>3,4','10,7>10,8Q']`. */
	moves: MovePacket[];
	clockValues?: ClockValues;
	youAreColor?: Player;
	participantState?: ParticipantState;
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
		variantOptions: await IndexedDB.loadItem<VariantOptions>(storageKey),
		gameConclusion: options.gameConclusion,
		// If the clock values are provided, adjust the timer of whos turn it is depending on ping.
		clockValues: options.clockValues,
	};

	const resolvedVariant = variant.resolveVariantCode(options.metadata.Variant);
	const resolvedTimestamp = clientmetadatautil.resolveTimestampFromMetadata(
		options.metadata.UTCDate,
		options.metadata.UTCTime,
	);

	gameslot
		.loadGamefile({
			metadata: options.metadata,
			variant: resolvedVariant,
			dateTimestamp: resolvedTimestamp,
			viewWhitePerspective: options.youAreColor === p.WHITE,
			allowEditCoords: false,
			additional,
		})
		.then((_result: any) => onFinishedLoading())
		.catch((err: Error) => onCatchLoadingError(err));

	onlinegame.initOnlineGame({
		gameInfo: options.gameInfo,
		youAreColor: options.youAreColor,
		participantState: options.participantState,
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
	/** The 'Event' string of the game's metadata. */
	event: string;
	/** Time control string for the game (e.g. `'600+5'`), or `'-'` for untimed. */
	timeControl: TimeControl;
	/** If it's not a practice checkmate, this is the variant code.
	 * MUTUALLY EXCLUSIVE with variantOptions. */
	variant: VariantCode | null;
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

	typeOfGameWeAreIn = 'engine';
	gameLoading = true;

	// Has to be awaited to give the document a chance to repaint.
	await loadingscreen.open();

	const formattedEngineName = getFormattedEngineName(
		options.currentEngine,
		options.engineConfig.strengthLevel,
	);
	const dateTimestamp = Date.now();
	const metadata = clientmetadatautil.buildBaseGameMetadata(
		options.event,
		options.timeControl,
		dateTimestamp,
	);
	if (options.variant) metadata.Variant = variant.getVariantName(options.variant);
	metadata.White =
		options.youAreColor === p.WHITE
			? clientmetadatautil.YOU_NAME_ICN_METADATA
			: formattedEngineName;
	metadata.Black =
		options.youAreColor === p.BLACK
			? clientmetadatautil.YOU_NAME_ICN_METADATA
			: formattedEngineName;

	/** A promise that resolves when the GRAPHICAL (spritesheet) part of the game has finished loading. */
	const graphicalPromise: Promise<void> = gameslot.loadGamefile({
		metadata,
		variant: options.variant,
		dateTimestamp,
		viewWhitePerspective: options.youAreColor === p.WHITE,
		allowEditCoords: false,
		additional: {
			variantOptions: options.variantOptions,
			worldBorderDist: engineDictionary[options.currentEngine].worldBorder,
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

	const dateTimestamp = Date.now();
	const metadata = clientmetadatautil.buildBaseGameMetadata(
		'Position created using ingame board editor',
		'-',
		dateTimestamp,
	);
	const variantCode: VariantCode = 'Classical';
	metadata.Variant = variant.getVariantName(variantCode);

	gameslot
		.loadGamefile({
			metadata,
			variant: variantCode,
			dateTimestamp,
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
	typeOfGameWeAreIn = 'local';
	gameLoading = true;

	// Has to be awaited to give the document a chance to repaint.
	await loadingscreen.open();

	const dateTimestamp = Date.now();
	const metadata = clientmetadatautil.buildBaseGameMetadata(
		'Casual local custom infinite chess game',
		'-',
		dateTimestamp,
	);

	gameslot
		.loadGamefile({
			...options,
			metadata,
			dateTimestamp,
			variant: null, // Not specified for custom position
			viewWhitePerspective: true,
			allowEditCoords: true,
		})
		.then((_result: any) => onFinishedLoading())
		.catch((err: Error) => onCatchLoadingError(err));

	// Open the gui stuff AFTER initiating the logical stuff,
	// because the gui DEPENDS on the other stuff.

	openGameinfoBarAndConcludeGameIfOver(metadata, false);
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
	typeOfGameWeAreIn = 'engine';
	gameLoading = true;

	// Has to be awaited to give the document a chance to repaint.
	await loadingscreen.open();

	const formattedEngineName = getFormattedEngineName(
		options.currentEngine,
		options.engineConfig.strengthLevel,
	);
	const dateTimestamp = Date.now();
	const metadata = clientmetadatautil.buildBaseGameMetadata(
		'Casual computer custom infinite chess game',
		options.timeControl,
		dateTimestamp,
	);
	metadata.White =
		options.youAreColor === p.WHITE
			? clientmetadatautil.YOU_NAME_ICN_METADATA
			: formattedEngineName;
	metadata.Black =
		options.youAreColor === p.BLACK
			? clientmetadatautil.YOU_NAME_ICN_METADATA
			: formattedEngineName;

	/** A promise that resolves when the GRAPHICAL (spritesheet) part of the game has finished loading. */
	const graphicalPromise: Promise<void> = gameslot.loadGamefile({
		metadata,
		variant: null, // Not specified for custom position
		dateTimestamp,
		viewWhitePerspective: options.youAreColor === p.WHITE,
		allowEditCoords: false,
		additional: {
			variantOptions: options.additional.variantOptions,
			worldBorderDist: engineDictionary[options.currentEngine].worldBorder,
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
	typeOfGameWeAreIn = 'editor';
	gameLoading = true;

	// Has to be awaited to give the document a chance to repaint.
	await loadingscreen.open();

	const dateTimestamp = Date.now();
	const metadata = clientmetadatautil.buildBaseGameMetadata(
		'Position created using ingame board editor',
		'-',
		dateTimestamp,
	);

	// Variant options are copied before the gamefile is loaded and this potentially manipualtes them
	const variantOptionsCopy = jsutil.deepCopyObject(options.additional.variantOptions);

	gameslot
		.loadGamefile({
			metadata,
			variant: null, // Not specified for custom position
			dateTimestamp,
			viewWhitePerspective: true,
			allowEditCoords: true,
			// See comment in startBoardEditor for why "editor: true" is needed
			additional: { ...options.additional, editor: true },
			presetAnnotes: options.presetAnnotes,
		})
		.then((_result: any) => onFinishedLoading())
		.catch((err: Error) => onCatchLoadingError(err));

	// Open the gui stuff AFTER initiating the logical stuff,
	// because the gui DEPENDS on the other stuff.

	await guipalette.initUI();
	boardeditor.initBoardEditor(dirty, variantOptionsCopy, pawnDoublePush, castling);
}

/**
 * Reloads the current local or online game from the provided metadata, existing moves, and variant options.
 */
async function pasteGame(options: {
	metadata: MetaData;
	variant: VariantCode | null;
	dateTimestamp: number;
	additional: Additional;
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
			variant: options.variant,
			dateTimestamp: options.dateTimestamp,
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

function unloadLogicalAndRendering(): void {
	gameslot.unloadGame();
	perspective.disable();
	boardpos.eraseMomentum();
	Transition.terminate();
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
	unloadLogicalAndRendering();
	typeOfGameWeAreIn = undefined;

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
	startBoardEditorFromCustomPosition,
	pasteGame,
	openGameinfoBarAndConcludeGameIfOver,
	unloadLogicalAndRendering,
	unloadGame,
};
