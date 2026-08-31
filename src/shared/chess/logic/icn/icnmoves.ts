// src/shared/chess/logic/icn/icnmoves.ts

/**
 * The move layer of Infinite Chess Notation.
 *
 * Owns everything needed to read or write a move and a move list — the compact token
 * `1,7>2,8=Q`, the decorated form `P1,7 x 2,8 =Q + {comment}`, the regexes matching both,
 * and the numbered multi-line styling.
 *
 * See docs/systems/ICN.md for the full format reference.
 */

import type { Player } from '../../util/typeutil.js';

import icnposition from './icnposition.js';
import coordutil, { Coords, CoordsKey } from '../../../util/coordutil.js';
import icncommentutils, { CommandObject } from './icncommentutils.js';

// Types -----------------------------------------------------------------------

/** The named capture groups of a shortform move. */
type NamedCaptureMoveGroups = {
	startCoordsKey: CoordsKey;
	endCoordsKey: CoordsKey;
	/** The piece abbreviation of the promoted piece, if present. */
	promotionAbbr?: string;
	/**
	 * An un-parsed comment on a move. This may contain embedded command sequences.
	 * However it won't include the opening "{" or closing "}" braces.
	 */
	comment?: string;
};

/** Input to the ICN serializer. Includes optional information for prettifying the move list. */
export interface MovePreprint extends MoveParsed {
	/** The type of piece moved */
	type?: number;
	flags?: {
		/** Whether the move delivered check. */
		check: boolean;
		/** Whether the move delivered mate (or the killing move). */
		mate: boolean;
		/** Whether the move caused a capture */
		capture: boolean;
	};
}

/** Output of the ICN parser. Includes information extractable from a shortform move. */
export interface MoveParsed extends MoveCoords {
	token: string;
	/**
	 * Any human-readable comment made on the move, specified in the ICN.
	 * FUTURE: This should go back into the ICN when copying the game.
	 */
	comment?: string;
	/** How much time the player had left after they made their move, in millis. */
	clockStamp?: number;
}

/** The bare minimum information needed to make a move. */
export interface MoveCoords {
	startCoords: Coords;
	endCoords: Coords;
	/** Present if the move was a special-move promotion. This is the integer type of the promoted piece. */
	promotion?: number;
}

// Regular Expressions ---------------------------------------------------------

/**
 * Simulates possessive behavior for a regex pattern string `str` (e.g., \d+)
 * using the lookahead/named backreference technique `(?:(?=(?<name>str))\k<name>)`.
 * Can essentially transform any (...?), (...+), or (...*) regex into a possessive version (...?+), (...?+), or (...*+).
 *
 * Using this prevents catastrophic backtracking in regexes, as once a possessive group is matched,
 * those characters can never be released to see if the string can be matched in a different way.
 * @param str - Regex pattern string to make possessive.
 * @returns Pattern string with possessive simulation.
 */
const possessive = (() => {
	let counter = 0;
	// The actual function that gets assigned to possessive()
	return function (str: string): string {
		const uniqueGroupName = `_g${counter++}`; // Generate unique name internally
		return String.raw`(?:(?=(?<${uniqueGroupName}>${str}))\k<${uniqueGroupName}>)`;
	};
})();

/** Returns a regex source for matching the promotion segment in a move, optionally capturing  */
function getPromotionRegexSource(capturing: boolean): string {
	const promotionAbbr = capturing ? '<promotionAbbr>' : ':';
	return `(?:=(?${promotionAbbr}${icnposition.getPieceAbbrevRegexSource(false)}))?`; // '=Q' => Promotion to queen
}
/**
 * A regex for matching a move in the MOST COMPACT form: '1,7>2,8=Q'
 * The start coords, end coords, and promotion abbrev are all captured into named groups.
 */
const MOVE_TOKEN_REGEX = new RegExp(
	`^(?<startCoordsKey>${icnposition.COORDS_KEY_REGEX_SOURCE})>(?<endCoordsKey>${icnposition.COORDS_KEY_REGEX_SOURCE})${getPromotionRegexSource(true)}$`,
);
/**
 * A regex for dynamically matching all forms of a move in ICN.
 * The move may optionally include a piece abbreviation, spaces between segments,
 * a separator of ">" or "x", check/mate flags "+" or "#", symbols !?, ?!, !!, and a comment.
 * "P1,7 x 2,8 =Q + !! {Promotion!!!}"
 *
 * It optionally captures the start coords, end coords, promotion abbrev, and the comment, all into named groups.
 */
