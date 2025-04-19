
/**
 * Universal Infinite Chess Notation [Converter] and Interface
 * 
 * This script converts games from a JSON notation to a
 * compact ICN (Infinite Chess Noation) and back,
 * still human-readable, but taking less space to describe positions.
 */

import jsutil from "../../util/jsutil.js";
import { rawTypes as r, ext as e, players as p, RawType, Player } from "../util/typeutil.js";
import typeutil from "../util/typeutil.js";



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
};
const player_codes_inverted = jsutil.invertObj(player_codes);

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

/**
 * The default promotions allowed, if the ICN does not specify.
 * If, when converting a game into ICN, the promotionsAllowed
 * gamerule matches this, then we won't specify custom promotions in the ICN.
 */
const default_promotions =  [r.QUEEN, r.ROOK, r.BISHOP, r.KNIGHT];


// Helper Functions --------------------------------------------------------------------------------


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
		const [raw, c] = typeutil.splitType(type);
		short = String(c) + piece_codes_raw[raw];
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
function getTypeFromAbbr(abbr: string) {
	const results = /(\d*)([a-zA-Z]+)/.exec(abbr);
	if (results === null) throw Error("Piece abbreviation is in invalid form: " + abbr);

	const characters: string = results[2]!; // 'nr'

	let typeStr: string | undefined;

	if (results[1] === '') { // No player number override is present
		typeStr = piece_codes_inverted[characters];
		if (typeStr === undefined) throw Error("Unknown piece abbreviation: " + abbr);
		return Number(typeStr);
	} else { // Player number override present
		const rawTypeStr = piece_codes_raw_inverted[characters.toLowerCase()];
		if (rawTypeStr === undefined) throw Error("Unknown raw piece abbreviation: " + abbr);
		const player = Number(results[1]) as Player;
		return typeutil.buildType(Number(rawTypeStr) as RawType, player);
	}
}













// TEMPORARY!! Delete when formatconverter has been cleaned out, its methods rewritten and migrated to here.
export {
	// Dictionaries
	player_codes,
	player_codes_inverted,
	piece_codes,
	piece_codes_inverted,
	piece_codes_raw,
	piece_codes_raw_inverted,
	metadata_key_ordering,
	default_promotions,
};

export default {
	getAbbrFromType,
	getTypeFromAbbr,
};