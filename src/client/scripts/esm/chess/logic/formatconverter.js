/* eslint-disable max-depth */

'use strict';

/* eslint-disable max-depth */
import { rawTypes as r, ext as e, players as p } from "../util/typeutil.js";
import typeutil from "../util/typeutil.js";

/** @typedef {import("../../game/chess/gameformulator.js").FormatConverterLong} FormatConverterLong */

/**
 * Universal Infinite Chess Notation [Converter] and Interface
 * by Andreas Tsevas and Naviary
 * https://github.com/tsevasa/infinite-chess-notation
 * 
 * This script converts primed gamefiles from JSON notation to a
 * compact ICN (Infinite Chess Noation) and back, still human-readable,
 * but taking less space to describe positions.
 */

/** Regex for numbers in scientific notation from https://stackoverflow.com/questions/638565/parsing-scientific-notation-sensibly */
const scientificNumberRegex = "[-+]?[0-9]*\\.?[0-9]+([eE][-+]?[0-9]+)?";

const playersDict = {
	[p.NEUTRAL]: "n", // I dont think we need this, good to have in case
	[p.WHITE]: "w",
	[p.BLACK]: "b",
	[p.RED]: "r",
	[p.BLUE]: "bu",
	[p.YELLOW]: "y",
	[p.GREEN]: "g",
};

const pieceDictionary = {
	[r.KING + e.W]: "K", [r.KING + e.B]: "k",
	[r.PAWN + e.W]: "P", [r.PAWN + e.B]: "p",
	[r.KNIGHT + e.W]: "N", [r.KNIGHT + e.B]: "n",
	[r.BISHOP + e.W]: "B", [r.BISHOP + e.B]: "b",
	[r.ROOK + e.W]: "R", [r.ROOK + e.B]: "r",
	[r.QUEEN + e.W]: "Q", [r.QUEEN + e.B]: "q",
	[r.AMAZON + e.W]: "AM", [r.AMAZON + e.B]: "am",
	[r.HAWK + e.W]: "HA", [r.HAWK + e.B]: "ha",
	[r.CHANCELLOR + e.W]: "CH", [r.CHANCELLOR + e.B]: "ch",
	[r.ARCHBISHOP + e.W]: "AR", [r.ARCHBISHOP + e.B]: "ar",
	[r.GUARD + e.W]: "GU", [r.GUARD + e.B]: "gu",
	[r.CAMEL + e.W]: "CA", [r.CAMEL + e.B]: "ca",
	[r.GIRAFFE + e.W]: "GI", [r.GIRAFFE + e.B]: "gi",
	[r.ZEBRA + e.W]: "ZE", [r.ZEBRA + e.B]: "ze",
	[r.CENTAUR + e.W]: "CE", [r.CENTAUR + e.B]: "ce",
	[r.ROYALQUEEN + e.W]: "RQ", [r.ROYALQUEEN + e.B]: "rq",
	[r.ROYALCENTAUR + e.W]: "RC", [r.ROYALCENTAUR + e.B]: "rc",
	[r.KNIGHTRIDER + e.W]: "NR", [r.KNIGHTRIDER + e.B]: "nr",
	[r.HUYGEN + e.W]: "HU", [r.HUYGEN + e.B]: "hu",
	[r.ROSE + e.W]: "RO", [r.ROSE + e.B]: "ro",
	[r.OBSTACLE + e.N]: "ob",
	[r.VOID + e.N]: "vo"
};

const pieceDefaults = {
	[r.KING]: "k",
	[r.PAWN]: "p",
	[r.KNIGHT]: "n",
	[r.BISHOP]: "b",
	[r.ROOK]: "r",
	[r.QUEEN]: "q",
	[r.AMAZON]: "am",
	[r.HAWK]: "ha",
	[r.CHANCELLOR]: "ch",
	[r.ARCHBISHOP]: "ar",
	[r.GUARD]: "gu",
	[r.CAMEL]: "ca",
	[r.GIRAFFE]: "gi",
	[r.ZEBRA]: "ze",
	[r.CENTAUR]: "ce",
	[r.ROYALQUEEN]: "rq",
	[r.ROYALCENTAUR]: "rc",
	[r.KNIGHTRIDER]: "nr",
	[r.HUYGEN]: "hu",
	[r.ROSE]: "ro",
	[r.OBSTACLE]: "ob",
	[r.VOID]: "vo"
};

const metadata_key_ordering = [
    "Event",
    "Site",
    "Variant",
    "Round",
    "UTCDate",
    "UTCTime",
    "TimeControl",
    "White",
    "Black",
    "WhiteID",
    "BlackID",
    "Result",
    "Termination"
];

const defaultPromotions =  [r.QUEEN, r.ROOK, r.BISHOP, r.KNIGHT];

function invertDictionary(json) {
	const inv = {};
	for (const key in json) {
		inv[json[key]] = key;
	}
	return inv;
}

const invertedpieceDictionary = invertDictionary(pieceDictionary);
const invertedplayersDict = invertDictionary(playersDict);

function IntToShort_Piece(intpiece) {
	let short = pieceDictionary[intpiece];
	if (short === undefined) {
		const [raw, c] = typeutil.splitType(intpiece);
		short = String(c) + pieceDefaults[raw];
	}
	return short;
}

