/* eslint-disable max-depth */

'use strict';

import jsutil from "../../util/jsutil.js";
import { players as p } from "../util/typeutil.js";
import typeutil from "../util/typeutil.js";
import icnconverter, { default_promotions, player_codes_inverted } from "./icn/icnconverter.js";

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
		if (longformat.moveRuleState === undefined && /^([0-9]+\/[0-9]+)$/.test(string)) {
			const [state, rule] = string.split("/");
			longformat.moveRuleState = Number(state);
			longformat.gameRules.moveRule = Number(rule);
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
			const { startingPosition, specialRights } = icnconverter.generatePositionFromShortForm(string);
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

export default {
	ShortToLong_Format,
};