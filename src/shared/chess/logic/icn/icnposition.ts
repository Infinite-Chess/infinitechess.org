// src/shared/chess/logic/icn/icnposition.ts

/**
 * The position layer of Infinite Chess Notation.
 *
 * Owns everything needed to read or write a bare position string
 * `P1,2+|R1,1+|K5,1+|k5,8+` — the piece abbreviation vocabulary, the regex
 * sources for a coordinate pair and a single piece entry, and the position
 * writer and parser.
 *
 * See docs/systems/ICN.md for the full format reference.
 */

import type { CoordsKey } from '../../util/coordutil.js';

import jsutil from '../../../util/jsutil.js';
import typeutil from '../../util/typeutil.js';
import { rawTypes as r, ext as e, RawType, Player } from '../../util/typeutil.js';

// Dictionaries -----------------------------------------------------------------------

/** 1-2 letter codes for the standard white, black, and neutral pieces. */
// prettier-ignore
const pieceCodes = {
	[r.KING + e.W]: 'K',          [r.KING + e.B]: 'k',
	[r.PAWN + e.W]: 'P',          [r.PAWN + e.B]: 'p',
	[r.KNIGHT + e.W]: 'N',        [r.KNIGHT + e.B]: 'n',
	[r.BISHOP + e.W]: 'B',        [r.BISHOP + e.B]: 'b',
	[r.ROOK + e.W]: 'R',          [r.ROOK + e.B]: 'r',
	[r.QUEEN + e.W]: 'Q',         [r.QUEEN + e.B]: 'q',
	[r.AMAZON + e.W]: 'AM',       [r.AMAZON + e.B]: 'am',
	[r.HAWK + e.W]: 'HA',         [r.HAWK + e.B]: 'ha',
	[r.CHANCELLOR + e.W]: 'CH',   [r.CHANCELLOR + e.B]: 'ch',
	[r.ARCHBISHOP + e.W]: 'AR',   [r.ARCHBISHOP + e.B]: 'ar',
	[r.GUARD + e.W]: 'GU',        [r.GUARD + e.B]: 'gu',
	[r.CAMEL + e.W]: 'CA',        [r.CAMEL + e.B]: 'ca',
	[r.GIRAFFE + e.W]: 'GI',      [r.GIRAFFE + e.B]: 'gi',
	[r.ZEBRA + e.W]: 'ZE',        [r.ZEBRA + e.B]: 'ze',
	[r.CENTAUR + e.W]: 'CE',      [r.CENTAUR + e.B]: 'ce',
	[r.ROYALQUEEN + e.W]: 'RQ',   [r.ROYALQUEEN + e.B]: 'rq',
	[r.ROYALCENTAUR + e.W]: 'RC', [r.ROYALCENTAUR + e.B]: 'rc',
	[r.KNIGHTRIDER + e.W]: 'NR',  [r.KNIGHTRIDER + e.B]: 'nr',
	[r.HUYGEN + e.W]: 'HU',       [r.HUYGEN + e.B]: 'hu',
	[r.ROSE + e.W]: 'RO',         [r.ROSE + e.B]: 'ro',
	// Neutrals
	[r.OBSTACLE + e.N]: 'ob',
	[r.VOID + e.N]: 'vo',
};
const pieceCodesInverted = jsutil.invertObj(pieceCodes);

/** The codes for raw, color-less piece types. */
const pieceCodesRaw = {
	[r.KING]: 'k',
	[r.PAWN]: 'p',
	[r.KNIGHT]: 'n',
	[r.BISHOP]: 'b',
	[r.ROOK]: 'r',
	[r.QUEEN]: 'q',
	[r.AMAZON]: 'am',
	[r.HAWK]: 'ha',
	[r.CHANCELLOR]: 'ch',
	[r.ARCHBISHOP]: 'ar',
	[r.GUARD]: 'gu',
	[r.CAMEL]: 'ca',
	[r.GIRAFFE]: 'gi',
	[r.ZEBRA]: 'ze',
	[r.CENTAUR]: 'ce',
	[r.ROYALQUEEN]: 'rq',
	[r.ROYALCENTAUR]: 'rc',
	[r.KNIGHTRIDER]: 'nr',
	[r.HUYGEN]: 'hu',
	[r.ROSE]: 'ro',
	// Neutrals
	[r.OBSTACLE]: 'ob',
	[r.VOID]: 'vo',
};
const pieceCodesRawInverted = jsutil.invertObj(pieceCodesRaw);