function ShortToInt_Piece(shortpiece) {
	const results = /(\d*)([a-zA-Z]+)/.exec(shortpiece);
	const UNKERR = new Error("Unknown piece type detected: " + shortpiece);
	if (results === null) throw UNKERR;

	let lowerType = results[2];
	if (results[1] !== "") lowerType = lowerType.toLowerCase(); // If the player is specified, make it lowercase (neutrals don't have uppercase entries in dictionary)

	if (invertedpieceDictionary[lowerType] === undefined) throw UNKERR;

	let type = Number(invertedpieceDictionary[lowerType]);
	if (results[1] !== "") { // Overwrite the player that owns it
		const player = Number(results[1]);
		type = typeutil.buildType(typeutil.getRawType(type), player);
	}
	return type;
}

/**
 * Checks if a string can be parsed to JSON
 * @param {string} str - Input string
 * @returns {boolean} True if string is in JSON format, else false
 */
function isJson(str) {
	try {
		JSON.parse(str);
	} catch {
		return false;
	}
	return true;
}

/**
 * This function brings the input number into a standard format that is not in scientific notation
 * @param {string} str - A string representing a number, may be in scientific notation or not, e.g. "2.0e32"
 * @returns {string} - A string with the number expanded to not use scientific notation, e.g. "200000000000000000000000000000000"
 */
function standardizeNumberString(str) {
	let coefficient;
	let exponent;
	if (!/e/i.test(str)) {
		// If string does not contain "e" or "E", it is not in scientific notation and exponent = 0
		coefficient = str;
		exponent = 0;
	} else {
		[coefficient, exponent] = str.toLowerCase().split('e');
    	exponent = Number(exponent);
	}

	// Handle decimal in coefficient
	if (coefficient.includes('.')) {
		const [intPart, decimalPart] = coefficient.split('.');
		const decimalLength = decimalPart.length;

		// Remove the decimal point and adjust the exponent
		coefficient = `${intPart}${decimalPart}`;
		exponent -= decimalLength;
	}

	// Calculate the expanded number
	if (exponent >= 0) {
		return (BigInt(coefficient) * BigInt(10) ** BigInt(exponent)).toString();
	} else {
		// Cut off and remember leading sign
		let leadingsign = "";
		if (coefficient[0] === '+') coefficient = coefficient.slice(1);
		else if (coefficient[0] === '-') {
			coefficient = coefficient.slice(1);
			leadingsign = "-";
		}

		// If exponent is negative, we need to move the decimal point to the left
		const absExp = Math.abs(exponent);
		let returnstring;
		if (absExp >= coefficient.length) {
			const zeros = "0".repeat(absExp - coefficient.length);
			returnstring = `0.${zeros}${coefficient}`;
		} else {
			const index = coefficient.length - absExp;
			returnstring = `${coefficient.slice(0, index)}.${coefficient.slice(index)}`;
		}

		// Formatting cleanup
		returnstring = returnstring.replace(/^0+/, ''); // trim unneeded zeroes at the start
		if (returnstring[0] === ".") returnstring = "0" + returnstring; // add leading zero before . if needed
		returnstring = returnstring.replace(/0+$/, ''); // trim unneeded zeroes at the end
		returnstring = returnstring.replace(/\.$/, ''); // trim . at the end

		return `${leadingsign}${returnstring}`;
	}
}

/**
 * This function brings the input coordinate into a standard format that is not in scientific notation
 * @param {string} str - A string representing a coordinate, may be in scientific notation or not, e.g. "2.0e32,-01.0e0"
 * @returns {string} - A string with the coordinate expanded to not use scientific notation, e.g. "200000000000000000000000000000000,-1"
 */
function standardizeCoordString(str) {
	if (str.includes(',')) {
		const [coord0, coord1] = str.split(',');
		return `${standardizeNumberString(coord0)},${standardizeNumberString(coord1)}`;
	} else {
		throw Error("Expected ',' in coordinate string"); // If string does not contain ",", it is not a coordinate string
	}
}

/**
 * Converts a gamefile in JSON format to Infinite Chess Notation.
 * @param {FormatConverterLong} longformat - The gamefile in JSON format
 * @param {Object} [options] - Configuration options for the output format
 * @param {number} [options.compact_moves=0] - Optional. Number between 0-2 for how compact you want the resulting ICN (0 = least compact, pretty. 1: moderately compact. 2: most compact, no 'x','+', or '#').
 * @param {boolean} [options.make_new_lines=true] - Optional. Boolean specifying whether linebreaks should be included in the output string.
 * @param {boolean} [options.specifyPosition=true] - Optional. If false, the ICN won't contain the starting position, that can be deduced from the Variant and Date metadata. This is useful for compressing server logs.
 * @returns {string} The ICN of the gamefile as a string
 */
