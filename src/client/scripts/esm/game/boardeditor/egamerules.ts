
// src/client/scripts/esm/game/boardeditor/egamerules.ts

/**
 * Editor Game Rules
 * 
 * Manages the game rules of the board editor position.
 */

import type { Coords } from "../../../../../shared/chess/util/coordutil";
import type { GameRules } from "../../../../../shared/chess/variants/gamerules";

import { PlayerGroup, players, RawType } from "../../../../../shared/chess/util/typeutil";
import { EnPassant, GlobalGameState } from "../../../../../shared/chess/logic/state";
import icnconverter from "../../../../../shared/chess/logic/icn/icnconverter";
import winconutil from "../../../../../shared/chess/util/winconutil";
import gameslot from "../chess/gameslot";
import guigamerules from "../gui/boardeditor/guigamerules";


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


function getPlayerToMove(): 'white' | 'black' {
	return gamerulesGUIinfo.playerToMove;
}

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
	const firstPlayer = gameRules.turnOrder[0];
	gamerulesGUIinfo.playerToMove = firstPlayer === players.WHITE ? "white" : firstPlayer === players.BLACK ? "black" : (() => { throw new Error("Invalid first player"); })(); // Future protection

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

	// Update gamefile properties for rendering purposes and correct legal move calculation
	const enpassantSquare: Coords | undefined = gamerulesGUIinfo.enPassant !== undefined ? [gamerulesGUIinfo.enPassant.x, gamerulesGUIinfo.enPassant.y] : undefined;
	updateGamefileProperties(enpassantSquare, gamerulesGUIinfo.promotionRanks, gamerulesGUIinfo.playerToMove);

	guigamerules.setGameRules(gamerulesGUIinfo); // Update the game rules GUI
}

/** Update the game rules object keeping track of all current game rules by using changes from guiboardeditor */
function updateGamerulesGUIinfo(new_gamerulesGUIinfo: GameRulesGUIinfo): void {
	gamerulesGUIinfo = new_gamerulesGUIinfo;
}


// Updating Gamefile State -------------------------------------------------------------


/**
 * Updates the en passant square, promotion lines, and turn order in the current gamefile.
 * Needed for display purposes and correct legal move calculation.
 */
function updateGamefileProperties(
	enpassantCoords: Coords | undefined,
	promotionRanks : { white?: bigint[]; black?: bigint[] } | undefined,
	playerToMove: 'white' | 'black',
): void {
	const gamefile = gameslot.getGamefile()!;

	// Update en passant state for rendering purposes, and correct enpassant legality calculation
	if (enpassantCoords === undefined) {
		gamefile.boardsim.state.global.enpassant = undefined;
	} else {
		const pawn: Coords = playerToMove === 'white' ? [enpassantCoords[0], enpassantCoords[1] - 1n] : playerToMove === 'black' ? [enpassantCoords[0], enpassantCoords[1] + 1n] : (() => { throw new Error("Invalid player to move"); })(); // Future protection
		const enpassant: EnPassant = { square: enpassantCoords, pawn };
		gamefile.boardsim.state.global.enpassant = enpassant;
	}

	// Update the promotionlines in the gamefile for rendering purposes
	if (promotionRanks === undefined) {
		gamefile.basegame.gameRules.promotionRanks = undefined;
	} else {
		gamefile.basegame.gameRules.promotionRanks = {};
		gamefile.basegame.gameRules.promotionRanks[players.WHITE] = promotionRanks.white || [];
		gamefile.basegame.gameRules.promotionRanks[players.BLACK] = promotionRanks.black || [];
	}

	// Update turn order so in the Normal tool, pawns correctly show enpassant as legal.
	gamefile.basegame.gameRules.turnOrder = playerToMove === 'white' ? [players.WHITE, players.BLACK] : playerToMove === 'black' ? [players.BLACK, players.WHITE] : (() => { throw new Error("Invalid player to move"); })(); // Future protection
	// Update whosTurn as well
	gamefile.basegame.whosTurn = gamefile.basegame.gameRules.turnOrder[0]!;
}


// Exports -------------------------------------------------------------


export type {
	GameRulesGUIinfo,
};

export default {
	// Getting & Setting
	getPlayerToMove,
	getCurrentGamerulesAndState,
	setGamerulesGUIinfo,
	updateGamerulesGUIinfo,
	// Updating Gamefile State
	updateGamefileProperties,
};