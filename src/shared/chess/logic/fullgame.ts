// src/shared/chess/logic/fullgame.ts

import type { Board } from './boardinit.js';
import type { Player } from '../util/typeutil.js';
import type { CoordsKey } from '../util/coordutil.js';
import type { GameRules } from '../util/gamerules.js';
import type { ClockData } from './clock.js';
import type { MovePacket } from '../../types.js';
import type { BoundingBox } from '../../util/math/bounds.js';
import type { VariantCode } from '../variants/variantregistry.js';
import type { VariantModule } from '../variants/variant_scripts/variantutil.js';
import type { GameConclusion } from '../util/winconutil.js';
import type { GlobalGameState } from './state.js';
import type { ClockValues, MetaData } from '../../types.js';

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

/** A variant code paired with its loaded module. */
export type LoadedVariant = { code: VariantCode; mod: VariantModule };

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
 * portion of {@link FullGame}.
 */
export type GameMetadata = {
	/** Information about the game */
	metadata: MetaData;
	/** The game's start timestamp in milliseconds since epoch, derived from UTCDate/UTCTime metadata. */
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

/**
 * The complete client-side game object: full board state plus game metadata.
 * Satisfies {@link Board} directly, so any function accepting a Board also
 * accepts a FullGame — no unwrapping needed.
 */
export type FullGame = Board & GameMetadata;

/**
 * Minimal game interface accepted by shared utility functions (clock, moveutil).
 * Satisfied structurally by both {@link FullGame} and the server's `ServerGame`.
 */
export type Game = GameMetadata & { whosTurn: Player; moves: { length: number } };

/** Additional options that may go into the gamefile constructor.
 * Typically used if we're pasting a game, or reloading an online one. */
export interface Additional {
	/** Existing moves, if any, to forward to the front of the game. Should be specified if reconnecting to an online game or pasting a game. */
	moves?: MovePacket[];
	/** If a custom position is needed, for instance, when pasting a game, then these options should be included. */
	variantOptions?: VariantOptions;
	/** The conclusion of the game, if loading an online game that has already ended. */
	gameConclusion?: GameConclusion;
	/** Any already existing clock values for the gamefile. */
	clockValues?: ClockValues;
	/** Whether the gamefile is for the board editor. If true, the piece list will contain MUCH more undefined placeholders, and for every single type of piece, as pieces are added commonly in that! */
	editor?: boolean;
	/** If present, the resulting gamefile will have a world border this distance away from the starting position's bounding box. */
	worldBorderDist?: bigint;
	/** Exact dimensions of the world border. OVERRIDES {@link worldBorderDist} if both are specified. */
	worldBorder?: BoundingBox;
}

// Functions -------------------------------------------------------------

/**
 * Creates a new {@link GameMetadata} object from provided arguments.
 * ASSUMES THE VARIANT SCRIPT IS ALREADY LOADED. This part is synchronous.
 */
function initGameMetadata(
	metadata: MetaData,
	dateTimestamp: number,
	mod: VariantModule | undefined,
	gameConclusion?: GameConclusion,
	clockValues?: ClockValues,
	variantOptions?: VariantOptions,
): { gamemetadata: GameMetadata; gameRules: GameRules } {
	const gameRules =
		variantOptions?.gameRules ?? variantpreviewer.getGameRulesOfVariant(mod, dateTimestamp);

	const clockDependantVars: ClockDependant = clock.init(
		gamerules.getUniquePlayersInTurnOrder(gameRules.turnOrder),
		metadata.TimeControl ?? '-', // Fallback to untimed if TimeControl metadata not specified
	);
	const gamemetadata: GameMetadata = {
		metadata,
		dateTimestamp,
		...clockDependantVars,
	};

	if (clockValues) {
		if (gamemetadata.untimed)
			throw Error(
				'Cannot set clock values for untimed game. Should not have specified clockValues.',
			);
		clock.edit(gamemetadata.clocks, clockValues);
	}

	gamemetadata.gameConclusion = gameConclusion; // <-- SHOULD NOT HAVE TO SET HERE
	gamefileutility.setConclusion({ metadata: gamemetadata.metadata, gameRules }, gameConclusion); // <-- SHOULD ACCEPT THE ACTUAL GAME, NOT A FAKE

	return { gamemetadata, gameRules };
}

/**
 * Combines a board and metadata into a flat {@link FullGame}. Used for loading a game after it was started.
 * @param validateMoves - During game construction, throws an error if any move played is illegal.
 */
function loadGameWithBoard(
	gamemetadata: GameMetadata,
	boardsim: Board,
	moves: MovePacket[] = [],
	validateMoves?: boolean,
): FullGame {
	const gamefile: FullGame = { ...boardsim, ...gamemetadata };

	// Do we need to convert any checkmate win conditions to royalcapture?
	if (!winconutil.isCheckmateCompatibleWithGame(gamefile))
		gamerules.swapCheckmateForRoyalCapture(gamefile.gameRules);

	{
		// Set the game's `inCheck` and `checks` properties at the front of the game.
		const trackChecks = gamefileutility.isOpponentUsingWinCondition(
			gamefile.gameRules,
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
 * Initiates both the base game and board of the FullGame at the same time.
 * **Asynchronous** because variant modules must be loaded. Used on just the client.
 * @param validateMoves - During game construction, throws an error if any move played is illegal.
 */
async function initFullGame(
	metadata: MetaData,
	dateTimestamp: number,
	variantCode: VariantCode | undefined,
	additional: Additional = {},
	validateMoves?: true,
): Promise<FullGame> {
	let variant: LoadedVariant | undefined;
	if (variantCode !== undefined) {
		await variantcache.ensureVariantLoaded(variantCode);
		variant = { code: variantCode, mod: variantcache.getModule(variantCode) };
	}

	const { gamemetadata, gameRules } = initGameMetadata(
		metadata,
		dateTimestamp,
		variant?.mod,
		additional.gameConclusion,
		additional.clockValues,
		additional.variantOptions,
	);
	const boardsim = boardinit.initBoard(
		gameRules,
		variant,
		dateTimestamp,
		additional.variantOptions,
		additional.editor,
		additional.worldBorderDist,
	);
	return loadGameWithBoard(gamemetadata, boardsim, additional.moves, validateMoves);
}

export default {
	initGameMetadata,
	initFullGame,
};
