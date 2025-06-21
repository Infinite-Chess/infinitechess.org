
/**
 * This script stores the type definition for a game's metadata.
 * 
 * ICN (Infinite Chess Notation) is inspired from PGN notation.
 * https://github.com/tsevasa/infinite-chess-notation
 */

import { Rating } from "../../../../../server/database/leaderboardsManager.js";
import { players } from "./typeutil.js";

import type { Player } from "./typeutil.js";

// Type Definitions ---------------------------------------------------------------


interface MetaData {
	/** What kind of game (rated/casual), and variant, in spoken language. For example, "Casual local Classical infinite chess game". This phrase goes: "Casual/Rated variantName infinite chess game." */
	Event: string,
	/** What website the game was played on. Right now this has no application because infinitechess.org is the ONLY site you can play this game on. */
	Site: 'https://www.infinitechess.org/',
	/**
	 * The clock value for the game, in the form `"s+s"`, where the left
	 * is start time in seconds, and the right is increment in seconds.
	 * 
	 * If the game is untimed, this should be `"-"`
	 */
	TimeControl: `${number}+${number}` | '-',
	/** The round number (between players? idk. This is a pgn-required metadata, but it has no application to infinitechess.org right now) */
	Round: '-',
	/** The UTC date of the game, in the format `"YYYY.MM.DD"` */
	UTCDate: string,
	/** The UTC time the game started, in the format `"HH:MM:SS"` */
	UTCTime: string,
	/** If it's not a custom position, this must be one of the valid variants in variant.ts*/
	Variant?: string,
	White?: string,
	Black?: string,
	/** The ID of the white player, if they are signed in, converted to base 62. */
	WhiteID?: string,
	/** The ID of the black player, if they are signed in, converted to base 62. */
	BlackID?: string,
	/** The display elo of the white player, whihc may includ a "?" if we're uncertain about their rating. */
	WhiteElo?: string,
	/** The display elo of the black player, whihc may includ a "?" if we're uncertain about their rating. */
	BlackElo?: string,
	/** How much elo white gained/lost from the match. */
	WhiteRatingDiff?: string,
	/** How much elo black gained/lost from the match. */
	BlackRatingDiff?: string,
	/** How many points each side received from the game (e.g. `"1-0"` means white won, `"1/2-1/2"` means a draw) */
	Result?: string,
	/** What caused the game to end, in spoken language. For example, "Time forfeit". This will always be the win condition that concluded the game. */
	Termination?: string,
}



/**
 * Returns the value of the game's Result metadata, depending on the victor.
 * @param victor - The victor of the game, in player number. Or none if undefined.
 * @returns The result of the game in the format '1-0', '0-1', '0.5-0.5', or '*' (aborted).
 */
function getResultFromVictor(victor?: Player): string {
	if (victor === players.WHITE) return '1-0';
	else if (victor === players.BLACK) return '0-1';
	else if (victor === players.NEUTRAL) return '1/2-1/2';
	else if (victor === undefined) return '*';
	throw new Error(`Cannot get game result from unsupported victor ${victor}!`);
}

/** Calculates the game conclusion from the Result metadata and termination CODE. */
function getGameConclusionFromResultAndTermination(result: string, termination: string) {
	if (!result || !termination) throw Error("Must provide both result and termination.");

	if (termination === 'aborted') return 'aborted';
	const victor: Player =
		result === '1-0' ? players.WHITE :
		result === '0-1' ? players.BLACK :
		result === '1/2-1/2' ? players.NEUTRAL :
		(() => { throw Error(`Unsupported result (${result})!`); })();
	return `${victor} ${termination}`;
}

/** Rounds the elo. And, if we're not confident about its value, appends a question mark "?" to it. */
function getWhiteBlackElo(rating: Rating): string {
	const roundedElo = Math.round(rating.value);
	return rating.confident ? `${roundedElo}` : `${roundedElo}?`;
}

/**
 * Parses the elo and confidence from WhiteElo/BlackElo metadata.
 * ONLY HAS AS MUCH PRECISION as what's in the metadata.
 * DOES NOT KNOW whether their current rating is now confident, if thir WhiteElo/BlackElo was not confident.
 */
function getRatingFromWhiteBlackElo(whiteBlackElo: string): Rating {
	const [elo, emptyStr] = whiteBlackElo.split('?'); // emptyStr will be '' if the '?' is present, otherwise it will be undefined.
	return {
		value: Number(elo),
		confident: emptyStr === undefined,
	};
}

/**
 * Takes elo change, calculates the string that should go into
 * the WhiteRatingDiff or BlackRatingDiff fields of the metadata.
 */
function getWhiteBlackRatingDiff(eloChange: number): string {
	const isPositive = eloChange >= 0;
	eloChange = Math.round(eloChange);
	return isPositive ? `+${eloChange}` : `${eloChange}`; // negative numbers are already negative
}



export default {
	getResultFromVictor,
	getGameConclusionFromResultAndTermination,
	getWhiteBlackElo,
	getRatingFromWhiteBlackElo,
	getWhiteBlackRatingDiff,
};

export type {
	MetaData,
};