function getMoveRegexSource(capturing: boolean): string {
	const startCoordsKey = capturing ? '<startCoordsKey>' : ':';
	const endCoordsKey = capturing ? '<endCoordsKey>' : ':';
	const comment = capturing ? '<comment>' : ':';
	const result =
		possessive(`(?:${icnposition.getPieceAbbrevRegexSource(false)})?`) + // Optional starting piece abbreviation "P"   DOESN'T NEED TO BE CAPTURED, this avoids a crash cause of duplicate capture group names
		`(?${startCoordsKey}${icnposition.COORDS_KEY_REGEX_SOURCE})` + // Starting coordinates
		possessive(` ?`) + // Optional space
		`[>x]` + // Separator
		possessive(` ?`) + // Optional space
		`(?${endCoordsKey}${icnposition.COORDS_KEY_REGEX_SOURCE})` + // Ending coordinates
		possessive(` ?`) + // Optional space
		possessive(getPromotionRegexSource(capturing)) + // Optional promotion ("=" REQUIRED)
		possessive(` ?`) + // Optional space
		possessive(`[+#]?`) + // Optional check/checkmate
		possessive(` ?`) + // Optional space
		possessive(`(?:[!?]{1,2})?`) + // Optional symbols: !?, ?!, !!
		possessive(' ?') + // Optional space
		possessive(String.raw`(?:\{(?${comment}[^}]+)\})?`); // Optional comment (not-greedy). Comments should NOT contain a closing brace "}".
	// console.log("Generated Move Regex Source:", result);
	return result;
}
// console.log("MoveRegexSource:", getMoveRegexSource(false));

/**
 * Matches any possible delimiter between moves in the moves section of an ICN.
 * This could be a pipe "|", or the move number "14."
 */
const MOVES_DELIMITER = String.raw`(?:\s?${icnposition.COUNTING_NUMBER_SOURCE}\. | ?\| ?)`; // " 14. " or " | "
/** Matches an entire moves list in an ICN, no matter its styling. */
const MOVES_REGEX_SOURCE =
	possessive(String.raw`(?:${icnposition.COUNTING_NUMBER_SOURCE}\. )?`) + // The first move number, if present
	getMoveRegexSource(false) +
	possessive(`(?:${MOVES_DELIMITER}${getMoveRegexSource(false)})*`);
// console.log("MovesRegexSource:", MOVES_REGEX_SOURCE);

// Compacting & Parsing Single Moves -------------------------------------------

/**
 * Converts a MoveCoords into the most minimal string form: '1,7>2,8=Q'
 *
 * THE `=` IS REQUIRED because in future multiplayer games we will
 * have promotion to colored pieces, so we need to be able to distinguish
 * the player number from the end-Y coordinate! "1,7>2,8=3Q" => Red queen
 *
 * {@link getShortFormMoveFromMove} is also capable of this, but less efficient.
 */
function getTokenFromMoveCoords(moveCoords: MoveCoords): string {
	const startCoordsKey = coordutil.getKeyFromCoords(moveCoords.startCoords);
	const endCoordsKey = coordutil.getKeyFromCoords(moveCoords.endCoords);
	const promotionAbbr =
		moveCoords.promotion !== undefined
			? icnposition.getAbbrFromType(moveCoords.promotion)
			: undefined;
	return getTokenFromParts(startCoordsKey, endCoordsKey, promotionAbbr);
}

/** Assembles a compact move token from its already-stringified parts. */
function getTokenFromParts(
	startCoordsKey: string,
	endCoordsKey: string,
	promotionAbbr?: string,
): string {
	const promotedPieceStr = promotionAbbr ? '=' + promotionAbbr : '';
	return startCoordsKey + '>' + endCoordsKey + promotedPieceStr; // 'a,b>c,d=X'
}

/**
 * Converts a move into shortform notation, with various styling options available.
 *
 * compact => Exclude piece abbreviations, 'x', '+' or '#' markers => '1,7>2,8=Q'.
 *     IF FALSE THEN THE MOVES must have their `type` and `flags` properties!!!
 * spaces => Spaces between segments of a move => 'P1,7 x 2,8 =Q +'
 * comments => Include move comments and clk embeded command sequences => 'P1,7x2,8=Q+{[%clk 0:09:56.7] Capture, promotion, and a check!}'
 * abbrev => Prepend the moved piece's abbreviation to the start coords. Default true; ONLY APPLIES when compact is false => '1,7x2,8=Q+'
 */
