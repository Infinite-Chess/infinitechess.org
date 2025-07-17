
/**
 * This script can weight a user's level of suspiciousness for rating abuse,
 * in attempt to boost their own elo.
 * 
 * This can include repeatedly losing on purpose on an alt account,
 * or playing illegal moves to abort games to avoid losing elo.
 * 
 * Naviary is notified by email of any flagged users.
 */

import { getRecentNRatedGamesForUser, getOpponentsOfUserFromGames } from "../../database/playerGamesManager.js";
import { addEntryToRatingAbuseTable, isEntryInRatingAbuseTable, getRatingAbuseData, updateRatingAbuseColumns } from "../../database/ratingAbuseManager.js";
import { findRefreshTokensForUsers } from "../../database/refreshTokenManager.js";
import { VariantLeaderboards } from '../../../client/scripts/esm/chess/variants/validleaderboard.js';
import { logEvents, logEventsAndPrint } from '../../middleware/logEvents.js';
import { getMultipleGameData } from "../../database/gamesManager.js";
import timeutil from "../../../client/scripts/esm/util/timeutil.js";
import { sendRatingAbuseEmail } from "../../controllers/sendMail.js";
// @ts-ignore
import { getMultipleMemberDataByCriteria } from "../../database/memberManager.js";
// @ts-ignore
import winconutil from "../../../client/scripts/esm/chess/util/winconutil.js";


import type { RefreshTokenRecord } from "../../database/refreshTokenManager.js";
// @ts-ignore
import type { Game } from '../TypeDefinitions.js';



/**
 * Potential red flags (already implemented checks are marked with an X at the start of the line):
 * 
 * (X) Low move counts (games ended quickly)
 * (X) Low game time durations with a high number of close together games, or high clock values at end (indicates no thinking)
 * (X) Opponents use the same IP address. OR The player has no active refresh tokens (logged out mid-game)
 * (X) Many games against always the same opponents
 * (X) Opponent accounts brand new
 * 
 * Win streaks, especially against the same opponents
 * Rapid improvement over days/weeks that should take months, especially if account new
 * Low total rated loss count
 * Opponents have low total casual matches, and low total rated wins
 * Excessive resignation terminations
 * Cheat reports against them
 */



// Constants -----------------------------------------------------------------------------


/** How many games played to measure a player's rating abuse probability at once. */
const GAME_INTERVAL_TO_MEASURE = 5;

/** Total suspicion score which is enough to mark a user as suspicious. */
const SUSPICION_TOTAL_WEIGHT_THRESHHOLD = 1.0;

/** Buffer time for sending the next email. If a user is found suspicious several times in that interval, no email is sent. */
const SUSPICIOUS_USER_NOTIFICATION_BUFFER_MILLIS = 1000 * 60 * 60 * 24; // 24 hours

/**
 * Two rated games started this close after each other have a nonzero suspicion score.
 * 
 * Slightly higher than {@link SUSPICIOUS_TIME_DURATION_MILLIS} to account for time to accept a new invite.
 */
const TOO_CLOSE_GAMES_MILLIS = 1000 * 60 * 3.5; // 3.5 minutes

/**
 * Games with fewer moves than this have a nonzero suspicion score.
 * 
 * Average move count per game is 38 moves.
 */
const SUSPICIOUS_MOVE_COUNT = 25;

/** Games lasting less than this time on the server have a nonzero suspicion score. */
const SUSPICIOUS_TIME_DURATION_MILLIS = 1000 * 60 * 3; // 3 minutes

/** Opponents with a younger account age than this count as suspicious. */
const SUSPICIOUS_ACCOUNT_AGE_MILLIS = 1000 * 60 * 60 * 24 * 5; // 5 days



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

/** Relevant entries of a MemberRecord object, which are used for the rating abuse calculation */
type RatingAbuseRelevantMemberRecord = {
	username: string,
	user_id: number,
	joined: string
};

/** Object containing information about analysis of suspicion level of some characteristic */
type SuspicionLevelRecord = {
	category: 'close_game_pairs' | 'move_count' | 'duration' | 'clock_at_end' | 'same_opponents' | 'ip_addresses' | 'opponent_account_age',
	weight: number,
	comment?: string
};



// Functions -----------------------------------------------------------------------------


/**
 * Monitor suspicion levels for all players who played a particular game in a particular leaderboard
 */
