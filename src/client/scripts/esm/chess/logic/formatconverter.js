
'use strict';
// 
import { rawTypes as r, ext as e, players } from "../config.js";
import typeutil from "../util/typeutil.js";

/**
 * Universal Infinite Chess Notation [Converter] and Interface
 * by Andreas Tsevas and Naviary
 * https://github.com/tsevasa/infinite-chess-notation
 * 
 * This script converts primed gamefiles from JSON notation to a
 * compact ICN (Infinite Chess Noation) and back, still human-readable,
 * but taking less space to describe positions.
 */
    
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

function invertDictionary(json) {
	const inv = {};
	for (const key in json) {
		inv[json[key]] = key;
	}
	return inv;
}

const invertedpieceDictionary = invertDictionary(pieceDictionary);

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

	const lowerType = results[2];

	if (!pieceDictionary[lowerType]) throw UNKERR;

	let type = pieceDictionary[lowerType];
	if (results[1] !== "") {
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
	} catch (e) {
		return false;
	}
	return true;
}

/**
 * Converts a gamefile in JSON format to Infinite Chess Notation.
 * @param {Object} longformat - The gamefile in JSON format
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
	const turnOrderArray = []; // ['w','b']
	if (!longformat.gameRules.turnOrder) throw new Error("turnOrder gamerule MUST be present when compressing a game.");
	for (const color of longformat.gameRules.turnOrder) {
		if (color === 'white') turnOrderArray.push('w');
		else if (color === 'black') turnOrderArray.push('b');
		else throw new Error(`Invalid color '${color}' when parsing turn order when copying game!`);
	}
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
		fullmove = parseInt(longformat.fullMove);
	}

	// promotion lines, currently assumes that "promotionRanks" is always defined as a list of length 2, if it is defined
	if (longformat.gameRules) {
		if (longformat.gameRules.promotionRanks) {
			shortformat += "(";
			if (longformat.gameRules.promotionRanks.white.length > 0) {
				shortformat += longformat.gameRules.promotionRanks.white.join(',');
				const promotionListWhite = (longformat.gameRules.promotionsAllowed ? longformat.gameRules.promotionsAllowed.white : null);
				if (promotionListWhite) {
					if (!(promotionListWhite.length == 4 && promotionListWhite.includes("rooks") && promotionListWhite.includes("queens") && promotionListWhite.includes("bishops") && promotionListWhite.includes("knights"))) {
						shortformat += ";";
						for (const longpiece of promotionListWhite) {
							shortformat += `${IntToShort_Piece(longpiece + "W")},`;
						}
						shortformat = shortformat.slice(0, -1);
					}
				}
			}
			shortformat += "|";
			if (longformat.gameRules.promotionRanks.black.length > 0) {
				shortformat += longformat.gameRules.promotionRanks.black.join(',');
				const promotionListBlack = (longformat.gameRules.promotionsAllowed ? longformat.gameRules.promotionsAllowed.black : null);
				if (promotionListBlack) {
					if (!(promotionListBlack.length == 4 && promotionListBlack.includes("rooks") && promotionListBlack.includes("queens") && promotionListBlack.includes("bishops") && promotionListBlack.includes("knights"))) {
						shortformat += ";";
						for (const longpiece of promotionListBlack) {
							shortformat += `${IntToShort_Piece(longpiece + "B")},`;
						}
						shortformat = shortformat.slice(0, -1);
					}
				}
			}
			shortformat += ") ";
		}
	}

	// win condition
	if (longformat.gameRules) {
		if (longformat.gameRules.winConditions) {
			const whitewins = longformat.gameRules.winConditions.white;
			const blackwins = longformat.gameRules.winConditions.black;
			if (whitewins && blackwins) {
				let wins_are_equal = true;
				if (whitewins.length == blackwins.length) {
					for (let i = 0; i < whitewins.length; i++) {
						let white_win_i_is_black_win = false;
						for (let j = 0; j < blackwins.length; j++) {
							if (whitewins[i] == blackwins[j]) {
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
		shortmoves += (longmove.type && (compact_moves == 0 || compact_moves == 1) ? IntToShort_Piece(longmove.type) : "");
		shortmoves += longmove.startCoords.toString();
		shortmoves += (compact_moves == 0 ? " " : "");
		shortmoves += (longmove.flags.capture && (compact_moves == 0 || compact_moves == 1) ? "x" : ">");
		shortmoves += (compact_moves == 0 ? " " : "");
		shortmoves += longmove.endCoords.toString();
		shortmoves += (compact_moves == 0 ? " " : "");
		if (longmove.promotion) {
			shortmoves += (compact_moves == 0 || compact_moves == 1 ? "=" : "");
			shortmoves += IntToShort_Piece(longmove.promotion);
		}
		if (longmove.flags.mate && (compact_moves == 0 || compact_moves == 1)) {
			shortmoves += "#";
		} else if (longmove.flags.check && (compact_moves == 0 || compact_moves == 1)) {
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
 * Converts a string in Infinite Chess Notation to gamefile in JSON format
 * @param {string} shortformat - A string in ICN
 * @param {boolean} [reconstruct_optional_move_flags] - Deprecated. If true, method will reconstruct "type", "captured", "enpassant" and "castle" flags of moves. Default: *true*
 * @param {boolean} [trust_check_and_mate_symbols] - Deprecated. If true, method will set "check" and "mate" flags of moves based on + and # symbols. Default: *true*
 * @returns {Object} Equivalent gamefile in JSON format
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
		if (end_index == -1) throw new Error("Unclosed [ detected");
		const metadatastring = shortformat.slice(start_index + 1,end_index);
		shortformat = `${shortformat.slice(0,start_index)}${shortformat.slice(end_index + 1)}`;
        
		// new metadata format [Metadata "value"]
		if (/^[^\s\:]*\s+\"/.test(metadatastring)) {
			const split_index = metadatastring.search(/\s\"/);
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

	while (shortformat != "") {
		if (/\s/.test(shortformat[0])) {
			shortformat = shortformat.slice(1);
			continue;
		}
		let index = shortformat.search(/\s/);
		if (index == -1) index = shortformat.length;
		let string = shortformat.slice(0,index);
		shortformat = shortformat.slice(index + 1);

		// turn order
		if (!longformat.gameRules.turnOrder && /^[a-z](:[a-z])*$/.test(string)) {
			if (string === 'w') string = 'w:b'; // 'w' is short for 'w:b'
			else if (string === 'b') string = 'b:w'; // 'b' is short for 'b:w'
			const turnOrderArray = string.split(':'); // ['w','b']
			const turnOrder = []; // ['white', 'black']
			for (const colorAbbrev of turnOrderArray) {
				if (colorAbbrev === 'w') turnOrder.push('white');
				else if (colorAbbrev === 'b') turnOrder.push('black');
				else throw new Error(`Unknown color abbreviation "${colorAbbrev}" when parsing turn order while pasting game!`);
			}
			longformat.gameRules.turnOrder = turnOrder;
			continue;
		}

		// en passant
		if (!longformat.enpassant && /^(-?[0-9]+,-?[0-9]+)$/.test(string)) {
			longformat.enpassant = [parseInt(string.split(",")[0]), parseInt(string.split(",")[1])];
			continue;
		}

		// X move rule
		if (!longformat.moveRule && /^([0-9]+\/[0-9]+)$/.test(string)) {
			longformat.moveRule = string;
			continue;
		}

		// full move counter
		if (!longformat.fullMove && /^([0-9]+)$/.test(string)) {
			longformat.fullMove = parseInt(string);
			continue;
		}

		// promotion lines
		if (/^\(((()|([^\(\)\|]*\|)-?[0-9]+)|(\|\)$))/.test(string)) {
			
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
				white: whiteRanksArray.map(num => parseInt(num)), // [-3, 4]
				black: blackRanksArray.map(num => parseInt(num))
			};

			const defaultPromotions =  ["queens","rooks","bishops","knights"];
			longformat.gameRules.promotionsAllowed = {
				// If they are not provided, yet the color still has atleast one promotion line, then they can promote to the default pieces.
				white: whitePromotions === undefined && whiteInfo.length > 0 ? defaultPromotions : whitePromotions !== undefined && whitePromotions.length > 0 ? whitePromotions.split(',').map(abv => ShortToInt_Piece(abv).slice(0,-1)) : [],
				black: blackPromotions === undefined && blackInfo.length > 0 ? defaultPromotions : blackPromotions !== undefined && blackPromotions.length > 0 ? blackPromotions.split(',').map(abv => ShortToInt_Piece(abv).slice(0,-1)) : []
			};

			continue;
		}

		// win condition (has to start with a letter and not include numbers)
		if (/^(\(?[a-zA-z][^0-9]+)$/.test(string)) {
			if (!longformat.gameRules.winConditions) {
				longformat.gameRules.winConditions = {};
				string = string.replace(/[\(\)]/g,"").split("|");
				if (string.length == 1) string.push(string[0]);
				for (let i = 0; i < 2; i++) {
					const color = (i == 0 ? "white" : "black");
					longformat.gameRules.winConditions[color] = [];
					for (const wincon of string[i].split(",")) {
						longformat.gameRules.winConditions[color].push(wincon);
					}
				}
				continue;
			}
		}

		// position
		if (!longformat.startingPosition && /^([0-9]*[a-zA-z]+-?[0-9]+,-?[0-9]+\+?($|\|))/.test(string)) {
			const { startingPosition, specialRights } = getStartingPositionAndSpecialRightsFromShortPosition(string);
			longformat.specialRights = specialRights;
			longformat.startingPosition = startingPosition;
			longformat.shortposition = string;
			continue;
		}

		//moves - conversion stops here
		if (/^(([0-9]+\.)|([a-zA-Z]*-?[0-9]+,-?[0-9]+[\s]*(x|>)+))/.test(string)) {
			const shortmoves = (string + "  " + shortformat).trimEnd();
			const moves = convertShortMovesToLong(shortmoves);
			if (moves.length > 0) longformat.moves = moves;
			if (!longformat.gameRules.winConditions) longformat.gameRules.winConditions = { white: ['checkmate'], black: ['checkmate'] }; // Default win conditions if none specified
			longformat.gameRules.turnOrder = longformat.gameRules.turnOrder || ['white','black']; // Default turn order if none specified
			longformat.fullMove = longformat.fullMove || 1;
			return longformat;
		}
	}
	if (!longformat.gameRules.winConditions) longformat.gameRules.winConditions = { white: ['checkmate'], black: ['checkmate'] }; // Default win conditions if none specified
	longformat.gameRules.turnOrder = longformat.gameRules.turnOrder || ['white','black']; // Default turn order if none specified
	longformat.fullMove = longformat.fullMove || 1;
	return longformat;
}

function convertShortMovesToLong(shortmoves) {
	const longmoves = [];

	shortmoves.replace(/[\!\?=]/g,"");
	while (shortmoves.indexOf("{") > -1) {
		const start_index = shortmoves.indexOf("{");
		const end_index = shortmoves.indexOf("}");
		if (end_index == -1) throw new Error("Unclosed { found.");
		shortmoves = shortmoves.slice(0,start_index) + "|" + shortmoves.slice(end_index + 1);
	}
	shortmoves = shortmoves.match(/[a-zA-Z]*-?[0-9]+,-?[0-9]+[\s]*(x|>)+[\s]*-?[0-9]+,-?[0-9]+[^\|\.0-9]*/g);

	if (!shortmoves) return longmoves;

	/*
    let runningCoordinates = {}; // contains current piece type at coordinates, and "undefined" if piece no longer on that square
    let wasWhiteDoublePawnMove = false; // boolean specifying if previous move was double pawn move by white
    let wasBlackDoublePawnMove = false; // boolean specifying if previous move was double pawn move by black
    let pawnEndString; // end square of previous pawn move
    if (reconstruct_optional_move_flags){
        if (!longformat["startingPosition"]){
            throw new Error("Moves have to be reconstructed but no starting position submitted!");
        }
        
        if (longformat["enpassant"]){
            pawnEndString = longformat["enpassant"].toString();
            if (!longformat["turn"]){
                wasBlackDoublePawnMove = true;
            } else if (longformat["turn"] == "white"){
                wasBlackDoublePawnMove = true;
            } else if (longformat["turn"] == "black"){
                wasWhiteDoublePawnMove = true;
            }
        }
    }
    */

	for (let i = 0; i < shortmoves.length; i++) {
		const coords = shortmoves[i].match(/-?[0-9]+,-?[0-9]+/g);
		const startString = coords[0];
		const endString = coords[1];

		const suffix_index = shortmoves[i].lastIndexOf(endString) + endString.length;
		const suffix = shortmoves[i].slice(suffix_index).trimStart().trimEnd();

		// simplified longmoves (comment out next 2 lines and uncomment block below to get back old behavior)
		const promotedPiece = ( /[a-zA-Z]+/.test(suffix) ? suffix.match(/[a-zA-Z]+/) : "");
		longmoves.push(`${startString}>${endString}${promotedPiece}`);

		/*
        let longmove = {};
        let startCoords = getCoordsFromString(startString);
        let endCoords = getCoordsFromString(endString);

        let isCheck = false;
        let isMate = false;
        if (trust_check_and_mate_symbols){
            if (suffix.match(/\+/g)) isCheck = true;
            if (suffix.match(/\#/g)){
                isCheck = true;
                isMate = true;
            }
        }

        let isPromotion = false;
        let promotedPiece = ( /[a-zA-Z]+/.test(suffix) ? suffix.match(/[a-zA-Z]+/) : "");
        if (promotedPiece != ""){
            isPromotion = true;
            try{
                promotedPiece = ShortToInt_Piece(promotedPiece);
            } catch(e) {
                // promoted piece defaults to Q or q if no valid promoted piece found
                promotedPiece = (endCoords[1] > startCoords[1] ? r.QUEEN + e.W : [r.QUEEN + e.B]);
            }
        }

        let movedPiece;
        if (reconstruct_optional_move_flags){
            if (runningCoordinates[startString]){
                movedPiece =`${runningCoordinates[startString]}`;
            } else{
                movedPiece =`${longformat["startingPosition"][startString]}`;
            }
            runningCoordinates[startString] = undefined;
            // moved piece defaults to Q if invalid:
            movedPiece = (movedPiece == "" || movedPiece == "null" || movedPiece == "undefined" ? "queensW" : movedPiece);
            longmove["type"] = movedPiece;
        }
        
        longmove["startCoords"] = startCoords;
        longmove["endCoords"] = endCoords;

        // capture and en passant handling
        if (reconstruct_optional_move_flags){
            let capturedPiece;
            if(runningCoordinates[endString]){
                capturedPiece = `${runningCoordinates[endString]}`;
                // captured piece defaults to Q if invalid:
                capturedPiece = (capturedPiece == "" || capturedPiece == "null" || capturedPiece == "undefined" ? "queensW" : capturedPiece);
                longmove["captured"] = capturedPiece;
            } else if (longformat["startingPosition"][endString] && !(endString in runningCoordinates)){
                capturedPiece = `${longformat["startingPosition"][endString]}`;
                // captured piece defaults to Q if invalid:
                capturedPiece = (capturedPiece == "" || capturedPiece == "null" || capturedPiece == "undefined" ? "queensW" : capturedPiece);
                longmove["captured"] = capturedPiece;
            } else if (movedPiece.slice(0, -1) == "pawns" && startCoords[0] != endCoords[0] && startCoords[1] != endCoords[1]){
                // En passant (no piece was directly captured but pawn moved diagonally)
                if (runningCoordinates[pawnEndString]){
                    capturedPiece = `${runningCoordinates[pawnEndString]}`;
                } else {
                    capturedPiece = `${longformat["startingPosition"][pawnEndString]}`;
                }
                if (wasWhiteDoublePawnMove || wasBlackDoublePawnMove){
                    runningCoordinates[pawnEndString] = undefined;
                    // captured piece defaults to Q if invalid:
                    capturedPiece = (capturedPiece == "" || capturedPiece == "null" || capturedPiece == "undefined" ? "queensW" : capturedPiece);
                    longmove["captured"] = capturedPiece;
                    longmove["enpassant"] = (wasWhiteDoublePawnMove ? 1 : -1);
                }
            }
        }

        // promotion handling
        if (isPromotion){
            longmove["promotion"] = promotedPiece;
            if (reconstruct_optional_move_flags) runningCoordinates[endString] = promotedPiece;
        } else{
            if (reconstruct_optional_move_flags) runningCoordinates[endString] = movedPiece;
        }

        // detect if move is double pawn move, i.e. if it allows en passant next move
        if (reconstruct_optional_move_flags){
            if (movedPiece.slice(0, -1) == "pawns"){
                if (startCoords[1] - endCoords[1] < -1){
                    wasWhiteDoublePawnMove = true;
                    wasBlackDoublePawnMove = false;
                    pawnEndString = `${endString}`;
                } else if (startCoords[1] - endCoords[1] > 1){
                    wasWhiteDoublePawnMove = false;
                    wasBlackDoublePawnMove = true;
                    pawnEndString = `${endString}`;
                } else{
                    wasWhiteDoublePawnMove = false;
                    wasBlackDoublePawnMove = false;
                }
            } else{
                wasWhiteDoublePawnMove = false;
                wasBlackDoublePawnMove = false;
            }
        }

        // castling handling
        if (reconstruct_optional_move_flags){
            if (movedPiece.slice(0, -1) == "kings"){
                const xmove = endCoords[0] - startCoords[0];
                const ymove = endCoords[1] - startCoords[1];
                if (Math.abs(xmove) === 2 && ymove === 0){
                    let castle = {};
                    let castleCandidate = "";
                    for (let coordinate in longformat["specialRights"]){
                        if (longformat["startingPosition"][coordinate]  && !(coordinate in runningCoordinates)){ // can only castle if unmoved in this game
                            let coordinateVec = getCoordsFromString(coordinate);
                            if (coordinateVec[1] == startCoords[1]){ // can only castle if same y coordinate
                                if ((coordinateVec[0] > startCoords[0] && xmove > 1) || (coordinateVec[0] < startCoords[0] && xmove < 1)) {
                                    if (castleCandidate == ""){
                                        castleCandidate = coordinateVec;
                                    } else{
                                        if ((xmove > 1 && castleCandidate[0] > coordinateVec[0]) || (xmove < 1 && castleCandidate[1] < coordinateVec[0])){
                                            castleCandidate = coordinateVec;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if (castleCandidate != ""){
                        castle["dir"] = (xmove > 1 ? 1 : -1);
                        castle["coord"] = castleCandidate;
                        longmove["castle"] = castle;
                        let castleString = castleCandidate.toString();
                        runningCoordinates[`${(parseInt(endCoords[0])-castle["dir"]).toString()},${endCoords[1].toString()}`] = `${longformat["startingPosition"][castleString]}`;
                        runningCoordinates[castleString] = undefined;
                    }
                }
            }
        }

        // check and mate
        if (trust_check_and_mate_symbols){
            if (isCheck){
                longmove["check"] = true;
                if (isMate){
                    longmove["mate"] = true;
                }
            }
        }
        
        longmoves.push(longmove);
        */
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
	const yParity = longformat.gameRules.turnOrder[0] === 'white' ? 1 : -1;
	let pawnThatDoublePushedKey = (ret.enpassant ? [ret.enpassant[0], ret.enpassant[1] - yParity].toString() : "");
	ret.fullMove = longformat.fullMove + Math.floor(ret.moves.length / longformat.gameRules.turnOrder.length);
	for (let i = 0; i < Math.min(halfmoves, ret.moves.length); i++) {
		const move = ret.moves[i];

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
			const slashindex = ret.moveRule.indexOf("/");
			if (move.flags.capture || move.type.slice(0, -1) === "pawns") {
				ret.moveRule = `0/${ret.moveRule.slice(slashindex + 1)}`;
			} else {
				ret.moveRule = `${(parseInt(ret.moveRule.slice(0,slashindex)) + 1).toString()}/${ret.moveRule.slice(slashindex + 1)}`;
			}
		}

		// delete captured piece en passant
		if (move.enpassant) {
			delete ret.startingPosition[pawnThatDoublePushedKey];
			if (ret.specialRights) delete ret.specialRights[pawnThatDoublePushedKey];
		}

		// update en passant
		if (move.type.startsWith('pawns') && Math.abs(move.endCoords[1] - move.startCoords[1]) === 2) {
			ret.enpassant = [move.endCoords[0], (move.startCoords[1] + move.endCoords[1]) / 2];
		} else delete ret.enpassant;

		// update coords of castled piece
		if (move.castle) {
			const castleString = move.castle.coord[0].toString() + "," + move.castle.coord[1].toString();
			ret.startingPosition[`${(parseInt(move.endCoords[0]) - move.castle.dir).toString()},${move.endCoords[1].toString()}`] = `${ret.startingPosition[castleString]}`;
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
 * @returns {Object} Output move as JSON: { startCoords, endCoords, promotion }
 */
function ShortToLong_CompactMove(shortmove) {
	let coords = shortmove.match(/-?[0-9]+,-?[0-9]+/g); // ['1,2','3,4']
	// Make sure the move contains exactly 2 coordinates.
	if (coords.length !== 2) throw new Error(`Short move does not contain 2 valid coordinates: ${JSON.stringify(coords)}`);
	coords = coords.map((movestring) => { return getCoordsFromString(movestring); }); // [[1,2],[3,4]]
	// Make sure the parsed number is not Infinity
	coords.forEach((coords) => { // coords = [1,2]
		if (!isFinite(coords[0])) throw new Error(`Move coordinate must not be Infinite. coords: ${coords}`);
		if (!isFinite(coords[1])) throw new Error(`Move coordinate must not be Infinite. coords: ${coords}`);
	});
	// ShortToInt_Piece() will already throw an error if the piece abbreviation is invalid.
	const promotedPiece = (/[a-zA-Z]+/.test(shortmove) ? ShortToInt_Piece(shortmove.match(/[a-zA-Z]+/)) : "");
	const longmove = { compact: shortmove };
	longmove.startCoords = coords[0];
	longmove.endCoords = coords[1];
	if (promotedPiece != "") {
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

	if (shortposition.length != 0) shortposition = shortposition.slice(0,-1); // Trim off the final |
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
 * @param {string | undefined} castleWith - If castling is allowed, this is what piece the king can castle with (e.g., "rooks"), otherwise leave it undefined
 * @returns {Object} The specialRights gamefile property, in the form 'x,y':true, where true means the piece at that location has their special move ability (pawn double push, castling rights..)
 */
function generateSpecialRights(position, pawnDoublePush, castleWith) {
	const specialRights = {};
	const kingsFound = {}; // Running list of kings discovered, 'x,y':'white'
	const castleWithsFound = {}; // Running list of pieces found that are able to castle (e.g. rooks), 'x,y':'black'

	for (const key in position) {
		const thisPiece = position[key]; // e.g. "pawnsW"
		if (pawnDoublePush && thisPiece.startsWith('pawns')) specialRights[key] = true;
		else if (castleWith && thisPiece.startsWith('kings')) {
			specialRights[key] = true;
			kingsFound[key] = getPieceColorFromType(thisPiece);
		}
		else if (castleWith && thisPiece.startsWith(castleWith)) {
			castleWithsFound[key] = getPieceColorFromType(thisPiece);
		}
	}

	// Only give the pieces that can castle their special move ability
	// if they are the same row and color as a king!
	if (Object.keys(kingsFound).length === 0) return specialRights; // Nothing can castle, return now.
	outerFor: for (const coord in castleWithsFound) { // 'x,y':'white'
		const coords = getCoordsFromString(coord); // [x,y]
		for (const kingCoord in kingsFound) { // 'x,y':'white'
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
 * Returns the color of the provided piece type
 * @param {string} type - The type of the piece (e.g., "pawnsW")
 * @returns {string} The color of the piece, "white", "black", or "neutral"
 */
function getPieceColorFromType(type) {
	// If the last letter of the piece type is 'W', the piece is white.
	if (type.endsWith('W')) return "white";
	else if (type.endsWith('B')) return "black";
	else if (type.endsWith('N')) return "neutral";
	else throw new Error(`Cannot get color of piece with type "${type}"!`);
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
		end_index = shortposition.slice(index).search(/\+|\|/); // end of current piece coordinates, counted from index
		if (end_index != -1) {
			if (shortposition[index + end_index] == "+") {
				const coordString = shortposition.slice(index + piecelength, index + end_index);
				startingPosition[coordString] = ShortToInt_Piece(shortpiece);
				specialRights[coordString] = true;
				index += end_index + 2;
			} else {
				startingPosition[shortposition.slice(index + piecelength, index + end_index)] = ShortToInt_Piece(shortpiece);
				index += end_index + 1;
			}
		} else {
			if (shortposition.slice(-1) == "+") {
				const coordString = shortposition.slice(index + piecelength, -1);
				startingPosition[coordString] = ShortToInt_Piece(shortpiece);
				specialRights[coordString] = true;
				index = MAX_INDEX;
			} else {
				startingPosition[shortposition.slice(index + piecelength)] = ShortToInt_Piece(shortpiece);
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

/////////// TESTS /////////////

// try{
//     // Example game converted from long to short format in three different levels of move compactness
//     const gameExample = 
//     {"metadata":{"Variant":"Classical","Version":"1","White":"Tom","Black":"Ben","TimeControl":"10+5","Date":"2024/03/17 13:42:06","Result":"0-1","Condition":"checkmate"},"turn":"white","moveRule":"0/100","fullMove":1,"gameRules":{"slideLimit":16,"promotionRanks":[8,1],"promotionsAllowed":{"white":["queens","rooks","bishops","knights"],"black":["queens","rooks","bishops","knights"]},"ovenTemperature": 350,"winConditions":{"white":["checkmate"],"black":["checkmate"]}},"specialRights":{"1,2":true,"2,2":true,"3,2":true,"4,2":true,"5,2":true,"6,2":true,"7,2":true,"8,2":true,"1,7":true,"2,7":true,"3,7":true,"4,7":true,"5,7":true,"6,7":true,"7,7":true,"8,7":true,"1,1":true,"5,1":true,"8,1":true,"1,8":true,"5,8":true,"8,8":true},"startingPosition":{"1,2":"pawnsW","2,2":"pawnsW","3,2":"pawnsW","4,2":"pawnsW","5,2":"pawnsW","6,2":"pawnsW","7,2":"pawnsW","8,2":"pawnsW","1,7":"pawnsB","2,7":"pawnsB","3,7":"pawnsB","4,7":"pawnsB","5,7":"pawnsB","6,7":"pawnsB","7,7":"pawnsB","8,7":"pawnsB","1,1":"rooksW","8,1":"rooksW","1,8":"rooksB","8,8":"rooksB","2,1":"knightsW","7,1":"knightsW","2,8":"knightsB","7,8":"knightsB","3,1":"bishopsW","6,1":"bishopsW","3,8":"bishopsB","6,8":"bishopsB","4,1":"queensW","4,8":"queensB","5,1":"kingsW","5,8":"kingsB"},"moves":[{"type":"pawnsW","startCoords":[4,2],"endCoords":[4,4]},{"type":"pawnsB","startCoords":[4,7],"endCoords":[4,6]},{"type":"pawnsW","startCoords":[4,4],"endCoords":[4,5]},{"type":"pawnsB","startCoords":[3,7],"endCoords":[3,5]},{"type":"pawnsW","startCoords":[4,5],"endCoords":[3,6],"captured":"pawnsB","enpassant":-1},{"type":"bishopsB","startCoords":[6,8],"endCoords":[3,11]},{"type":"pawnsW","startCoords":[3,6],"endCoords":[2,7],"captured":"pawnsB"},{"type":"bishopsB","startCoords":[3,11],"endCoords":[-4,4]},{"type":"pawnsW","startCoords":[2,7],"endCoords":[1,8],"captured":"rooksB","promotion":"queensW"},{"type":"bishopsB","startCoords":[-4,4],"endCoords":[2,-2],"check":true},{"type":"kingsW","startCoords":[5,1],"endCoords":[4,2]},{"type":"knightsB","startCoords":[7,8],"endCoords":[6,6]},{"type":"queensW","startCoords":[1,8],"endCoords":[2,8],"captured":"knightsB"},{"type":"kingsB","startCoords":[5,8],"endCoords":[7,8],"castle":{"dir":1,"coord":[8,8]}},{"type":"queensW","startCoords":[2,8],"endCoords":[1,7],"captured":"pawnsB"},{"type":"queensB","startCoords":[4,8],"endCoords":[0,4]},{"type":"queensW","startCoords":[1,7],"endCoords":[7,13],"check":true},{"type":"kingsB","startCoords":[7,8],"endCoords":[8,8]},{"type":"queensW","startCoords":[7,13],"endCoords":[7,7],"captured":"pawnsB","check":true},{"type":"kingsB","startCoords":[8,8],"endCoords":[7,7],"captured":"queensW"},{"type":"pawnsW","startCoords":[8,2],"endCoords":[8,4]},{"type":"queensB","startCoords":[0,4],"endCoords":[4,4],"check":true,"mate":true}]}
//     const outputNice = LongToShort_Format(gameExample);
//     console.log("Game in short format with nice moves:\n\n" + outputNice + "\n");
//     const outputMoreCompact = LongToShort_Format(gameExample, { compact_moves: 1 });
//     console.log("Game in short format with more compact moves:\n\n" + outputMoreCompact + "\n");
//     const outputMostCompact = LongToShort_Format(gameExample, { compact_moves: 2 });
//     console.log("Game in short format with most compact moves:\n\n" + outputMostCompact + "\n");

//     // Converted back to long format
//     const gameExampleBackToLong = ShortToLong_Format(outputNice, true, true);
//     console.log("Converted back to long format:\n\n" + JSON.stringify(gameExampleBackToLong)+ "\n");

//     // Position after 21 halfmoves:
//     const position = GameToPosition(gameExample, 21, false);
//     console.log("Position after 21 half moves in long format:\n\n" + JSON.stringify(position));
//     console.log("Position after 21 half moves in short format:\n\n" + LongToShort_Format(position));

//     // String test:
//     console.log('\nTest:\n\n' + JSON.stringify(ShortToLong_Format(' 3,4 3 w 3232098/2319080123213 K3,3+ {"asdds}sd a": 2332, "{nes(|)t}" : { "nes t2": "233 22" } } [asa: adsdsa] checkmate,asd (|4;q) ')) + '\n');

//     // String test - no position:
//     console.log('Test (no moves):\n\n' + JSON.stringify(ShortToLong_Format('[Variant: Classical] w 0/100 1 (8|1) R8,1>11,1|r8,8>11,8', false, false)) + '\n');

//     // String test - illegal moves:
//     console.log('Test (illegal moves):\n\n' + JSON.stringify(ShortToLong_Format('[Variant: Classical]  w 0/100 1 (8|1) P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|R1,1+|R8,1+|r1,8+|r8,8+|N2,1|N7,1|n2,8|n7,8|B3,1|B6,1|b3,8|b6,8|Q4,1|q4,8|K5,1+|k5,8+  P6,2>10,8=Q NAN62,22>120,82=nan NAN3,1>3,8=n{great move} P6,7x5,6{what a move}n8,7x5,7{ha ha}')) + '\n');

//     // Move conversion
//     console.log(JSON.stringify(ShortToLong_CompactMove('2,-3>3,-4ha')));
//     console.log(LongToShort_CompactMove({"startCoords":[2,-3],"endCoords":[3,-4],"promotion":"hawksB"}));

//     // specialMoves reconstruction, given the position, pawnDoublePush gamerule, and castleWith gamerule
//     const positionExample = {"1,2":"pawnsW","2,2":"pawnsW","3,2":"pawnsW","4,2":"pawnsW","5,2":"pawnsW","6,2":"pawnsW","7,2":"pawnsW","8,2":"pawnsW","1,7":"pawnsB","2,7":"pawnsB","3,7":"pawnsB","4,7":"pawnsB","5,7":"pawnsB","6,7":"pawnsB","7,7":"pawnsB","8,7":"pawnsB","1,1":"rooksW","8,1":"rooksW","1,8":"rooksB","8,8":"rooksB","2,1":"knightsW","7,1":"rooksW","2,8":"knightsB","7,8":"knightsB","3,1":"bishopsW","6,1":"bishopsW","3,8":"bishopsB","6,8":"bishopsB","4,1":"queensW","4,8":"queensB","5,1":"kingsW","5,8":"kingsB"};
//     const specialMoves = generateSpecialRights(positionExample, true, "rooks")
//     console.log(`\nspecialMoves reconstruction example:\n\n${JSON.stringify(specialMoves)}`)

//     // Compressing of a variant's starting position, only provided the pawnDoublePush and castleWith gamerules.
//     const a = {"1,2": "pawnsW","2,2": "pawnsW","3,2": "pawnsW","4,2": "pawnsW","5,2": "pawnsW","6,2": "pawnsW","7,2": "pawnsW","8,2": "pawnsW","1,7": "pawnsB","2,7": "pawnsB","3,7": "pawnsB","4,7": "pawnsB","5,7": "pawnsB","6,7": "pawnsB","7,7": "pawnsB","8,7": "pawnsB","1,1": "rooksW","8,1": "rooksW","1,8": "rooksB","8,8": "rooksB","2,1": "knightsW","7,1": "knightsW","2,8": "knightsB","7,8": "knightsB","3,1": "bishopsW","6,1": "bishopsW","3,8": "bishopsB","6,8": "bishopsB","4,1": "queensW","4,8": "queensB","5,1": "kingsW","5,8": "kingsB"}
//     const b = LongToShort_Position_FromGamerules(a, true, 'rooks');
//     console.log(`\n\nCompressing of a variant's starting position example:\n\n${JSON.stringify(b)}`)

//     // Speed test, put large position in "longposition.txt"
//     import fs from 'fs'; // supported in Node.js
//     fs.readFile("longposition.txt", (err, data) => {
//         if (err) return;
//         const gameExampleLong = JSON.parse(data);
//         console.log("\nTimer Start with " + Object.keys(gameExampleLong.startingPosition).length + " pieces and " + gameExampleLong.moves.length + " moves.");
//         const start_time = Date.now();
//         const outputLong = LongToShort_Format(gameExampleLong);
//         const med_time = Date.now();
//         console.log("Long to short: " + (med_time - start_time) / 1000);
//         ShortToLong_Format(outputLong, true, true);
//         console.log("Short to long: " +  (Date.now() - med_time) / 1000);
//     });

// } catch(e){
//     console.log(e);
// }

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