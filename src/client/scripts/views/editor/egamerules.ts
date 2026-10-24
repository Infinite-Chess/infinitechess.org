// src/client/scripts/views/editor/egamerules.ts

/**
 * Editor Game Rules
 *
 * Manages the game rules of the board editor position.
 */

import type { Edit } from '../../../../shared/chess/logic/movepiece.js';
import type { Piece } from '../../../../shared/chess/logic/boardutil.js';
import type { Coords } from '../../../../shared/util/coordutil.js';
import type { UnboundedRectangle } from '../../../../shared/util/math/bounds.js';
import type { GameRules, Promotion } from '../../../../shared/chess/util/gamerules.js';
import type { GameruleWinCondition } from '../../../../shared/chess/util/winconutil.js';
import type { EnPassant, GlobalGameState } from '../../../../shared/chess/logic/state.js';
import type { Player, PlayerGroup, RawType } from '../../../../shared/chess/util/typeutil.js';

import boardutil from '../../../../shared/chess/logic/boardutil.js';
import gamerules from '../../../../shared/chess/util/gamerules.js';
import typeutil, { players as p, rawTypes as r } from '../../../../shared/chess/util/typeutil.js';

import gameslot from '../../game/chess/gameslot.js';
import edithistory from './edithistory.js';
import guigamerules from './gui/actions/guigamerules.js';

// Types -----------------------------------------------------------------------

/** The sides the editor supports to move. Widening it fails to compile wherever it's keyed on. */
type PlayerToMove = 'white' | 'black';

/** Type encoding information for the game rules object of the editor position */
export interface GameRulesGUIinfo {
	playerToMove: PlayerToMove;
	/** The square a pawn may capture en passant onto. */
	enPassant?: Coords;
	moveRule?: {
		current: number;
		max: number;
	};
	promotionRanks?: {
		white?: bigint[];
		black?: bigint[];
	};
	promotionPieces?: RawType[];
	pawnDoublePush?: boolean;
	castling?: boolean;
	winConditions: GameruleWinCondition[];
	worldBorder?: UnboundedRectangle;
}

// Constants -------------------------------------------------------------------

/** All piece types affected by the pawnDoublePush rule */
const PAWN_DOUBLE_PUSH_TYPES: RawType[] = [r.PAWN];
/** All piece types affected by the castling rule. These pieces are the only pieces allowed to castle under the castling rule. */
const CASTLING_TYPES: RawType[] = [r.ROOK, r.KING, r.ROYALCENTAUR];

/** The turn order beginning with each side to move. */
const TURN_ORDERS: Record<PlayerToMove, Player[]> = {
	white: [p.WHITE, p.BLACK],
	black: [p.BLACK, p.WHITE],
};
/** Per side to move, the rank offset from an en passant square to the pawn capturable there. */
const EN_PASSANT_PAWN_RANK_OFFSETS: Record<PlayerToMove, bigint> = { white: -1n, black: 1n };

// State -----------------------------------------------------------------------

/** Virtual game rules object for the position */
let gamerulesGUIinfo: GameRulesGUIinfo = {
	playerToMove: 'white',
	winConditions: [gamerules.DEFAULT_WIN_CONDITION],
};

// Getting & Setting -----------------------------------------------------------

/** The player to move in the editor position. */
function getPlayerToMove(): PlayerToMove {
	return gamerulesGUIinfo.playerToMove;
}

/** Builds the position's GameRules, move-rule state and en passant state from the GUI's rules. */
function getCurrentGamerulesAndState(): {
	gameRules: GameRules;
	moveRuleState: number | undefined;
	enpassant: EnPassant | undefined;
} {
	// Construct gameRules
	const turnOrder = [...TURN_ORDERS[gamerulesGUIinfo.playerToMove]];
	const moveRule =
		gamerulesGUIinfo.moveRule !== undefined ? gamerulesGUIinfo.moveRule.max : undefined;
	const winConditions = {
		[p.WHITE]: gamerulesGUIinfo.winConditions,
		[p.BLACK]: gamerulesGUIinfo.winConditions,
	};

	let promotion: Promotion | undefined;
	if (
		gamerulesGUIinfo.promotionPieces !== undefined &&
		gamerulesGUIinfo.promotionRanks !== undefined
	) {
		const promotionRanks: PlayerGroup<bigint[]> = {};
		if (
			gamerulesGUIinfo.promotionRanks.white !== undefined &&
			gamerulesGUIinfo.promotionRanks.white.length !== 0
		) {
			promotionRanks[p.WHITE] = gamerulesGUIinfo.promotionRanks.white;
		}
		if (
			gamerulesGUIinfo.promotionRanks.black !== undefined &&
			gamerulesGUIinfo.promotionRanks.black.length !== 0
		) {
			promotionRanks[p.BLACK] = gamerulesGUIinfo.promotionRanks.black;
		}

		promotion = {
			ranks: promotionRanks,
			pieces: gamerulesGUIinfo.promotionPieces,
		};
	}

	const gameRules: GameRules = {
		turnOrder,
		moveRule,
		promotion,
		winConditions,
		worldBorder: gamerulesGUIinfo.worldBorder,
	};

	const moveRuleState =
		gamerulesGUIinfo.moveRule !== undefined ? gamerulesGUIinfo.moveRule.current : undefined;

	return {
		gameRules,
		moveRuleState,
		enpassant: getEnPassant(gamerulesGUIinfo),
	};
}