async function measureRatingAbuseAfterGame(game: Game) {
	// Do not monitor suspicion levels, if game was unrated 
	if (!game.rated) return;
	// Skip if the game was aborted (this also covers 0 moves),
	// the game will NOT have added an entry in the leaderboards table for the players!
	if (winconutil.getVictorAndConditionFromGameConclusion(game.gameConclusion!).victor === undefined) return;

	// Do not monitor suspicion levels, if game belongs to no valid leaderboard_id
	const leaderboard_id = VariantLeaderboards[game.variant];
	if (leaderboard_id === undefined) return;

	for (const [playerStr, player] of Object.entries(game.players)) {
		if (!player.identifier.signedIn) {
			await logEventsAndPrint(`Unexpected: Player "${playerStr}" is not signed in. Game: ${JSON.stringify(game)}`,'errLog.txt');
			continue;
		}
		const user_id = player.identifier.user_id;
		const username = player.identifier.username;
		if (user_id === undefined || username === undefined) {
			await logEventsAndPrint(`Unexpected: trying to access user_id and username of player ${playerStr} in ranked game suspicion monitoring but failed. Game: ${JSON.stringify(game)}`, 'errLog.txt');
			continue;
		}

		try {
			await measurePlayerRatingAbuse(user_id, username, leaderboard_id);
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			await logEventsAndPrint(`Error running rating_abuse checks for user ID "${user_id}" on leaderboard ${leaderboard_id}: ${message}`, 'errLog.txt');
		}
	}
}

/**
 * Weights a specific user's probability of rating abuse on a specified leaderboard.
 * If it flags a user, it sends Naviary an email with data on them.
 */
