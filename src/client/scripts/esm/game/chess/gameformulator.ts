
/**
 * This script takes a compressed abridged gamefile and constructs a full gamefile from it.
 */


// @ts-ignore
import gamefile from '../../chess/logic/gamefile.js';


import type { AbridgedGamefile } from './gamecompressor.js';
import type { Move } from '../../chess/logic/movepiece.js';
import type { VariantOptions } from './gameslot.js';


/**
 * Formulates a whole gamefile from a smaller simpler abridged one.
 * @param compressedGame - The return value of gamecompressor.compressGamefile()
 */
function formulateGame(compressedGame: AbridgedGamefile) {

	/** String array of the moves in their most compact notation (e.g. "4,7>4,8Q") */
	const moves: string[] = compressedGame.moves.map((m: Move) => m.compact);

	const variantOptions: VariantOptions = {
		fullMove: compressedGame.fullMove,
		gameRules: compressedGame.gameRules,
		moveRule: compressedGame.moveRule,
		positionString: compressedGame.positionString,
		startingPosition: compressedGame.startingPosition,
		specialRights: compressedGame.specialRights,
	};
	// Optional properties
	if (compressedGame.enpassant) variantOptions.enpassant = compressedGame.enpassant;
	if (compressedGame.moveRule) variantOptions.moveRule = compressedGame.moveRule;

	return new gamefile(compressedGame.metadata, { moves, variantOptions });
}

export default {
	formulateGame,
};