function LongToShort_Format(longformat, { compact_moves = 0, make_new_lines = true, specifyPosition = true } = {}) {
	let shortformat = "";
	const whitespace = (make_new_lines ? "\n" : " ");

	// metadata - appended in correct order given by metadata_key_ordering
	const metadata_keys_used = {};
	for (const key of metadata_key_ordering) {
		if (longformat.metadata[key]) {
			shortformat += `[${key} "${longformat.metadata[key]}"]${whitespace}`;
			metadata_keys_used[key] = true;
		}
	}
	// append the rest of the metadata
	for (const key in longformat.metadata) {
		if (longformat.metadata[key] && !metadata_keys_used[key]) shortformat += `[${key} "${longformat.metadata[key]}"]${whitespace}`;
	}
	if (longformat.metadata) shortformat += whitespace;

	// Turn order
	if (!longformat.gameRules.turnOrder) throw new Error("turnOrder gamerule MUST be present when compressing a game.");
	const turnOrderArray = longformat.gameRules.turnOrder.map(player => {
		if (!(player in playersDict)) throw new Error(`Invalid color '${player}' when parsing turn order when copying game!`);
		return playersDict[player];
	});
	let turn_order = turnOrderArray.join(':'); // 'w:b'
	if (turn_order === 'w:b') turn_order = 'w'; // Short for 'w:b'
	else if (turn_order === 'b:w') turn_order = 'b'; // Short for 'b:w'
	shortformat += turn_order + ' ';

	// en passant
	if (longformat.enpassant) shortformat += `${longformat.enpassant.toString()} `;

	// X move rule
	if (longformat.moveRule) shortformat += `${longformat.moveRule.toString()} `;

	// full move counter
	let fullmove = 1;
	if (longformat.fullMove) {
		shortformat += `${longformat.fullMove.toString()} `;
		fullmove = Number(longformat.fullMove);
	}

	// promotion lines, currently assumes that "promotionRanks" is always defined as a list of length 2, if it is defined
	if (longformat.gameRules) {
		if (longformat.gameRules.promotionRanks) {
			shortformat += "(";
			if (longformat.gameRules.promotionRanks[p.WHITE].length > 0) {
				shortformat += longformat.gameRules.promotionRanks[p.WHITE].join(',');
				const promotionListWhite = (longformat.gameRules.promotionsAllowed ? longformat.gameRules.promotionsAllowed[p.WHITE] : null);
				// Only add the legal promotions to the ICN if they aren't the default
				if (promotionListWhite && !isPromotionListDefaultPromotions(promotionListWhite)) {
					shortformat += ";";
					for (const longpiece of promotionListWhite) {
						shortformat += `${IntToShort_Piece(longpiece + e.W)},`;
					}
					shortformat = shortformat.slice(0, -1);
				}
			}
			shortformat += "|";
			if (longformat.gameRules.promotionRanks[p.BLACK].length > 0) {
				shortformat += longformat.gameRules.promotionRanks[p.BLACK].join(',');
				const promotionListBlack = (longformat.gameRules.promotionsAllowed ? longformat.gameRules.promotionsAllowed[p.BLACK] : null);
				// Only add the legal promotions to the ICN if they aren't the default
				if (promotionListBlack && !isPromotionListDefaultPromotions(promotionListBlack)) {
					shortformat += ";";
					for (const longpiece of promotionListBlack) {
						shortformat += `${IntToShort_Piece(longpiece + e.B)},`;
					}
					shortformat = shortformat.slice(0, -1);
				}
			}
			shortformat += ") ";
		}
	}

	// win condition
	if (longformat.gameRules) {
		if (longformat.gameRules.winConditions) {
			const whitewins = longformat.gameRules.winConditions[p.WHITE];
			const blackwins = longformat.gameRules.winConditions[p.BLACK];
			if (whitewins && blackwins) {
				let wins_are_equal = true;
				if (whitewins.length === blackwins.length) {
					for (let i = 0; i < whitewins.length; i++) {
						let white_win_i_is_black_win = false;
						for (let j = 0; j < blackwins.length; j++) {
							if (whitewins[i] === blackwins[j]) {
								white_win_i_is_black_win = true;
								break;
							}
						}
						if (!white_win_i_is_black_win) wins_are_equal = false;
					}
				} else wins_are_equal = false;
                
				if (wins_are_equal) {
					if (whitewins.length > 1 || whitewins[0] !== 'checkmate') shortformat += `${whitewins.toString()} `;
				} else {
					shortformat += `(${whitewins.toString()}|${blackwins.toString()}) `;
				}
			}
		}
	}

	// Extra gamerules not used will be stringified into the ICN
	const excludedGameRules = new Set(["promotionRanks", "promotionsAllowed", "winConditions", "turnOrder"]);
	const extraGameRules = {};
	let added_extras = false;
	for (const key in longformat.gameRules) {
		if (excludedGameRules.has(key)) continue;
		extraGameRules[key] = longformat.gameRules[key];
		added_extras = true;
	}
	if (added_extras) shortformat += `${JSON.stringify(extraGameRules)} `;

	// position
	if (specifyPosition) {
		if (isStartingPositionInLongFormat(longformat.startingPosition)) {
			shortformat += LongToShort_Position(longformat.startingPosition, longformat.specialRights);
		} else { // Already in short format!
			shortformat += longformat.startingPosition;
		}
		if (longformat.moves) shortformat += `${whitespace}${whitespace}`; // Add more spacing for the next part
	}

	// moves
	if (longformat.moves) shortformat += longToShortMoves(longformat.moves, { turnOrderArray, fullmove, compact_moves, make_new_lines });

	return shortformat;
}

/**
 * Converts moves from either the format `[{ startCoords, endCoords }, ...]` or `['1,2>3,4','5,6>7,8N']`
 * to short string format `1,2>3,4|5,6>7,8N`
 * @param {Object} longmoves 
 * @param {Object} options - Additional options
 * @param {string} options.turnOrderArray - ['w','b']
 * @param {string} options.fullmove
 * @param {string} options.make_new_lines
 * @param {string} options.compact_moves
 */
