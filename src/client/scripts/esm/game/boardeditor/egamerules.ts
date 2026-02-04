// src/client/scripts/esm/game/boardeditor/egamerules.ts

/**
 * Editor Game Rules
 *
 * Manages the game rules of the board editor position.
 */

import type { Edit } from './boardeditor';
import type { Piece } from '../../../../../shared/chess/util/boardutil';
import type { Coords } from '../../../../../shared/chess/util/coordutil';
import type { GameRules } from '../../../../../shared/chess/variants/gamerules';
import type { UnboundedRectangle } from '../../../../../shared/util/math/bounds';
import type { RawType, PlayerGroup } from '../../../../../shared/chess/util/typeutil';

import gameslot from '../chess/gameslot';
import boardutil from '../../../../../shared/chess/util/boardutil';
import winconutil from '../../../../../shared/chess/util/winconutil';
import boardeditor from './boardeditor';
import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter';
import guigamerules from '../gui/boardeditor/guigamerules';
import typeutil, { players as p, rawTypes as r } from '../../../../../shared/chess/util/typeutil';
import { EnPassant, GlobalGameState } from '../../../../../shared/chess/logic/state';

// Type Definitions --------------------------------------------------------------

/** Type encoding information for the game rules object of the editor position */
interface GameRulesGUIinfo {
	playerToMove: 'white' | 'black';
	enPassant?: {
		x: bigint;
		y: bigint;
	};
	moveRule?: {
		current: number;
		max: number;
	};
	promotionRanks?: {
		white?: bigint[];
		black?: bigint[];
	};
	promotionsAllowed?: RawType[];
	pawnDoublePush?: boolean;
	castling?: boolean;
	winConditions: string[];
	worldBorder?: UnboundedRectangle;
}

// Constants -------------------------------------------------------------

// Game rule relevant piece types

/** All piece types affected by the pawnDoublePush rule */
const pawnDoublePushTypes: RawType[] = [r.PAWN];
/** All piece types affected by the castling rule. These pieces are the only pieces allowed to castle under the castling rule. */
const castlingTypes: RawType[] = [r.ROOK, r.KING, r.ROYALCENTAUR];

// State -------------------------------------------------------------

/** Virtual game rules object for the position */
let gamerulesGUIinfo: GameRulesGUIinfo = {
	playerToMove: 'white',
	winConditions: [icnconverter.default_win_condition],
};

// Getting & Setting -------------------------------------------------------------

function getPlayerToMove(): 'white' | 'black' {
	return gamerulesGUIinfo.playerToMove;
}

