/* eslint-disable max-depth */

'use strict';

import jsutil from "../../util/jsutil.js";
import coordutil from "../util/coordutil.js";
import { rawTypes as r, ext as e, players as p } from "../util/typeutil.js";
import typeutil from "../util/typeutil.js";
import icnconverter, { default_promotions, default_win_conditions, excludedGameRules, metadata_key_ordering, player_codes, player_codes_inverted } from "./icn/icnconverter.js";

/** @typedef {import("../../game/chess/gameformulator.js").FormatConverterLong} FormatConverterLong */
/** @typedef {import("../util/coordutil.js").CoordsKey} CoordsKey */
/** @typedef {import("./movepiece.js").Move} Move */

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
		if (!(player in player_codes)) throw new Error(`Invalid color '${player}' when parsing turn order when copying game!`);
		return player_codes[player];
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
	if (longformat.fullMove) {
		shortformat += `${longformat.fullMove} `;
	}

	// promotion lines, currently assumes that "promotionRanks" is always defined as a list of length 2, if it is defined
	if (longformat.gameRules) {
		if (longformat.gameRules.promotionRanks) {
			shortformat += "(";
			if (longformat.gameRules.promotionRanks[p.WHITE].length > 0) {
				shortformat += longformat.gameRules.promotionRanks[p.WHITE].join(',');
				const promotionListWhite = (longformat.gameRules.promotionsAllowed ? longformat.gameRules.promotionsAllowed[p.WHITE] : null);
				// Only add the legal promotions to the ICN if they aren't the default
				if (promotionListWhite && !icnconverter.isPromotionListDefaultPromotions(promotionListWhite)) {
					shortformat += ";";
					for (const longpiece of promotionListWhite) {
						shortformat += `${icnconverter.getAbbrFromType(longpiece + e.W)},`;
					}
					shortformat = shortformat.slice(0, -1);
				}
			}
			shortformat += "|";
			if (longformat.gameRules.promotionRanks[p.BLACK].length > 0) {
				shortformat += longformat.gameRules.promotionRanks[p.BLACK].join(',');
				const promotionListBlack = (longformat.gameRules.promotionsAllowed ? longformat.gameRules.promotionsAllowed[p.BLACK] : null);
				// Only add the legal promotions to the ICN if they aren't the default
				if (promotionListBlack && !icnconverter.isPromotionListDefaultPromotions(promotionListBlack)) {
					shortformat += ";";
					for (const longpiece of promotionListBlack) {
						shortformat += `${icnconverter.getAbbrFromType(longpiece + e.B)},`;
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
	if (longformat.moves) {
		// If the moves are provided like: ['1,2>3,4','5,6>7,8N'], then quick return!
		// THE SERVER SIDE sends them in this format!
		if (typeof longformat.moves[0] === 'string') shortformat += longformat.moves.join('|');
		else { // Add the moves the usual way, parsing the gamefile's Move[]
			const options = {
				compact: false,
				spaces: false,
				comments: false,
				move_numbers: false,
				// Required if adding move numbers:
				// make_new_lines: true,
				// turnOrder: longformat.gameRules.turnOrder,
				// fullmove: longformat.fullMove,
			};
			shortformat += icnconverter.getShortFormMovesFromMoves(longformat.moves, options);
		}
	}

	return shortformat;
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
	longformat.metadata = {};
	longformat.gameRules = {};

	// variables keeping track of whether we are currently parsing metadata
	let in_metadata_parsing_mode = false;
	let metadata_key = "";
	let metadata_value = "";

	// variables keeping track of whether we are currently parsing gamerules (can only be parsed once)
	let in_gamerules_parsing_mode = false;
	let gamerules_string = "";

	while (shortformat !== "") {
		if (/\s/.test(shortformat[0])) {
			shortformat = shortformat.slice(1);
			continue;
		}
		let index = shortformat.search(/\s/);
		if (index === -1) index = shortformat.length;
		let string = shortformat.slice(0,index);
		shortformat = shortformat.slice(index + 1);

		// metadata key is read: enter metadata parsing mode, if string starts with [ and letter
		if (!in_metadata_parsing_mode && !in_gamerules_parsing_mode && /^\[[a-zA-Z]/.test(string)) {
			in_metadata_parsing_mode = true;
			metadata_key = string.slice(1);
			continue;
		}

		// Read metadata value, if in metadata parsing mode
		if (in_metadata_parsing_mode) {
			// remove " from the start of string if possible
			if (/^"/.test(string) && metadata_value === "") {
				string = string.slice(1);
			}

			// metadata_value is not fully parsed in yet
			if (!/"\]$/.test(string)) {
				metadata_value += `${string} `;
			}
			// metadata_value is fully parsed in now: set metadata and exit metadata parsing mode
			else {
				metadata_value += string.slice(0, -2);
				longformat.metadata[metadata_key] = metadata_value;
				in_metadata_parsing_mode = false;
				metadata_value = "";
			}
			continue;
		}

		// gamerules - start: read in string and enter gamerules parsing mode, if string starts with {
		if (!in_metadata_parsing_mode && !in_gamerules_parsing_mode && /^\{/.test(string) && gamerules_string === "") {
			in_gamerules_parsing_mode = true;
			gamerules_string = string;
			string = ""; // this line is used instead of continue; so that we immediately enter the gamerules continuation below and check if isJson(gamerules_string)
		}

		// Read gamerules continuation, if in gamerules parsing mode
		if (in_gamerules_parsing_mode) {
			if (string !== "") gamerules_string += ` ${string}`;

			// gamerules_string can be parsed into JSON now: parse it in and permanently exit gamerules parsing mode
			if (jsutil.isJson(gamerules_string)) {
				const parsedGameRules = JSON.parse(gamerules_string);
				longformat.gameRules = {...longformat.gameRules, ...parsedGameRules};
				in_gamerules_parsing_mode = false;
			}
			continue;
		}

		// turn order
		if (!longformat.gameRules.turnOrder && /^[a-z]{1,2}(:[a-z]{1,2})*$/.test(string)) {
			if (string === 'w') string = 'w:b'; // 'w' is short for 'w:b'
			else if (string === 'b') string = 'b:w'; // 'b' is short for 'b:w'
			const turnOrderArray = string.split(':'); // ['w','b']
			longformat.gameRules.turnOrder = [...turnOrderArray.map(playerabbrev => {
				if (!(playerabbrev in player_codes_inverted)) throw new Error(`Unknown color abbreviation "${playerabbrev}" when parsing turn order while pasting game!`);
				return Number(player_codes_inverted[playerabbrev]);
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
				[p.WHITE]: whitePromotions === undefined && whiteInfo.length > 0 ? default_promotions : whitePromotions !== undefined && whitePromotions.length > 0 ? whitePromotions.split(',').map(abv => typeutil.getRawType(icnconverter.getTypeFromAbbr(abv))) : [],
				[p.BLACK]: blackPromotions === undefined && blackInfo.length > 0 ? default_promotions : blackPromotions !== undefined && blackPromotions.length > 0 ? blackPromotions.split(',').map(abv => typeutil.getRawType(icnconverter.getTypeFromAbbr(abv))) : []
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
			const parsedMoves = icnconverter.parseShortFormMoves(shortmoves); // { moveDraft, comment }[]
			if (parsedMoves.length > 0) longformat.moves = parsedMoves.map(parsedMove => icnconverter.getCompactMoveFromDraft(parsedMove.moveDraft));
			if (!longformat.gameRules.winConditions) longformat.gameRules.winConditions = default_win_conditions; // Default win conditions if none specified
			longformat.gameRules.turnOrder = longformat.gameRules.turnOrder ?? [p.WHITE, p.BLACK]; // Default turn order if none specified
			longformat.fullMove = longformat.fullMove ?? 1;
			return longformat;
		}
	}
	if (!longformat.gameRules.winConditions) longformat.gameRules.winConditions = default_win_conditions; // Default win conditions if none specified
	longformat.gameRules.turnOrder = longformat.gameRules.turnOrder ?? [p.WHITE, p.BLACK]; // Default turn order if none specified
	longformat.fullMove = longformat.fullMove ?? 1;
	return longformat;
}

/**
 * Converts a gamefile in JSON format to single position gamefile in JSON format with deleted "moves" object
 * 
 * TODO: UPDATE THIS METHOD TO UTILIZE the changes arrays in the moves instead of manually checking for promotion,
 * enpassant, and castle flags!!! This will make it future proof. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
 * 
 * @param {Object} longformat - Input gamefile in JSON format
 * @param {number} [halfmoves] - Number of halfmoves from starting position (Infinity: final position of game)
 * @param {boolean} [modify_input] - If false, a new object is created and returned. If true, the input object is modified (which is faster)
 * @returns {Object} Output gamefile in JSON format
 */
function GameToPosition(longformat, halfmoves = 0, modify_input = false) {
	if (typeof longformat.startingPosition === 'string') throw new Error('startingPosition must be in json format!');
    
	if (!longformat.moves || longformat.moves.length === 0) return longformat;
	const ret = modify_input ? longformat : jsutil.deepCopyObject(longformat);
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
			ret.startingPosition[endString] = move.promotion;
		} else {
			ret.startingPosition[endString] = ret.startingPosition[startString];
		}
		delete ret.startingPosition[startString];
		if (ret.specialRights) {
			ret.specialRights.delete(startString);
			ret.specialRights.delete(endString);
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
			if (ret.specialRights) ret.specialRights.delete(pawnThatDoublePushedKey);
		}

		// update en passant
		// TODO: Doesn't the move object contain the enpassantCreate special flag? Let's read that instead
		if (rawType === r.PAWN && Math.abs(move.endCoords[1] - move.startCoords[1]) === 2) {
			ret.enpassant = [move.endCoords[0], (move.startCoords[1] + move.endCoords[1]) / 2];
		} else delete ret.enpassant;

		// update coords of castled piece
		if (move.castle) {
			const castleString = move.castle.coord[0].toString() + "," + move.castle.coord[1].toString();
			ret.startingPosition[`${(Number(move.endCoords[0]) - move.castle.dir)},${move.endCoords[1]}`] = ret.startingPosition[castleString];
			delete ret.startingPosition[castleString];
			if (ret.specialRights) ret.specialRights.delete(castleString);
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
 * Accepts a gamefile's starting position and specialRights properties, returns the position in compressed notation (.e.g., "P5,6+|k15,-56|Q5000,1")
 * @param {Record<CoordsKey,number>} position - The starting position of the gamefile, in the form 'x,y':'pawnsW'
 * @param {Set<CoordsKey>} [specialRights] - Optional. The special rights of each piece in the gamefile, in the form 'x,y':true, where true means the piece at that coordinate can perform their special move (pawn double push, castling rights..)
 * @returns {string} The position of the game in compressed form, where each piece with a + has its special move ability
 */
function LongToShort_Position(position, specialRights) {
	let shortposition = "";
	if (!position) return shortposition; // undefined position --> no string
	let firstPiece = true;
	for (const coordsKey in position) {
		const pieceDelimiter = firstPiece ? "" : "|";
		const pieceAbbr = icnconverter.getAbbrFromType(position[coordsKey]);
		const specialRightsString = specialRights.has(coordsKey) ? '+' : '';
		shortposition += pieceDelimiter + pieceAbbr + coordsKey + specialRightsString;
		firstPiece = false;
	}
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
	const specialRights = new Set();
	const kingsFound = {}; // Running list of kings discovered, 'x,y': player
	const castleWithsFound = {}; // Running list of pieces found that are able to castle (e.g. rooks), 'x,y': player

	for (const key in position) {
		const thisPiece = position[key]; // e.g. "pawnsW"
		if (pawnDoublePush && typeutil.getRawType(thisPiece) === r.PAWN) specialRights.add(key);
		else if (castleWith && typeutil.getRawType(thisPiece) === r.KING) {
			specialRights.add(key);
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
		const coords = coordutil.getCoordsFromKey(coord); // [x,y]
		for (const kingCoord in kingsFound) { // 'x,y': player
			const kingCoords = coordutil.getCoordsFromKey(kingCoord); // [x,y]
			if (coords[1] !== kingCoords[1]) continue; // Not the same y level
			if (castleWithsFound[coord] !== kingsFound[kingCoord]) continue; // Their players don't match
			const xDist = Math.abs(coords[0] - kingCoords[0]);
			if (xDist < 3) continue; // Not ateast 3 squares away
			specialRights.add(coord); // Same row and color as the king! This piece can castle.
			// We already know this piece can castle, we don't
			// need to see if it's on the same rank as any other king
			continue outerFor;
		}
	}
	return specialRights;
}

/**
 * Takes the position in compressed short form and returns the startingPosition and specialRights properties of the gamefile
 * @param {string} shortposition - The compressed position of the gamefile (e.g., "K5,4+|P1,2|r500,25389")
 * @returns {Object} An object containing 2 properties: startingPosition, and specialRights
 */
function getStartingPositionAndSpecialRightsFromShortPosition(shortposition) {
	// console.log("Parsing shortposition:", shortposition);
	
	const startingPosition = {};
	const specialRights = new Set();
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
				startingPosition[coordString] = icnconverter.getTypeFromAbbr(shortpiece);
				specialRights.add(coordString);
				index += end_index + 2;
			} else {
				startingPosition[shortposition.slice(index + piecelength, index + end_index)] = icnconverter.getTypeFromAbbr(shortpiece);
				index += end_index + 1;
			}
		} else {
			if (shortposition.slice(-1) === "+") {
				const coordString = shortposition.slice(index + piecelength, -1);
				startingPosition[coordString] = icnconverter.getTypeFromAbbr(shortpiece);
				specialRights.add(coordString);
				index = MAX_INDEX;
			} else {
				startingPosition[shortposition.slice(index + piecelength)] = icnconverter.getTypeFromAbbr(shortpiece);
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

export default {
	LongToShort_Format,
	ShortToLong_Format,
	GameToPosition,
	LongToShort_Position,
	LongToShort_Position_FromGamerules,
	getStartingPositionAndSpecialRightsFromShortPosition,
	generateSpecialRights,
};