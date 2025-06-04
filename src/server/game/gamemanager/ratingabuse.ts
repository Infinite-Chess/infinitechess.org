
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
import timeutil from "../../../client/scripts/esm/util/timeutil.js";
// @ts-ignore
import { sendRatingAbuseEmail } from "../../controllers/sendMail.js";


// @ts-ignore
import type { Game } from '../TypeDefinitions.js';


// Constants -----------------------------------------------------------------------------


/** How many games played to measure their rating abuse probability again. */
const GAME_INTERVAL_TO_MEASURE = 5;

/** Number of suspicious measurements to flag user as suspicious. */
const NUMBER_OF_SUSPICIOUS_ENTRIES_TO_RAISE_ALARM = 3;

/** Number of rated games started close after each other to count as suspicious. */
const TOO_CLOSE_GAMES_AMOUNT = 2;

/** Two rated games started this close after each other count as suspicious. */
const TOO_CLOSE_GAMES_MILLIS = 1000 * 60 * 10; // 10 minutes

/** Games with fewer moves than this are suspicious. */
const SUSPICIOUS_MOVE_COUNT = 10;

/** Games lasting less than this time on the serverare suspicious. */
const SUSPICIOUS_TIME_DURATION_MILLIS = 1000 * 60; // 1 minute

/** A player ending a game with a larger fraction of his total clock time than this counts as suspicious. */
const SUSPICIOUS_CLOCK_REMAINING_FRACTION = 0.9;



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


type SuspicionLevelRecord = {
	game_id?: number,
	suspicion_level: number,
	reason?: string
};



// Functions -----------------------------------------------------------------------------


/**
 * Potential red flags (implemented checks are marked with an X):
 * 
 * (X) Low move counts (games ended quickly)
 * (X) Low game time durations with a high number of close together games, or high clock values at end (indicates no thinking)
 * Opponents use the same IP address
 * Win streaks, especially against the same opponents
 * Rapid improvement over days/weeks that should take months, especially if account new
 * Low total rated loss count
 * Opponents have low total casual matches, and low total rated wins
 * Opponent accounts brand new
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
		return;
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
		logEvents(`INNOCENT! Tried to run suspicion check for user ${user_id} on leaderboard ${leaderboard_id}, but user net rating change is not positive: ${netRatingChange} in the last ${GAME_INTERVAL_TO_MEASURE} games.`, 'ratingAbuseLog.txt');
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


	// Handcrafted game suspicion checking ------------------------------------------


	/** An Object containg a suspicion level score for various monitored things */
	const suspicion_level_record_list: SuspicionLevelRecord[] = [];


	// Check if the game dates are too close in proximity to each other
	const sorted_timestamp_list = gameInfoList.map(game_info => game_info.date).map(date => timeutil.sqliteToTimestamp(date)).sort();
	const timestamp_differences: number[] = [];
	for (let i = 1; i < sorted_timestamp_list.length; i++) {
		timestamp_differences.push(sorted_timestamp_list[i]! - sorted_timestamp_list[i - 1]!);
	}
	const close_game_pairs_amount = timestamp_differences.filter(diff => diff < TOO_CLOSE_GAMES_MILLIS).length;
	if (close_game_pairs_amount >= TOO_CLOSE_GAMES_AMOUNT) {
		suspicion_level_record_list.push({
			suspicion_level: 3,
			reason: `There are ${close_game_pairs_amount} game pairs, where games started within ${(TOO_CLOSE_GAMES_MILLIS / 60_000)} minutes of each other.`
		});
	}


	// Iterate over all games in gameInfoList to set their suspicion level score
	for (const gameInfo of gameInfoList) {
		
		// Game is not suspicious is player lost elo from it
		if (gameInfo.elo_change_from_game < 0) {
			suspicion_level_record_list.push({
				game_id: gameInfo.game_id,
				suspicion_level: 0
			});
			continue;
		}

		let game_suspicion_level = 0;
		let reason = "";

		// Game is suspicious if it contains too few moves
		if (gameInfo.move_count < SUSPICIOUS_MOVE_COUNT) {
			game_suspicion_level++;
			reason += `Game contains ${gameInfo.move_count} moves. `;
		}

		// Game is suspicious if it lasted too briefly on the server
		if (gameInfo.time_duration_millis !== null && gameInfo.time_duration_millis < SUSPICIOUS_TIME_DURATION_MILLIS) {
			game_suspicion_level++;
			reason += `Game lasted only ${gameInfo.time_duration_millis} millis on the server. `;
		}

		// Game is suspicious if the clock at the end is still similar to the start time
		if (gameInfo.clock_at_end_millis !== null &&
			gameInfo.base_time_seconds !== null &&
			gameInfo.increment_seconds !== null &&
			gameInfo.clock_at_end_millis >= SUSPICIOUS_CLOCK_REMAINING_FRACTION * ( gameInfo.base_time_seconds + gameInfo.increment_seconds * gameInfo.move_count)
		) {
			game_suspicion_level++;
			reason += `Player still has ${gameInfo.clock_at_end_millis} millis on his clock at the end of the game, with time control ${gameInfo.base_time_seconds}+${gameInfo.increment_seconds} and ${gameInfo.move_count} moves played. `;
		}


		suspicion_level_record_list.push({
			game_id: gameInfo.game_id,
			suspicion_level: game_suspicion_level,
			reason: (reason !== "" ? reason : undefined)
		});
	}

	
	// Rating abuse if at least 2 entries have a positive suspicion level
	const potential_rating_abuse = (suspicion_level_record_list.map(entry => entry.suspicion_level).filter(num => num !== 0).length >= NUMBER_OF_SUSPICIOUS_ENTRIES_TO_RAISE_ALARM);
	const suspicion_sum = suspicion_level_record_list.map(entry => entry.suspicion_level).reduce((acc, cur) => acc + cur, 0);

	// Player is suspicious and Naviary is notified
	if (potential_rating_abuse) {
		const messageText = `>>>>>>>>>>>>>>> GUILTY??? Ran suspicion check for user ${user_id} on leaderboard ${leaderboard_id} with net rating change ${netRatingChange} in the last ${GAME_INTERVAL_TO_MEASURE} games, and user might be suspicious! Suspicion sum: ${suspicion_sum}. Suspicion list: ${JSON.stringify(suspicion_level_record_list, null, 2)}`;
		logEventsAndPrint(messageText.replace(/[\n\r\t]/g,""), 'ratingAbuseLog.txt');
		sendRatingAbuseEmail(messageText);
	}
	// Player is not suspicious
	else logEvents(`INNOCENT! Ran suspicion check for user ${user_id} on leaderboard ${leaderboard_id} with net rating change ${netRatingChange} in the last ${GAME_INTERVAL_TO_MEASURE} games, but user is not suspicious. Suspicion sum: ${suspicion_sum}. Suspicion list: ${JSON.stringify(suspicion_level_record_list)}`, 'ratingAbuseLog.txt');
}


export default {
	measureRatingAbuseAfterGame,
};