function getShortFormMoveFromMove(
	move: MovePreprint,
	options: {
		compact: boolean;
		spaces: boolean;
		comments: boolean;
		abbrev: boolean;
	},
): string {
	if (options.compact && !options.spaces && !options.comments)
		console.warn('getTokenFromMoveCoords() is more efficient to get the most-compact form of a move.'); // prettier-ignore
	if (!options.compact) {
		if (move.type === undefined)
			throw Error(`move.type must be present when compact = false! (${move.token})`);
		if (move.flags === undefined)
			throw Error(`move.flags must be present when compact = false! (${move.token})`);
	}

	/** Each "segment" of the entire move will be separated by a space, if spaces is true */
	const segments: string[] = [];

	// 1st segment: piece abbreviation + start coords
	const startCoordsKey = coordutil.getKeyFromCoords(move.startCoords);
	if (options.compact)
		segments.push(startCoordsKey); // '1,2'
	else {
		// Default to including the piece abbreviation unless explicitly disabled.
		const pieceAbbr = options.abbrev === false ? '' : icnposition.getAbbrFromType(move.type!);
		segments.push(pieceAbbr + startCoordsKey); // 'P1,2' | '1,2'
	}

	// 2nd segment: If it was a capture, use 'x' instead of '>'
	if (options.compact) segments.push('>');
	else segments.push(move.flags!.capture ? 'x' : '>');

	// 3rd segment: end coords
	segments.push(coordutil.getKeyFromCoords(move.endCoords));

	// 4th segment: Specify the promoted piece, if present
	if (move.promotion !== undefined) {
		const promotedPieceAbbr = icnposition.getAbbrFromType(move.promotion);
		segments.push('=' + promotedPieceAbbr); // =Q  "=" REQUIRED
	}

	// 5th segment: Append the check/mate flags '#' or '+'
	if (!options.compact && (move.flags!.mate || move.flags!.check))
		segments.push(move.flags!.mate ? '#' : '+');

	// 6th segment: Comment, if present, with the clk embedded command sequence
	// For example: {[%clk 0:09:56.7] White captures en passant}
	if (options.comments && (move.comment || move.clockStamp !== undefined)) {
		/**
		 * Everything in a comment that has to be separated by a space.
		 * This should include all embeded command sequences, like [%clk 0:09:56.7]
		 */
		const cmdObjs: CommandObject[] = [];
		// Include the clk embeded command sequence, if the player's clockStamp is present on the move.
		if (move.clockStamp !== undefined)
			cmdObjs.push(icncommentutils.createClkCommandObject(move.clockStamp)); // '[%clk 0:09:56.7]'

		const fullComment = icncommentutils.combineCommentAndCommands(cmdObjs, move.comment); // '[%clk 0:09:56.7] White captures en passant'
		if (fullComment) segments.push('{' + fullComment + '}'); // '{[%clk 0:09:56.7] White captures en passant}'
	}

	// Return the shortform move, adding a space between all segments, if spaces is true
	const segmentDelimiter = options.spaces ? ' ' : '';
	return segments.join(segmentDelimiter); // 'P1,7 x 2,8 =Q + {[%clk 0:09:56.7] White captures en passant}' | 'P1,7x2,8=Q+{[%clk 0:09:56.7] White captures en passant}' | '1,7>2,8Q{[%clk 0:09:56.7]}' | '1,7>2,8Q'
}

/**
 * Parses a compact token move '1,7>2,8=Q' to a readable MoveParsed.
 * `comment` and `clockStamp` will NOT be present.
 */
function parseTokenMove(tokenMove: string): MoveParsed {
	const match = MOVE_TOKEN_REGEX.exec(tokenMove);
	if (match === null) throw Error('Invalid compact move: ' + tokenMove);
	return getParsedMoveFromNamedCapturedMoveGroups(match.groups as NamedCaptureMoveGroups);
}

/**
 * Takes the result.groups of a regex match and parses them into a move.
 * @throws If the promoted piece abbreviation is invalid.
 */
