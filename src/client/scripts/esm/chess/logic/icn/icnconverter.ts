
/**
 * Universal Infinite Chess Notation [Converter] and Interface
 * 
 * This script converts games from a JSON notation to a
 * compact ICN (Infinite Chess Noation) and back,
 * still human-readable, but taking less space to describe positions.
 */

import jsutil from "../../../util/jsutil.js";
import coordutil, { Coords, CoordsKey } from "../../util/coordutil.js";
import { rawTypes as r, ext as e, players as p, RawType, Player, PlayerGroup } from "../../util/typeutil.js";
import typeutil from "../../util/typeutil.js";
import icncommentutils, { CommandObject } from "./icncommentutils.js";


import type { MetaData } from "../../util/metadata.js";
import type { GlobalGameState } from "../state.js";
// @ts-ignore
import type { GameRules } from "../../variants/gamerules.js";


// Type Definitions -------------------------------------------------------------------


interface LongFormatIn extends LongFormatBase {
	moves?: _Move_In[]
}

interface LongFormatOut extends LongFormatBase {
	moves?: _Move_Out[]
}

interface LongFormatBase {
	metadata: MetaData
	position?: Map<CoordsKey, number>
	gameRules: {
		turnOrder: Player[]
		winConditions: PlayerGroup<string[]>
		moveRule?: number
		promotionRanks?: PlayerGroup<number[]>
		promotionsAllowed?: PlayerGroup<RawType[]>
	}
	fullMove: number,
	global_state: GlobalGameState
}

/** The named capture groups of a shortform move. */
type NamedCaptureMoveGroups = {
	startCoordsKey: CoordsKey,
	endCoordsKey: CoordsKey,
	/** The piece abbreviation of the promoted piece, if present. */
	promotionAbbr?: string,
	/**
	 * An un-parsed comment on a move. This may contain embeded command sequences.
	 * However it won't include the opening "{" or closing "}" braces.
	 */
	comment?: string
};

/** Same as {@link _Move_In}, but with additional information we may want to prettify the shortform with. */
interface _Move_In extends _Move_Out {
	/** The type of piece moved */
	type?: number,
	flags?: {
		/** Whether the move delivered check. */
		check: boolean,
		/** Whether the move delivered mate (or the killing move). */
		mate: boolean,
		/** Whether the move caused a capture */
		capture: boolean,
	}
}

/** Information pullable from moves in shortform notation. */
/** The move in most compact notation: `8,7>8,8=Q` */
interface _Move_Out extends _Move_Compact {
	compact: string,
	/**
	 * Any human-readable comment made on the move, specified in the ICN.
	 * This will go back into the ICN when copying the game.
	 */
	comment?: string,
	/** How much time the player had left after they made their move, in millis. */
	clockStamp?: number,
}

/** Minimum information of a move needed to generate its most compact shortform. */
interface _Move_Compact {
	startCoords: Coords,
	endCoords: Coords,
	/** Present if the move was a special-move promotion. This is the integer type of the promoted piece. */
	promotion?: number,
}

// Dictionaries -----------------------------------------------------------------------


/**
 * 1-2 letter codes for each player number.
 * This is used for the specifying turn order in ICN.
 */
const player_codes = {
	[p.NEUTRAL]: "n", // I dont think we need this, good to have in case
	[p.WHITE]: "w",
	[p.BLACK]: "b",
	// Colored players
	[p.RED]: "r",
	[p.BLUE]: "bu",
	[p.YELLOW]: "y",
	[p.GREEN]: "g",
} as const;
const player_codes_inverted = jsutil.invertObj(player_codes);

type PlayerCode = typeof player_codes[keyof typeof player_codes];

/** 1-2 letter codes for the standard white, black, and neutral pieces. */
const piece_codes = {
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
	// Neutrals
	[r.OBSTACLE + e.N]: "ob",
	[r.VOID + e.N]: "vo"
};
const piece_codes_inverted = jsutil.invertObj(piece_codes);

/** The codes for raw, color-less piece types. */
const piece_codes_raw = {
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
	// Neutrals
	[r.OBSTACLE]: "ob",
	[r.VOID]: "vo"
};
const piece_codes_raw_inverted = jsutil.invertObj(piece_codes_raw);