/** The en passant state `info` describes, if it has an en passant square. */
function getEnPassant(info: GameRulesGUIinfo): EnPassant | undefined {
	const square = info.enPassant;
	if (square === undefined) return undefined;
	const pawnY = square[1] + EN_PASSANT_PAWN_RANK_OFFSETS[info.playerToMove];
	return { square, pawn: [square[0], pawnY] };
}

/**
 * Update the game rules object keeping track of all current game rules by using new gameRules and state_global.
 * Optionally, pawnDoublePush and castling can also be passed into this function, if they should take values other than undefined.
 * Optionally, an Edit object can be passed to this function if the board state should be updated
 */
function setGamerulesGUIinfo(
	gameRules: GameRules,
	state_global: Partial<GlobalGameState>,
	pawnDoublePush: boolean | undefined,
	castling: boolean | undefined,
): void {
	const firstPlayer = gameRules.turnOrder[0];
	// prettier-ignore
	gamerulesGUIinfo.playerToMove = firstPlayer === p.WHITE ? 'white' : firstPlayer === p.BLACK ? 'black' : (() => { throw new Error('Invalid first player'); })(); // Future protection

	if (state_global.enpassant !== undefined)
		gamerulesGUIinfo.enPassant = state_global.enpassant.square;
	else delete gamerulesGUIinfo.enPassant;

	if (gameRules.moveRule !== undefined) {
		gamerulesGUIinfo.moveRule = {
			current: state_global.moveRuleState || 0,
			max: gameRules.moveRule,
		};
	} else {
		delete gamerulesGUIinfo.moveRule;
	}

	if (gameRules.promotion !== undefined) {
		gamerulesGUIinfo.promotionRanks = {
			white: gameRules.promotion.ranks[p.WHITE],
			black: gameRules.promotion.ranks[p.BLACK],
		};
		gamerulesGUIinfo.promotionPieces = gameRules.promotion.pieces;
	} else {
		delete gamerulesGUIinfo.promotionRanks;
		delete gamerulesGUIinfo.promotionPieces;
	}

	gamerulesGUIinfo.winConditions = [
		...new Set([
			...(gameRules.winConditions[p.WHITE] || [gamerules.DEFAULT_WIN_CONDITION]),
			...(gameRules.winConditions[p.BLACK] || [gamerules.DEFAULT_WIN_CONDITION]),
		]),
	];

	// Update pawn double push specialrights of position, if necessary
	gamerulesGUIinfo.pawnDoublePush = pawnDoublePush;
	// Update castling with rooks specialrights of position, if necessary
	gamerulesGUIinfo.castling = castling;

	// Read World Border from the gamefile
	gamerulesGUIinfo.worldBorder = gameRules.worldBorder;

	// Update gamefile properties for rendering purposes and correct legal move calculation
	updateGamefileProperties(gamerulesGUIinfo);

	guigamerules.setGameRules(gamerulesGUIinfo); // Update the game rules GUI
}

/**
 * This gets called when undoing or redoing moves, to forget the pawnDoublePush and castling entries of the gamerules
 * since we do not keep track of the checkbox state between edits.
 * This also gets called when resetting the position.
 * @param options - The values to set pawnDoublePush and castling to, each undefined for indeterminate.
 */
function setPositionDependentGameRules(
	options: { pawnDoublePush?: boolean | undefined; castling?: boolean | undefined } = {},
): void {
	gamerulesGUIinfo.pawnDoublePush = options.pawnDoublePush;
	gamerulesGUIinfo.castling = options.castling;

	guigamerules.setGameRules(gamerulesGUIinfo); // Update the game rules GUI
}

/** The pawnDoublePush and castling checkbox states, each undefined while indeterminate. */
function getPositionDependentGameRules(): {
	pawnDoublePush: boolean | undefined;
	castling: boolean | undefined;
} {
	return {
		pawnDoublePush: gamerulesGUIinfo.pawnDoublePush,
		castling: gamerulesGUIinfo.castling,
	};
}

/** Update the game rules object keeping track of all current game rules by using changes from guiboardeditor */
function updateGamerulesGUIinfo(new_gamerulesGUIinfo: GameRulesGUIinfo): void {
	gamerulesGUIinfo = new_gamerulesGUIinfo;
}