function getCurrentGamerulesAndState(): {
	gameRules: GameRules;
	moveRuleState: number | undefined;
	enpassantcoords: Coords | undefined;
} {
	// Construct gameRules
	// prettier-ignore
	const turnOrder = gamerulesGUIinfo.playerToMove === "white" ? [p.WHITE, p.BLACK] : gamerulesGUIinfo.playerToMove === "black" ? [p.BLACK, p.WHITE] : (() => { throw Error("Invalid player to move"); })(); // Future protection
	const moveRule =
		gamerulesGUIinfo.moveRule !== undefined ? gamerulesGUIinfo.moveRule.max : undefined;
	const winConditions = {
		[p.WHITE]: gamerulesGUIinfo.winConditions,
		[p.BLACK]: gamerulesGUIinfo.winConditions,
	};
	let promotionRanks: PlayerGroup<bigint[]> | undefined = undefined;
	let promotionsAllowed: PlayerGroup<RawType[]> | undefined = undefined;
	if (
		gamerulesGUIinfo.promotionsAllowed !== undefined &&
		gamerulesGUIinfo.promotionRanks !== undefined
	) {
		promotionsAllowed = {};
		promotionRanks = {};
		if (
			gamerulesGUIinfo.promotionRanks.white !== undefined &&
			gamerulesGUIinfo.promotionRanks.white.length !== 0
		) {
			promotionRanks[p.WHITE] = gamerulesGUIinfo.promotionRanks.white;
			promotionsAllowed[p.WHITE] = gamerulesGUIinfo.promotionsAllowed;
		}
		if (
			gamerulesGUIinfo.promotionRanks.black !== undefined &&
			gamerulesGUIinfo.promotionRanks.black.length !== 0
		) {
			promotionRanks[p.BLACK] = gamerulesGUIinfo.promotionRanks.black;
			promotionsAllowed[p.BLACK] = gamerulesGUIinfo.promotionsAllowed;
		}
	}

	const gameRules: GameRules = {
		turnOrder,
		moveRule,
		promotionRanks,
		promotionsAllowed,
		winConditions,
		worldBorder: gamerulesGUIinfo.worldBorder,
	};

	const moveRuleState =
		gamerulesGUIinfo.moveRule !== undefined ? gamerulesGUIinfo.moveRule.current : undefined;
	// prettier-ignore
	const enpassantcoords: Coords | undefined = gamerulesGUIinfo.enPassant !== undefined ? [gamerulesGUIinfo.enPassant.x, gamerulesGUIinfo.enPassant.y] : undefined;

	return {
		gameRules,
		moveRuleState,
		enpassantcoords,
	};
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
	gamerulesGUIinfo.playerToMove = firstPlayer === p.WHITE ? "white" : firstPlayer === p.BLACK ? "black" : (() => { throw new Error("Invalid first player"); })(); // Future protection

	if (gameRules.turnOrder[0] === p.WHITE) gamerulesGUIinfo.playerToMove = 'white';
	else gamerulesGUIinfo.playerToMove = 'black';

	if (state_global.enpassant !== undefined) {
		gamerulesGUIinfo.enPassant = {
			x: state_global.enpassant.square[0],
			y: state_global.enpassant.square[1],
		};
	} else {
		gamerulesGUIinfo.enPassant = undefined;
	}

	if (gameRules.moveRule !== undefined) {
		gamerulesGUIinfo.moveRule = {
			current: state_global.moveRuleState || 0,
			max: gameRules.moveRule,
		};
	} else {
		gamerulesGUIinfo.moveRule = undefined;
	}

	if (gameRules.promotionRanks !== undefined) {
		gamerulesGUIinfo.promotionRanks = {
			white: gameRules.promotionRanks[p.WHITE],
			black: gameRules.promotionRanks[p.BLACK],
		};
	} else {
		gamerulesGUIinfo.promotionRanks = undefined;
	}

	if (gameRules.promotionsAllowed !== undefined) {
		gamerulesGUIinfo.promotionsAllowed = [
			...new Set([
				...(gameRules.promotionsAllowed[p.WHITE] || []),
				...(gameRules.promotionsAllowed[p.BLACK] || []),
			]),
		];
		if (gamerulesGUIinfo.promotionsAllowed.length === 0)
			gamerulesGUIinfo.promotionsAllowed = undefined;
	} else {
		gamerulesGUIinfo.promotionsAllowed = undefined;
	}

	gamerulesGUIinfo.winConditions = [
		...new Set([
			...(gameRules.winConditions[p.WHITE] || [icnconverter.default_win_condition]),
			...(gameRules.winConditions[p.BLACK] || [icnconverter.default_win_condition]),
		]),
	].filter((wincon) => winconutil.isWinConditionValid(wincon));

	// Update pawn double push specialrights of position, if necessary
	gamerulesGUIinfo.pawnDoublePush = pawnDoublePush;
	// Update castling with rooks specialrights of position, if necessary
	gamerulesGUIinfo.castling = castling;

	// Read World Border from the gamefile
	gamerulesGUIinfo.worldBorder = gameRules.worldBorder;

	// Update gamefile properties for rendering purposes and correct legal move calculation
	// prettier-ignore
	const enpassantSquare: Coords | undefined = gamerulesGUIinfo.enPassant !== undefined ? [gamerulesGUIinfo.enPassant.x, gamerulesGUIinfo.enPassant.y] : undefined;
	updateGamefileProperties(
		enpassantSquare,
		gamerulesGUIinfo.promotionRanks,
		gamerulesGUIinfo.playerToMove,
		gamerulesGUIinfo.worldBorder,
	);

	guigamerules.setGameRules(gamerulesGUIinfo); // Update the game rules GUI
}

/**
 * This gets called when undoing or redoing moves, to forget the pawnDoublePush and castling entries of the gamerules
 * since we do not keep track of the checkbox state between edits.
 * This also gets called when resetting the position.
 * @param value - The value to set pawnDoublePush and castling to, or undefined to set them to indeterminate.
 */
