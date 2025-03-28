
/**
 * This script stores the type definition for a game's metadata.
 * 
 * ICN (Infinite Chess Notation) is inspired from PGN notation.
 * https://github.com/tsevasa/infinite-chess-notation
 */

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
	TimeControl: string,
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
	/** How many points each side received from the game (e.g. `"1-0"` means white won, `"1/2-1/2"` means a draw) */
	Result?: string,
	/** What caused the game to end, in spoken language. For example, "Time forfeit". This will always be the win condition that concluded the game. */
	Termination?: string,
}

// getMetadataOfGame()



/**
 * Returns the value of the game's Result metadata, depending on the victor.
 * @param victor - The victor of the game. Can be 'white', 'black', 'draw', or 'aborted'.
 * @returns The result of the game in the format '1-0', '0-1', '0.5-0.5', or '0-0'.
 */
function getResultFromVictor(victor?: Player): string {
	if (victor === players.WHITE) return '1-0';
	else if (victor === players.BLACK) return '0-1';
	else if (victor === players.NEUTRAL) return '1/2-1/2';
	else if (victor === undefined) return '0-0';
	throw new Error(`Cannot get game result from unsupported victor ${victor}!`);
}



export default {
	getResultFromVictor,
};

export type {
	MetaData,
};