/**
 * Implementation of glicko-1 algorithm for calculating rating changes arising from ranked games
 */

import { PlayerGroup, type Player } from '../../../client/scripts/esm/chess/util/typeutil.js';
import { DEFAULT_LEADERBOARD_ELO, DEFAULT_RATING_DEVIATION } from '../../../client/scripts/esm/chess/variants/leaderboard.js';


// Types -------------------------------------------------------------------------------

/** Type containing all relevant rating calculation quantities for a specific player */
type PlayerRatingData = {
	elo_at_game?: number;
	rating_deviation_at_game?: number;
	last_rated_game_date?: string | null; // A date in string format, as used in the database. Can be null if no games played yet
    elo_after_game?: number;
    rating_deviation_after_game?: number;
	elo_change_from_game?: number;
};

/** A dictionary type with Players as keys, containing PlayerRatingData for each player */
type RatingData = PlayerGroup<PlayerRatingData>;


// Default variables -------------------------------------------------------------------------------




// Functions -------------------------------------------------------------------------------

/**
 * Takes ratingdata object as an input, with entries: elo_at_game, rating_deviation_at_game and last_rated_game_date.
 * Computes rating data changes and returns ratingdata object by overwriting entries: elo_after_game, rating_deviation_after_game and elo_change_from_game.
 */
function computeRatingDataChanges(ratingdata: RatingData, victor: Player) : RatingData {
	const playerCount = Object.keys(ratingdata).length;

	// Currently, only rating calculations for 2-player games are supported
	if (playerCount !== 2) return ratingdata;
	if (ratingdata[1] === undefined || ratingdata[2] === undefined) return ratingdata;

	for (const player of Object.keys(ratingdata) as unknown[] as Player[]) {
		const playerratingdata = ratingdata[player];
		const rating_change = (victor === player ? 1 : -1);
		//@ts-ignore
		playerratingdata.elo_after_game = playerratingdata.elo_at_game - rating_change;
		//@ts-ignore
		playerratingdata.rating_deviation_after_game = playerratingdata.rating_deviation_after_game - 1;
		//@ts-ignore
		playerratingdata.elo_change_from_game = rating_change;
	}
	return ratingdata;
}



export {
	RatingData,
	computeRatingDataChanges
};