// src/server/game/cheatdetection/gameReplay.ts

/**
 * Builds a stored game's board at its start position, so each position's board facts can be
 * read at the front of the game, where they are defined, as the game is played forward:
 * whether the side to move is in check, and whether a move captures. Also writes each
 * position as the ICN the engine is handed, and says which plies each player moves at.
 */

import type { GameFile } from '../../../shared/chess/logic/gamefile.js';
import type { MoveParsed } from '../../../shared/chess/logic/icn/icnmoves.js';
import type { GameConstructionOptions } from '../../../shared/chess/game/gameformulator.js';
import type { LongFormatIn, LongFormatOut } from '../../../shared/chess/logic/icn/icnconverter.js';

import icnmoves from '../../../shared/chess/logic/icn/icnmoves.js';
import boardutil from '../../../shared/chess/logic/boardutil.js';
import engineicn from '../../../shared/chess/logic/icn/engineicn.js';
import icnconverter from '../../../shared/chess/logic/icn/icnconverter.js';
import gameformulator from '../../../shared/chess/game/gameformulator.js';

// Types -----------------------------------------------------------------------

/** A stored game, parsed, with a board standing at its start position. */
export interface GameAtStart {
	longformat: LongFormatOut;
	options: GameConstructionOptions;
	gamefile: GameFile;
}

// Functions -------------------------------------------------------------------

/** Parses a stored game's ICN and builds its board at the start position. */
async function loadAtStart(icn: string): Promise<GameAtStart> {
	const longformat = icnconverter.ShortToLong_Format(icn);
	const options = await gameformulator.resolveConstructionOptions(longformat);
	const gamefile = gameformulator.constructGame({ ...options, additional: { ...options.additional!, moves: undefined } }); // prettier-ignore
	return { longformat, options, gamefile };
}

/** The engine's ICN of the game's start position followed by `moves`. */
function engineIcn(game: GameAtStart, moves: MoveParsed[]): string {
	const { longformat, options } = game;
	const variantOptions = options.additional!.variantOptions!;
	const longform: LongFormatIn = {
		metadata: longformat.metadata,
		gameRules: longformat.gameRules,
		fullMove: longformat.fullMove,
		position: variantOptions.position,
		state_global: variantOptions.state_global,
		moves,
	};
	engineicn.prepareForEngine(longform);
	return engineicn.serialize(longform);
}

/** Whether the side to move is in check. */
function isInCheck(gamefile: GameFile): boolean {
	return gamefile.state.local.inCheck !== false;
}

/** Whether a move from the current position lands on a piece. */
function isCapture(gamefile: GameFile, token: string): boolean {
	const { endCoords } = icnmoves.parseTokenMove(token);
	return boardutil.isPieceOnCoords(gamefile.pieces, endCoords);
}

/** Whether player number `player` moves at a stored game's even plies (0) or odd (1), by its turn order. */
function parityOf(icn: string, player: number): 0 | 1 {
	const { turnOrder } = icnconverter.ShortToLong_Format(icn).gameRules;
	return turnOrder[0] === player ? 0 : 1;
}

// Exports ---------------------------------------------------------------------

export default {
	loadAtStart,
	engineIcn,
	isInCheck,
	isCapture,
	parityOf,
};
