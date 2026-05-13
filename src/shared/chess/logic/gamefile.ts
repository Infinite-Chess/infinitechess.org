// src/shared/chess/logic/gamefile.ts

import type { CoordsKey } from '../util/coordutil.js';
import type { GameRules } from '../util/gamerules.js';
import type { ClockData } from './clock.js';
import type { MovePacket } from '../../types.js';
import type { BoundingBox } from '../../util/math/bounds.js';
import type { VariantCode } from '../variants/variantregistry.js';
import type { PieceMoveset } from './movesets.js';
import type { VariantModule } from '../variant_scripts/variantutil.js';
import type { GameConclusion } from '../util/winconutil.js';
import type { OrganizedPieces } from './organizedpieces.js';
import type { SpecialMoveFunction } from './specialmove.js';
import type { MoveFull, MoveRecord } from './movepiece.js';
import type { ClockValues, MetaData } from '../../types.js';
import type { GameState, GlobalGameState } from './state.js';
import type { Player, RawType, RawTypeGroup } from '../util/typeutil.js';

import clock from './clock.js';
import jsutil from '../../util/jsutil.js';
import typeutil from '../util/typeutil.js';
import boardutil from '../util/boardutil.js';
import movepiece from './movepiece.js';
import gamerules from '../util/gamerules.js';
import legalmoves from './legalmoves.js';
import wincondition from './wincondition.js';
import variantcache from '../variants/variantcache.js';
import variantreader from '../variants/variantreader.js';
import checkdetection from './checkdetection.js';
import organizedpieces from './organizedpieces.js';
import gamefileutility from '../util/gamefileutility.js';

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
 * Purely game data
 * Used on both sides
 */