/**
 * When a special rights change gets queued, this function gets called
 * to potentially set gamerulesGUIinfo.pawnDoublePush and gamerulesGUIinfo.castling to indeterminate
 * @param type - The piece type whose special right is being changed
 * @param future - The future value of the special right being changed
 */
function updateGamerulesUponQueueToggleSpecialRight(type: number, future: boolean): void {
	if (gamerulesGUIinfo.pawnDoublePush !== undefined) {
		const rawtype = typeutil.getRawType(type);
		if (PAWN_DOUBLE_PUSH_TYPES.includes(rawtype) && gamerulesGUIinfo.pawnDoublePush !== future)
			gamerulesGUIinfo.pawnDoublePush = undefined;
	}

	if (gamerulesGUIinfo.castling !== undefined) {
		const rawtype = typeutil.getRawType(type);
		if (CASTLING_TYPES.includes(rawtype)) {
			if (gamerulesGUIinfo.castling !== future) gamerulesGUIinfo.castling = undefined;
		} else if (!PAWN_DOUBLE_PUSH_TYPES.includes(rawtype)) {
			if (future) gamerulesGUIinfo.castling = undefined;
		}
	}

	guigamerules.setGameRules(gamerulesGUIinfo); // Update the game rules GUI
}

// Updating Special Rights -----------------------------------------------------

/** Gives or removes all special rights of pawns according to the value of pawnDoublePush. */
function queueToggleGlobalPawnDoublePush(pawnDoublePush: boolean, edit: Edit): void {
	const gamefile = gameslot.getGamefile()!;
	const pieces = gamefile.pieces;

	for (const idx of pieces.coords.values()) {
		const piece: Piece = boardutil.getDefinedPieceFromIdx(pieces, idx)!;
		if (PAWN_DOUBLE_PUSH_TYPES.includes(typeutil.getRawType(piece.type)))
			edithistory.queueSpecialRights(gamefile, edit, piece.coords, pawnDoublePush);
	}
}

/** Gives or removes all special rights of rooks and jumping royals according to the value of castling. */
function queueToggleGlobalCastlingWithRooks(castling: boolean, edit: Edit): void {
	const gamefile = gameslot.getGamefile()!;
	const pieces = gamefile.pieces;

	for (const idx of pieces.coords.values()) {
		const piece: Piece = boardutil.getDefinedPieceFromIdx(pieces, idx)!;
		const rawType = typeutil.getRawType(piece.type);
		if (CASTLING_TYPES.includes(rawType))
			edithistory.queueSpecialRights(gamefile, edit, piece.coords, castling);
		else if (!PAWN_DOUBLE_PUSH_TYPES.includes(rawType))
			edithistory.queueSpecialRights(gamefile, edit, piece.coords, false);
	}
}

// Updating Gamefile State -----------------------------------------------------

/**
 * Updates the en passant square, promotion lines, turn order and world border in the current
 * gamefile to `info`'s. Needed for display purposes and correct legal move calculation.
 */
function updateGamefileProperties(info: GameRulesGUIinfo): void {
	const gamefile = gameslot.getGamefile()!;
	const { promotionRanks, promotionPieces } = info;

	// Update en passant state for rendering purposes, and correct enpassant legality calculation
	gamefile.state.global.enpassant = getEnPassant(info);

	// Update the promotionlines in the gamefile for rendering purposes
	if (promotionRanks === undefined || promotionPieces === undefined) {
		delete gamefile.gameRules.promotion;
	} else {
		gamefile.gameRules.promotion = {
			ranks: {
				[p.WHITE]: promotionRanks.white,
				[p.BLACK]: promotionRanks.black,
			},
			pieces: promotionPieces,
		};
	}

	// Update turn order so in the Normal tool, pawns correctly show enpassant as legal.
	gamefile.gameRules.turnOrder = [...TURN_ORDERS[info.playerToMove]];
	// Update whosTurn as well
	gamefile.whosTurn = gamefile.gameRules.turnOrder[0]!;

	// Update World Border
	gamefile.gameRules.worldBorder = info.worldBorder;
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	PAWN_DOUBLE_PUSH_TYPES,
	CASTLING_TYPES,
	// Getting & Setting
	getPlayerToMove,
	getCurrentGamerulesAndState,
	setGamerulesGUIinfo,
	setPositionDependentGameRules,
	getPositionDependentGameRules,
	updateGamerulesGUIinfo,
	updateGamerulesUponQueueToggleSpecialRight,
	// Updating Special Rights
	queueToggleGlobalPawnDoublePush,
	queueToggleGlobalCastlingWithRooks,
	// Updating Gamefile State
	updateGamefileProperties,
};
