
// src/client/scripts/esm/game/boardeditor/egamerules.ts

/**
 * Editor Game Rules
 * 
 * Manages the game rules of the board editor position.
 */

import type { Coords } from "../../../../../shared/chess/util/coordutil";
import type { GameRules } from "../../../../../shared/chess/variants/gamerules";

import { PlayerGroup, players, RawType } from "../../../../../shared/chess/util/typeutil";
import state, { EnPassant, GlobalGameState } from "../../../../../shared/chess/logic/state";
import boardeditor, { Edit } from "./boardeditor";
import icnconverter from "../../../../../shared/chess/logic/icn/icnconverter";
import winconutil from "../../../../../shared/chess/util/winconutil";
import gameslot from "../chess/gameslot";
import guiboardeditor from "../gui/guiboardeditor";


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
	winConditions: string[];
}


// State -------------------------------------------------------------


/** Virtual game rules object for the position */
let gamerulesGUIinfo: GameRulesGUIinfo = {
	playerToMove: 'white',
	winConditions: [icnconverter.default_win_condition]
};


// Getting & Setting -------------------------------------------------------------


function getCurrentGamerulesAndState(): { gameRules: GameRules; moveRuleState: number | undefined; enpassantcoords: Coords | undefined; } {
	// Construct gameRules
	const turnOrder = gamerulesGUIinfo.playerToMove === "white" ? [players.WHITE, players.BLACK] : gamerulesGUIinfo.playerToMove === "black" ? [players.BLACK, players.WHITE] : (() => { throw Error("Invalid player to move"); })(); // Future protection
	const moveRule = gamerulesGUIinfo.moveRule !== undefined ? gamerulesGUIinfo.moveRule.max : undefined;
	const winConditions = { [players.WHITE]: gamerulesGUIinfo.winConditions, [players.BLACK]: gamerulesGUIinfo.winConditions };
	let promotionRanks: PlayerGroup<bigint[]> | undefined = undefined;
	let promotionsAllowed: PlayerGroup<RawType[]> | undefined = undefined;
	if (gamerulesGUIinfo.promotionsAllowed !== undefined && gamerulesGUIinfo.promotionRanks !== undefined) {
		promotionsAllowed = {};
		promotionRanks = {};
		if (gamerulesGUIinfo.promotionRanks.white !== undefined && gamerulesGUIinfo.promotionRanks.white.length !== 0) {
			promotionRanks[players.WHITE] = gamerulesGUIinfo.promotionRanks.white;
			promotionsAllowed[players.WHITE] = gamerulesGUIinfo.promotionsAllowed;
		}
		if (gamerulesGUIinfo.promotionRanks.black !== undefined && gamerulesGUIinfo.promotionRanks.black.length !== 0) {
			promotionRanks[players.BLACK] = gamerulesGUIinfo.promotionRanks.black;
			promotionsAllowed[players.BLACK] = gamerulesGUIinfo.promotionsAllowed;
		}
	}

	const gameRules: GameRules = {
		turnOrder,
		moveRule,
		promotionRanks,
		promotionsAllowed,
		winConditions
	};

	const moveRuleState = gamerulesGUIinfo.moveRule !== undefined ? gamerulesGUIinfo.moveRule.current : undefined;
	const enpassantcoords: Coords | undefined = gamerulesGUIinfo.enPassant !== undefined ? [gamerulesGUIinfo.enPassant.x, gamerulesGUIinfo.enPassant.y] : undefined;

	return {
		gameRules,
		moveRuleState,
		enpassantcoords
	};
}

