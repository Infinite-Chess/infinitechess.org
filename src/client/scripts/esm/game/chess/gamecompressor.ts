
/**
 * This script handles the compression of a gamefile into a more simple json format,
 * suitable for the formatconverter to turn it into ICN (Infinite Chess Notation).
 */


import jsutil from '../../util/jsutil.js';
import icnconverter, { _Move_In, LongFormatIn } from '../../chess/logic/icn/icnconverter.js';
import state from '../../chess/logic/state.js';
import boardchanges from '../../chess/logic/boardchanges.js';
import organizedpieces from '../../chess/logic/organizedpieces.js';
import movepiece from '../../chess/logic/movepiece.js';


import type { Coords, CoordsKey } from '../../chess/util/coordutil.js';
import type { MetaData } from '../../chess/util/metadata.js';
import type { Move, NullMove } from '../../chess/logic/movepiece.js';
import type { EnPassant, GlobalGameState } from '../../chess/logic/state.js';
// @ts-ignore
import type gamefile from '../../chess/logic/gamefile.js';
// @ts-ignore
import type { GameRules } from '../../chess/variants/gamerules.js';



/**
 * This is the bare minimum gamefile you need to keep track of STATE,
 * or, properties of a gamefile that may change from making moves,
 * and you don't record the moves list so second-handedly keep track
 * of states like whosTurn and fullMove number.
 * 
 * This is used in {@link GameToPosition} when converting a gamefile to a single position.
 */
interface SimplifiedGameState {
	// The pieces
	position: Map<CoordsKey, number>,
	// The turnOrder rotating essentially keeps track of whos turn it is in the position.
	turnOrder: gamefile['gameRules']['turnOrder'],
	// The fullMove number increments with every turn cycle
	fullMove: number,
	// For state.ts, the 3 global game states
	state_global: {
		specialRights: Set<CoordsKey>,
		enpassant?: EnPassant,
		moveRuleState?: number,
	}
}


/**
 * Primes the provided gamefile to for the formatconverter to turn it into an ICN
 * @param gamefile - The gamefile
 * @param copySinglePosition - If true, only copy the current position, not the entire game. It won't have the moves list.
 * @returns The primed gamefile for converting into ICN format
 */
function compressGamefile(gamefile: gamefile, copySinglePosition?: true): LongFormatIn {

	let startingPosition: Map<CoordsKey, number>;
	let state_global: GlobalGameState;
	let fullMove: number;

	if (gamefile.startSnapshot) {
		startingPosition = jsutil.deepCopyObject(gamefile.startSnapshot.position);
		state_global = jsutil.deepCopyObject(gamefile.startSnapshot.state_global);
		fullMove = gamefile.startSnapshot.fullMove;
	} else { // editor game,   also copySinglePosition is false
		if (!gamefile.editor) throw Error("startSnapshot missing in non-editor mode");
		if (gamefile.moves.length > 0) throw Error("Should not be moves present in editor mode");
		if (copySinglePosition) throw Error('copySinglePosition has no effect in editor mode');

		startingPosition = organizedpieces.generatePositionFromPieces(gamefile.pieces);
		// Since we know there's zero moves, then the gamefile itself acts as the startSnapshot
		state_global = jsutil.deepCopyObject(gamefile.state.global);
		fullMove = 1;
	}

	/*
	 * We need to calculate the game state so that, if desired,
	 * we can convert the gamefile to a single position.
	 */
	const gameRulesCopy = jsutil.deepCopyObject(gamefile.gameRules);
	let gamestate: SimplifiedGameState = {
		position: startingPosition,
		turnOrder: gameRulesCopy.turnOrder,
		fullMove,
		state_global,
	};

	// Modify the state if we're applying moves to match a single position
	if (copySinglePosition) gamestate = GameToPosition(gamestate, gamefile.moves, gamefile.state.local.moveIndex + 1); // Convert -1 based to 0 based

	// Start constructing the abridged gamefile
	const long_format_in: LongFormatIn = {
		metadata: jsutil.deepCopyObject(gamefile.metadata),
		position: gamestate.position,
		gameRules: gameRulesCopy,
		fullMove: gamestate.fullMove,
		state_global: gamestate.state_global,
		moves: copySinglePosition ? [] : convertMovesToICNConverterInMove(gamefile.moves),
	};

	console.log("Constructed LongFormatIn:", jsutil.deepCopyObject(long_format_in));

	return long_format_in;
}

function convertMovesToICNConverterInMove(moves: (Move | NullMove)[]): _Move_In[] {
	const mappedMoves = moves.map((move: Move | NullMove) => {
		if (move.isNull) throw Error("Should not be null moves in game!")
		const move_in: _Move_In = {
			type: move.type,
			startCoords: move.startCoords,
			endCoords: move.endCoords,
			compact: move.compact,
			flags: move.flags,
		}
		// Optionals
		if (move.promotion !== undefined) move_in.promotion = move.promotion;
		if (move.comment) move_in.comment = move.comment;
		if (move.clockStamp !== undefined) move_in.clockStamp = move.clockStamp;

		return move_in;
	});
	return jsutil.deepCopyObject(mappedMoves);
}



// Converting a Game to Single Position ---------------------------------------------------------------------------------


/**
 * Takes a simple game state and applies the desired moves to it, modifying it.
 * @param longform
 * @param moves - The moves of the original gamefile to apply to the state
 * @param [halfmoves] - Number of halfmoves from starting position to apply to the state (Infinity: final position of game)
 */
function GameToPosition(longform: SimplifiedGameState, moves: (Move | NullMove)[], halfmoves: number = 0): SimplifiedGameState {
	if (halfmoves === Infinity) halfmoves = moves.length; // If we want the final position, set halfmoves to the length of the moves array
	if (moves.length < halfmoves) throw Error(`Cannot convert game to position. Moves length (${moves.length}) is less than desired halfmoves (${halfmoves}).`);
	if (halfmoves === 0) return longform; // No changes needed

	// console.log('Before converting gamestate to single position:', jsutil.deepCopyObject(longform));

	// First update the fullMove number. Increment one for each full turn cycle applied to the state.
	longform.fullMove += Math.floor(halfmoves / longform.turnOrder.length);

	// Iterate through each move, progressively applying their game state changes,
	// until we reach the desired halfmove.
	for (let i = 0; i < halfmoves; i++) {
		const move = moves[i]!;
		if (move.isNull) throw Error("Should not be a null move.")

		// Apply the move's state changes.
		// state.applyMove(longform, move.state, true, { globalChange: true }); // Apply the State of the move
		state.applyGlobalStateChanges(longform.state_global, move.state.global, true);
		// Next apply the logical (piece) changes.
		boardchanges.runChanges_Position(longform.position, move.changes);

		// Rotate the turn order, moving the first player to the back
		longform.turnOrder.push(longform.turnOrder.shift()!);
	}

	// console.log('After converting gamestate to single position:', jsutil.deepCopyObject(longform));

	return longform;
}


// Exports --------------------------------------------------------------------------------------------------------------


export default {
	compressGamefile,
};