/**
 * Implementation of Glicko-1 algorithm for calculating rating changes arising from ranked games
 */

import timeutil from '../../../client/scripts/esm/util/timeutil.js';
import { PlayerGroup, type Player } from '../../../client/scripts/esm/chess/util/typeutil.js';
import {
	DEFAULT_LEADERBOARD_RD as defaultRD,
	MIMIMUM_LEADERBOARD_RD as minRD,
	GLICKO_ONE_C as c,
	GLICKO_ONE_Q as q,
	RATING_PERIOD_DURATION as rating_period_duration
} from '../../../client/scripts/esm/chess/variants/leaderboard.js';


// Types -------------------------------------------------------------------------------

/** Type containing all relevant rating calculation quantities for a specific player */
type PlayerRatingData = {
	elo_at_game: number;
	rating_deviation_at_game: number;
	last_rated_game_date: string | null; // A date in string format, as used in the database. Can be null if no games played yet
    elo_after_game?: number;
    rating_deviation_after_game?: number;
	elo_change_from_game?: number;
};

/** A dictionary type with Players as keys, containing PlayerRatingData for each player */
type RatingData = PlayerGroup<PlayerRatingData>;


// Functions -------------------------------------------------------------------------------


/**
 * Computes the effective rating deviation for the current rating period, as for Glicko-1 algorithm
 */
function getTrueRD(rating_deviation: number, last_rated_game_date: string | null) : number {
	if (last_rated_game_date === null) return rating_deviation;
	else {
		const last_rated_game_timestamp = timeutil.sqliteToTimestamp(last_rated_game_date);
		const current_timestamp = Date.now();

		const last_rated_game_period = Math.floor(last_rated_game_timestamp / rating_period_duration);
		const current_period = Math.floor(current_timestamp / rating_period_duration);
		const rating_periods_elapsed = Math.max(0, current_period - last_rated_game_period);

		return Math.max(minRD, Math.min(defaultRD, Math.sqrt(rating_deviation ** 2 + rating_periods_elapsed * c ** 2)));
	}
}

/** Function g of Glicko-1 algorithm */
function g(RD: number) : number {
	return 1 / Math.sqrt( 1 + 3 * (q ** 2) * (RD ** 2) / (Math.PI ** 2) );
}

/** Function E of Glicko-1 algorithm: expected outcome of game */
function E(r: number, r_opp: number, RD_opp: number) : number {
	return 1 / ( 1 + 10 ** ( - g(RD_opp) * (r - r_opp) / 400 ) );
}

/** Function d^2 of Glicko-1 algorithm */
function d_squared(r: number, r_opp: number, RD_opp: number) : number {
	const Es = E(r, r_opp, RD_opp);
	return 1 / ( (q ** 2) * (g(RD_opp) ** 2) * Es * (1 - Es) );
}

/** Given a game outcome for a player, his rating r, his RD, and the opponent'S rating r_opp and RD_opp, compute his new rating with glicko-1 */
function new_rating(outcome: 0 | 0.5 | 1, r: number, RD: number, r_opp: number, RD_opp: number) {
	return r + ( q / ( 1 / RD ** 2 + 1 / d_squared(r, r_opp, RD_opp) ) ) * g(RD_opp) * (outcome - E(r, r_opp, RD_opp));
}

/** Given a player's rating r, his RD, and the opponent'S rating r_opp and RD_opp, compute his new rating with glicko-1 */
function new_RD(r: number, RD: number, r_opp: number, RD_opp: number) {
	return Math.max(minRD, Math.sqrt( 1 / ( 1 / RD ** 2 + 1 / d_squared(r, r_opp, RD_opp) ) ) );
}

/**
 * Takes ratingdata object as an input, with entries: elo_at_game, rating_deviation_at_game and last_rated_game_date.
 * Computes rating data changes and returns ratingdata object by overwriting entries: elo_after_game, rating_deviation_after_game and elo_change_from_game.
 */
function computeRatingDataChanges(ratingdata: RatingData, victor: Player) : RatingData {
	const playerCount = Object.keys(ratingdata).length;

	// Currently, only rating calculations for 2-player games with White vs Black are supported
	if (playerCount !== 2) return ratingdata;
	if (ratingdata[1] === undefined || ratingdata[2] === undefined) return ratingdata;

	const r1 = ratingdata[1].elo_at_game;
	const r2 = ratingdata[2].elo_at_game;
	const RD1 = getTrueRD(ratingdata[1].rating_deviation_at_game, ratingdata[1].last_rated_game_date);
	const RD2 = getTrueRD(ratingdata[2].rating_deviation_at_game, ratingdata[2].last_rated_game_date);
	const outcome_white = (victor === 1 ? 1 : (victor === 2 ? 0 : 0.5 ));
	const outcome_black = (victor === 1 ? 0 : (victor === 2 ? 1 : 0.5 ));

	ratingdata[1].elo_after_game = new_rating(outcome_white, r1, RD1, r2, RD2);
	ratingdata[1].rating_deviation_after_game = new_RD(r1, RD1, r2, RD2);
	ratingdata[1].elo_change_from_game = ratingdata[1].elo_after_game - r1;

	ratingdata[2].elo_after_game = new_rating(outcome_black, r2, RD2, r1, RD1);
	ratingdata[2].rating_deviation_after_game = new_RD(r2, RD2, r1, RD1);
	ratingdata[2].elo_change_from_game = ratingdata[2].elo_after_game - r2;

	return ratingdata;
}



export {
	RatingData,
	getTrueRD,
	computeRatingDataChanges
};