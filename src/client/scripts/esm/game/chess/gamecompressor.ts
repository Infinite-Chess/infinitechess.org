
/**
 * This script handles the compression of a gamefile into a more simple json format,
 * suitable for the formatconverter to turn it into ICN (Infinite Chess Notation).
 */


import jsutil from '../../util/jsutil.js';
// @ts-ignore
import formatconverter from '../../chess/logic/formatconverter.js';


import type { Coords, CoordsKey } from '../../chess/util/coordutil.js';
import type { MetaData } from '../../chess/util/metadata.js';
import type { Move } from '../../chess/logic/movepiece.js';
import type { PiecesByKey } from '../../chess/logic/organizedlines.js';
// @ts-ignore
import type gamefile from '../../chess/logic/gamefile.js';
// @ts-ignore
import type { GameRules } from '../../chess/variants/gamerules.js';
import type { EnPassant } from '../../chess/logic/state.js';


/**
 * A compressed version of a gamefile, suitable for the formatconverter to turn it into ICN.
 * All unimportant data is excluded.
 */
interface AbridgedGamefile {
	metadata: MetaData,
	fullMove: number,
	/** A position in ICN notation (e.g. `"P1,2+|P2,2+|..."`) */
	positionString: string,
	startingPosition: PiecesByKey,
	specialRights: Record<CoordsKey, true>,
	gameRules: GameRules,
	moves: Move[],
	// Optional properties
	enpassant?: EnPassant,
	moveRule?: `${number}/${number}`,
}

/** The game longformat the formatconverter expects games to come in. */
interface FormatConverterLongform {
	metadata: MetaData,
	fullMove: number,
	/** formatconverter.LongToShort_Format() may optionally take this in shortposition positionString format. GameToPosition() however needs it in this format. */
	startingPosition: PiecesByKey,
	specialRights: Record<CoordsKey, true>,
	gameRules: GameRules,
	moves: Move[],
	// Optional properties
	enpassant?: Coords,
	moveRule?: `${number}/${number}`,
}



/**
 * Primes the provided gamefile to for the formatconverter to turn it into an ICN
 * @param gamefile - The gamefile
 * @param copySinglePosition - If true, only copy the current position, not the entire game. It won't have the moves list.
 * @returns The primed gamefile for converting into ICN format
 */
function compressGamefile(gamefile: gamefile, copySinglePosition?: true): AbridgedGamefile {

	const metadata = jsutil.deepCopyObject(gamefile.metadata);
	if (metadata.Variant) metadata.Variant = translations[metadata.Variant]; // Convert the variant metadata code to spoken language if translation is available

	const gameRules = jsutil.deepCopyObject(gamefile.gameRules);
	delete gameRules.moveRule;


	let abridgedGamefile: AbridgedGamefile = {
		metadata,
		positionString: gamefile.startSnapshot.positionString,
		startingPosition: gamefile.startSnapshot.position,
		specialRights: gamefile.startSnapshot.specialRights,
		fullMove: gamefile.startSnapshot.fullMove,
		gameRules,
		moves: gamefile.moves,
	};

	// Append the optional properties, if present

	// enpassant
	if (gamefile.startSnapshot.enpassant) abridgedGamefile.enpassant = gamefile.startSnapshot.enpassant;

	// moveRule
	if (gamefile.gameRules.moveRule) abridgedGamefile.moveRule = `${gamefile.startSnapshot.moveRuleState!}/${gamefile.gameRules.moveRule}`;

	// If we only want the current position, not the entire game

	if (copySinglePosition) abridgedGamefile = turnMoveIntoSinglePosition(abridgedGamefile, gamefile.moveIndex);

	return abridgedGamefile;
}

/**
 * Takes an abridged gamefile and transforms it into a single position, without any moves present, at the desired move index.
 * @param abridgedGamefile
 * @param desiredMove - The move index which we desire to turn into a single position, where -1 is the start of the game. Same as gamefile.moveIndex.
 * @param position - The position at the start of the game in key format ('x,y': 'pawns')
 * @param specialRights - The specialRights at the start of the game
 */
function turnMoveIntoSinglePosition(abridgedGamefile: AbridgedGamefile, desiredMove: number): AbridgedGamefile {

	const fcLongform: FormatConverterLongform = {
		metadata: abridgedGamefile.metadata,
		startingPosition: abridgedGamefile.startingPosition,
		specialRights: abridgedGamefile.specialRights,
		fullMove: abridgedGamefile.fullMove,
		gameRules: abridgedGamefile.gameRules,
		moves: abridgedGamefile.moves,
		// Optional properties
		moveRule: abridgedGamefile.moveRule,
	};

	if (abridgedGamefile.enpassant) { // In the form: { square: Coords, pawn: Coords },
		// We need to convert it to just the Coords, SO LONG AS THE distance to the pawn is 1 square!! Which may not be true if it's a 4D game.
		const yDistance = Math.abs(abridgedGamefile.enpassant.square[1] - abridgedGamefile.enpassant.pawn[1]);
		if (yDistance === 1) fcLongform.enpassant = abridgedGamefile.enpassant.square; // Don't assign it if the distance is more than 1 square (not compatible with ICN)
	}

	return formatconverter.GameToPosition(fcLongform, desiredMove + 1); // Convert -1 based to 0 based
}


export default {
	compressGamefile,
};

export type {
	AbridgedGamefile,
};