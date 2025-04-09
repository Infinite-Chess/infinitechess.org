
/**
 * This script takes an ICN, or a compressed abridged gamefile, and constructs a full gamefile from them.
 */


import typeutil from '../../chess/util/typeutil.js';
import coordutil, { Coords, CoordsKey } from '../../chess/util/coordutil.js';
import { players as p, rawTypes as r } from '../../chess/util/typeutil.js';
// @ts-ignore
import gamefile from '../../chess/logic/gamefile.js';
// @ts-ignore
import formatconverter from '../../chess/logic/formatconverter.js';

import type { AbridgedGamefile } from './gamecompressor.js';
import type { Move } from '../../chess/logic/movepiece.js';
import type { VariantOptions } from './gameslot.js';
import type { MetaData } from '../../chess/util/metadata.js';
import type { Position } from '../../chess/util/boardutil.js';
// @ts-ignore
import type { GameRules } from '../../chess/variants/gamerules.js';


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

/** The game JSON format the formatconvert returns from ShortToLong_Format(). */
interface FormatConverterLong {
	metadata: MetaData,
	startingPosition: Position,
	/** A position in ICN notation (e.g. `"P1,2+|P2,2+|..."`) */
	shortposition: string,
	fullMove: number,
	specialRights: Record<CoordsKey, true>,
	gameRules: GameRules,
	moves: string[],
	// Optional properties...
	moveRule?: `${number}/${number}`,
	enpassant?: Coords,
}

/**
 * Converts an ICN directly to a gamefile.
 * Throws an error in these cases:
 * * Invalid format or enpassant square
 * * Game contains an illegal move
 */
function ICNToGamefile(ICN: string): gamefile {
	const longformat: FormatConverterLong = formatconverter.ShortToLong_Format(ICN);

	const variantOptions: VariantOptions = {
		fullMove: longformat.fullMove,
		moveRule: longformat.moveRule,
		positionString: longformat.shortposition,
		startingPosition: longformat.startingPosition,
		specialRights: longformat.specialRights,
		gameRules: longformat.gameRules
	};

	// If the variant has been translated, the variant metadata needs to be converted from language-specific to internal game code else keep it the same
	longformat.metadata.Variant = convertVariantFromSpokenLanguageToCode(longformat.metadata.Variant) || longformat.metadata.Variant;

	// if (longformat.enpassant) { // Coords: [x,y]
	// 	// TRANSFORM it into the gamefile's enpassant property in the form: { square: Coords, pawn: Coords }
	// 	const firstTurn = longformat.gameRules.turnOrder[0];
	// 	const yParity = firstTurn === p.WHITE ? 1 : firstTurn === p.BLACK ? -1 : (() => { throw new Error(`Invalid first turn "${firstTurn}" when formulating a gamefile from an abridged one!`); })();
	// 	const pawnExpectedSquare = [longformat.enpassant[0], longformat.enpassant[1] - yParity] as Coords;
	// 	/**
	// 	 * First make sure there IS a pawn on the square!
	// 	 * If not, the ICN was likely tampered, throw an Error!
	// 	 */
	// 	const pieceOnExpectedSquare: number | undefined = longformat.startingPosition[coordutil.getKeyFromCoords(pawnExpectedSquare)];
	// 	if (pieceOnExpectedSquare && typeutil.getRawType(pieceOnExpectedSquare) === r.PAWN && typeutil.getColorFromType(pieceOnExpectedSquare) !== firstTurn) {
	// 		variantOptions.enpassant = { square: longformat.enpassant, pawn: pawnExpectedSquare };
	// 	} else throw Error(`Invalid enpassant ${longformat.enpassant} in ICN!`);
	// }
	/**
	 * ACTUALLY, WE SHOULD NEVER expect an enpassant property in the starting position of ANY
	 * game log! No variant starts with enpassant possible.
	 */
	if (longformat.enpassant) throw Error('Logged game ICNs should NEVER have an enpassant property on the starting position!!');

	/**
	 * This automatically forwards all moves to the front of the game.
	 * It will throw an Error if there's any move with a startCoords that doesn't have any piece on it!
	 * Some illegal moves may pass, but those aren't what we care about. We care about crashing moves!
	 */
	return new gamefile(longformat.metadata, { moves: longformat.moves, variantOptions });
}

function convertVariantFromSpokenLanguageToCode(Variant?: string) {
	// Iterate through all translations until we find one that matches this name
	for (const translationCode in translations) {
		if (translations[translationCode] === Variant) {
			return translationCode;
		}
	}
	// Else unknown variant, return undefined
	return;
}

export default {
	formulateGame,
	ICNToGamefile,
	convertVariantFromSpokenLanguageToCode,
};