async function measurePlayerRatingAbuse(user_id: number, username: string, leaderboard_id: number) {

	// If player is not in rating_abuse table, add him to it
	if (!isEntryInRatingAbuseTable(user_id, leaderboard_id)) {
		const result = addEntryToRatingAbuseTable(user_id, leaderboard_id);
		if (!result.success) {
			await logEventsAndPrint(`Failed to add user ${user_id} to rating_abuse table for leaderboard ${leaderboard_id} for reason: ${result.reason}`, 'errLog.txt');
			return;
		}
	}

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
	const game_id_list = recentPlayerGamesEntries.map(recent_game => recent_game.game_id);

	// The player has lost elo the past GAME_INTERVAL_TO_MEASURE games. No cause for concern, early exit
	if (netRatingChange <= 0) {
		const messageText = `Innocent: Ran suspicion check for user ${username} with user_id ${user_id} on leaderboard ${leaderboard_id}, but user net rating change ${netRatingChange} is not positive in the last ${GAME_INTERVAL_TO_MEASURE} games. Game IDs: ${JSON.stringify(game_id_list)}.`;
		await logEvents(messageText, 'ratingAbuseLog.txt');
		return;
	}

	// Retrieve these same games also from the games table
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
		else await logEventsAndPrint(`Found game_id ${game_id_list[i]!} in player_games table but not it games table, during rating abuse calculation`, 'errLog.txt');
	}
	// console.log(gameInfoList);

	// Get a list of the user_ids of the previous opponents of the player
	const opponentPlayerGamesEntries = getOpponentsOfUserFromGames(user_id, game_id_list, ['user_id']);
	const user_id_list = opponentPlayerGamesEntries.map(entry => entry.user_id!);
	const unique_user_id_list = [...new Set(user_id_list)];

	// Dictionary of frequencies of user_ids in user_id_list
	const user_id_frequency: { [key: number] : number } = {};
	for (const user_id of user_id_list) {
		user_id_frequency[user_id] = (user_id_frequency[user_id] || 0) + 1;
	}

	// Get the refresh tokens of the user and all his opponents
	let refreshTokenEntries: RefreshTokenRecord[];
	try {
		refreshTokenEntries = findRefreshTokensForUsers([user_id, ...unique_user_id_list]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		await logEventsAndPrint(`Error fetching refresh token entries for users "${JSON.stringify([user_id, ...unique_user_id_list])}": ${message}`, 'errLog.txt');
		refreshTokenEntries = [];
	}

	// Extract the IP addresses of the user and his opponents from the refresh tokens
	const user_ip_address_list: string[] = []; // ip_addresses of the user
	const opponent_ip_address_lists: { [ key: number ] : string[] } = {}; // ip_addresses of his unique opponents
	for (const refreshToken of refreshTokenEntries) {
		if (refreshToken.ip_address === null) continue;

		// If the refresh token belongs to the user, add his IP address to user_ip_address_list
		if (refreshToken.user_id === user_id) user_ip_address_list.push(refreshToken.ip_address);

		// Else, add the IP address to the opponent_ip_address_list
		else if (refreshToken.user_id in user_id_frequency) {
			opponent_ip_address_lists[refreshToken.user_id] = opponent_ip_address_lists[refreshToken.user_id] || []; // Initialize if undefined
			opponent_ip_address_lists[refreshToken.user_id]!.push(refreshToken.ip_address);
		}
	}

	// Get relevant MemberRecords of the opponents from the members table
	const opponentInfoList = getMultipleMemberDataByCriteria(
		['username', 'user_id', 'joined'],
		'user_id',
		unique_user_id_list
	) as RatingAbuseRelevantMemberRecord[];


	// Handcrafted game suspicion checking ------------------------------------------


	/** An Object containg a suspicion level score for various monitored things */
	const suspicion_level_record_list: SuspicionLevelRecord[] = [];
	
	// Run various checks and add entries to suspicion_level_record_list, if necessary
	checkCloseGamePairs(gameInfoList, suspicion_level_record_list);
	checkMoveCounts(gameInfoList, suspicion_level_record_list);
	checkDurations(gameInfoList, suspicion_level_record_list);
	checkClockAtEnd(gameInfoList, suspicion_level_record_list);
	checkOpponentSameness(user_id_list, user_id_frequency, suspicion_level_record_list);
	checkIPAddresses(user_id_list, user_id_frequency, user_ip_address_list, opponent_ip_address_lists, suspicion_level_record_list);
	checkOpponentAccountAge(user_id_list, user_id_frequency, opponentInfoList, suspicion_level_record_list);
	
	/** Sum of all suspicion weights in suspicion_level_record_list */
	const suspicion_total_weight = suspicion_level_record_list.map(entry => entry.weight).reduce((acc, cur) => acc + cur, 0);

	// Player is suspicious and admin is notified if necessary
	if (suspicion_total_weight >= SUSPICION_TOTAL_WEIGHT_THRESHHOLD) {
		const messageText = `
>>>>>> GUILTY??? Suspicion total weight: ${suspicion_total_weight}.
Ran suspicion check for user ${username} with user_id ${user_id} on leaderboard ${leaderboard_id} with net rating change ${netRatingChange} in the last ${GAME_INTERVAL_TO_MEASURE} games, and user might be cheating!
Suspicion level record: ${JSON.stringify(suspicion_level_record_list, undefined, 2)}.
Opponent user_id_list: ${JSON.stringify(user_id_list)}.
OpponentInfoList: ${JSON.stringify(opponentInfoList, undefined, 2)}.
Game_id_list: ${JSON.stringify(game_id_list)}.
\nGameInfo list: ${JSON.stringify(gameInfoList, undefined, 2)}.
		`;
		await logEventsAndPrint('\n' + messageText, 'ratingAbuseLog.txt');

		// If enough time has passed from the last alarm for that user, send an email about his rating abuse
		if (rating_abuse_data.last_alerted_at === null || rating_abuse_data.last_alerted_at === undefined || Date.now() - timeutil.sqliteToTimestamp(rating_abuse_data.last_alerted_at) >= SUSPICIOUS_USER_NOTIFICATION_BUFFER_MILLIS) {
			const messageSubject = `Rating Abuse Warning: user ${username}, user_id ${user_id}`;
			await sendRatingAbuseEmail(messageSubject, messageText);
			// Update RatingAbuse table with last_alerted_at value
			const last_alerted_at = timeutil.timestampToSqlite(Date.now());
			updateRatingAbuseColumns(user_id, leaderboard_id, { last_alerted_at });
		}
	}
	// Player is not suspicious
	else {
		const messageText = 
`Innocent? Suspicion total weight: ${suspicion_total_weight}. ` +
`Ran suspicion check for user ${username} with user_id ${user_id} on leaderboard ${leaderboard_id} with net rating change ${netRatingChange} in the last ${GAME_INTERVAL_TO_MEASURE} games, and user seems innocent.` +
`Suspicion level record: ${JSON.stringify(suspicion_level_record_list)}. ` +
`Opponent user_id_list: ${JSON.stringify(user_id_list)}. ` +
`OpponentInfoList: ${JSON.stringify(opponentInfoList)}. ` +
`Game_id_list: ${JSON.stringify(game_id_list)}. ` +
`GameInfo list: ${JSON.stringify(gameInfoList)}.`;
		await logEvents(messageText, 'ratingAbuseLog.txt');
	}
}

