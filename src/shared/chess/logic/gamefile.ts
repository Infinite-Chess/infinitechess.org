// src/shared/chess/logic/gamefile.ts

import type { Board } from './boardinit.js';
import type { CoordsKey } from '../util/coordutil.js';
import type { GameRules } from '../util/gamerules.js';
import type { ClockData } from './clock.js';
import type { MovePacket } from '../../domain.js';
import type { BoundingBox } from '../../util/math/bounds.js';
import type { VariantCode } from '../variants/variantregistry.js';
import type { VariantModule } from '../variants/variant_scripts/variantutil.js';
import type { GameConclusion } from '../util/winconutil.js';
import type { GlobalGameState } from './state.js';
import type { ClockValues, TimeControl } from '../../domain.js';

import clock from './clock.js';
import movepiece from './movepiece.js';
import gamerules from '../util/gamerules.js';
import boardinit from './boardinit.js';
import winconutil from '../util/winconutil.js';
import wincondition from './wincondition.js';
import variantcache from '../variants/variantcache.js';
import checkdetection from './checkdetection.js';
import gamefileutility from '../util/gamefileutility.js';
import variantpreviewer from '../variants/variantpreviewer.js';

// Types ----------------------------------------------------

/** A variant code paired with its loaded module and the game's creation timestamp. */
export type LoadedVariant = { code: VariantCode; mod: VariantModule; dateTimestamp: number };

export interface Snapshot {
	/** In key format 'x,y':'type' */
	position: Map<CoordsKey, number>;
	/** The global state of the game beginning */
	state_global: GlobalGameState;
	/** This is the full-move number at the start of the game. Used for converting to ICN notation. */
	fullMove: number;
	/** The bounding box surrounding the starting position, without padding. INTEGER coords, not floating. */
	box: BoundingBox;
}

/**
 * Variant options that can be used to load a custom game,
 * whether local or online, instead of one of the default variants.
 */
export interface VariantOptions {
	/**
	 * The full move number of the turn at the provided position. Default: 1.
	 * Can be higher if you copy just the positional information in a game with some moves played already.
	 */
	fullMove: number;
	gameRules: GameRules;
	/**
	 * The starting position object, containing the pieces organized by key.
	 * The key of the object is the coordinates of the piece as a string,
	 * and the value is the type of piece on that coordinate (e.g. [22] pawn (neutral))
	 */
	position: Map<CoordsKey, number>;
	/** The 3 global game states */
	state_global: GlobalGameState;
}

/**
 * Pure game metadata — display info, clock data, and conclusion.
 * Contains no game state (moves, turn, pieces). Used as the non-board
 * portion of {@link GameFile}.
 */
export type Game = {
	/** The time control of the game (e.g. `"600+5"`, or `"-"` for untimed). */
	timeControl: TimeControl;
	/** The game's start timestamp in milliseconds since epoch. */
	dateTimestamp: number;
	gameConclusion?: GameConclusion;
} & ClockDependant;

/**
 * The Game variables that depend on the clock.
 */
export type ClockDependant =
	| {
			untimed: true;
			clocks: undefined;
	  }
	| {
			untimed: false;
			clocks: ClockData;
	  };

/** The complete client-side game object: full board state plus game metadata. */
export type GameFile = Game & Board;

/** Additional options that may go into the gamefile constructor.
 * Typically used if we're pasting a game, or reloading an online one. */
export interface Additional {
	/** Existing moves, if any, to forward to the front of the game. Should be specified if reconnecting to an online game or pasting a game. */
	moves?: MovePacket[];
	/** If a custom position is needed, for instance, when pasting a game, then these options should be included. */
	variantOptions?: VariantOptions;
	/** Adds the `slideLimit` gamerule. */
	slideLimit?: bigint;
	/** The conclusion of the game, if loading an online game that has already ended. */
	gameConclusion?: GameConclusion;
	/** Any already existing clock values for the gamefile. */
	clockValues?: ClockValues;
	/** Whether the gamefile is for the board editor. If true, the piece list will contain MUCH more undefined placeholders, and for every single type of piece, as pieces are added commonly in that! */
	editor?: boolean;
	/** If present, the resulting gamefile will have a world border this distance away from the starting position's bounding box. */
	worldBorderDist?: bigint;
	/** Maximum absolute edge of a world border generated from {@link worldBorderDist}. */
	worldBorderCap?: bigint;
}

// Functions -------------------------------------------------------------

