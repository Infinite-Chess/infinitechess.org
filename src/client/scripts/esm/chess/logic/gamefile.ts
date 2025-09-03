
import type { ClockData, ClockValues } from "./clock.js";
import type { CoordsKey } from "../util/coordutil.js";
import type { MetaData } from "../util/metadata.js";
import type { GameRules } from "../variants/gamerules.js";
import type { Player, RawType, RawTypeGroup } from "../util/typeutil.js";
import type { Move, BaseMove } from "./movepiece.js";
import type { OrganizedPieces } from "./organizedpieces.js";
import type { PieceMoveset } from "./movesets.js";
import type { GameState, GlobalGameState } from "./state.js";
import type { VariantOptions } from "./initvariant.js";
import type { ServerGameMoveMessage } from "../../../../../server/game/gamemanager/gameutility.js";
import type { SpecialMoveFunction } from "./specialmove.js";
import type { BoundingBox } from "../../util/math/bounds.js";
import type { Additional } from "../../game/chess/gameslot.js";

import organizedpieces from "./organizedpieces.js";
import initvariant from "./initvariant.js";
import jsutil from "../../util/jsutil.js";
import typeutil from "../util/typeutil.js";
import legalmoves from "./legalmoves.js";
import gamefileutility from "../util/gamefileutility.js";
import boardutil from "../util/boardutil.js";
import clock from "./clock.js";
import movepiece from "./movepiece.js";
import checkdetection from "./checkdetection.js";
import gamerules from "../variants/gamerules.js";
import wincondition from "./wincondition.js";
import bounds from "../../util/math/bounds.js";
import variant from "../variants/variant.js";

interface Snapshot {
	/** In key format 'x,y':'type' */
	position: Map<CoordsKey, number>,
	/** The global state of the game beginning */
	state_global: GlobalGameState,
	/** This is the full-move number at the start of the game. Used for converting to ICN notation. */
	fullMove: number,
	/** The bounding box surrounding the starting position, without padding. INTEGER coords, not floating. */
	box: BoundingBox
}

/**
 * Purely game data
 * Used on both sides
 */
type Game = {
	/** Information about the game */
	metadata: MetaData
	moves: BaseMove[]
	gameRules: GameRules
	whosTurn: Player
	gameConclusion?: string
} & ClockDependant


/**
 * The Game variables that depend on the clock.
 */
type ClockDependant = {
	untimed: true,
	clocks: undefined,
} | {
	untimed: false,
	clocks: ClockData
}

/**
 * Game data used for simulating game logic and board state
 * Use by client always, may not be used by the server.
 */
type Board = {
	/** An array of all types of pieces that are in this game, without their color extension: `['pawns','queens']` */
	existingTypes: number[],
	/** An array of all RAW piece types that are in this game. */
	existingRawTypes: RawType[]

	moves: Move[]
	pieces: OrganizedPieces
	state: GameState

	colinearsPresent: boolean
	pieceMovesets: RawTypeGroup<() => PieceMoveset>
	specialMoves: RawTypeGroup<SpecialMoveFunction>

	specialVicinity: Record<CoordsKey, RawType[]>
	vicinity: Record<CoordsKey, RawType[]>

	/**
	 * If a world border exists in the current game (not dependant on variant,
	 * but dependant on game mode, such as engine), this is the width of extra
	 * available play area next to the furthest piece on each side of the starting position.
	 * This is so the position is symmetrical and fair.
	 * For example, if the starting position is 8x8, and the worldBorder is 10, then the playable area is 28x28.
	 */
	worldBorder?: bigint
} & EditorDependent

/** Some information should be left out when the editor is being used as it will slow processing down */
type EditorDependent = {
	/** Whether the gamefile is for the board editor. If true, the piece list will contain MUCH more undefined placeholders, and for every single type of piece, as pieces are added commonly in that! */
	editor: false
	/**
	 * Information about the beginning of the game (position, positionString, specialRights, turn)
	*/
	startSnapshot: Snapshot
} | {
	editor: true
	startSnapshot: undefined
}

/**
 * Both game data AND board state used on the client-side,
 * and in the future *sometimes* used on the server-side,
 * when the server starts doing legal move validation.
 */
type FullGame = {
	basegame: Game,
	boardsim: Board
}

/** Creates a new {@link Game} object from provided arguments */
function initGame(metadata: MetaData, variantOptions?: VariantOptions, gameConclusion?: string, clockValues?: ClockValues): Game {
	const gameRules = initvariant.getVariantGamerules(metadata, variantOptions);
	const clockDependantVars: ClockDependant = clock.init(new Set(gameRules.turnOrder), metadata.TimeControl);
	const game: Game = {
		metadata,
		moves: [],
		gameRules,
		whosTurn: gameRules.turnOrder[0]!,
		gameConclusion,
		...clockDependantVars,
	};
	
	if (clockValues) {
		if (game.untimed) throw Error('Cannot set clock values for untimed game. Should not have specified clockValues.');
		clock.edit(game.clocks, clockValues);
	}

	return game;
}