export type Game = {
	/** Information about the game */
	metadata: MetaData;
	/** The game's start timestamp in milliseconds since epoch, derived from UTCDate/UTCTime metadata. */
	dateTimestamp: number;
	moves: MoveRecord[];
	gameRules: GameRules;
	whosTurn: Player;
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
 * Game data used for simulating game logic and board state
 * Use by client always, may not be used by the server.
 */
export type Board = {
	/** An array of all types of pieces that are in this game, without their color extension: `['pawns','queens']` */
	existingTypes: number[];
	/** An array of all RAW piece types that are in this game. */
	existingRawTypes: RawType[];

	moves: MoveFull[];
	pieces: OrganizedPieces;
	state: GameState;

	pieceMovesets: RawTypeGroup<() => PieceMoveset>;
	specialMoves: RawTypeGroup<SpecialMoveFunction>;

	specialVicinity: Record<CoordsKey, RawType[]>;
	vicinity: Record<CoordsKey, RawType[]>;

	/** Whether the gamefile is for the board editor. If true, the piece list will contain MUCH more undefined placeholders, and for every single type of piece, as pieces are added commonly in that! */
	editor: boolean;

	/**
	 * The variant code and its loaded module.
	 * Undefined for custom/pasted positions without a known variant.
	 */
	variant?: LoadedVariant;

	/**
	 * Information about the beginning snapshot of the game (position, positionString, specialRights, turn)
	 */
	startSnapshot: Snapshot;
};

/**
 * Both game data AND board state used on the client-side,
 * and in the future *sometimes* used on the server-side,
 * when the server starts doing legal move validation.
 */
export type FullGame = {
	basegame: Game;
	boardsim: Board;
};

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
 * Creates a new {@link Game} object from provided arguments.
 * ASSUMES THE VARIANT SCRIPT IS ALREADY LOADED. This part is synchronous.
 */
function initGame(
	metadata: MetaData,
	dateTimestamp: number,
	mod: VariantModule | undefined,
	gameConclusion?: GameConclusion,
	clockValues?: ClockValues,
	variantOptions?: VariantOptions,
): Game {
	const gameRules =
		variantOptions?.gameRules ?? variantreader.getGameRulesOfVariant(mod, dateTimestamp);

	const clockDependantVars: ClockDependant = clock.init(
		gamerules.getUniquePlayersInTurnOrder(gameRules.turnOrder),
		metadata.TimeControl ?? '-', // Fallback to untimed if TimeControl metadata not specified
	);
	const game: Game = {
		metadata,
		dateTimestamp,
		moves: [],
		gameRules,
		whosTurn: gameRules.turnOrder[0]!,
		...clockDependantVars,
	};

	if (clockValues) {
		if (game.untimed)
			throw Error(
				'Cannot set clock values for untimed game. Should not have specified clockValues.',
			);
		clock.edit(game.clocks, clockValues);
	}

	gamefileutility.setConclusion(game, gameConclusion);

	return game;
}

/** Creates a new {@link Board} object from provided arguments */
function initBoard(
	gameRules: GameRules,
	variant: LoadedVariant | undefined,
	dateTimestamp: number,
	variantOptions?: VariantOptions,
	editor: boolean = false,
	/** Only has an effect if the `worldBorder` gamerule is not present. */
	worldBorderDist?: bigint,
): Board {
	// Construct board state
	if (
		variantOptions?.gameRules.moveRule !== undefined &&
		variantOptions?.state_global.moveRuleState === undefined
	)
		throw new Error('If moveRule is specified, moveRuleState must also be specified.');

	const fullMove = variantOptions?.fullMove ?? 1;
	const enpassant = variantOptions?.state_global.enpassant;
	const moveRuleState =
		variantOptions?.state_global.moveRuleState ??
		(gameRules.moveRule !== undefined ? 0 : undefined);

	let position: Map<CoordsKey, number>;
	let specialRights: Set<CoordsKey>;

	if (variantOptions) {
		position = variantOptions.position;
		specialRights = variantOptions.state_global.specialRights;
	} else if (variant !== undefined) {
		({ position, specialRights } = variantreader.getStartingPositionOfVariant(
			variant.mod,
			dateTimestamp,
		));
	} else throw Error('Cannot get starting position without a variant module or variantOptions.');

	const state_global: GlobalGameState = { specialRights };
	if (enpassant !== undefined) state_global.enpassant = enpassant;
	if (moveRuleState !== undefined) state_global.moveRuleState = moveRuleState;

	const state: GameState = {
		local: {
			moveIndex: -1,
			inCheck: false,
			checks: [],
		},
		global: jsutil.deepCopyObject(state_global),
	};

	// Calculate movesets
	const pieceMovesets = variantreader.getMovesetsOfVariant(variant?.mod, gameRules.slideLimit);
	const specialMoves = variantreader.getSpecialMovesOfVariant(variant?.mod);

	const { pieces, existingTypes, existingRawTypes } = organizedpieces.processInitialPosition(position, pieceMovesets, gameRules.turnOrder, editor, gameRules.promotion); // prettier-ignore

	typeutil.deleteUnusedFromRawTypeGroup(existingRawTypes, specialMoves);

	let startingPositionBox = boardutil.getBoundingBoxOfAllPieces(pieces);
	// Fallback if no pieces present
	if (startingPositionBox === undefined)
		startingPositionBox = { left: 1n, right: 8n, bottom: 1n, top: 8n };

	// worldBorder: Receives the smaller of the two, if either the variant property or the override are defined.
	let worldBorderProperty: bigint | undefined = variantreader.getVariantWorldBorder(variant?.mod);
	if (worldBorderDist !== undefined) {
		if (worldBorderProperty === undefined)
			worldBorderProperty = worldBorderDist; // Use the provided world border if the variant doesn't have one.
		else if (worldBorderDist < worldBorderProperty) worldBorderProperty = worldBorderDist; // Use the smaller of the two if both exist.
	}

	if (gameRules.worldBorder === undefined && worldBorderProperty !== undefined) {
		// No override for exact world border dimensions provided, calculate it using the provided distance.
		gameRules.worldBorder = {
			left: startingPositionBox.left - worldBorderProperty,
			right: startingPositionBox.right + worldBorderProperty,
			bottom: startingPositionBox.bottom - worldBorderProperty,
			top: startingPositionBox.top + worldBorderProperty,
		};
	}

	const startSnapshot: Snapshot = {
		position,
		state_global,
		fullMove,
		box: startingPositionBox,
	};

	const vicinity = legalmoves.genVicinity(pieceMovesets);
	const specialVicinity = legalmoves.genSpecialVicinity(variant?.mod, existingRawTypes);

	const moves: MoveFull[] = [];

	return {
		pieces,
		existingTypes,
		existingRawTypes,
		state,
		moves,
		vicinity,
		specialVicinity,
		pieceMovesets,
		specialMoves,
		editor,
		variant,
		startSnapshot,
	};
}

/**
 * Attaches a board to a specific game. Used for loading a game after it was started.
 * @param validateMoves - During game construction, throws an error if any move played is illegal.
 */
function loadGameWithBoard(
	basegame: Game,
	boardsim: Board,
	moves: MovePacket[] = [],
	validateMoves?: boolean,
): FullGame {
	const gamefile = { basegame, boardsim };

	// Do we need to convert any checkmate win conditions to royalcapture?
	if (!wincondition.isCheckmateCompatibleWithGame(gamefile))
		gamerules.swapCheckmateForRoyalCapture(basegame.gameRules);

	{
		// Set the game's `inCheck` and `checks` properties at the front of the game.
		const trackChecks = gamefileutility.isOpponentUsingWinCondition(
			basegame,
			basegame.whosTurn,
			'checkmate',
		);
		const checkResults = checkdetection.detectCheck(gamefile, basegame.whosTurn, trackChecks); // { check: boolean, royalsInCheck: Coords[], checks?: CheckInfo[] }
		boardsim.state.local.inCheck = checkResults.check ? checkResults.royalsInCheck : false;
		if (trackChecks) boardsim.state.local.checks = checkResults.checks ?? [];
	}

	movepiece.makeAllMovesInGame(gamefile, moves, validateMoves);
	// Do not overwrite pre-existing server conclusion, if present.
	if (basegame.gameConclusion === undefined) gamefileutility.doGameOverChecks(gamefile);
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

	const basegame = initGame(
		metadata,
		dateTimestamp,
		variant?.mod,
		additional.gameConclusion,
		additional.clockValues,
		additional.variantOptions,
	);
	const boardsim = initBoard(
		basegame.gameRules,
		variant,
		dateTimestamp,
		additional.variantOptions,
		additional.editor,
		additional.worldBorderDist,
	);
	return loadGameWithBoard(basegame, boardsim, additional.moves, validateMoves);
}

export default {
	initGame,
	initBoard,
	initFullGame,
};
