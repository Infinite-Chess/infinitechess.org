
/**
 * This script handles the compression of a gamefile into a more simple json format,
 * suitable for the formatconverter to turn it into ICN (Infinite Chess Notation).
 */


import jsutil from '../../util/jsutil.js';
import icnconverter from '../../chess/logic/icn/icnconverter.js';
import state from '../../chess/logic/state.js';
import boardchanges from '../../chess/logic/boardchanges.js';
import organizedpieces from '../../chess/logic/organizedpieces.js';
import movepiece from '../../chess/logic/movepiece.js';


import type { Coords, CoordsKey } from '../../chess/util/coordutil.js';
import type { MetaData } from '../../chess/util/metadata.js';
import type { Move } from '../../chess/logic/movepiece.js';
import type { EnPassant } from '../../chess/logic/state.js';
// @ts-ignore
import type gamefile from '../../chess/logic/gamefile.js';
// @ts-ignore
import type { GameRules } from '../../chess/variants/gamerules.js';


/**
 * A compressed version of a gamefile, suitable for the formatconverter to turn it into ICN.
 * All unimportant data is excluded.
 */
interface AbridgedGamefile {
	/** The Variant metadata should be the CODE of the variant, not a translation. */
	metadata: MetaData,
	fullMove: number,
	/** A position in ICN notation (e.g. `"P1,2+|P2,2+|..."`) */
	positionString: string,
	startingPosition: Map<CoordsKey, number>,
	gameRules: GameRules,
	moves: Move[],
	// The 3 global game states
	specialRights: Set<CoordsKey>,
	enpassant?: Coords,
	moveRuleState?: number,
}


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
function compressGamefile(gamefile: gamefile, copySinglePosition?: true): AbridgedGamefile {

	// ===== NEEDED FOR GAME STATE ========

	let startingPosition: Map<CoordsKey, number>;
	const gameRulesCopy = jsutil.deepCopyObject(gamefile.gameRules);
	// The 3 global game states:
	let specialRights: Set<CoordsKey>;
	let enpassant: EnPassant | undefined;
	let moveRuleState: number | undefined;

	// ======== NEEDED FOR ABRIDGEMENT ==========

	const metadataCopy = jsutil.deepCopyObject(gamefile.metadata);
	const movesCopy: Move[] = jsutil.deepCopyObject(movepiece.ensureMovesNotNull(gamefile.moves));
	let positionString: string;
	let fullMove: number;

	if (gamefile.startSnapshot) {
		startingPosition = jsutil.deepCopyObject(gamefile.startSnapshot.position);
		// For game state
		specialRights = jsutil.deepCopyObject(gamefile.startSnapshot.specialRights);
		enpassant = jsutil.deepCopyObject(gamefile.startSnapshot.enpassant);
		moveRuleState = gamefile.startSnapshot.moveRuleState;
		// For abridgement
		({ positionString, fullMove } = gamefile.startSnapshot);
	} else { // editor game,   also copySinglePosition is false
		if (!gamefile.editor) throw Error("startSnapshot missing in non-editor mode");
		if (gamefile.moves.length > 0) throw Error("Should not be moves present in editor mode");
		if (copySinglePosition) throw Error('copySinglePosition has no effect in editor mode');

		startingPosition = organizedpieces.generatePositionFromPieces(gamefile.pieces);
		// For game state.   Since we know there's zero moves, then the gamefile itself acts as the startSnapshot
		specialRights = jsutil.deepCopyObject(gamefile.state.global.specialRights);
		enpassant = jsutil.deepCopyObject(gamefile.state.global.enpassant);
		moveRuleState = jsutil.deepCopyObject(gamefile.state.global.moveRuleState);
		// For abridgement
		positionString = icnconverter.getShortFormPosition(startingPosition, specialRights);
		fullMove = 1;
	}

	/**
	 * We need to calculate the game state so that, if desired,
	 * we can convert the gamefile to a single position.
	 */
	let gamestate: SimplifiedGameState = {
		position: startingPosition,
		turnOrder: gameRulesCopy.turnOrder,
		fullMove,
		state_global: {
			specialRights,
			enpassant,
			moveRuleState,
		}
	};

	// Modify the state if we're applying moves to match a single position
	if (copySinglePosition) {
		gamestate = GameToPosition(gamestate, movesCopy, gamefile.state.local.moveIndex + 1); // Convert -1 based to 0 based
		// Recalc positionString, because it will be different
		positionString = icnconverter.getShortFormPosition(gamestate.position, gamestate.state_global.specialRights);
	}

	// Start constructing the abridged gamefile
	const abridgedGamefile: AbridgedGamefile = {
		metadata: metadataCopy,
		fullMove: gamestate.fullMove,
		positionString,
		startingPosition: gamestate.position,
		gameRules: gameRulesCopy,
		moves: copySinglePosition ? [] : movesCopy, // Copy the moves list if not copying a single position
		// The 3 global game states
		specialRights: gamestate.state_global.specialRights,
		// enpassant added below
		moveRuleState: gamestate.state_global.moveRuleState !== undefined ? gamestate.state_global.moveRuleState : undefined,
	};
	// enpassant
	if (gamestate.state_global.enpassant) { // In the form: { square: Coords, pawn: Coords },
		// We need to convert it to just the Coords, SO LONG AS THE distance to the pawn is 1 square!! Which may not be true if it's a 4D game.
		const yDistance = Math.abs(gamestate.state_global.enpassant.square[1] - gamestate.state_global.enpassant.pawn[1]);
		if (yDistance === 1) abridgedGamefile.enpassant = gamestate.state_global.enpassant.square; // Don't assign it if the distance is more than 1 square (not compatible with ICN)
		else console.warn("Enpassant distance is more than 1 square, not assigning it to the ICN. Enpassant:", gamestate.state_global.enpassant);
	}

	console.log("Returning abridged game:", jsutil.deepCopyObject(abridgedGamefile));

	return abridgedGamefile;
}



// Converting a Game to Single Position ---------------------------------------------------------------------------------


/**
 * Takes a simple game state and applies the desired moves to it, modifying it.
 * @param longform
 * @param moves - The moves of the original gamefile to apply to the state
 * @param [halfmoves] - Number of halfmoves from starting position to apply to the state (Infinity: final position of game)
 */
function GameToPosition(longform: SimplifiedGameState, moves: Move[], halfmoves: number = 0): SimplifiedGameState {
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

export type {
	AbridgedGamefile,
};