function longToShortMoves(longmoves, { turnOrderArray, fullmove, make_new_lines, compact_moves }) {
	// If the moves are provided like: ['1,2>3,4','5,6>7,8N'], then quick return!
	if (typeof longmoves[0] === 'string') return longmoves.join('|');

	let turnIndex = 0;
	let shortmoves = "";
	for (let i = 0; i < longmoves.length; i++) {
		const longmove = longmoves[i];
		if (compact_moves === 0) {
			if (turnIndex === 0) {
				shortmoves += (!make_new_lines && i !== 0 ? " " : "");
				shortmoves += fullmove + ". ";
			} else shortmoves += " | ";
		} else { // compact_moves > 0
			shortmoves += (i === 0 ? "" : "|");
		}
		shortmoves += (longmove.type && (compact_moves === 0 || compact_moves === 1) ? IntToShort_Piece(longmove.type) : "");
		shortmoves += longmove.startCoords.toString();
		shortmoves += (compact_moves === 0 ? " " : "");
		shortmoves += (longmove.flags.capture && (compact_moves === 0 || compact_moves === 1) ? "x" : ">");
		shortmoves += (compact_moves === 0 ? " " : "");
		shortmoves += longmove.endCoords.toString();
		shortmoves += (compact_moves === 0 ? " " : "");
		if (longmove.promotion) {
			shortmoves += (compact_moves === 0 || compact_moves === 1 ? "=" : "");
			shortmoves += IntToShort_Piece(longmove.promotion);
		}
		if (longmove.flags.mate && (compact_moves === 0 || compact_moves === 1)) {
			shortmoves += "#";
		} else if (longmove.flags.check && (compact_moves === 0 || compact_moves === 1)) {
			shortmoves += "+";
		}
		shortmoves = shortmoves.trimEnd();

		// Prep for next iteration by adjusting the turn index
		turnIndex++;
		if (turnIndex > turnOrderArray.length - 1) { // Wrap around back to first turn
			turnIndex = 0;
			fullmove += 1;
			if (i !== longmoves.length - 1 && compact_moves === 0) {
				shortmoves += (make_new_lines ? "\n" : " |");
			}
		}
	}
	return shortmoves.trimEnd();
}

/**
 * Tests if the provided array of legal promotions is the default set of promotions.
 * @param {number[]} promotionList 
 * @returns {boolean}
 */
function isPromotionListDefaultPromotions(promotionList) {
	if (promotionList.length !== defaultPromotions.length) return false;
	return defaultPromotions.every(promotion => promotionList.includes(promotion));
}

/**
 * Converts a string in Infinite Chess Notation to gamefile in JSON format
 * @param {string} shortformat - A string in ICN
 * @param {boolean} [reconstruct_optional_move_flags] - Deprecated. If true, method will reconstruct "type", "captured", "enpassant" and "castle" flags of moves. Default: *true*
 * @param {boolean} [trust_check_and_mate_symbols] - Deprecated. If true, method will set "check" and "mate" flags of moves based on + and # symbols. Default: *true*
 * @returns {FormatConverterLong} Equivalent gamefile in JSON format
 */
