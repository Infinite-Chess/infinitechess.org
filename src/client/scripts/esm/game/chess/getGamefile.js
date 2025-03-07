
/** 
 * Type Definitions 
 * @typedef {import('../../chess/logic/gamefile.js').gamefile} gamefile
 */

// Import Start
//@ts-ignore
import backcompatible from '../../chess/logic/backcompatible.js';
import checkdetection from '../../chess/logic/checkdetection.js';
//@ts-ignore
import gamefile from '../../chess/logic/gamefile.js';
//@ts-ignore
import colorutil from '../../chess/util/colorutil.js';
//@ts-ignore
import coordutil from '../../chess/util/coordutil.js';
import moveutil from '../../chess/util/moveutil.js';
// Import End
"use strict";

/**
 * get game file from longformat
 * @param {Object} longformat - The game in longformat, or primed for copying. This is NOT the gamefile, we'll need to use the gamefile constructor.
 * @returns {Object} The gamefile
 */
export function getGamefile(longformat) {

	if (longformat.shortposition || longformat.startingPosition) {
		longformat.metadata.UTCDate = "n/a";
		longformat.metadata.UTCTime = "n/a";
	} else if (backcompatible.isDateMetadataInOldFormat(longformat.metadata.Date)) {
		const { UTCDate, UTCTime } = backcompatible.convertDateMetdatatoUTCDateUTCTime(longformat.metadata.Date);
		longformat.metadata.UTCDate = UTCDate;
		longformat.metadata.UTCTime = UTCTime;
	}

	delete longformat.metadata.Clock;
	delete longformat.metadata.Result;
	delete longformat.metadata.Condition;
	delete longformat.metadata.Termination;

	const variantOptions = {
		fullMove: longformat.fullMove,
		moveRule: longformat.moveRule,
		positionString: longformat.shortposition,
		startingPosition: longformat.startingPosition,
		specialRights: longformat.specialRights,
		gameRules: longformat.gameRules
	};

	if (longformat.enpassant !== undefined) {
		const firstTurn = longformat.gameRules.turnOrder[0];
		const yParity = firstTurn === 'white' ? 1 : firstTurn === 'black' ? -1 : (() => { throw new Error(`Invalid first turn "${firstTurn}" when pasting a game!`); })();
		const pawnExpectedSquare = [longformat.enpassant[0], longformat.enpassant[1] - yParity];
		const pieceOnExpectedSquare = longformat.startingPosition[coordutil.getKeyFromCoords(pawnExpectedSquare)];

		if (pieceOnExpectedSquare && pieceOnExpectedSquare.startsWith('pawns') && colorutil.getPieceColorFromType(pieceOnExpectedSquare) !== firstTurn) {
			variantOptions.enpassant = { square: longformat.enpassant, pawn: pawnExpectedSquare };
		}
	}
	const gmf = new gamefile(longformat.metadata, { moves: longformat.moves, variantOptions, editor: false });

	const attackers = [];
	const whosTurnItWasAtMoveIndex = moveutil.getWhosTurnAtMoveIndex(gmf, gmf.moveIndex);
	const futureInCheck = checkdetection.detectCheck(gmf, whosTurnItWasAtMoveIndex, attackers);
	gmf.inCheck = futureInCheck;
	gmf.attackers = attackers;
	// console.log(attackers);

	return gmf;
}

export default { getGamefile};