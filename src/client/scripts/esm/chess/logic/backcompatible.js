
// Import Start
import formatconverter from './formatconverter.js';
import moveutil from '../util/moveutil.js';
import jsutil from '../../util/jsutil.js';
import { players } from '../util/typeutil.js';
// Import End

'use script';

/**
 * Converts pre-1.3 old gamefile code into the new internal format.
 */

/**
 * Makes sure the gamefile/longformat is in the new notation.
 * @param {Object} longformat - The format converter long format output, or an old gamefile.
 * @returns {Object} The gamefile in the latest notation.
 */
function getLongformatInNewNotation(longformat) {
	if (!isLongformatInOldNotation(longformat)) return longformat; // Already in new notation

	// Convert old to new notation...

	// An example of an old gamefile:
	// {"variant":"Classical","promotionRanks":[1,8],"moves":[[{"type":"pawnsW","startCoords":[4,2],"endCoords":[4,4]},{"type":"pawnsB","startCoords":[4,7],"endCoords":[4,5]}],[{"type":"pawnsW","startCoords":[3,2],"endCoords":[3,3]},{"type":"knightsB","startCoords":[7,8],"endCoords":[6,6]}],[{"type":"knightsW","startCoords":[7,1],"endCoords":[6,3]},{"type":"bishopsB","startCoords":[3,8],"endCoords":[85,-74]}],[{"type":"bishopsW","startCoords":[6,1],"endCoords":[-4496198,-4496203]},{"type":"bishopsB","startCoords":[85,-74],"endCoords":[82,-77]}],[{"type":"bishopsW","startCoords":[3,1],"endCoords":[9,7]},{"type":"bishopsB","startCoords":[82,-77],"endCoords":[4,1],"captured":"queensW"}],[{"type":"kingsW","startCoords":[5,1],"endCoords":[4,1],"captured":"bishopsB"},{"type":"rooksB","startCoords":[8,8],"endCoords":[611,8]}],[{"type":"pawnsW","startCoords":[1,2],"endCoords":[1,4]},{"type":"queensB","startCoords":[4,8],"endCoords":[4,7]}],[{"type":"rooksW","startCoords":[8,1],"endCoords":[57,1]},{"type":"queensB","startCoords":[4,7],"endCoords":[9,2]}],[{"type":"bishopsW","startCoords":[9,7],"endCoords":[5,3]},{"type":"queensB","startCoords":[9,2],"endCoords":[9,-998535]}],[{"type":"rooksW","startCoords":[1,1],"endCoords":[-11009,1]},{"type":"queensB","startCoords":[9,-998535],"endCoords":[4,-998535]}],[{"type":"knightsW","startCoords":[2,1],"endCoords":[4,0]}]]}
	const converted = {};
    
	/** What properties do we need in the new format?
     * metadata
     * enpassant
     * moveRule
     * fullMove
     * startingPosition
     * specialRights
     * moves
     * gameRules
     */

	const { pawnDoublePush, castleWith } = longformat.gameRules ? longformat.gameRules : {};

	converted.metadata = {};
	if (longformat.variant) converted.metadata.Variant = longformat.variant;
	converted.fullMove = 1;
	if (longformat.startingPosition) {
		converted.startingPosition = longformat.startingPosition;
		converted.specialRights = formatconverter.generateSpecialRights(longformat.startingPosition, pawnDoublePush, castleWith);
	}
	let turnOrder = [players.WHITE, players.BLACK];
	if (longformat.moves?.length > 0) {
		const { moves: moveslong, turn } = moveutil.convertMovesTo1DFormat(longformat.moves); // Long format still, needs to be compressed
		let turnOrderArray = ['w','b'];
		if (turn === players.BLACK) {
			turnOrderArray = ['b','w'];
			turnOrder = [players.BLACK, players.WHITE];
		}
		const options = {
			turnOrderArray,
			fullmove: converted.fullMove,
			make_new_lines: false,
			compact_moves: 2
		};
		const shortmoves = formatconverter.longToShortMoves(moveslong, options);
		const shortmovessplit = shortmoves.split('|');
        
		converted.moves = shortmovessplit;
	}
	if (longformat.promotionRanks) {
		const newRanks = { [players.WHITE]: longformat.promotionRanks[1], [players.BLACK]: longformat.promotionRanks[0] };
		if (!longformat.gameRules) longformat.gameRules = { promotionRanks: newRanks };
		else longformat.gameRules.promotionRanks = newRanks;
	}
	if (longformat.gameRules) {
		// Example of old gameRules format:
		// {
		//     slideLimit: "Infinity",
		//     castleWith: "rooks",
		//     pawnDoublePush: true,
		//     winConditions: { 
		//       checkmate: 'both',
		//       // royalcapture: 'both',
		//       // allroyalscaptured: 'both',
		//       // allpiecescaptured: 'both',
		//       // threecheck: 'both',
		//       // koth: 'both'
		//     }
		// }
		const newGameRules = {
			turnOrder,
			winConditions: { [players.WHITE]: ['checkmate'], [players.BLACK]: ['checkmate'] }
		};
		if (longformat.gameRules.winConditions) {
			const newWinConditions = { [players.WHITE]: [], [players.BLACK]: [] };
			for (const condition in longformat.gameRules.winConditions) {
				const value = longformat.gameRules.winConditions[condition];
				if (value === 'both' || value === 'white') newWinConditions[players.WHITE].push(condition);
				if (value === 'both' || value === 'black') newWinConditions[players.BLACK].push(condition);
			}
			newGameRules.winConditions = newWinConditions;
		}
		if (longformat.gameRules.slideLimit && longformat.gameRules.slideLimit !== "Infinity") newGameRules.slideLimit = longformat.gameRules.slideLimit;
		converted.gameRules = newGameRules;
	}

	console.log("longformat after converting to new format:");
	console.log(jsutil.deepCopyObject(converted));

	return converted;
}

