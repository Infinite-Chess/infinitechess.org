
/** 
 * Type Definitions 
 * @typedef {import('../../chess/logic/gamefile.js').gamefile} gamefile
 */

// Import Start
//@ts-ignore
import formatconverter from '../../chess/logic/formatconverter.js';
//@ts-ignore
import jsutil from '../../util/jsutil.js';
// Import End

"use strict";

/**
 * Primes the provided gamefile to for the formatconverter to turn it into an ICN
 * @param {gamefile} gamefile - The gamefile
 * @param {boolean} copySinglePosition - If true, only copy the current position, not the entire game. It won't have the moves list.
 * @returns {Object} The primed gamefile for converting into ICN format
 */
export function primeGamefileForCopying(gamefile, copySinglePosition) {
	let primedGamefile = {};
	const gameRulesCopy = jsutil.deepCopyObject(gamefile.gameRules);

	primedGamefile.metadata = gamefile.metadata;
	primedGamefile.metadata.Variant = translations[primedGamefile.metadata.Variant] || primedGamefile.metadata.Variant; // Convert the variant metadata code to spoken language if translation is available
	if (gamefile.startSnapshot.enpassant !== undefined) {
		// gamefile.startSnapshot.enpassant is in the form: { square: Coords, pawn: Coords }
		// need to convert it to just the Coords, SO LONG AS THE distance to the pawn is 1 square!!
		const yDistance = Math.abs(gamefile.startSnapshot.enpassant.square[1] - gamefile.startSnapshot.enpassant.pawn[1]);
		if (yDistance === 1) primedGamefile.enpassant = gamefile.startSnapshot.enpassant.square; // Don't assign it if the distance is more than 1 square (not compatible with ICN)
	}
	if (gameRulesCopy.moveRule) primedGamefile.moveRule = `${gamefile.startSnapshot.moveRuleState}/${gameRulesCopy.moveRule}`; delete gameRulesCopy.moveRule;
	primedGamefile.fullMove = gamefile.startSnapshot.fullMove;
	primedGamefile.startingPosition = gamefile.startSnapshot.positionString;
	primedGamefile.gameRules = gameRulesCopy;

	if (copySinglePosition) {
		primedGamefile.startingPosition = gamefile.startSnapshot.position;
		primedGamefile.specialRights = gamefile.startSnapshot.specialRights;
		primedGamefile.moves = gamefile.moves.slice(0, gamefile.moveIndex + 1); // Only copy the moves up to the current move
		primedGamefile = formatconverter.GameToPosition(primedGamefile, Infinity);
	} else {
		primedGamefile.moves = gamefile.moves;
	}

	return primedGamefile;
}


export default {
	primeGamefileForCopying
};