/** Update the game rules object keeping track of all current game rules by using new gameRules and state_global */
function setGamerulesGUIinfo(gameRules: GameRules, state_global: Partial<GlobalGameState>): void {
	if (gameRules.turnOrder[0] === players.WHITE) gamerulesGUIinfo.playerToMove = "white";
	else gamerulesGUIinfo.playerToMove = "black";

	if (state_global.enpassant !== undefined) {
		gamerulesGUIinfo.enPassant = {
			x : state_global.enpassant.square[0],
			y : state_global.enpassant.square[1],
		};
	} else {
		gamerulesGUIinfo.enPassant = undefined;
	}

	if (gameRules.moveRule !== undefined) {
		gamerulesGUIinfo.moveRule = {
			current: state_global.moveRuleState || 0,
			max: gameRules.moveRule
		};
	} else {
		gamerulesGUIinfo.moveRule = undefined;
	}

	if (gameRules.promotionRanks !== undefined) {
		gamerulesGUIinfo.promotionRanks = {
			white: gameRules.promotionRanks[players.WHITE],
			black: gameRules.promotionRanks[players.BLACK]
		};
	} else {
		gamerulesGUIinfo.promotionRanks = undefined;
	}

	if (gameRules.promotionsAllowed !== undefined) {
		gamerulesGUIinfo.promotionsAllowed = [...new Set([
			...gameRules.promotionsAllowed[players.WHITE] || [],
			...gameRules.promotionsAllowed[players.BLACK] || []
		])];
		if (gamerulesGUIinfo.promotionsAllowed.length === 0) gamerulesGUIinfo.promotionsAllowed = undefined;
	} else {
		gamerulesGUIinfo.promotionsAllowed = undefined;
	}

	gamerulesGUIinfo.winConditions = [...new Set([
		...gameRules.winConditions[players.WHITE] || [icnconverter.default_win_condition],
		...gameRules.winConditions[players.BLACK] || [icnconverter.default_win_condition]
	])].filter(wincon => winconutil.isWinConditionValid(wincon));

	// Set en passant state for rendering purposes
	if (gamerulesGUIinfo.enPassant !== undefined) setEnpassantState([gamerulesGUIinfo.enPassant.x, gamerulesGUIinfo.enPassant.y]);
	else setEnpassantState(undefined);

	// Update the promotionlines in the gamefile for rendering purposes
	updatePromotionLines(gamerulesGUIinfo.promotionRanks);

	guiboardeditor.setGameRules(gamerulesGUIinfo); // Update the game rules GUI
}

/** Update the game rules object keeping track of all current game rules by using changes from guiboardeditor */
function updateGamerulesGUIinfo(new_gamerulesGUIinfo: GameRulesGUIinfo): void {
	gamerulesGUIinfo = new_gamerulesGUIinfo;
}


// Specific Rules -------------------------------------------------------------


/** Updates the en passant square in the current gamefile, needed for display purposes */
function setEnpassantState(coord: Coords | undefined): void {
	const enpassant: EnPassant | undefined = (coord !== undefined) ? { square: coord, pawn: [coord[0], coord[1] - 1n] } : undefined; // dummy enpassant object
	const edit: Edit = { changes: [], state: { local: [], global: [] } }; // dummy edit object

	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	state.createEnPassantState(edit, gamefile.boardsim.state.global.enpassant, enpassant);
	boardeditor.runEdit(gamefile, mesh, edit, true);
}

/** Updates the promotion lines in the current gamefile, needed for display purposes */
function updatePromotionLines(promotionRanks : { white?: bigint[]; black?: bigint[] } | undefined ): void {
	const gamefile = gameslot.getGamefile()!;
	if (promotionRanks === undefined) gamefile.basegame.gameRules.promotionRanks = undefined;
	else {
		gamefile.basegame.gameRules.promotionRanks = {};
		gamefile.basegame.gameRules.promotionRanks[players.WHITE] = (promotionRanks.white !== undefined ? promotionRanks.white : []);
		gamefile.basegame.gameRules.promotionRanks[players.BLACK] = (promotionRanks.black !== undefined ? promotionRanks.black : []);
	}
}


// Exports -------------------------------------------------------------


export type {
	GameRulesGUIinfo,
};

export default {
	// Getting & Setting
	getCurrentGamerulesAndState,
	setGamerulesGUIinfo,
	updateGamerulesGUIinfo,
	// Specific Rules
	setEnpassantState,
	updatePromotionLines,
};