function setPositionDependentGameRules(
	options: { pawnDoublePush?: boolean | undefined; castling?: boolean | undefined } = {},
): void {
	gamerulesGUIinfo.pawnDoublePush = options.pawnDoublePush;
	gamerulesGUIinfo.castling = options.castling;

	guigamerules.setGameRules(gamerulesGUIinfo); // Update the game rules GUI
}

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
		if (pawnDoublePushTypes.includes(rawtype) && gamerulesGUIinfo.pawnDoublePush !== future)
			gamerulesGUIinfo.pawnDoublePush = undefined;
	}

	if (gamerulesGUIinfo.castling !== undefined) {
		const rawtype = typeutil.getRawType(type);
		if (castlingTypes.includes(rawtype)) {
			if (gamerulesGUIinfo.castling !== future) gamerulesGUIinfo.castling = undefined;
		} else if (!pawnDoublePushTypes.includes(rawtype)) {
			if (future) gamerulesGUIinfo.castling = undefined;
		}
	}

	guigamerules.setGameRules(gamerulesGUIinfo); // Update the game rules GUI
}

// Updating Special Rights -------------------------------------------------------------

/** Gives or removes all special rights of pawns according to the value of pawnDoublePush. */
function queueToggleGlobalPawnDoublePush(pawnDoublePush: boolean, edit: Edit): void {
	const gamefile = gameslot.getGamefile()!;
	const pieces = gamefile.boardsim.pieces;

	for (const idx of pieces.coords.values()) {
		const piece: Piece = boardutil.getDefinedPieceFromIdx(pieces, idx)!;
		if (pawnDoublePushTypes.includes(typeutil.getRawType(piece.type)))
			boardeditor.queueSpecialRights(gamefile, edit, piece.coords, pawnDoublePush);
	}
}

/** Gives or removes all special rights of rooks and jumping royals according to the value of castling. */
function queueToggleGlobalCastlingWithRooks(castling: boolean, edit: Edit): void {
	if (!boardeditor.areInBoardEditor()) return;

	const gamefile = gameslot.getGamefile()!;
	const pieces = gamefile.boardsim.pieces;

	for (const idx of pieces.coords.values()) {
		const piece: Piece = boardutil.getDefinedPieceFromIdx(pieces, idx)!;
		if (castlingTypes.includes(typeutil.getRawType(piece.type)))
			boardeditor.queueSpecialRights(gamefile, edit, piece.coords, castling);
		else if (!pawnDoublePushTypes.includes(typeutil.getRawType(piece.type)))
			boardeditor.queueSpecialRights(gamefile, edit, piece.coords, false);
	}
}

// Updating Gamefile State -------------------------------------------------------------

/**
 * Updates the en passant square, promotion lines, and turn order in the current gamefile.
 * Needed for display purposes and correct legal move calculation.
 */
function updateGamefileProperties(
	enpassantCoords: Coords | undefined,
	promotionRanks: { white?: bigint[]; black?: bigint[] } | undefined,
	playerToMove: 'white' | 'black',
	worldBorder: UnboundedRectangle | undefined,
): void {
	const gamefile = gameslot.getGamefile()!;

	// Update en passant state for rendering purposes, and correct enpassant legality calculation
	if (enpassantCoords === undefined) {
		gamefile.boardsim.state.global.enpassant = undefined;
	} else {
		// prettier-ignore
		const pawn: Coords = playerToMove === 'white' ? [enpassantCoords[0], enpassantCoords[1] - 1n] : playerToMove === 'black' ? [enpassantCoords[0], enpassantCoords[1] + 1n] : (() => { throw new Error("Invalid player to move"); })(); // Future protection
		const enpassant: EnPassant = { square: enpassantCoords, pawn };
		gamefile.boardsim.state.global.enpassant = enpassant;
	}

	// Update the promotionlines in the gamefile for rendering purposes
	if (promotionRanks === undefined) {
		gamefile.basegame.gameRules.promotionRanks = undefined;
	} else {
		gamefile.basegame.gameRules.promotionRanks = {};
		gamefile.basegame.gameRules.promotionRanks[p.WHITE] = promotionRanks.white || [];
		gamefile.basegame.gameRules.promotionRanks[p.BLACK] = promotionRanks.black || [];
	}

	// Update turn order so in the Normal tool, pawns correctly show enpassant as legal.
	// prettier-ignore
	gamefile.basegame.gameRules.turnOrder = playerToMove === 'white' ? [p.WHITE, p.BLACK] : playerToMove === 'black' ? [p.BLACK, p.WHITE] : (() => { throw new Error("Invalid player to move"); })(); // Future protection
	// Update whosTurn as well
	gamefile.basegame.whosTurn = gamefile.basegame.gameRules.turnOrder[0]!;

	// Update World Border
	gamefile.basegame.gameRules.worldBorder = worldBorder;
}

// Exports -------------------------------------------------------------

export type { GameRulesGUIinfo };

export default {
	pawnDoublePushTypes,
	castlingTypes,
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
