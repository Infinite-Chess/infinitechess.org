
/**
 * This script can weight a user's level of suspiciousness for rating abuse,
 * in attempt to boost their own elo.
 * 
 * This can include repeatedly losing on purpose on an alt account,
 * or playing illegal moves to abort games to avoid losing elo.
 * 
 * Naviary is notified by email of any flagged users.
 */

import { getRecentNRatedGamesForUser } from "../../database/playerGamesManager.js";
import { VariantLeaderboards } from '../../../client/scripts/esm/chess/variants/validleaderboard.js';
import { logEvents, logEventsAndPrint } from '../../middleware/logEvents.js';
import { addEntryToRatingAbuseTable, isEntryInRatingAbuseTable, getRatingAbuseData, updateRatingAbuseColumns } from "../../database/ratingAbuseManager.js";
import { getMultipleGameData } from "../../database/gamesManager.js";


// @ts-ignore
import type { Game } from '../TypeDefinitions.js';


/** How many games played to measure their rating abuse probability again. */
const GAME_INTERVAL_TO_MEASURE = 4;



// Types Definitions ---------------------------------------------------------------------


/** Relevant entries of a PlayerGamesRecord object, which are used for the rating abuse calculation */
type RatingAbuseRelevantPlayerGamesRecord = { 
	game_id: number,
	score: number,
	clock_at_end_millis: number | null,
	elo_change_from_game: number
};

/** Relevant entries of a GamesRecord object, which are used for the rating abuse calculation */
type RatingAbuseRelevantGamesRecord = {
	game_id: number,
	date: string,
	base_time_seconds: number | null,
	increment_seconds: number | null,
	private: 0 | 1,
	termination: string,
	move_count: number,
	time_duration_millis: number | null
};

/** Object containing all relevant information about a specific game, which is used for the rating abuse calculation */
type RatingAbuseRelevantGameInfo = RatingAbuseRelevantPlayerGamesRecord & RatingAbuseRelevantGamesRecord;



// Functions -----------------------------------------------------------------------------


/**
 * Red flags:
 * 
 * Opponents use the same IP address
 * Low move counts (games ended quickly)
 * Win streaks, especially against the same opponents
 * Rapid improvement over days/weeks that should take months, especially if account new
 * Low total rated loss count.
 * Opponents have low total casual matches, and low total rated wins.
 * 
 * Opponent accounts brand new
 * Low game time durations with a high number of close together games, or high clock values at end (indicates no thinking)
 * Excessive resignation terminations
 * Cheat reports against them
 */


/**
 * Monitor suspicion levels for all players who played a particular game in a particular leaderboard
 */
async function measureRatingAbuseAfterGame(game: Game) {
	// Do not monitor suspicion levels, if game was unrated 
	if (!game.rated) return;

	// Do not monitor suspicion levels, if game belongs to no valid leaderboard_id
	const leaderboard_id = VariantLeaderboards[game.variant];
	if (leaderboard_id === undefined) return;

	for (const playerStr in game.players) {
		const user_id = game.players[playerStr].identifier.user_id;
		if (user_id === undefined) {
			await logEventsAndPrint(`Unexpected: trying to access user_id of player in ranked game suspicion monitoring but failed. Game: ${JSON.stringify(game)}`, 'errLog.txt');
			continue;
		}

		await measurePlayerRatingAbuse(user_id, leaderboard_id);
	}
}

/**
 * Weights a specific user's probability of rating abuse on a specified leaderboard.
 * If it flags a user, it sends Naviary an email with data on them.
 */