function ShortToLong_Format(shortformat/*, reconstruct_optional_move_flags = true, trust_check_and_mate_symbols = true*/) {
	const longformat = {};
	longformat.gameRules = {};

	// Extra gamerules, included inside { }, MUST BE PARSED BEFORE the metadata,
	// because they may include more [ and ], which is what the metadata parser eats!
	const indexOfGameRulesStart = shortformat.indexOf('{');
	if (indexOfGameRulesStart !== -1) {
		const indexOfGameRulesEnd = shortformat.lastIndexOf('}');
		if (indexOfGameRulesEnd === -1) throw new Error("Unclosed extra gamerules!");

		const stringifiedExtraGamerules = shortformat.substring(indexOfGameRulesStart, indexOfGameRulesEnd + 1);
		// Splice the extra gamerules out of the ICN, so that its nested [ and ] don't break the metadata parser
		shortformat = shortformat.substring(0, indexOfGameRulesStart) + shortformat.substring(indexOfGameRulesEnd + 1, shortformat.length);
        
		if (!isJson(stringifiedExtraGamerules)) throw new Error(`Extra optional arguments not in valid JSON format: ${stringifiedExtraGamerules}`);

		const parsedGameRules = JSON.parse(stringifiedExtraGamerules);
		Object.assign(longformat.gameRules, parsedGameRules); // Copy over the parsed gamerules to the longformat
	}

	// metadata handling. Don't put ": " in metadata fields.
	const metadata = {};
	while (shortformat.indexOf("[") > -1) {
		const start_index = shortformat.indexOf("[");
		const end_index = shortformat.indexOf("]");
		if (end_index === -1) throw new Error("Unclosed [ detected");
		const metadatastring = shortformat.slice(start_index + 1,end_index);
		shortformat = `${shortformat.slice(0,start_index)}${shortformat.slice(end_index + 1)}`;
        
		// new metadata format [Metadata "value"]
		if (/^[^\s:]*\s+"/.test(metadatastring)) {
			const split_index = metadatastring.search(/\s"/);
			metadata[metadatastring.slice(0,split_index)] = metadatastring.slice(split_index + 2, -1);
		}
		// old metadata format [Metadata: value]
		else {
			const split_index = metadatastring.indexOf(": ");
			if (split_index > -1) metadata[metadatastring.slice(0,split_index)] = metadatastring.slice(split_index + 2);
			else metadata[metadatastring] = "";
		}
	}
	longformat.metadata = metadata;

	while (shortformat !== "") {
		if (/\s/.test(shortformat[0])) {
			shortformat = shortformat.slice(1);
			continue;
		}
		let index = shortformat.search(/\s/);
		if (index === -1) index = shortformat.length;
		let string = shortformat.slice(0,index);
		shortformat = shortformat.slice(index + 1);

		// turn order
		if (!longformat.gameRules.turnOrder && /^[a-z]{1,2}(:[a-z]{1,2})*$/.test(string)) {
			if (string === 'w') string = 'w:b'; // 'w' is short for 'w:b'
			else if (string === 'b') string = 'b:w'; // 'b' is short for 'b:w'
			const turnOrderArray = string.split(':'); // ['w','b']
			longformat.gameRules.turnOrder = [...turnOrderArray.map(playerabbrev => {
				if (!(playerabbrev in invertedplayersDict)) throw new Error(`Unknown color abbreviation "${playerabbrev}" when parsing turn order while pasting game!`);
				return Number(invertedplayersDict[playerabbrev]);
			})];
			continue;
		}

		// en passant
		if (!longformat.enpassant && RegExp(`^(${scientificNumberRegex},${scientificNumberRegex})$`).test(string)) {
			longformat.enpassant = [Number(string.split(",")[0]), Number(string.split(",")[1])];
			continue;
		}

		// X move rule
		if (!longformat.moveRule && /^([0-9]+\/[0-9]+)$/.test(string)) {
			longformat.moveRule = string;
			continue;
		}

		// full move counter
		if (!longformat.fullMove && /^([0-9]+)$/.test(string)) {
			longformat.fullMove = Number(string);
			continue;
		}

		// promotion lines
		if (RegExp(`^\\((${scientificNumberRegex})?[,;\\|]`).test(string)) {
			
			/**
			 * Possible cases the string could look like:
			 * 
			 * (8|0)
			 * (-8|)
			 * (|)
			 * (5,-6,-7|-8,9,10)
			 * (1;N,R,AM|8)
			 * (-3,4;|10,20;q,ca)
			 */

			string = string.slice(1, -1); // Chop off the parenthesis

			const [ whiteInfo, blackInfo ] = string.split('|'); // ["-3,4;N,R", ...]
			const [ whiteRanks, whitePromotions ] = whiteInfo.split(';'); // ["-3,4", "N,R"]
			const [ blackRanks, blackPromotions ] = blackInfo.split(';');

			const whiteRanksArray = whiteRanks.length === 0 ? [] : whiteRanks.split(','); // ['-3','4']
			const blackRanksArray = blackRanks.length === 0 ? [] : blackRanks.split(',');

			longformat.gameRules.promotionRanks = {
				[p.WHITE]: whiteRanksArray.map(num => Number(num)), // [-3, 4]
				[p.BLACK]: blackRanksArray.map(num => Number(num))
			};

			longformat.gameRules.promotionsAllowed = {
				// If they are not provided, yet the color still has atleast one promotion line, then they can promote to the default pieces.
				[p.WHITE]: whitePromotions === undefined && whiteInfo.length > 0 ? defaultPromotions : whitePromotions !== undefined && whitePromotions.length > 0 ? whitePromotions.split(',').map(abv => typeutil.getRawType(ShortToInt_Piece(abv))) : [],
				[p.BLACK]: blackPromotions === undefined && blackInfo.length > 0 ? defaultPromotions : blackPromotions !== undefined && blackPromotions.length > 0 ? blackPromotions.split(',').map(abv => typeutil.getRawType(ShortToInt_Piece(abv))) : []
			};

			continue;
		}

		// win condition (has to start with a letter and not include numbers)
		if (/^(\(?[a-zA-z][^0-9:]+)$/.test(string)) {

			/**
			 * Possible cases of what the string could look like:
			 * 
			 * testtest
			 * (bliblablub|blabla)
			 * (bliblablub,testtest|blabla)
			 * (bliblablub,testtest|blabla,hahaha)
			 * 
			 * et cetera....
			 */

			if (!longformat.gameRules.winConditions) {
				longformat.gameRules.winConditions = {};
				string = string.replace(/[()]/g,"").split("|");
				if (string.length === 1) string.push(string[0]);
				for (let i = 0; i < 2; i++) {
					const color = (i === 0 ? p.WHITE : p.BLACK);
					longformat.gameRules.winConditions[color] = [];
					for (const wincon of string[i].split(",")) {
						longformat.gameRules.winConditions[color].push(wincon);
					}
				}
				continue;
			}
		}

		// position
		if (!longformat.startingPosition && RegExp(`^([0-9]*[a-zA-z]+${scientificNumberRegex},${scientificNumberRegex}\\+?($|\\|))`).test(string)) {
			const { startingPosition, specialRights } = getStartingPositionAndSpecialRightsFromShortPosition(string);
			longformat.specialRights = specialRights;
			longformat.startingPosition = startingPosition;
			longformat.shortposition = string;
			continue;
		}

		//moves - conversion stops here
		if (RegExp(`^(([0-9]+\\.$)|([a-zA-Z]*${scientificNumberRegex},${scientificNumberRegex}[\\s]*(x|>)+))`).test(string)) {
			const shortmoves = (string + "  " + shortformat).trimEnd();
			const moves = convertShortMovesToLong(shortmoves);
			if (moves.length > 0) longformat.moves = moves;
			if (!longformat.gameRules.winConditions) longformat.gameRules.winConditions = { [p.WHITE]: ['checkmate'], [p.BLACK]: ['checkmate'] }; // Default win conditions if none specified
			longformat.gameRules.turnOrder = longformat.gameRules.turnOrder ?? [p.WHITE, p.BLACK]; // Default turn order if none specified
			longformat.fullMove = longformat.fullMove ?? 1;
			return longformat;
		}
	}
	if (!longformat.gameRules.winConditions) longformat.gameRules.winConditions = { [p.WHITE]: ['checkmate'], [p.BLACK]: ['checkmate'] }; // Default win conditions if none specified
	longformat.gameRules.turnOrder = longformat.gameRules.turnOrder ?? [p.WHITE, p.BLACK]; // Default turn order if none specified
	longformat.fullMove = longformat.fullMove ?? 1;
	return longformat;
}

function convertShortMovesToLong(shortmoves) {
	const longmoves = [];

	shortmoves.replace(/[!?=]/g,"");
	while (shortmoves.indexOf("{") > -1) {
		const start_index = shortmoves.indexOf("{");
		const end_index = shortmoves.indexOf("}");
		if (end_index === -1) throw new Error("Unclosed { found.");
		shortmoves = shortmoves.slice(0,start_index) + "|" + shortmoves.slice(end_index + 1);
	}
	shortmoves = shortmoves.match(RegExp(`[a-zA-Z]*${scientificNumberRegex},${scientificNumberRegex}[\\s]*(x|>)+[\\s]*${scientificNumberRegex},${scientificNumberRegex}[^\\|\\.0-9]*`, "g"));

	if (!shortmoves) return longmoves;

	for (let i = 0; i < shortmoves.length; i++) {
		const coords = shortmoves[i].match(RegExp(`${scientificNumberRegex},${scientificNumberRegex}`, "g"));
		const startString = coords[0];
		const endString = coords[1];

		const suffix_index = shortmoves[i].lastIndexOf(endString) + endString.length;
		const suffix = shortmoves[i].slice(suffix_index).trimStart().trimEnd();

		// simplified longmoves (comment out next 2 lines and uncomment block below to get back old behavior)
		const promotedPiece = ( /[a-zA-Z]+/.test(suffix) ? suffix.match(/[a-zA-Z]+/)[0] : "");
		longmoves.push(`${startString}>${endString}${promotedPiece}`);
	}

	return longmoves;
}

/**
 * Converts a gamefile in JSON format to single position gamefile in JSON format with deleted "moves" object
 * @param {Object} longformat - Input gamefile in JSON format
 * @param {number} [halfmoves] - Number of halfmoves from starting position (Infinity: final position of game)
 * @param {boolean} [modify_input] - If false, a new object is created and returned. If true, the input object is modified (which is faster)
 * @returns {Object} Output gamefile in JSON format
 */
function GameToPosition(longformat, halfmoves = 0, modify_input = false) {
	if (typeof longformat.startingPosition === 'string') throw new Error('startingPosition must be in json format!');
    
	if (!longformat.moves || longformat.moves.length === 0) return longformat;
	const ret = modify_input ? longformat : deepCopyObject(longformat);
	const yParity = longformat.gameRules.turnOrder[0] === p.WHITE ? 1 : longformat.gameRules.turnOrder[0] === p.BLACK ? -1 : (() => { throw new Error(`Unsupported turn player ${longformat.gameRules.turnOrder[0]} when converting game to position.`); })();
	let pawnThatDoublePushedKey = (ret.enpassant ? [ret.enpassant[0], ret.enpassant[1] - yParity].toString() : "");
	ret.fullMove = longformat.fullMove + Math.floor(ret.moves.length / longformat.gameRules.turnOrder.length);
	for (let i = 0; i < Math.min(halfmoves, ret.moves.length); i++) {
		const move = ret.moves[i];
		const rawType = typeutil.getRawType(move.type);

		const startString = move.startCoords.toString();
		const endString = move.endCoords.toString();

		// update coordinates in starting position
		if (move.promotion) {
			ret.startingPosition[endString] = `${move.promotion}`;
		} else {
			ret.startingPosition[endString] = `${ret.startingPosition[startString]}`;
		}
		delete ret.startingPosition[startString];
		if (ret.specialRights) {
			delete ret.specialRights[startString];
			delete ret.specialRights[endString];
		}

		// update move rule
		if (ret.moveRule) {
			const parts = ret.moveRule.split("/").map(Number); // [X,100]
			// If the move is one-way, reset the draw by 50 move rule counter.
			if (move.flags.capture || rawType === r.PAWN) ret.moveRule = `0/${parts[1]}`; // One-way action. Reset counter until draw by 50 move rule.
			else ret.moveRule = `${parts[0] + 1}/${parts[1]}`;
		}

		// delete captured piece en passant
		if (move.enpassant) {
			delete ret.startingPosition[pawnThatDoublePushedKey];
			if (ret.specialRights) delete ret.specialRights[pawnThatDoublePushedKey];
		}

		// update en passant
		// TODO: Doesn't the move object contain the enpassantCreate special flag? Let's read that instead
		if (rawType === r.PAWN && Math.abs(move.endCoords[1] - move.startCoords[1]) === 2) {
			ret.enpassant = [move.endCoords[0], (move.startCoords[1] + move.endCoords[1]) / 2];
		} else delete ret.enpassant;

		// update coords of castled piece
		if (move.castle) {
			const castleString = move.castle.coord[0].toString() + "," + move.castle.coord[1].toString();
			ret.startingPosition[`${(Number(move.endCoords[0]) - move.castle.dir).toString()},${move.endCoords[1].toString()}`] = `${ret.startingPosition[castleString]}`;
			delete ret.startingPosition[castleString];
			if (ret.specialRights) delete ret.specialRights[castleString];
		}

		// save move coords for potential en passant
		pawnThatDoublePushedKey = endString;

		// Rotate the turn order, moving the first player to the back
		ret.gameRules.turnOrder.push(ret.gameRules.turnOrder.shift());
	}
	delete ret.moves;
	ret.moves = [];
	return ret;
}

/**
 * Converts a single move in JSON format to most-compact (excludes 'x','+','#') ICN notation: 'a,b>c,dX'
 * @param {Object} longmove - Input move in JSON format
 * @returns {string} Output string in compact ICN notation
 */
function LongToShort_CompactMove(longmove) {
	const promotedPiece = (longmove.promotion ? IntToShort_Piece(longmove.promotion) : "");
	return `${longmove.startCoords.toString()}>${longmove.endCoords.toString()}${promotedPiece}`;
}

/**
 * Converts a single compact move "a,b>c,dX" in ICN notation to JSON format.
 * Doesn't reconstruct captured, enpassant, or castle flags, but DOES reconstruct promotion flag.
 * 
 * **Throws and error** if the move is in an invalid format.
 * @param {string} shortmove - Input move as string
 * @returns {Object} Output move as JSON: { startCoords, endCoords, promotion: type }
 */
function ShortToLong_CompactMove(shortmove) {
	let coords = shortmove.match(RegExp(`${scientificNumberRegex},${scientificNumberRegex}`, "g")); // ['1,2','3,4']
	// Make sure the move contains exactly 2 coordinates.
	if (coords.length !== 2) throw new Error(`Short move does not contain 2 valid coordinates: ${JSON.stringify(coords)}`);
	coords = coords.map((movestring) => { return getCoordsFromString(movestring); }); // [[1,2],[3,4]]
	// Make sure the parsed number is not Infinity
	coords.forEach((coords) => { // coords = [1,2]
		if (!isFinite(coords[0])) throw new Error(`Move coordinate must not be Infinite. coords: ${coords}`);
		if (!isFinite(coords[1])) throw new Error(`Move coordinate must not be Infinite. coords: ${coords}`);
	});
	// ShortToInt_Piece() will already throw an error if the piece abbreviation is invalid.
	const promotedPiece = (/[a-zA-Z]+$/.test(shortmove) ? ShortToInt_Piece(shortmove.match(/[a-zA-Z]+$/)[0]) : "");
	const longmove = { compact: shortmove };
	longmove.startCoords = coords[0];
	longmove.endCoords = coords[1];
	if (promotedPiece !== "") {
		longmove.promotion = promotedPiece;
	}
	return longmove;
}

/**
 * Accepts a gamefile's starting position and specialRights properties, returns the position in compressed notation (.e.g., "P5,6+|k15,-56|Q5000,1")
 * @param {Object} position - The starting position of the gamefile, in the form 'x,y':'pawnsW'
 * @param {Object} [specialRights] - Optional. The special rights of each piece in the gamefile, in the form 'x,y':true, where true means the piece at that coordinate can perform their special move (pawn double push, castling rights..)
 * @returns {string} The position of the game in compressed form, where each piece with a + has its special move ability
 */
function LongToShort_Position(position, specialRights = {}) {
	let shortposition = "";
	if (!position) return shortposition; // undefined position --> no string
	for (const coordinate in position) {
		if (specialRights[coordinate]) {
			shortposition += `${IntToShort_Piece(position[coordinate])}${coordinate}+|`;
		} else {
			shortposition += `${IntToShort_Piece(position[coordinate])}${coordinate}|`;
		}
	}

	if (shortposition.length !== 0) shortposition = shortposition.slice(0,-1); // Trim off the final |
	return shortposition;
}

/**
 * Accepts a gamefile's starting position, pawnDoublePush and castleWith gamerules, returns the position in compressed notation (.e.g., "P5,6+|k15,-56|Q5000,1")
 * @param {Object} position - The starting position of the gamefile, in the form 'x,y':'pawnsW'
 * @param {boolean} pawnDoublePush - Whether pawns are allowed to double push
 * @param {string | undefined} castleWith - If castling is allowed, this is what piece the king can castle with (e.g., "rooks"),
 * @returns {string} The position of the game in compressed form, where each piece with a + has its special move ability
 */
function LongToShort_Position_FromGamerules(position, pawnDoublePush, castleWith) {
	const specialRights = generateSpecialRights(position, pawnDoublePush, castleWith);
	return LongToShort_Position(position, specialRights); // Now we have the information we need!
}

/**
 * Generates the specialRights property of a gamefile, given the provided position and gamerules.
 * Only gives pieces that can castle their right if they are on the same rank, and color, as the king, and atleast 3 squares away
 * 
 * This can be manually used to compress the starting position of variants of InfiniteChess.org to shrink the size of the code
 * @param {Object} position - The starting position of the gamefile, in the form 'x,y':'pawnsW'
 * @param {boolean} pawnDoublePush - Whether pawns are allowed to double push
 * @param {RawType | undefined} castleWith - If castling is allowed, this is what piece the king can castle with (e.g., "rooks"), otherwise leave it undefined
 * @returns {Object} The specialRights gamefile property, in the form 'x,y':true, where true means the piece at that location has their special move ability (pawn double push, castling rights..)
 */
function generateSpecialRights(position, pawnDoublePush, castleWith) {
	const specialRights = {};
	const kingsFound = {}; // Running list of kings discovered, 'x,y': player
	const castleWithsFound = {}; // Running list of pieces found that are able to castle (e.g. rooks), 'x,y': player

	for (const key in position) {
		const thisPiece = position[key]; // e.g. "pawnsW"
		if (pawnDoublePush && typeutil.getRawType(thisPiece) === r.PAWN) specialRights[key] = true;
		else if (castleWith && typeutil.getRawType(thisPiece) === r.KING) {
			specialRights[key] = true;
			kingsFound[key] = typeutil.getColorFromType(thisPiece);
		}
		else if (castleWith && typeutil.getRawType(thisPiece) === castleWith) {
			castleWithsFound[key] = typeutil.getColorFromType(thisPiece);
		}
	}

	// Only give the pieces that can castle their special move ability
	// if they are the same row and color as a king!
	if (Object.keys(kingsFound).length === 0) return specialRights; // Nothing can castle, return now.
	outerFor: for (const coord in castleWithsFound) { // 'x,y': player
		const coords = getCoordsFromString(coord); // [x,y]
		for (const kingCoord in kingsFound) { // 'x,y': player
			const kingCoords = getCoordsFromString(kingCoord); // [x,y]
			if (coords[1] !== kingCoords[1]) continue; // Not the same y level
			if (castleWithsFound[coord] !== kingsFound[kingCoord]) continue; // Their players don't match
			const xDist = Math.abs(coords[0] - kingCoords[0]);
			if (xDist < 3) continue; // Not ateast 3 squares away
			specialRights[coord] = true; // Same row and color as the king! This piece can castle.
			// We already know this piece can castle, we don't
			// need to see if it's on the same rank as any other king
			continue outerFor;
		}
	}
	return specialRights;
}

/**
 * Returns a length-2 array of the provided coordinates
 * @param {string} key - 'x,y'
 * @return {number[]} The coordinates of the piece, [x,y]
 */
function getCoordsFromString(key) {
	return key.split(',').map(Number);
}

/**
 * Takes the position in compressed short form and returns the startingPosition and specialRights properties of the gamefile
 * @param {string} shortposition - The compressed position of the gamefile (e.g., "K5,4+|P1,2|r500,25389")
 * @returns {Object} An object containing 2 properties: startingPosition, and specialRights
 */
function getStartingPositionAndSpecialRightsFromShortPosition(shortposition) {
	const startingPosition = {};
	const specialRights = {};
	const letter_regex = /[a-zA-Z]/;
	const MAX_INDEX = shortposition.length - 1;
	let index = 0;
	let end_index = 0;
	while (index < MAX_INDEX) {
		let shortpiece = shortposition[index];
		let piecelength = 1;
		while (true) {
			const current_char = shortposition[index + piecelength];
			if (letter_regex.test(current_char)) {
				shortpiece += current_char;
				piecelength++;
			} else {
				break;
			}
		}
		end_index = shortposition.slice(index).search(/(\+($|\|))|\|/); // end of current piece coordinates, counted from index
		if (end_index !== -1) {
			if (shortposition[index + end_index] === "+") {
				const coordString = shortposition.slice(index + piecelength, index + end_index);
				startingPosition[standardizeCoordString(coordString)] = ShortToInt_Piece(shortpiece);
				specialRights[standardizeCoordString(coordString)] = true;
				index += end_index + 2;
			} else {
				startingPosition[standardizeCoordString(shortposition.slice(index + piecelength, index + end_index))] = ShortToInt_Piece(shortpiece);
				index += end_index + 1;
			}
		} else {
			if (shortposition.slice(-1) === "+") {
				const coordString = shortposition.slice(index + piecelength, -1);
				startingPosition[standardizeCoordString(coordString)] = ShortToInt_Piece(shortpiece);
				specialRights[standardizeCoordString(coordString)] = true;
				index = MAX_INDEX;
			} else {
				startingPosition[standardizeCoordString(shortposition.slice(index + piecelength))] = ShortToInt_Piece(shortpiece);
				index = MAX_INDEX;
			}
		}
	}

	return {startingPosition, specialRights};
}

/**
 * Tests if the provided startingPosition is in long (json) format.
 * @param {object | string} startingPosition - The startingPosition to test
 * @returns {boolean} *true* if the startingPosition is in long (json) format
 */
function isStartingPositionInLongFormat(startingPosition) {
	return typeof startingPosition !== 'string';
}

/**
 * Deep copies an entire object, no matter how deep its nested.
 * No properties will contain references to the source object.
 * Use this instead of structuredClone() when that throws an error due to nested functions.
 * 
 * SLOW. Avoid using for very massive objects.
 * @param {Object | string | number | bigint | boolean} src - The source object
 * @returns {Object | string | number | bigint | boolean} The copied object
 */
function deepCopyObject(src) {
	if (typeof src !== "object" || src === null) return src;
    
	const copy = Array.isArray(src) ? [] : {}; // Create an empty array or object
    
	for (const key in src) {
		const value = src[key];
		copy[key] = deepCopyObject(value); // Recursively copy each property
	}
    
	return copy; // Return the copied object
}

export default {
	LongToShort_Format,
	ShortToLong_Format,
	GameToPosition,
	LongToShort_CompactMove,
	ShortToLong_CompactMove,
	LongToShort_Position,
	LongToShort_Position_FromGamerules,
	getStartingPositionAndSpecialRightsFromShortPosition,
	generateSpecialRights,
	convertShortMovesToLong,
	longToShortMoves,
	ShortToInt_Piece
};