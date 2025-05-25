import type { ClockData, ClockValues } from "./clock.js";
import type { CoordsKey } from "../util/coordutil.js";
import type { BoundingBox } from "../../util/math.js";
import type { MetaData } from "../util/metadata.js";
import type { GameRules } from "../variants/gamerules.js";
import type { Player, RawType, RawTypeGroup } from "../util/typeutil.js";
import type { Move, NullMove } from "./movepiece.js";
import type { OrganizedPieces } from "./organizedpieces.js";
import type { PieceMoveset } from "./movesets.js";
import type { GameState, GlobalGameState } from "./state.js";
import type { Piece } from "../util/boardutil.js";
import type { VariantOptions } from "./initvariant.js";
import type { ServerGameMovesMessage } from "../../game/misc/onlinegame/onlinegamerouter.js";

import organizedpieces from "./organizedpieces.js";
import initvariant from "./initvariant.js";
import jsutil from "../../util/jsutil.js";
import typeutil from "../util/typeutil.js";
import legalmoves from "./legalmoves.js";
import gamefileutility from "../util/gamefileutility.js";
import boardutil from "../util/boardutil.js";
import math from "../../util/math.js";
import clock from "./clock.js";
import movepiece from "./movepiece.js";
import checkdetection from "./checkdetection.js";
// @ts-ignore
import wincondition from "./wincondition.js";
import gamerules from "../variants/gamerules.js";

interface Snapshot {
	/** In key format 'x,y':'type' */
	position: Map<CoordsKey, number>,
	/** The global state of the game beginning */
	state_global: GlobalGameState,
	/** This is the full-move number at the start of the game. Used for converting to ICN notation. */
	fullMove?: number,
	/** The bounding box surrounding the starting position, without padding.*/
	box: BoundingBox
}

/**
 * Purely game data
 * Used on both sides
 */
type Game = {
	/** Information about the game */
	metadata: MetaData
	moves: string[]
	gameRules: GameRules
	whosTurn: Player
	gameConclusion?: string
	board?: Board
} & ({
	untimed: true,
	clocks: undefined,
} | {
	untimed: false,
	clocks: ClockData
}
)

type FullGame = {
	game: Game,
	board: Board
}

/**
 * Game data used for simulating game logic
 * Use by client always, may not be used by the server.
 */
type Board = {
	/** An array of all types of pieces that are in this game, without their color extension: `['pawns','queens']` */
	existingTypes: number[],
	/** An array of all RAW piece types that are in this game. */
	existingRawTypes: RawType[]

	moves: (Move|NullMove)[]
	pieces: OrganizedPieces
	state: GameState

	colinearsPresent: boolean
	pieceMovesets: RawTypeGroup<() => PieceMoveset>
	// eslint-disable-next-line no-unused-vars
	specialMoves: RawTypeGroup<(board: Board, piece: Piece, move: Move) => boolean>

	specialVicinity: Record<CoordsKey, RawType[]>
	vicinity: Record<CoordsKey, RawType[]>
} & EditorDependent

type EditorDependent = {
	/** Whether the gamefile is for the board editor. If true, the piece list will contain MUCH more undefined placeholders, and for every single type of piece, as pieces are added commonly in that! */
	editor: false
	/**
	 * Information about the beginning of the game (position, positionString, specialRights, turn)
	 * Not included when we're in editor mode
	 * Too many changes slows it down.
	*/
	startSnapshot: Snapshot
} | {
	editor: true
	startSnapshot: undefined
}

function initGame(metadata: MetaData, variantOptions?: VariantOptions, gameConclusion?: string, clockValues?: ClockValues): Game {
	const gameRules = initvariant.getVariantGamerules(metadata, variantOptions);
	const game = {
		gameRules,
		metadata,
		moves: [],
		whosTurn: gameRules.turnOrder[0],
		untimed: true,
		clocks: undefined,
		gameConclusion
	} as Game;

	clock.set(game, clockValues);

	return game;
}

function initBoard(gameRules: GameRules, metadata: MetaData, variantOptions?: VariantOptions, editor: boolean = false): Board {
	const startSnapshot = initvariant.genStartSnapshot(gameRules, metadata, variantOptions);

	const state: GameState = {
		local: {
			moveIndex: -1,
			inCheck: false,
			attackers: [],
		},
		global: jsutil.deepCopyObject(startSnapshot.state_global)
	};
	
	const { pieceMovesets, specialMoves } = initvariant.getPieceMovesets(metadata, gameRules.slideLimit);

	const { pieces, existingTypes, existingRawTypes } = organizedpieces.processInitialPosition(
		startSnapshot.position,
		pieceMovesets,
		gameRules.turnOrder,
		gameRules.promotionsAllowed,
		editor
	);

	typeutil.deleteUnusedFromRawTypeGroup(existingRawTypes, specialMoves);

	startSnapshot.box = math.getBoxFromCoordsList(boardutil.getCoordsOfAllPieces(pieces));

	const specialVicinity = legalmoves.genSpecialVicinity(metadata, existingRawTypes);

	const moves: (Move|NullMove)[] = [];
	// We can set these now, since processInitialPosition() trims the movesets of all pieces not in the game.
	const colinearsPresent = gamefileutility.areColinearSlidesPresentInGame(pieceMovesets, pieces.slides);

	const vicinity = legalmoves.genVicinity(pieceMovesets);

	const refSnapshot = startSnapshot;

	const editorDependentVars = {
		editor,
		startSnapshot: (editor ? undefined : refSnapshot)
	} as EditorDependent;

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
		...editorDependentVars
	};
}

function loadGameWithBoard(game: Game, board: Board, moves:ServerGameMovesMessage = [], gameConclusion?: string) {
	game.board = board;

	// Do we need to convert any checkmate win conditions to royalcapture?
	if (!wincondition.isCheckmateCompatibleWithGame(game, board)) gamerules.swapCheckmateForRoyalCapture(game.gameRules);

	{ // Set the game's `inCheck` and `attackers` properties at the front of the game.
		const trackAttackers = gamefileutility.isOpponentUsingWinCondition(game, game.whosTurn, 'checkmate');
		const checkResults = checkdetection.detectCheck(game, board, game.whosTurn, trackAttackers); // { check: boolean, royalsInCheck: Coords[], attackers?: Attacker[] }
		board.state.local.inCheck = checkResults.check ? checkResults.royalsInCheck : false;
		if (trackAttackers) board.state.local.attackers = checkResults.attackers ?? [];
	}

	movepiece.makeAllMovesInGame(game, board, moves);
	/** The game's conclusion, if it is over. For example, `'1 checkmate'`
	 * Server's gameConclusion should overwrite preexisting gameConclusion. */
	if (gameConclusion) game.gameConclusion = gameConclusion;
	else gamefileutility.doGameOverChecks(game, board);
}

export type {
	Game,
	Board,
	FullGame,
	Snapshot,
};

export default {
	initBoard,
	initGame,
	loadGameWithBoard,
};