function isLongformatInOldNotation(longformat) {
	// An example of an old gamefile:
	// {"variant":"Classical","promotionRanks":[1,8],"moves":[[{"type":"pawnsW","startCoords":[4,2],"endCoords":[4,4]},{"type":"pawnsB","startCoords":[4,7],"endCoords":[4,5]}],[{"type":"pawnsW","startCoords":[3,2],"endCoords":[3,3]},{"type":"knightsB","startCoords":[7,8],"endCoords":[6,6]}],[{"type":"knightsW","startCoords":[7,1],"endCoords":[6,3]},{"type":"bishopsB","startCoords":[3,8],"endCoords":[85,-74]}],[{"type":"bishopsW","startCoords":[6,1],"endCoords":[-4496198,-4496203]},{"type":"bishopsB","startCoords":[85,-74],"endCoords":[82,-77]}],[{"type":"bishopsW","startCoords":[3,1],"endCoords":[9,7]},{"type":"bishopsB","startCoords":[82,-77],"endCoords":[4,1],"captured":"queensW"}],[{"type":"kingsW","startCoords":[5,1],"endCoords":[4,1],"captured":"bishopsB"},{"type":"rooksB","startCoords":[8,8],"endCoords":[611,8]}],[{"type":"pawnsW","startCoords":[1,2],"endCoords":[1,4]},{"type":"queensB","startCoords":[4,8],"endCoords":[4,7]}],[{"type":"rooksW","startCoords":[8,1],"endCoords":[57,1]},{"type":"queensB","startCoords":[4,7],"endCoords":[9,2]}],[{"type":"bishopsW","startCoords":[9,7],"endCoords":[5,3]},{"type":"queensB","startCoords":[9,2],"endCoords":[9,-998535]}],[{"type":"rooksW","startCoords":[1,1],"endCoords":[-11009,1]},{"type":"queensB","startCoords":[9,-998535],"endCoords":[4,-998535]}],[{"type":"knightsW","startCoords":[2,1],"endCoords":[4,0]}]]}
	return longformat.variant || longformat.promotionRanks || longformat.moves && moveutil.areMovesIn2DFormat(longformat.moves) || (Object.keys(longformat).length === 1 && longformat.startingPosition);
}

/**
 * Tests if the given Date metadata is in the old format "YYYY/MM/DD HH:MM:SS"
 * @param {string} Date - The Date metadata, if it is defined.
 * @returns {boolean}
 */
function isDateMetadataInOldFormat(Date) {
	if (!Date) return false;
	return Date.indexOf(' ') !== -1;
}

/**
 * Converts a date and time string from the old `Date` metdata in the form "YYYY/MM/DD HH:MM:SS"
 * to an object with the new `UTCDate` and `UTCTime` metadata properties.
 * @param {string} DateMetadata - The date and time string in the format "YYYY/MM/DD HH:MM:SS".
 * @returns {Object} An object with the properties { UTCDate: "YYYY.MM.DD", UTCTime: "HH:MM:SS" }.
 */
function convertDateMetdatatoUTCDateUTCTime(DateMetadata) {
	const dateTime = new Date(DateMetadata);

	const year = String(dateTime.getUTCFullYear());
	const month = String(dateTime.getUTCMonth() + 1).padStart(2, '0');
	const day = String(dateTime.getUTCDate()).padStart(2, '0');
	const hours = String(dateTime.getUTCHours()).padStart(2, '0');
	const minutes = String(dateTime.getUTCMinutes()).padStart(2, '0');
	const seconds = String(dateTime.getUTCSeconds()).padStart(2, '0');

	const UTCDate = `${year}.${month}.${day}`;
	const UTCTime = `${hours}:${minutes}:${seconds}`;

	return { UTCDate, UTCTime };
}

/**
 * Convert old Clock metadata to the new TimeControl metadata.
 * @param {string} Clock - 'mm+ss' or "Infinite"
 */
function convertClockToTimeControl(Clock) {
	if (!Clock) return undefined;

	if (Clock === "Infinite") return '-';
	const [ minutes, incrementSecs ] = Clock.split('+');
	const seconds = minutes * 60;
	return `${seconds}+${incrementSecs}`;
}

export default {
	getLongformatInNewNotation,
	isDateMetadataInOldFormat,
	convertDateMetdatatoUTCDateUTCTime,
	convertClockToTimeControl
};