// Regular Expressions ----------------------------------------------------------------

const wholeNumberSource = String.raw`(?:0|[1-9]\d*)`; // 0+   Positive. Disallows leading 0's unless it's 0
const integerSource = String.raw`(?:0|-?[1-9]\d*)`; // Prevents "-0", or numbers with leading 0's like "000005"

const coordsKeyRegexSource = `${integerSource},${integerSource}`; // '-1,2'

const pieceCodeRegexSource = '[a-zA-Z]{1,2}';

/**
 * Returns a regex for matching a piece abbreviation like '3Q' or 'nr'. '3Q' => Player-3 queen (red)
 * Optionally captures the piece abbreviation, and the player
 * number if present, using custom capture group names.
 * Disallows negatives, or leading 0's
 *
 * This prevents duplicate capture group names when a bigger regex contains
 * multiple smaller pieceAbbrev regexes, as we can make them different.
 * @param capturing - Whether to capture the player number and piece abbreviation.
 */
function getPieceAbbrevRegexSource(capturing: boolean): string {
	const player = capturing ? '<player>' : ':';
	const abbrev = capturing ? '<abbrev>' : ':';
	const result = `(?${player}${wholeNumberSource})?(?${abbrev}${pieceCodeRegexSource})`;
	// console.log("Generated PieceAbbrev Regex Source:", result);
	return result;
}

/**
 * A regex for matching a single piece entry in a shortform position in ICN.
 * For example, 'P1,2+' => Pawn at 1,2 with special right.
 * It optionally captures the piece abbreviation, coords key, and special right into named groups.
 */
function getPieceEntryRegexSource(capturing: boolean): string {
	const pieceAbbr = capturing ? '<pieceAbbr>' : ':';
	const coordsKey = capturing ? '<coordsKey>' : ':';
	const specialRight = capturing ? '<specialRight>' : ':';

	return String.raw`(?${pieceAbbr}${getPieceAbbrevRegexSource(false)})(?${coordsKey}${coordsKeyRegexSource})(?${specialRight}\+)?`; // 'P1,2+' => Pawn at 1,2 with special right
}

// Getting & Parsing Abbreviations ----------------------------------------------------

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
	let short = pieceCodes[type];
	if (!short) {
		const [rawType, player] = typeutil.splitType(type);
		short = String(player) + pieceCodesRaw[rawType];
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
	const results = new RegExp(`^${getPieceAbbrevRegexSource(true)}$`).exec(pieceAbbr);
	if (results === null) throw Error(`Piece abbreviation is in invalid form: (${pieceAbbr})`);

	const playerStr = results.groups!['player'];
	const abbrev = results.groups!['abbrev']!;

	let typeStr: string | undefined;

	if (playerStr === undefined) {
		// No player number override is present
		typeStr = pieceCodesInverted[abbrev];
		if (typeStr === undefined) throw Error(`Unknown piece abbreviation: (${pieceAbbr})`);
		return Number(typeStr);
	} else {
		// Player number override present   '3Q'
		const rawTypeStr = pieceCodesRawInverted[abbrev.toLowerCase()];
		if (rawTypeStr === undefined) throw Error(`Unknown raw piece abbreviation: (${pieceAbbr})`);
		return typeutil.buildType(Number(rawTypeStr) as RawType, Number(playerStr) as Player);
	}
}

// Converting Positions ---------------------------------------------------------------

/**
 * Accepts a gamefile's starting position and specialRights properties, returns
 * the position in compressed notation (e.g., "P5,6+|k15,-56|Q5000,1").
 * @param position - A piece iterator giving us each piece's coordsKey and pieceType. An iterable
 * (a Map<CoordsKey, number> qualifies) lets callers avoid building massive intermediate maps.
 * @param specialRights - The pieces that can still perform their special
 * move (pawn double push, castling rights..), as a set of CoordsKeys.
 * @returns The position, where each piece with a + has its special move ability.
 */
