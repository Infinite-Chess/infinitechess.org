
/**
 * This script takes a compressed abridged gamefile and constructs a full gamefile from it.
 */


// @ts-ignore
import gamefile from '../../chess/logic/gamefile.js';
import typeutil from '../../chess/util/typeutil.js';
import coordutil, { Coords } from '../../chess/util/coordutil.js';
import { players as p, rawTypes as r } from '../../chess/config.js';

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
	if (compressedGame.moveRule) variantOptions.moveRule = compressedGame.moveRule;
	if (compressedGame.enpassant) { // Coords: [x,y]
		// TRANSFORM it into the gamefile's enpassant property in the form: { square: Coords, pawn: Coords }
		const firstTurn = compressedGame.gameRules.turnOrder[0];
		const yParity = firstTurn === p.WHITE ? 1 : firstTurn === p.BLACK ? -1 : (() => { throw new Error(`Invalid first turn "${firstTurn}" when formulating a gamefile from an abridged one!`); })();
		const pawnExpectedSquare = [compressedGame.enpassant[0], compressedGame.enpassant[1] - yParity] as Coords;
		const pieceOnExpectedSquare: number | undefined = compressedGame.startingPosition[coordutil.getKeyFromCoords(pawnExpectedSquare)];

		if (pieceOnExpectedSquare && typeutil.getRawType(pieceOnExpectedSquare) === r.PAWN && typeutil.getColorFromType(pieceOnExpectedSquare) !== firstTurn) {
			variantOptions.enpassant = { square: compressedGame.enpassant, pawn: pawnExpectedSquare };
		}
	}

	return new gamefile(compressedGame.metadata, { moves, variantOptions });
}

export default {
	formulateGame,
};