/**
 * Creates a new {@link Game} object from provided arguments.
 * @param gameRules - The game's rules. Only read, for the turn order the clocks are built from.
 */
function initGame(
	timeControl: TimeControl,
	dateTimestamp: number,
	gameRules: GameRules,
	gameConclusion?: GameConclusion,
	clockValues?: ClockValues,
): Game {
	const clockDependantVars: ClockDependant = clock.init(
		gamerules.getUniquePlayersInTurnOrder(gameRules.turnOrder),
		timeControl,
	);
	const game: Game = {
		timeControl,
		dateTimestamp,
		...clockDependantVars,
	};

	if (clockValues) {
		if (game.untimed)
			throw Error(
				'Cannot set clock values for untimed game. Should not have specified clockValues.',
			);
		clock.edit(game.clocks, clockValues);
	}

	game.gameConclusion = gameConclusion;

	return game;
}

/**
 * Combines a board and game into a flat {@link GameFile}. Used for loading a game when it starts.
 * @param validateMoves - During game construction, throws an error if any move played is illegal.
 */
function loadGameWithBoard(
	game: Game,
	boardsim: Board,
	moves: MovePacket[] = [],
	validateMoves?: boolean,
): GameFile {
	const gamefile: GameFile = { ...game, ...boardsim };

	// Do we need to convert any checkmate win conditions to royalcapture?
	if (!winconutil.isCheckmateCompatibleWithGame(gamefile))
		gamerules.swapCheckmateForRoyalCapture(gamefile.gameRules);

	{
		// Set the game's `inCheck` and `checks` properties at the front of the game.
		const trackChecks = gamefileutility.isOpponentUsingWinCondition(
			gamefile,
			gamefile.whosTurn,
			'checkmate',
		);
		const checkResults = checkdetection.detectCheck(gamefile, gamefile.whosTurn, trackChecks); // { check: boolean, royalsInCheck: Coords[], checks?: CheckInfo[] }
		gamefile.state.local.inCheck = checkResults.check ? checkResults.royalsInCheck : false;
		if (trackChecks) gamefile.state.local.checks = checkResults.checks ?? [];
	}

	movepiece.makeAllMovesInGame(gamefile, moves, validateMoves);
	// Do not overwrite pre-existing server conclusion, if present.
	if (gamefile.gameConclusion === undefined) wincondition.doGameOverChecks(gamefile);
	return gamefile;
}

/**
 * Initiates both the base game and board of the GameFile at the same time.
 * REQUIRES THE VARIANT MODULE TO BE PRELOADED via {@link variantcache.ensureVariantLoaded}
 * if a variant is specified. Used on just the client.
 * @param validateMoves - During game construction, throws an error if any move played is illegal,
 *   such as no piece on the start coords, or promotion to a piece with no space in the piece lists
 *   for (not a promotion piece).
 */
function initGameFile(
	timeControl: TimeControl,
	dateTimestamp: number,
	variantCode: VariantCode | undefined,
	additional: Additional = {},
	validateMoves?: true,
): GameFile {
	const variant: LoadedVariant | undefined =
		variantCode !== undefined
			? { code: variantCode, mod: variantcache.getModule(variantCode), dateTimestamp }
			: undefined;

	let gameRules: GameRules =
		additional.variantOptions?.gameRules ?? variantpreviewer.getGameRulesOfVariant(variant); // Already a fresh copy

	// Slide Limit modifier override. Onto a shallow copy, so the caller's rules stay untouched —
	// initBoard deep-copies from here, so the gamefile shares no nested objects with them either.
	// Must precede initBoard, which builds the movesets from the slide limit.
	if (additional.slideLimit !== undefined)
		gameRules = { ...gameRules, slideLimit: additional.slideLimit };

	const game = initGame(
		timeControl,
		dateTimestamp,
		gameRules,
		additional.gameConclusion,
		additional.clockValues,
	);
	const boardsim = boardinit.initBoard(gameRules, variant, {
		variantOptions: additional.variantOptions,
		editor: additional.editor,
		worldBorderDist: additional.worldBorderDist,
		worldBorderCap: additional.worldBorderCap,
	});
	const gamefile = loadGameWithBoard(game, boardsim, additional.moves, validateMoves);

	// Must follow the moves being made, as the stamps are read off them.
	clock.seedFromMoveStamps(gamefile, additional.clockValues?.clocks);

	return gamefile;
}

export default {
	initGame,
	initGameFile,
};