/**
 * Check if the game dates are too close in proximity to each other
 * If yes, append entry to suspicion_level_record_list.
 */
function checkCloseGamePairs(gameInfoList: RatingAbuseRelevantGameInfo[], suspicion_level_record_list: SuspicionLevelRecord[]) {
	const sorted_timestamp_list = gameInfoList.map(game_info => timeutil.sqliteToTimestamp(game_info.date)).sort();
	const timestamp_differences: number[] = [];
	for (let i = 1; i < sorted_timestamp_list.length; i++) {
		timestamp_differences.push(sorted_timestamp_list[i]! - sorted_timestamp_list[i - 1]!);
	}
	const close_game_pairs_amount = timestamp_differences.filter(diff => diff < TOO_CLOSE_GAMES_MILLIS).length;
	if (close_game_pairs_amount > 0) {
		suspicion_level_record_list.push({
			category: 'close_game_pairs',
			weight: (close_game_pairs_amount / timestamp_differences.length) * 0.5, // rescale to [0, 0.5]
			comment: `Amount: ${close_game_pairs_amount}`
		});
	}
}

/** 
 * Check if the move counts of the games in gameInfoList are too low.
 * If yes, append entry to suspicion_level_record_list.
 */
function checkMoveCounts(gameInfoList: RatingAbuseRelevantGameInfo[], suspicion_level_record_list: SuspicionLevelRecord[]) {
	let weight = 0;
	let comment = "";
	for (const gameInfo of gameInfoList) {
		if (gameInfo.elo_change_from_game < 0) continue; // Game is not suspicious is player lost elo from it

		// Game is suspicious if it contains too few moves
		if (gameInfo.move_count <= SUSPICIOUS_MOVE_COUNT) {
			const fraction = Math.max(0, (gameInfo.move_count - 2) / (SUSPICIOUS_MOVE_COUNT - 2)); // fraction is in the interval [0, 1]
			weight += 1 - fraction;
			comment += `Game ${gameInfo.game_id} lasted ${gameInfo.move_count} moves. `;
		}
	}
	if (weight > 0) suspicion_level_record_list.push({
		category: 'move_count',
		weight: (weight / gameInfoList.length) * 0.5, // rescale to [0,0.5]
		comment
	});
}

/** 
 * Check if the durations on the server of the games in gameInfoList are too low.
 * If yes, append entry to suspicion_level_record_list.
 */
function checkDurations(gameInfoList: RatingAbuseRelevantGameInfo[], suspicion_level_record_list: SuspicionLevelRecord[]) {
	let weight = 0;
	let comment = "";
	for (const gameInfo of gameInfoList) {
		if (gameInfo.elo_change_from_game < 0) continue; // Game is not suspicious is player lost elo from it

		// Game is suspicious if it lasted too briefly on the server
		if (gameInfo.time_duration_millis !== null && gameInfo.time_duration_millis <= SUSPICIOUS_TIME_DURATION_MILLIS) {
			const fraction = gameInfo.time_duration_millis / SUSPICIOUS_TIME_DURATION_MILLIS; // fraction is in the interval [0, 1]
			weight += 1 - fraction;
			comment += `Game ${gameInfo.game_id} lasted ${Math.round(gameInfo.time_duration_millis / 1000)}s. `;
		}
	}
	if (weight > 0) suspicion_level_record_list.push({
		category: 'duration',
		weight: (weight / gameInfoList.length) * 0.8, // rescale to [0,0.8]
		comment
	});
}

/** 
 * Check if the clock at the end of the games in gameInfoList are too low.
 * If yes, append entry to suspicion_level_record_list.
 */
