// src/shared/chess/logic/gamefile.ts

import type { Board } from './boardinit.js';
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

/** The complete client-side game object: full board state plus game metadata. */
export type GameFile = Game & Board;

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

/** Creates a new {@link Game} object from provided arguments. */
function initGame(
	metadata: MetaData,
	dateTimestamp: number,
	variant: LoadedVariant | undefined,
	gameConclusion?: GameConclusion,
	clockValues?: ClockValues,
	variantOptions?: VariantOptions,
): Game & { gameRules: GameRules } {
	const gameRules = variantOptions?.gameRules ?? variantpreviewer.getGameRulesOfVariant(variant);

	const clockDependantVars: ClockDependant = clock.init(
		gamerules.getUniquePlayersInTurnOrder(gameRules.turnOrder),
		metadata.TimeControl ?? '-', // Fallback to untimed if TimeControl metadata not specified
	);
	const game: Game = {
		metadata,
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

	const gameWithRules = { ...game, gameRules };

	gamefileutility.setConclusion(gameWithRules, gameConclusion);

	return gameWithRules;
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
 * **Asynchronous** because variant modules must be loaded. Used on just the client.
 * @param validateMoves - During game construction, throws an error if any move played is illegal.
 */
async function initGameFile(
	metadata: MetaData,
	dateTimestamp: number,
	variantCode: VariantCode | undefined,
	additional: Additional = {},
	validateMoves?: true,
): Promise<GameFile> {
	let variant: LoadedVariant | undefined;
	if (variantCode !== undefined) {
		await variantcache.ensureVariantLoaded(variantCode);
		variant = { code: variantCode, mod: variantcache.getModule(variantCode), dateTimestamp };
	}

	const gameWithRules = initGame(
		metadata,
		dateTimestamp,
		variant,
		additional.gameConclusion,
		additional.clockValues,
		additional.variantOptions,
	);
	const boardsim = boardinit.initBoard(
		gameWithRules.gameRules,
		variant,
		additional.variantOptions,
		additional.editor,
		additional.worldBorderDist,
	);
	return loadGameWithBoard(gameWithRules, boardsim, additional.moves, validateMoves);
}

export default {
	initGame,
	initGameFile,
};