function getParsedMoveFromNamedCapturedMoveGroups(
	capturedGroups: NamedCaptureMoveGroups,
): MoveParsed {
	const startCoordsKey = capturedGroups!.startCoordsKey;
	const endCoordsKey = capturedGroups!.endCoordsKey;
	const promotionAbbr = capturedGroups!.promotionAbbr;
	const comment = capturedGroups!.comment;

	const startCoords = coordutil.getCoordsFromKey(startCoordsKey);
	const endCoords = coordutil.getCoordsFromKey(endCoordsKey);

	const parsedMove: MoveParsed = {
		startCoords,
		endCoords,
		token: getTokenFromParts(startCoordsKey, endCoordsKey, promotionAbbr),
	};
	if (promotionAbbr) parsedMove.promotion = icnposition.getTypeFromAbbr(promotionAbbr);
	if (comment) {
		// Parse the human readable comment from the embeded command sequences
		const parsedComment = icncommentutils.extractCommandsFromComment(comment);
		parsedMove.comment = parsedComment.comment;
		parsedComment.commands.forEach((cmdObj) => {
			if (cmdObj.command === 'clk')
				parsedMove.clockStamp = icncommentutils.getMillisFromClkTimeValue(cmdObj.value);
		});
	}

	return parsedMove;
}

// Compacting & Parsing Move Lists ---------------------------------------------

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
function getShortFormMovesFromMoves(
	moves: MovePreprint[],
	options: { compact: boolean; spaces: boolean; comments: boolean; abbrev: boolean } & (
		| { move_numbers: false }
		| { move_numbers: true; turnOrder: Player[]; fullmove: number; make_new_lines: boolean }
	),
): string {
	// console.log("Getting shortform moves with options:", options);

	// Converts a gamefile's moves list to the most minimal and compact string notation `1,2>3,4|5,6>7,8=N`
	if (options.compact && !options.spaces && !options.comments && !options.move_numbers)
		return moves.map((move) => move.token).join('|'); // Most efficient, as the MoveFull already has the compact form.

	if (!options.move_numbers) {
		const shortforms = moves.map((move) => getShortFormMoveFromMove(move, options));
		const moveDelimiter = options.spaces ? ' | ' : '|';
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
function getShortFormMovesFromMoves_MoveNumbers(
	moves: MovePreprint[],
	options: {
		turnOrder: Player[];
		fullmove: number;
		compact: boolean;
		spaces: boolean;
		comments: boolean;
		make_new_lines: boolean;
		abbrev: boolean;
	},
): string {
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

	/** If true, we can read move.token */
	const mostCompactForm = options.compact && !options.spaces && !options.comments;

	const moveLines: string[] = [];
	let currentLine: string = '';
	moves.forEach((move, i) => {
		const turnIndex = i % options.turnOrder.length;

		// If turn index is 0, start out with the move number
		if (turnIndex === 0)
			currentLine += `${Math.floor(i / options.turnOrder.length) + options.fullmove}. `;
		// Else add the move delimiter
		else currentLine += ' | ';

		// Add the shortform move to the current line
		currentLine += mostCompactForm ? move.token : getShortFormMoveFromMove(move, options);

		// If turn index is the last player, push the current line and start a new one.
		if (turnIndex === options.turnOrder.length - 1) {
			moveLines.push(currentLine);
			currentLine = '';
		}
	});

	// If the last line is not empty, push it to the lines.
	if (currentLine !== '') moveLines.push(currentLine);

	const linesDelimiter = options.make_new_lines ? '\n' : ' ';
	return moveLines.join(linesDelimiter);
}

/** Parses the shortform moves of an ICN into a JSON readable format. */
function parseShortFormMoves(shortformMoves: string): MoveParsed[] {
	// console.log("Parsing shortform moves:", shortformMoves);

	const moves: MoveParsed[] = [];
	const moveRegex = new RegExp(getMoveRegexSource(true), 'g');

	// Since the moveRegex has the global flag, exec() will return the next match each time.
	// NO STRING SPLITTING REQUIRED
	let match: RegExpExecArray | null;
	while ((match = moveRegex.exec(shortformMoves)) !== null) {
		moves.push(
			getParsedMoveFromNamedCapturedMoveGroups(match.groups as NamedCaptureMoveGroups),
		);
	}

	// console.log("Parsed moves:", moves);
	return moves;
}

// Exports ---------------------------------------------------------------------

export default {
	// Regular Expressions
	MOVES_REGEX_SOURCE,
	// Compacting & Parsing Single Moves
	getTokenFromMoveCoords,
	getShortFormMoveFromMove,
	parseTokenMove,
	// Compacting & Parsing Move Lists
	getShortFormMovesFromMoves,
	parseShortFormMoves,
};
