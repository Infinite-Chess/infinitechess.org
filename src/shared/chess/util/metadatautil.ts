// src/shared/chess/util/metadatautil.ts

/**
 * This script stores the type definition for a game's metadata.
 *
 * ICN (Infinite Chess Notation) is inspired from PGN notation.
 * https://github.com/tsevasa/infinite-chess-notation
 */

import type { Rating } from '../../../server/database/leaderboardsManager.js';
import type { Player } from './typeutil.js';
import type { TimeControl } from './clockutil.js';

import { players as p } from './typeutil.js';

// Types --------------------------------------------------------------------------

interface MetaData {
	/** What kind of game (rated/casual), and variant, in spoken language. For example, "Casual local Classical infinite chess game". This phrase goes: "Casual/Rated variantName infinite chess game." */
	Event?: string;
	/** What website the game was played on. Right now this has no application because infinitechess.org is the ONLY site you can play this game on. */
	Site?: 'https://www.infinitechess.org/';
	/**
	 * The clock value for the game, in the form `"s+s"`, where the left
	 * is start time in seconds, and the right is increment in seconds.
	 *
	 * If the game is untimed, this should be `"-"`
	 */
	TimeControl?: TimeControl;
	/** The round number (between players? idk. This is a pgn-required metadata, but it has no application to infinitechess.org right now) */
	Round?: '-';
	/** The UTC date of the game, in the format `"YYYY.MM.DD"` */
	UTCDate?: string;
	/** The UTC time the game started, in the format `"HH:MM:SS"` */
	UTCTime?: string;
	/** If it's not a custom position, this must be one of the valid variants in variant.ts*/
	Variant?: string;
	White?: string;
	Black?: string;
	/** The ID of the white player, if they are signed in, converted to base 62. */
	WhiteID?: string;
	/** The ID of the black player, if they are signed in, converted to base 62. */
	BlackID?: string;
	/** The display elo of the white player, whihc may includ a "?" if we're uncertain about their rating. */
	WhiteElo?: string;
	/** The display elo of the black player, whihc may includ a "?" if we're uncertain about their rating. */
	BlackElo?: string;
	/** How much elo white gained/lost from the match. */
	WhiteRatingDiff?: string;
	/** How much elo black gained/lost from the match. */
	BlackRatingDiff?: string;
	/** How many points each side received from the game (e.g. `"1-0"` means white won, `"1/2-1/2"` means a draw) */
	Result?: string;
	/** What caused the game to end, in spoken language. For example, "Time forfeit". This will always be the win condition that concluded the game. */
	Termination?: string;
}

/** All valid metadata names. */
type MetadataKey = keyof MetaData;

// Functions -----------------------------------------------------------------------

/**
 * Returns the value of the game's Result metadata, depending on the victor.
 * @param victor - The victor of the game, in player number. Or none if undefined.
 * @returns The result of the game in the format '1-0', '0-1', '1/2-1/2', or '*' (aborted).
 */
function getResultFromVictor(victor?: Player | null): string {
	if (victor === p.WHITE) return '1-0';
	else if (victor === p.BLACK) return '0-1';
	else if (victor === null) return '1/2-1/2';
	else if (victor === undefined) return '*';
	throw new Error(`Cannot get game result from unsupported victor ${victor}!`);
}

/** Rounds the elo. And, if we're not confident about its value, appends a question mark "?" to it. */
function getFormattedElo(rating: Rating): string {
	const roundedElo = Math.round(rating.value);
	return rating.confident ? `${roundedElo}` : `${roundedElo}?`;
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
	getFormattedElo,
	getWhiteBlackRatingDiff,
};

export type { MetaData, MetadataKey };