/** Creates a new {@link Board} object from provided arguements */
function initBoard(gameRules: GameRules, metadata: MetaData, variantOptions?: VariantOptions, editor: boolean = false, worldBorder?: bigint): Board {
	const { position, state_global, fullMove } = initvariant.getVariantVariantOptions(gameRules, metadata, variantOptions);

	const state: GameState = {
		local: {
			moveIndex: -1,
			inCheck: false,
			attackers: [],
		},
		global: jsutil.deepCopyObject(state_global)
	};
	
	const { pieceMovesets, specialMoves } = initvariant.getPieceMovesets(metadata, gameRules.slideLimit);

	const { pieces, existingTypes, existingRawTypes } = organizedpieces.processInitialPosition(
		position,
		pieceMovesets,
		gameRules.turnOrder,
		editor,
		gameRules.promotionsAllowed
	);

	typeutil.deleteUnusedFromRawTypeGroup(existingRawTypes, specialMoves);

	const startSnapshot: Snapshot = {
		position,
		state_global,
		fullMove,
		box: bounds.getBDBoxFromCoordsList(boardutil.getCoordsOfAllPieces(pieces)),
	};

	const vicinity = legalmoves.genVicinity(pieceMovesets);
	const specialVicinity = legalmoves.genSpecialVicinity(metadata, existingRawTypes);

	const moves: Move[] = [];
	// We can set these now, since processInitialPosition() trims the movesets of all pieces not in the game.
	const colinearsPresent = gamefileutility.areColinearSlidesPresentInGame(pieceMovesets, pieces.slides);

	// Have to assign it this weird way to make typescript happy.
	// We don't have to cast to EditorDependent this way.
	const editorDependentVars: EditorDependent = editor ? {
		editor: true,
		startSnapshot: undefined
	} : {
		editor: false,
		startSnapshot
	};

	// worldBorder: Receives the smaller of the two, if either the variant property or the override are defined.
	let worldBorderProperty: bigint | undefined = variant.getVariantWorldBorder(metadata.Variant);
	if (worldBorder !== undefined) {
		if (worldBorderProperty === undefined) worldBorderProperty = worldBorder; // Use the provided world border if the variant doesn't have one.
		else if (worldBorder < worldBorderProperty) worldBorderProperty = worldBorder; // Use the smaller of the two if both exist.
	}

	return {
		pieces,
		existingTypes,
		existingRawTypes,
		state,
		moves,
		vicinity,
		specialVicinity,
		colinearsPresent,
		pieceMovesets,
		specialMoves,
		worldBorder: worldBorderProperty,
		...editorDependentVars
	};
}

/** Attaches a board to a specific game. Used for loading a game after it was started. */
function loadGameWithBoard(basegame: Game, boardsim: Board, moves: ServerGameMoveMessage[] = [], gameConclusion?: string): FullGame {
	const gamefile = { basegame, boardsim };

	// Do we need to convert any checkmate win conditions to royalcapture?
	if (!wincondition.isCheckmateCompatibleWithGame(gamefile)) gamerules.swapCheckmateForRoyalCapture(basegame.gameRules);

	{ // Set the game's `inCheck` and `attackers` properties at the front of the game.
		const trackAttackers = gamefileutility.isOpponentUsingWinCondition(basegame, basegame.whosTurn, 'checkmate');
		const checkResults = checkdetection.detectCheck(gamefile, basegame.whosTurn, trackAttackers); // { check: boolean, royalsInCheck: Coords[], attackers?: Attacker[] }
		boardsim.state.local.inCheck = checkResults.check ? checkResults.royalsInCheck : false;
		if (trackAttackers) boardsim.state.local.attackers = checkResults.attackers ?? [];
	}

	movepiece.makeAllMovesInGame(gamefile, moves);
	/** The game's conclusion, if it is over. For example, `'1 checkmate'`
	 * Server's gameConclusion should overwrite preexisting gameConclusion. */
	if (gameConclusion) basegame.gameConclusion = gameConclusion;
	else gamefileutility.doGameOverChecks(gamefile);
	return gamefile;
}

/**
 * Initiates both the base game and board of the FullGame at the same time.
 * Used on just the client.
 */
function initFullGame(metadata: MetaData, additional: Additional = {}): FullGame {
	const basegame = initGame(metadata, additional.variantOptions, additional.gameConclusion, additional.clockValues);
	const boardsim = initBoard(basegame.gameRules, basegame.metadata, additional.variantOptions, additional.editor, additional.worldBorder);
	return loadGameWithBoard(basegame, boardsim, additional.moves, additional.gameConclusion);
}

export type {
	Game,
	Board,
	FullGame,
	Snapshot,
	ClockDependant,
};

export default {
	initGame,
	initBoard,
	loadGameWithBoard,
	initFullGame,
};