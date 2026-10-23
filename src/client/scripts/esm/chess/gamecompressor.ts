// src/client/scripts/esm/chess/gamecompressor.ts

/**
 * This script handles the compression of a gamefile into a more simple json format,
 * suitable for the icnconverter to turn it into ICN (Infinite Chess Notation).
 */

import type { MoveFull } from '../../../../shared/chess/logic/movepiece.js';
import type { MovePreprint } from '../../../../shared/chess/logic/icn/icnmoves.js';
import type { GameFile, VariantOptions } from '../../../../shared/chess/logic/gamefile.js';
import type {
	LongFormatIn,
	PresetAnnotes,
} from '../../../../shared/chess/logic/icn/icnconverter.js';

import state from '../../../../shared/chess/logic/state.js';
import jsutil from '../../../../shared/util/jsutil.js';
import boardchanges from '../../../../shared/chess/logic/boardchanges.js';

import clientmetadatautil from './clientmetadatautil.js';

// Compressing a Game ----------------------------------------------------------

/**
 * Snapshots a gamefile's starting state, copied, ready for
 * {@link gameToPosition} to apply moves to.
 */
function buildStartState(gamefile: GameFile): VariantOptions {
	const { position, state_global, fullMove } = gamefile.startSnapshot;
	return {
		position: new Map(position),
		gameRules: jsutil.deepCopyObject(gamefile.gameRules),
		fullMove,
		// Shallow beyond the rights: moves replace the en passant object, never edit it.
		state_global: { ...state_global, specialRights: new Set(state_global.specialRights) },
	};
}

/**
 * Snapshots the provided gamefile into the shape the icnconverter turns into an ICN.
 * @param copySinglePosition - If true, only copy the current position, not the entire game. It won't have the moves list.
 * @param presetAnnotes - Should be specified if we have overrides for the variant's preset annotations.
 */
function compressGamefile(
	gamefile: GameFile,
	copySinglePosition?: boolean,
	presetAnnotes?: PresetAnnotes,
): LongFormatIn {
	/*
	 * We need to calculate the game state so that, if desired,
	 * we can convert the gamefile to a single position.
	 */
	const startState: VariantOptions = buildStartState(gamefile);

	// Modify the state if we're applying moves to match a single position
	const gamestate: VariantOptions = copySinglePosition
		? gameToPosition(startState, gamefile.moves, gamefile.state.local.moveIndex + 1) // Convert -1 based to 0 based
		: startState;

	// Start constructing the abridged gamefile
	const longformIn: LongFormatIn = {
		metadata: clientmetadatautil.buildMetaDataFromGamefile(gamefile),
		position: gamestate.position,
		gameRules: gamestate.gameRules,
		fullMove: gamestate.fullMove,
		state_global: gamestate.state_global,
		moves: copySinglePosition ? [] : convertMovesToICNConverterInMove(gamefile.moves),
	};

	// Add the preset annotation overrides from the previously pasted game, if present.
	if (presetAnnotes) longformIn.presetAnnotes = presetAnnotes;

	return longformIn;
}

/** Copies a gamefile's moves into the shape the icnconverter writes. */
function convertMovesToICNConverterInMove(moves: MoveFull[]): MovePreprint[] {
	const mappedMoves = moves.map((move: MoveFull) => {
		const movePreprint: MovePreprint = {
			type: move.type,
			startCoords: move.startCoords,
			endCoords: move.endCoords,
			token: move.token,
			flags: move.flags,
		};
		// Optionals
		if (move.promotion !== undefined) movePreprint.promotion = move.promotion;
		if (move.comment) movePreprint.comment = move.comment;
		if (move.clockStamp !== undefined) movePreprint.clockStamp = move.clockStamp;

		return movePreprint;
	});
	return jsutil.deepCopyObject(mappedMoves);
}

// Converting a Game to Single Position ----------------------------------------

/**
 * Takes a game state and applies the desired moves to it, modifying it.
 * The rotating turnOrder keeps track of whose turn it is in the resulting position.
 * @param moves - The moves of the original gamefile to apply to the state
 * @param [halfmoves] - Number of halfmoves from starting position to apply to the state (Infinity: final position of game)
 */
function gameToPosition(
	gamestate: VariantOptions,
	moves: MoveFull[],
	halfmoves: number = 0,
): VariantOptions {
	if (halfmoves === Infinity) halfmoves = moves.length; // If we want the final position, set halfmoves to the length of the moves array
	if (moves.length < halfmoves)
		throw Error(`Cannot convert game to position. Moves length (${moves.length}) is less than desired halfmoves (${halfmoves}).`); // prettier-ignore
	if (halfmoves === 0) return gamestate; // No changes needed

	const turnOrder = gamestate.gameRules.turnOrder;

	// First update the fullMove number. Increment one for each full turn cycle applied to the state.
	gamestate.fullMove += Math.floor(halfmoves / turnOrder.length);

	// Iterate through each move, progressively applying their game state changes,
	// until we reach the desired halfmove.
	for (let i = 0; i < halfmoves; i++) {
		const move = moves[i]!;

		// Apply the move's state changes (only the global ones land on a bare position).
		state.applyGlobalStateChanges(gamestate.state_global, move.state, true);
		// Next apply the logical (piece) changes.
		boardchanges.runChanges_Position(gamestate.position, move.changes);

		// Rotate the turn order, moving the first player to the back
		turnOrder.push(turnOrder.shift()!);
	}

	return gamestate;
}

/**
 * Flattens a gamefile's entire move list into the {@link VariantOptions} of the resulting
 * position, as though a new game were started from it. Regardless of the currently viewed
 * ply. Carries no metadata, and no moves.
 */
function gamefileToPositionOptions(gamefile: GameFile): VariantOptions {
	const startState = buildStartState(gamefile);
	return gameToPosition(startState, gamefile.moves, Infinity);
}

// Exports ---------------------------------------------------------------------

export default {
	compressGamefile,
	gameToPosition,
	gamefileToPositionOptions,
};