function getShortFormPosition(
	position: Iterable<[CoordsKey, number]>,
	specialRights: Set<CoordsKey>,
): string {
	const pieces: string[] = []; // ['P1,2+','P2,2+', ...]
	for (const [coordsKey, type] of position) {
		const pieceAbbr = getAbbrFromType(type);
		const specialRightsString = specialRights.has(coordsKey) ? '+' : '';
		pieces.push(pieceAbbr + coordsKey + specialRightsString);
	}
	// Using join avoids overhead of repeatedly creating and copying large intermediate strings.
	return pieces.join('|');
}

/**
 * Walks the piece entries of a position starting at `index`, entry
 * by entry — a position can be too long to regex match all at once.
 * @returns The position, its specialRights, and the index the position ends at,
 * or undefined if no piece entry lies at `index`.
 * @throws If a "|" isn't followed by a valid piece entry.
 */
function matchShortFormPosition(
	shortposition: string,
	index: number,
):
	| {
			position: Map<CoordsKey, number>;
			specialRights: Set<CoordsKey>;
			nextIndex: number;
	  }
	| undefined {
	const pieceEntryRegex = new RegExp(getPieceEntryRegexSource(true), 'y');
	const delimiter = /\|/y; // The delimiter between piece entries

	// Check for the presence of the first piece entry
	pieceEntryRegex.lastIndex = index;
	let match: RegExpExecArray | null = pieceEntryRegex.exec(shortposition);
	if (!match) return undefined;

	const position = new Map<CoordsKey, number>();
	const specialRights = new Set<CoordsKey>();

	addPieceEntry(match, position, specialRights);

	// Repeatedly check for the next piece entry.
	// EFFICIENT. Works for arbitrarily large positions!
	while (true) {
		// Check if the next character is a delimiter
		delimiter.lastIndex = pieceEntryRegex.lastIndex;
		if (!delimiter.exec(shortposition)) break; // No delimiter found. End of position. Exit the loop.
		// Delimiter found
		pieceEntryRegex.lastIndex = delimiter.lastIndex;
		match = pieceEntryRegex.exec(shortposition); // Get the next match
		if (!match) throw Error(`Position is malformed! No valid piece entry follows a "|".`); // prettier-ignore
		addPieceEntry(match, position, specialRights);
	}

	// console.log("Parsed position:", position);

	return { position, specialRights, nextIndex: pieceEntryRegex.lastIndex };
}

/** Adds a matched piece entry to the position and specialRights. */
function addPieceEntry(
	match: RegExpExecArray,
	position: Map<CoordsKey, number>,
	specialRights: Set<CoordsKey>,
): void {
	// named groups are: pieceAbbr, coordsKey, specialRight
	const pieceAbbr = match.groups!['pieceAbbr']!;
	const coordsKey = match.groups!['coordsKey']! as CoordsKey;
	const hasSpecialRight = match.groups!['specialRight'] === '+';

	const pieceType = getTypeFromAbbr(pieceAbbr);

	position.set(coordsKey, pieceType);
	if (hasSpecialRight) specialRights.add(coordsKey);
}

/**
 * Takes a WHOLE position in compressed short form and returns the position and specialRights properties of the gamefile
 * @param shortposition - The compressed position of the gamefile (e.g., "K5,4+|P1,2|r500,25389")
 * @throws If the string isn't entirely consumed, so a typo can't silently drop pieces.
 */
function parseShortFormPosition(shortposition: string): {
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
} {
	// console.log("Parsing shortposition:", shortposition);

	const match = matchShortFormPosition(shortposition, 0);
	if (!match) throw Error(`Position contains no piece entries! "${shortposition.slice(0, 40)}"`); // prettier-ignore
	if (match.nextIndex < shortposition.length) throw Error(`Position is malformed at index ${match.nextIndex}! "${shortposition.slice(match.nextIndex, match.nextIndex + 40)}"`); // prettier-ignore

	return { position: match.position, specialRights: match.specialRights };
}

// Exports ----------------------------------------------------------------------------

export default {
	// Dictionaries
	pieceCodesInverted,
	pieceCodesRaw,
	pieceCodesRawInverted,
	// Regular Expressions
	wholeNumberSource,
	integerSource,
	coordsKeyRegexSource,
	pieceCodeRegexSource,
	getPieceAbbrevRegexSource,
	getPieceEntryRegexSource,
	// Getting & Parsing Abbreviations
	getAbbrFromType,
	getTypeFromAbbr,
	// Converting Positions
	getShortFormPosition,
	matchShortFormPosition,
	parseShortFormPosition,
};