async function measurePlayerRatingAbuse(user_id: number, leaderboard_id: number) {

	// If player is not in rating_abuse table, add him to it
	if (!isEntryInRatingAbuseTable(user_id, leaderboard_id)) addEntryToRatingAbuseTable(user_id, leaderboard_id);

	// Access the player rating_abuse data
	const rating_abuse_data = getRatingAbuseData(user_id, leaderboard_id, ['game_count_since_last_check', 'last_alerted_at']);
	if (rating_abuse_data === undefined) {
		await logEventsAndPrint(`Unable to read rating_abuse_data of user ${user_id} on leaderboard ${leaderboard_id} while making RatingAbuse check!`, 'errLog.txt');
		return;
	}
	// Increment game_count_since_last_check by 1
	let game_count_since_last_check = 1 + (rating_abuse_data.game_count_since_last_check || 0);

	// Early exit condition if the newly incremented game_count_since_last_check is still below the GAME_INTERVAL_TO_MEASURE threshhold
	if (game_count_since_last_check < GAME_INTERVAL_TO_MEASURE) {
		updateRatingAbuseColumns(user_id, leaderboard_id, { game_count_since_last_check }); // update rating_abuse table with new value for game_count_since_last_check
		// return;
	}

	// Now we run the actual suspicion level check, thereby setting game_count_since_last_check to 0 from now on
	game_count_since_last_check = 0;
	updateRatingAbuseColumns(user_id, leaderboard_id, { game_count_since_last_check });

	// Retrieve the most recent ranked non-aborted games from the player_games table
	const recentPlayerGamesEntries = getRecentNRatedGamesForUser(
		user_id,
		leaderboard_id,
		GAME_INTERVAL_TO_MEASURE,
        ['game_id', 'score', 'clock_at_end_millis', 'elo_change_from_game']
	) as RatingAbuseRelevantPlayerGamesRecord[];
    
	const netRatingChange = recentPlayerGamesEntries.reduce(
		(acc, g) => acc + g.elo_change_from_game,
		0
	);

	// The player has lost elo the past GAME_INTERVAL_TO_MEASURE games. No cause for concern, early exit
	if (netRatingChange <= 0) {
		logEvents(`INNOCENT! Tried to run suspicion check for user ${user_id} on leaderboard ${leaderboard_id}, but user net rating change is not positive: ${netRatingChange}.`, 'ratingAbuseLog.txt');
		return;
	}

	// Retrieve these same games also from the games table
	const game_id_list = recentPlayerGamesEntries.map(recent_game => recent_game.game_id);
	const recentGamesEntries = getMultipleGameData(
		game_id_list,
		['game_id', 'date', 'base_time_seconds', 'increment_seconds', 'private', 'termination', 'move_count', 'time_duration_millis']
	) as RatingAbuseRelevantGamesRecord[];
	const games_table_game_id_list = recentGamesEntries.map(recent_game => recent_game.game_id);

	// Combine the information about the games into a single gameInfoList object
	const gameInfoList: RatingAbuseRelevantGameInfo[] = [];
	for (let i = 0; i < game_id_list.length; i++) {
		const j = games_table_game_id_list.indexOf(game_id_list[i]!);
		// If the same game_id exists in both lists of retrieved database entries, add this game as a single object to gameInfoList
		if (j > -1) gameInfoList.push({ ...recentPlayerGamesEntries[i]!, ...recentGamesEntries[j]! });
	}
	// console.log(gameInfoList);

	
	// Handcrafted game suspicion checking
	const suspicion_level_list: number[] = [];
	for (const gameInfo of gameInfoList) {
		
		// Game is not suspicious is player lost elo from it
		if (gameInfo.elo_change_from_game < 0) {
			suspicion_level_list.push(0);
			continue;
		}

		let game_suspicion_level = 0;

		// Game is suspicious if it contains too few moves
		if (gameInfo.move_count < 10) game_suspicion_level++;

		// Game is suspicious if it lasted too briefly on the server
		if (gameInfo.time_duration_millis !== null && gameInfo.time_duration_millis < 60_000) game_suspicion_level++;

		// Game is suspicious if the clock at the end is still similar to the start time
		if (gameInfo.clock_at_end_millis !== null &&
			gameInfo.base_time_seconds !== null && 
			gameInfo.increment_seconds !== null && 
			gameInfo.clock_at_end_millis >= 0.9 * ( gameInfo.base_time_seconds + gameInfo.increment_seconds * gameInfo.move_count)
		) game_suspicion_level++;


		suspicion_level_list.push(game_suspicion_level);
	}


	const potential_rating_abuse = (suspicion_level_list.filter(num => num !== 0).length > 1);

	// Player is suspicious and Naviary is notified
	if (potential_rating_abuse) {
		logEvents(`GUILTY??? Ran suspicion check for user ${user_id} on leaderboard ${leaderboard_id}, and user might be suspicious! Suspicion list: ${suspicion_level_list}`, 'ratingAbuseLog.txt');
	}
	// Player is not suspicious
	else logEvents(`INNOCENT! Ran suspicion check for user ${user_id} on leaderboard ${leaderboard_id}, but user is not suspicious. Suspicion list: ${suspicion_level_list}`, 'ratingAbuseLog.txt');
}


export default {
	measureRatingAbuseAfterGame,
};