function checkClockAtEnd(gameInfoList: RatingAbuseRelevantGameInfo[], suspicion_level_record_list: SuspicionLevelRecord[]) {
	let weight = 0;
	let comment = "";
	for (const gameInfo of gameInfoList) {
		if (gameInfo.elo_change_from_game < 0) continue; // Game is not suspicious is player lost elo from it

		// Game is suspicious if the clock at the end is still similar to the start time
		if (gameInfo.clock_at_end_millis !== null &&
			gameInfo.base_time_seconds !== null &&
			gameInfo.increment_seconds !== null
		) {
			const approximate_total_time_millis = 1000 * ( gameInfo.base_time_seconds + 0.5 * gameInfo.increment_seconds * (gameInfo.move_count - 1) );
			if (approximate_total_time_millis > 0 && gameInfo.clock_at_end_millis >= 0.8 * approximate_total_time_millis) {
				const fraction = Math.min(1, gameInfo.clock_at_end_millis / approximate_total_time_millis); // fraction is in the interval [0.8, 1]
				weight += 5 * fraction - 4; // rescale to [0,1]
				comment += `At end of game ${gameInfo.game_id} with time control ${gameInfo.base_time_seconds / 60}m+${gameInfo.increment_seconds}s, player has ${(gameInfo.clock_at_end_millis / 60_000).toFixed(2)}m left. `;
			}
		}
	}
	if (weight > 0) suspicion_level_record_list.push({
		category: 'clock_at_end',
		weight: (weight / gameInfoList.length) * 0.4, // rescale to [0, 0.4]
		comment
	});
}

/** 
 * Check if the user is playing against the same opponents many times.
 * If yes, append entry to suspicion_level_record_list.
 */
function checkOpponentSameness(user_id_list: number[], user_id_frequency: { [key: number] : number }, suspicion_level_record_list: SuspicionLevelRecord[]) {
	if (user_id_list.length === 0) return;

	let weight = 0;
	for (const frequency of Object.values(user_id_frequency)) {
		// Player is suspicious if he played against the same opponent several times
		if (frequency > 1) weight += frequency ** 2;
	}
	if (weight > 0) suspicion_level_record_list.push({
		category: 'same_opponents',
		weight: (weight / (user_id_list.length ** 2)) * 0.5 // rescale to [0, 0.5]
	});
}

/** 
 * Check if the user is using the same IP address as his opponents.
 * If yes, append entry to suspicion_level_record_list.
 */
function checkIPAddresses(
	user_id_list: number[],
	user_id_frequency: { [key: number] : number },
	user_ip_address_list: string[],
	opponent_ip_address_lists: { [ key: number ] : string[] },
	suspicion_level_record_list: SuspicionLevelRecord[]
) {
	// Player logged out mid game
	if (user_ip_address_list.length === 0) {
		suspicion_level_record_list.push({
			category: 'ip_addresses',
			weight: 0.5,
			comment: 'Player logged out mid-game.'
		});
		return;
	}
	else if (user_id_list.length === 0 || Object.keys(opponent_ip_address_lists).length === 0) return; 

	let weight = 0;
	let comment = "Opponents using same IP address: ";
	for (const user_id in opponent_ip_address_lists) {
		// Player is suspicious if he uses a same IP adress as an opponent
		const common_ip_addresses = user_ip_address_list.filter(ip_address => opponent_ip_address_lists[user_id]!.includes(ip_address));
		if (common_ip_addresses.length > 0) {
			weight += user_id_frequency[user_id] ?? 0;
			comment += `${user_id},`;
		}
	}
	if (weight > 0) suspicion_level_record_list.push({
		category: 'ip_addresses',
		weight: (weight / user_id_list.length) * 0.5, // rescale to [0, 0.5]
		comment
	});
}

/** 
 * Check if the user's opponents have newly created accounts
 * If yes, append entry to suspicion_level_record_list.
 */
function checkOpponentAccountAge(
	user_id_list: number[],
	user_id_frequency: { [key: number] : number },
	opponentInfoList: RatingAbuseRelevantMemberRecord[],
	suspicion_level_record_list: SuspicionLevelRecord[]
) {
	if (user_id_list.length === 0) return;

	const current_time_millis = Date.now();
	let weight = 0;
	let comment = "Newly joined opponents: ";
	for (const opponentInfo of opponentInfoList) {
		// Player is suspicious if his opponent's account is less than a week old
		const account_age_millis = Math.max(0, current_time_millis - timeutil.sqliteToTimestamp(opponentInfo.joined));
		if (account_age_millis < SUSPICIOUS_ACCOUNT_AGE_MILLIS) {
			const fraction = account_age_millis / SUSPICIOUS_ACCOUNT_AGE_MILLIS; // fraction is in the interval [0, 1]
			weight += (1 - fraction) * (user_id_frequency[opponentInfo.user_id] ?? 0);
			comment += `${opponentInfo.user_id},`;
		}
	}
	if (weight > 0) suspicion_level_record_list.push({
		category: 'opponent_account_age',
		weight: (weight / user_id_list.length) * 0.3, // rescale to [0, 0.3]
		comment
	});
}


export default {
	measureRatingAbuseAfterGame,
};