/** The desired ordering metadata should be placed in the ICN */
const metadata_ordering: (keyof MetaData)[] = [
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

/**
 * The default promotions allowed, if the ICN does not specify.
 * If, when converting a game into ICN, the promotionsAllowed
 * gamerule matches this, then we won't specify custom promotions in the ICN.
 */
const default_promotions =  [r.QUEEN, r.ROOK, r.BISHOP, r.KNIGHT];

const default_win_condition = 'checkmate';

/** Gamerules that will not be stringified into the ICN */
const excludedGameRules = new Set(["promotionRanks", "promotionsAllowed", "winConditions", "turnOrder", "moveRule"]);


// Regular Expressions ------------------------------------------------------------------------------------


const singleCoordSource = '(?:0|-?[1-9]\\d*)'; // Prevents "-0", or numbers with leading 0's like "000005"
const coordsKeyRegexSource = `${singleCoordSource},${singleCoordSource}`; // '-1,2'

/**
 * Returns a regex for matching a piece abbreviation like '3Q' or 'nr'. '3Q' => Player-3 queen (red)
 * Optionally captures the piece abbreviation, and the player
 * number if present, using custom capture group names.
 * Disallows negatives, or leading 0's
 * 
 * This prevents duplicate capture group names when a bigger regex contains
 * multiple smaller pieceAbbrev regexes, as we can make them different.
 * @param playerCapture - The name of the player capture group. If null, it won't be captured.
 * @param abbrevCapture - The name of the abbrev capture group. If null, it won't be captured.
 */
function getPieceAbbrevRegexSource(playerCapture: string | null, abbrevCapture: string| null): string {
	// Capture group names must not contain special characters used in regex.
	const captureGroupNameRegex = /^[$_A-Za-z][$\w]*$/;
	if (playerCapture !== null && !captureGroupNameRegex.test(playerCapture)) throw Error("Invalid playerCapture group name: " + playerCapture);
	if (abbrevCapture !== null && !captureGroupNameRegex.test(abbrevCapture)) throw Error("Invalid abbrevCapture group name: " + abbrevCapture);
	
	const playerGroup = playerCapture !== null ? `<${playerCapture}>` : ":";
	const abbrevGroup = abbrevCapture !== null ? `<${abbrevCapture}>` : ":";
	return `(?${playerGroup}0|[1-9]\\d*)?(?${abbrevGroup}[A-Za-z]+)`; // Disallows negatives, or leading 0's
}

/**
 * A regex for matching a single piece entry in a shortform position in ICN.
 * For example, 'P1,2+' => Pawn at 1,2 with special right.
 * It captures the piece abbreviation, coords key, and special right into named groups.
 */
const pieceEntryRegexSource = `(?<pieceAbbr>${getPieceAbbrevRegexSource(null, null)})(?<coordsKey>${coordsKeyRegexSource})(?<specialRight>\\+)?`; // 'P1,2+' => Pawn at 1,2 with special right

const promotionRegexSource = `(?:=(?<promotionAbbr>${getPieceAbbrevRegexSource(null, null)}))?`; // '=Q' => Promotion to queen

/**
 * A regex for matching a move in the MOST COMPACT form: '1,7>2,8=Q
 * The start coords, end coords, and promotion abbrev are all captured into named groups.
 */
// const moveRegexCompact = new RegExp(`^(?<startCoordsKey>${coordsKeyRegexSource})>(?<endCoordsKey>${coordsKeyRegexSource})${promotionRegexSource}$`);

/**
 * A regex for dynamically matching all forms of a move in ICN.
 * The move may optionally include a piece abbreviation, spaces between segments,
 * a separator of ">" or "x", check/mate flags "+" or "#", symbols !?, ?!, !!, and a comment.
 * 
 * It captures start coords, end coords, promotion abbrev, and comment into named groups.
 */
const moveRegexSource = 
	`(${getPieceAbbrevRegexSource(null, null)})?` + // Optional starting piece abbreviation "P"   DOESN'T NEED TO BE CAPTURED, this avoids a crash cause of duplicate capture group names
    `(?<startCoordsKey>${coordsKeyRegexSource})` + // Starting coordinates
    ` ?` + // Optional space
    `[>x]` + // Separator
    ` ?` + // Optional space
    `(?<endCoordsKey>${coordsKeyRegexSource})` + // Ending coordinates
    ` ?` + // Optional space
    promotionRegexSource + // Optional promotion ("=" REQUIRED)
    ` ?` + // Optional space
    `[+#]?` + // Optional check/checkmate
    ` ?` + // Optional space
	`(?:[!?]{1,2})?` + // Optional symbols: !?, ?!, !!
	` ?` + // Optional space
    `(?:\\{(?<comment>[^}]+)\\})?` // Optional comment (not-greedy). Comments should NOT contain a closing brace "}".
;


// Helper Functions ---------------------------------------------------------------------------------


/** Tests if the provided array of legal promotions is the default set of promotions. */
function isPromotionListDefaultPromotions(promotionList: RawType[]): boolean {
	if (promotionList.length !== default_promotions.length) return false;
	return default_promotions.every(promotion => promotionList.includes(promotion));
}


// Getting & Parsing Abbreviations --------------------------------------------------------------------------------


/**
 * Gets the 1-2 letter abbreviation of the given piece type.
 * White pieces are capitalized, black pieces are lowercase.
 * If a piece is neither white nor black, its player number
 * will be placed before its abbreviation, overriding the color.
 * 
 * [43] pawn(white) => 'P'
 * [52] queen(black) => 'q'
 * [68] king(red) => '3k'
 */
function getAbbrFromType(type: number): string {
	let short = piece_codes[type];
	if (!short) {
		const [r, p] = typeutil.splitType(type);
		short = String(p) + piece_codes_raw[r];
	}
	return short;
}

/**
 * Gets the integer piece type from a 1-2 letter piece abbreviation.
 * Capitolized abbrev's are white, lowercase are black, or neutral.
 * It may contain a proceeding number, overriding the player color.
 * 
 * 'P' => [43] pawn(white)
 * 'q' => [52] queen(black)
 * '3k' => [68] king(red)
 */
function getTypeFromAbbr(pieceAbbr: string): number {
	const results = new RegExp(`^${getPieceAbbrevRegexSource('player', 'abbrev')}$`).exec(pieceAbbr);
	if (results === null) throw Error(`Piece abbreviation is in invalid form: (${pieceAbbr})`);

	const playerStr = results.groups!['player'];
	const abbrev = results.groups!['abbrev']!;

	let typeStr: string | undefined;

	if (playerStr === undefined) { // No player number override is present
		typeStr = piece_codes_inverted[abbrev];
		if (typeStr === undefined) throw Error(`Unknown piece abbreviation: (${pieceAbbr})`);
		return Number(typeStr);
	} else { // Player number override present   '3Q'
		const rawTypeStr = piece_codes_raw_inverted[abbrev.toLowerCase()];
		if (rawTypeStr === undefined) throw Error(`Unknown raw piece abbreviation: (${pieceAbbr})`);
		return typeutil.buildType(Number(rawTypeStr) as RawType, Number(playerStr) as Player);
	}
}


// Main Functions Converting Games To and From ICN -----------------------------------------------------------------


/**
 * Converts a game in JSON format to Infinite Chess Notation.
 * @param longformat - The game in JSON format. Required properties below.
 * @param longformat.metadata - The metadata of the game. Variant, UTCDate, and UTCTime are required if options.skipPosition = true
 * @param [longformat.position] The position of the game, where the values is the integer piece type at that coordsKey. Required if options.skipPosition = false
 * @param longformat.gameRules - The required gameRules to create the ICN
 * @param longformat.fullMove - The fullMove property of the gamefile (usually 1)
 * @param longformat.global_state - The game's global state. This contains the following properties which change over the duration of a game: `specialRights`, `enpassant`, `moveRuleState`.
 * @param [longformat.moves] - If provided, they will be placed into the ICN
 * @param options - Various styling options for the resulting ICN, mostly affecting the moves section. Descriptions are below.
 * * compact => Exclude piece abbreviations, 'x', '+' or '#' markers => '1,7>2,8=Q'
 *     IF FALSE THEN THE MOVES must have their `type` and `flags` properties!!!
 * * spaces => Spaces between segments of a move. => 'P1,7 x 2,8 =Q +'
 * * comments => Include move comments and clk embeded command sequences => 'P1,7x2,8=Q+{[%clk 0:09:56.7]}'
 * * move_numbers => Include move numbers, prettifying the notation.
 * * make_new_lines => Include line breaks in the ICN, between metadata, and between move numbers.
 */
function LongToShort_Format(longformat: LongFormatIn, options: { skipPosition?: true, compact: boolean; spaces: boolean; comments: boolean; make_new_lines: boolean, move_numbers: boolean}): string {

	/** Will contain the Metadata, Positon, and Move sections. */
	const segments: string[] = [];


	// =================================== Section 1: Metadata ===================================


	const metadataSegments: string[] = [];

	// Appended in the correct order given by metadata_key_ordering
	const metadataCopy = jsutil.deepCopyObject(longformat.metadata);
	for (const metadata_name of metadata_ordering) {
		if (metadataCopy[metadata_name] === undefined) continue;
		metadataSegments.push(`[${metadata_name} "${metadataCopy[metadata_name]}"]`);
		delete metadataCopy[metadata_name];
	}
	// Are there any remaining we missed?
	if (Object.keys(metadataCopy).length > 0) throw Error(`metadata_ordering is missing metadata keys (${Object.keys(metadataCopy).join(", ")})`);

	if (metadataSegments.length > 0) {
		const metadataDelimiter = options.make_new_lines ? '\n' : ' ';
		segments.push(metadataSegments.join(metadataDelimiter));
	}


	// =================================== Section 2: Position ===================================


	const positionSegments: string[] = [];

	/**
	 * The ordering goes:
	 * 
	 * Turn order
	 * Move rule
	 * Full move counter
	 * Promotion lines
	 * Win conditions
	 * Extra gamerules
	 * Position
	 * 
	 * As an example:
	 * 
	 * w 0/100 1 (8;Q,R,B,N|1;q,r,b,n) checkmate {"slideLimit": 100, "cannotPassTurn": true} P1,2+|P2,2+|P3,2+|P4,2+|P5,2+
	 */


	// Turn order
	const turnOrderArray: PlayerCode[] = longformat.gameRules.turnOrder.map(player => {
		if (!(player in player_codes)) throw new Error(`No player code found for player (${player})!`);
		return player_codes[player];
	});
	let turn_order = turnOrderArray.join(':'); // 'w:b'
	if (turn_order === 'w:b') turn_order = 'w'; // Short for 'w:b'
	else if (turn_order === 'b:w') turn_order = 'b'; // Short for 'b:w'
	positionSegments.push(turn_order);


	// En passant
	if (longformat.global_state.enpassant) positionSegments.push(coordutil.getKeyFromCoords(longformat.global_state.enpassant.square)); // '1,3'


	// 50 Move Rule
	if (longformat.gameRules.moveRule !== undefined || longformat) {
		// Make sure both moveRule and moveRuleState are present
		if (longformat.global_state.moveRuleState === undefined) throw Error("moveRuleState must be present when convering a game with moveRule to shortform!");
		if (longformat.gameRules.moveRule === undefined) throw Error("moveRule must be present when convering a game with moveRuleState to shortform!");

		positionSegments.push(`${longformat.global_state.moveRuleState}/${longformat.gameRules.moveRule}`); // '0/100'
	}


	// Full move counter
	positionSegments.push(String(longformat.fullMove));


	// Promotion lines
	if (longformat.gameRules.promotionRanks || longformat.gameRules.promotionsAllowed) {
		// Make sure both promotionRanks and promotionsAllowed are present
		if (!longformat.gameRules.promotionRanks) throw Error("promotionRanks must be present when converting a game with promotionsAllowed to shortform!");
		if (!longformat.gameRules.promotionsAllowed) throw Error("promotionsAllowed must be present when converting a game with promotionRanks to shortform!");

		const promotionRanksCopy = jsutil.deepCopyObject(longformat.gameRules.promotionRanks);
		const promotionsAllowedCopy = jsutil.deepCopyObject(longformat.gameRules.promotionsAllowed);

		const playerSegments: string[] = []; // ['8,17','1,10']
		for (const player of longformat.gameRules.turnOrder) {
			const playerSegment: string[] = []; // ['8,17','n,r,b,q']

			const ranks = promotionRanksCopy[player] ?? [];
			if (ranks.length === 0) {
				// They have no promotions, but still add them. For example it may look like '(8|)'
				playerSegments.push('');
				continue;
			}
			const ranksString = ranks.join(',');
			playerSegment.push(ranksString);

			const promotions: RawType[] = promotionsAllowedCopy[player] ?? [];
			if (promotions.length === 0) throw Error(`Player was given promotion ranks, but no promotions allowed! (${player}: ${ranksString})`);
			if (!isPromotionListDefaultPromotions(promotions)) {
				const promotionsAbbrevs = promotions.map(type => piece_codes_raw[type].toUpperCase()).join(','); // 'N,R,B,Q'
				playerSegment.push(promotionsAbbrevs);
			}

			playerSegments.push(playerSegment.join(';')); 
			delete promotionRanksCopy[player]; // Remove the player from the object
			delete promotionsAllowedCopy[player]; // Remove the player from the object
		}
		positionSegments.push('(' + playerSegments.join('|') + ')'); // '(8,17|1,10)'

		// Check if there are any remaining players not accounted for
		if (Object.keys(promotionRanksCopy).length > 0) throw Error("Not all players with promotion ranks had a turn in the turn order! " + Object.keys(promotionRanksCopy).join(", "));
		if (Object.keys(promotionsAllowedCopy).length > 0) throw Error("Not all players with promotions allowed had a turn in the turn order! " + Object.keys(promotionsAllowedCopy).join(", "));
	}


	// Win conditions
	const playerWinConSegments: string[] = []; // ['checkmate','checkmate|allpiecescaptured']
	// Sort by ascending player number
	const sortedPlayers = (Object.keys(longformat.gameRules.winConditions).map(Number) as Player[]).sort((a, b) => a - b);
	console.log("Are players sorted?:", sortedPlayers);
	for (const player of sortedPlayers) {
		playerWinConSegments.push(longformat.gameRules.winConditions[player]!.join(',')); // 'checkmate,allpiecescaptured'
	}
	const allPlayersMatchWinConditions = playerWinConSegments.every(segment => segment === playerWinConSegments[0]);
	if (allPlayersMatchWinConditions) {
		if (playerWinConSegments[0]! !== default_win_condition) positionSegments.push(playerWinConSegments[0]!); // 'royalcapture'
		// Else all players have checkmate, no need to specify!
	} else {
		positionSegments.push('(' + playerWinConSegments.join('|') + ')'); // '(checkmate|checkmate,allpiecescaptured)'
	}


	// Extra gamerules - Will be stringified into the ICN
	const extraGameRules: Partial<GameRules> = {};
	for (const key of jsutil.typedKeys(longformat.gameRules)) {
		if (excludedGameRules.has(key)) continue;
		extraGameRules[key] = longformat.gameRules[key];
	}
	if (Object.keys(extraGameRules).length > 0) positionSegments.push(JSON.stringify(extraGameRules));


	// Position - P1,2+|P2,2+|P3,2+|P4,2+|P5,2+
	if (!options.skipPosition) {
		if (longformat.position === undefined) throw Error("longformat.position must be specified when skipPosition = false");
		if (longformat.global_state.specialRights === undefined) throw Error("longformat.specialRights must be specified when skipPosition = false");
		positionSegments.push(getShortFormPosition(longformat.position, longformat.global_state.specialRights));
	} else if (!longformat.metadata.Variant || !longformat.metadata.UTCDate || !longformat.metadata.UTCTime) throw Error("longformat.metadata's Variant, UTCDate, and UTCTime must be specified when skipPosition = true");


	// =================================== Section 3: Moves ===================================


	if (longformat.moves) {
		const move_options = {
			compact: false,
			spaces: false,
			comments: false,
			move_numbers: options.move_numbers,
			// Required if move_numbers = true:
			make_new_lines: options.make_new_lines,
			turnOrder: longformat.gameRules.turnOrder,
			fullmove: longformat.fullMove,
		};
		segments.push(getShortFormMovesFromMoves(longformat.moves, move_options));
	}


	// ========================================================================================

	// Combine them all, with an extra line break if make_new_lines = true

	const sectionDelimiter = options.make_new_lines ? "\n\n" : " ";
	return segments.join(sectionDelimiter); // 'w 0/100 1 (8,17|1,10) (checkmate|checkmate,allpiecescaptured) {"slideLimit": 100, "cannotPassTurn": true} P1,2+|P2,2+|P3,2+|P4,2+|P5,2+'
}


















// Compacting & Parsing Single Moves -------------------------------------------------------------------------------


/**
 * Converts a move draft into the most minimal string form: '1,7>2,8=Q'
 * 
 * THE `=` IS REQUIRED because in future multiplayer games we will
 * have promotion to colored pieces, so we need to be able to distinguish
 * the player number from the end-Y coordinate! "1,7>2,8=3Q" => Red queen
 * 
 * {@link getShortFormMoveFromMove} is also capable of this, but less efficient.
 */
function getCompactMoveFromDraft(moveDraft: _Move_Compact): string {
	const startCoordsKey = coordutil.getKeyFromCoords(moveDraft.startCoords);
	const endCoordsKey = coordutil.getKeyFromCoords(moveDraft.endCoords);
	const promotionAbbr = moveDraft.promotion !== undefined ? getAbbrFromType(moveDraft.promotion) : undefined;
	return getCompactMoveFromParts(startCoordsKey, endCoordsKey, promotionAbbr);
}

function getCompactMoveFromParts(startCoordsKey: string, endCoordsKey: string, promotionAbbr?: string) {
	const promotedPieceStr = promotionAbbr ? "=" + promotionAbbr : "";
	return startCoordsKey + ">" + endCoordsKey + promotedPieceStr; // 'a,b>c,d=X'
}

/**
 * Converts a move into shortform notation, with various styling options available.
 * 
 * compact => Exclude piece abbreviations, 'x', '+' or '#' markers => '1,7>2,8=Q'.
 *     IF FALSE THEN THE MOVES must have their `type` and `flags` properties!!!
 * spaces => Spaces between segments of a move => 'P1,7 x 2,8 =Q +'
 * comments => Include move comments and clk embeded command sequences => 'P1,7x2,8=Q+{[%clk 0:09:56.7] Capture, promotion, and a check!}'
 */
function getShortFormMoveFromMove(move: _Move_In, options: { compact: boolean, spaces: boolean, comments: boolean }): string {
	if (options.compact && !options.spaces && !options.comments) console.warn("getCompactMoveFromDraft() is more efficient to get the most-compact form of a move.");
	if (!options.compact) {
		if (move.type === undefined) throw Error(`Move.type must be present when compact = false! (${move.compact})`);
		if (move.flags === undefined) throw Error(`Move.flags must be present when compact = false! (${move.compact})`);
	}

	// TESTING. Randomly give the move either a comment or a clk value.
	// if (Math.random() < 0.3) move.comment = "Comment example";
	// if (Math.random() < 0.3) move.clk = Math.random() * 100000;
	
	/** Each "segment" of the entire move will be separated by a space, if spaces is true */
	const segments: string[] = [];

	// 1st segment: piece abbreviation + start coords
	const startCoordsKey = coordutil.getKeyFromCoords(move.startCoords);
	if (options.compact) segments.push(startCoordsKey); // '1,2'
	else {
		const pieceAbbr = getAbbrFromType(move.type!);
		segments.push(pieceAbbr + startCoordsKey); // 'P1,2'
	}

	// 2nd segment: If it was a capture, use 'x' instead of '>'
	if (options.compact) segments.push(">");
	else segments.push(move.flags!.capture ? "x" : ">");

	// 3rd segment: end coords
	segments.push(coordutil.getKeyFromCoords(move.endCoords));

	// 4th segment: Specify the promoted piece, if present
	if (move.promotion !== undefined) {
		const promotedPieceAbbr = getAbbrFromType(move.promotion);
		segments.push("=" + promotedPieceAbbr); // =Q  "=" REQUIRED
	}

	// 5th segment: Append the check/mate flags '#' or '+'
	if (!options.compact && (move.flags!.mate || move.flags!.check)) segments.push(move.flags!.mate ? "#" : "+");

	// 6th segment: Comment, if present, with the clk embedded command sequence
	// For example: {[%clk 0:09:56.7] White captures en passant}
	if (options.comments && (move.comment || move.clockStamp !== undefined)) {
		/**
		 * Everything in a comment that has to be separated by a space.
		 * This should include all embeded command sequences, like [%clk 0:09:56.7]
		 * 
		 */
		const cmdObjs: CommandObject[] = [];
		// Include the clk embeded command sequence, if the player's clockStamp is present on the move.
		if (move.clockStamp !== undefined) cmdObjs.push(icncommentutils.createClkCommandObject(move.clockStamp)); // '[%clk 0:09:56.7]'

		const fullComment = icncommentutils.combineCommentAndCommands(cmdObjs, move.comment); // '[%clk 0:09:56.7] White captures en passant'
		if (fullComment) segments.push("{" + fullComment + "}"); // '{[%clk 0:09:56.7] White captures en passant}'
	}

	// Return the shortform move, adding a space between all segments, if spaces is true
	const segmentDelimiter = options.spaces ? " " : "";
	return segments.join(segmentDelimiter); // 'P1,7 x 2,8 =Q + {[%clk 0:09:56.7] White captures en passant}' | 'P1,7x2,8=Q+{[%clk 0:09:56.7] White captures en passant}' | '1,7>2,8Q{[%clk 0:09:56.7]}' | '1,7>2,8Q'
}

/** Parses a shortform move IN THE MOST COMPACT FORM '1,7>2,8=Q' to a readable move draft. */
// function parseCompactMove(compactMove: string): { startCoords: Coords, endCoords: Coords, promotion?: number } {
// 	const match = moveRegexCompact.exec(compactMove);
// 	if (match === null) throw Error("Invalid compact move: " + compactMove);
// 	return getParsedMoveFromNamedCapturedMoveGroups(match.groups as NamedCaptureMoveGroups);
// }

/** Parses a shortform move in any dynamic format to a readable json. */
function parseMoveFromShortFormMove(shortFormMove: string): _Move_Out {
	const moveRegex = new RegExp(`^${moveRegexSource}$`);
	const match = moveRegex.exec(shortFormMove);
	if (match === null) throw Error("Invalid shortform move: " + shortFormMove);
	return getParsedMoveFromNamedCapturedMoveGroups(match.groups as NamedCaptureMoveGroups);
}

/**
 * Takes the result.groups of a regex match and parses them into a move.
 * 
 * Throws an error if the coordinates would become Infinity when cast to
 * a javascript number, or if the promoted piece abbreviation is invalid.
 */
function getParsedMoveFromNamedCapturedMoveGroups(capturedGroups: NamedCaptureMoveGroups): _Move_Out {
	const startCoordsKey = capturedGroups!.startCoordsKey;
	const endCoordsKey = capturedGroups!.endCoordsKey;
	const promotionAbbr = capturedGroups!.promotionAbbr;
	const comment = capturedGroups!.comment;

	const startCoords = coordutil.getCoordsFromKey(startCoordsKey);
	const endCoords = coordutil.getCoordsFromKey(endCoordsKey);

	// Make sure neither coords are Infinity
	if (!isFinite(startCoords[0]) || !isFinite(startCoords[1]) || !isFinite(endCoords[0]) || !isFinite(endCoords[1])) {
		throw Error(`Move coordinate must not be Infinite. ${JSON.stringify(capturedGroups)}`);
	}

	const parsedMove: _Move_Out = {
		startCoords,
		endCoords,
		compact: getCompactMoveFromParts(startCoordsKey, endCoordsKey, promotionAbbr),
	};
	if (promotionAbbr) parsedMove.promotion = getTypeFromAbbr(promotionAbbr);
	if (comment) {
		// Parse the human readable comment from the embeded command sequences
		const parsedComment = icncommentutils.extractCommandsFromComment(comment);
		parsedMove.comment = parsedComment.comment;
		parsedComment.commands.forEach(cmdObj => {
			if (cmdObj.command === 'clk') parsedMove.clockStamp = icncommentutils.getMillisFromClkTimeValue(cmdObj.value);
		})
	}

	return parsedMove;
}


// Compacting & Parsing Move Lists --------------------------------------------------------------------------------


/**
 * Converts a gamefile's moves list into shortform, ready to place into the ICN.
 * Various styling options are available:
 * 
 * compact => Exclude piece abbreviations, 'x', '+' or '#' markers => '1,7>2,8=Q'
 *     IF FALSE THEN THE MOVES must have their `type` and `flags` properties!!!
 * spaces => Spaces between segments of a move. => 'P1,7 x 2,8 =Q +'
 * comments => Include move comments and clk embeded command sequences => 'P1,7x2,8=Q+{[%clk 0:09:56.7]}'
 * move_numbers => Include move numbers, prettifying the notation. This makes turnOrder, fullmove, and make_new_lines required.
 * make_new_lines => Include new lines between move numbers (only when move_numbers = true)
 */
function getShortFormMovesFromMoves(moves: _Move_In[], options: { compact: boolean; spaces: boolean; comments: boolean; } & ({ move_numbers: false } | { move_numbers: true, turnOrder: Player[], fullmove: number, make_new_lines: boolean })): string {
	// console.log("Getting shortform moves with options:", options);

	// Converts a gamefile's moves list to the most minimal and compact string notation `1,2>3,4|5,6>7,8=N`
	if (options.compact && !options.spaces && !options.comments && !options.move_numbers) return moves.map(move => move.compact).join("|"); // Most efficient, as the Move already has the compact form.

	if (!options.move_numbers) {
		const shortforms = moves.map(move => getShortFormMoveFromMove(move, options));
		const moveDelimiter = options.spaces ? " | " : "|";
		return shortforms.join(moveDelimiter);
	}

	// Include move_numbers with the notation
	return getShortFormMovesFromMoves_MoveNumbers(moves, options); // Beautiful form with move numbers, new lines, and comments!
}

/**
 * Converts a gamefile's moves list to a NUMBERED shortform notation.
 * Various styling options are available:
 * 
 * compact => Exclude piece abbreviations, 'x', '+' or '#' markers => '1,7>2,8Q'
 * spaces => Spaces between segments of a move. => 'P1,7 x 2,8 =Q +'
 * comments => Include move comments and clk embeded command sequences => 'P1,7x2,8=Q+{[%clk 0:09:56.7]}'
 * make_new_lines => Include new lines between move numbers
 */
function getShortFormMovesFromMoves_MoveNumbers(moves: _Move_In[], options: { turnOrder: Player[], fullmove: number, compact: boolean, spaces: boolean, comments: boolean, make_new_lines: boolean }): string {

	/**
	 * Example preview: (compact = false, spaces = true, comments = true, fullmove = 1)
	 * 
	 * 1. P4,2 > 4,4  | p4,7 > 4,6
	 * 2. P4,4 > 4,5  | p3,7 > 3,5
	 * 3. P4,5 x 3,6 {White captures en passant} | b6,8 > 3,11 
	 * 4. P3,6 x 2,7  | b3,11 > -4,4 ?
	 * 5. P2,7 x 1,8 =Q | b-4,4 > 2,-2 +
	 * 6. K5,1 > 4,2  | n7,8 > 6,6
	 * 7. Q1,8 x 2,8  | k5,8 > 7,8 {Castling}
	 * 8. Q2,8 x 1,7  | q4,8 > 0,4
	 * 9. Q1,7 > 7,13 + | k7,8 > 8,8
	 * 10. Q7,13 x 7,7 + {Queen sacrifice} | k8,8 x 7,7 !!
	 * 11. P8,2 > 8,4 ?! | q0,4 > 4,4 # {Bad game from both players}
	 */

	/** If true, we can read move.compact */
	const mostCompactForm = options.compact && !options.spaces && !options.comments;

	const moveLines: string[] = [];
	let currentLine: string = '';
	moves.forEach((move, i) => {
		const turnIndex = i % options.turnOrder.length;

		// If turn index is 0, start out with the move number
		if (turnIndex === 0) currentLine += `${Math.floor(i / options.turnOrder.length) + options.fullmove}. `;
		// Else add the move delimiter
		else currentLine += " | ";

		// Add the shortform move to the current line
		currentLine += mostCompactForm ? move.compact : getShortFormMoveFromMove(move, options);

		// If turn index is the last player, push the current line and start a new one.
		if (turnIndex === options.turnOrder.length - 1) {
			moveLines.push(currentLine);
			currentLine = '';
		}
	});

	// If the last line is not empty, push it to the lines.
	if (currentLine !== '') moveLines.push(currentLine);

	const linesDelimiter = options.make_new_lines ? "\n" : " ";
	return moveLines.join(linesDelimiter);
}

/** Parses the shortform moves of an ICN into a JSON readable format. */
function parseShortFormMoves(shortformMoves: string): _Move_Out[] {
	// console.log("Parsing shortform moves:", shortformMoves);

	const moves: _Move_Out[] = [];
	const moveRegex = new RegExp(moveRegexSource, "g");

	// Since the moveRegex has the global flag, exec() will return the next match each time.
	// NO STRING SPLITTING REQUIRED
	let match: RegExpExecArray | null;
	while ((match = moveRegex.exec(shortformMoves)) !== null) {
		moves.push(getParsedMoveFromNamedCapturedMoveGroups(match.groups as NamedCaptureMoveGroups));
	}

	// console.log("Parsed moves:", moves);
	return moves;
}


// Converting Positions ------------------------------------------------------------------------------------------


/**
 * Accepts a gamefile's starting position and specialRights properties, returns the position in compressed notation (.e.g., "P5,6+|k15,-56|Q5000,1")
 * @param position - The starting position of the gamefile, in the form 'x,y': number
 * @param specialRights - Optional. The special rights of each piece in the gamefile, a set of CoordsKeys, where the piece at that coordinate can perform their special move (pawn double push, castling rights..)
 * @returns The position of the game in compressed form, where each piece with a + has its special move ability (.e.g., "P5,6+|k15,-56|Q5000,1")
 */
function getShortFormPosition(position: Map<CoordsKey, number>, specialRights: Set<CoordsKey>): string {
	const pieces: string[] = []; // ['P1,2+','P2,2+', ...]
	for (const [coordsKey, type] of position) {
		const pieceAbbr = getAbbrFromType(type);
		const specialRightsString = specialRights.has(coordsKey as CoordsKey) ? '+' : '';
		pieces.push(pieceAbbr + coordsKey + specialRightsString);
	}
	// Using join avoids overhead of repeatedly creating and copying large intermediate strings.
	return pieces.join("|");
}

/**
 * Generates the specialRights property of a gamefile, given the provided position and gamerules.
 * Only gives pieces that can castle their right if they are on the same rank, and color, as the king, and at least 3 squares away
 * 
 * This can be manually used to compress the starting position of variants of InfiniteChess.org to shrink the size of the code
 * @param position - The starting position of the gamefile, in the form 'x,y':'pawnsW'
 * @param pawnDoublePush - Whether pawns are allowed to double push
 * @param castleWith - If castling is allowed, this is what piece the king can castle with (e.g., "rooks"), otherwise leave it undefined
 * @returns The specialRights gamefile property, a set where entries are coordsKeys 'x,y', where the piece at that location has their special move ability (pawn double push, castling rights..)
 */
function generateSpecialRights(position: Map<CoordsKey, number>, pawnDoublePush: boolean, castleWith?: RawType): Set<CoordsKey> {
	// Make sure castleWith is with a valid piece to castle with
	if (castleWith !== undefined && castleWith !== r.ROOK && castleWith !== r.GUARD) throw Error(`Cannot allow castling with ${typeutil.debugType(castleWith)}!.`);

	const specialRights = new Set<CoordsKey>();
	if (pawnDoublePush === false && castleWith === undefined) return specialRights; // Early exit

	/** Running list of kings discovered, 'x,y': player */
	const kingsFound: Record<CoordsKey, Player> = {};
	/** Running list of pieces found that are able to castle (e.g. rooks), 'x,y': Player */
	const castleWithsFound: Record<CoordsKey, Player> = {};

	for (const [key, thisPiece] of position.entries()) {
		const [rawType, player] = typeutil.splitType(thisPiece);
		if (pawnDoublePush && rawType === r.PAWN) {
			specialRights.add(key);
		} else if (castleWith && typeutil.jumpingRoyals.includes(rawType)) {
			specialRights.add(key);
			kingsFound[key] = player;
		} else if (castleWith && rawType === castleWith) {
			castleWithsFound[key] = player;
		}
	}

	// Only give the pieces that can castle their special move ability
	// if they are the same row and color as a king!
	if (Object.keys(kingsFound).length === 0) return specialRights; // Nothing can castle, return now.
	outerFor: for (const coord in castleWithsFound) { // 'x,y': player
		const coords = coordutil.getCoordsFromKey(coord as CoordsKey); // [x,y]
		for (const kingCoord in kingsFound) { // 'x,y': player
			const kingCoords = coordutil.getCoordsFromKey(kingCoord as CoordsKey); // [x,y]
			if (coords[1] !== kingCoords[1]) continue; // Not the same y level
			if (castleWithsFound[coord as CoordsKey] !== kingsFound[kingCoord as CoordsKey]) continue; // Their players don't match
			const xDist = Math.abs(coords[0] - kingCoords[0]);
			if (xDist < 3) continue; // Not at least 3 squares away
			specialRights.add(coord as CoordsKey); // Same row and color as the king! This piece can castle.
			// We already know this piece can castle, we don't
			// need to see if it's on the same rank as any other king
			continue outerFor;
		}
	}
	return specialRights;
}

/**
 * Takes the position in compressed short form and returns the startingPosition and specialRights properties of the gamefile
 * @param shortposition - The compressed position of the gamefile (e.g., "K5,4+|P1,2|r500,25389")
 */
function generatePositionFromShortForm(shortposition: string): { startingPosition: Map<CoordsKey, number>, specialRights: Set<CoordsKey> } {
	// console.log("Parsing shortposition:", shortposition);

	const startingPosition = new Map<CoordsKey, number>();
	const specialRights = new Set<CoordsKey>();

	const pieceRegex = new RegExp(pieceEntryRegexSource, "g"); // named groups are: pieceAbbr, coordsKey, specialRight

	// Since the moveRegex has the global flag, exec() will return the next match each time.
	// NO STRING SPLITTING REQUIRED
	let match: RegExpExecArray | null;
	while ((match = pieceRegex.exec(shortposition)) !== null) {
		const pieceAbbr = match.groups!['pieceAbbr']!;
		const coordsKey = match.groups!['coordsKey']! as CoordsKey;
		const hasSpecialRight = match.groups!['specialRight'] === "+";

		const pieceType = getTypeFromAbbr(pieceAbbr);

		startingPosition.set(coordsKey, pieceType);
		if (hasSpecialRight) specialRights.add(coordsKey);
	}

	// console.log("Parsed position:", startingPosition);

	return { startingPosition, specialRights };
}


// Exports --------------------------------------------------------------------------------------------------------


// TEMPORARY!! Delete when formatconverter has been cleaned out, its methods rewritten and migrated to here.
export {
	// Dictionaries
	player_codes,
	player_codes_inverted,
	piece_codes,
	piece_codes_inverted,
	piece_codes_raw,
	piece_codes_raw_inverted,
	metadata_ordering as metadata_key_ordering,
	default_promotions,
	excludedGameRules,
};

export default {
	isPromotionListDefaultPromotions,

	getAbbrFromType,
	getTypeFromAbbr,
	getCompactMoveFromDraft,

	parseMoveFromShortFormMove,
	getShortFormMovesFromMoves,
	parseShortFormMoves,

	getShortFormPosition,
	generateSpecialRights,
	generatePositionFromShortForm,
};