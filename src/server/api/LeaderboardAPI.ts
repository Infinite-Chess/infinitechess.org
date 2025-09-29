
/**
 * Route
 * Fetched by leaderboard script.
 * Sends the client the information about the leaderboard they are currently profile viewing.
 */

import { getTopPlayersForLeaderboard, getPlayerRankInLeaderboard, getEloOfPlayerInLeaderboard } from "../database/leaderboardsManager.js";
import { Leaderboard } from "../../shared/chess/variants/validleaderboard.js";
// @ts-ignore
import { getMemberDataByCriteria } from "../database/memberManager.js";
import { logEventsAndPrint } from "../middleware/logEvents.js";

import type { Response } from "express";
import type { IdentifiedRequest } from "../types.js";



/** Maximum number of players allowed to be requested in a single request. */
const MAX_N_PLAYERS_REQUEST_CAP = 100;

// Functions -------------------------------------------------------------

/**
 * Responds to the request to fetch top (N = n_players) players of leaderboard
 * leaderboard_id, starting from start_rank, and also find rank of requester if find_requester_rank === 1
 */
const getLeaderboardData = async(req: IdentifiedRequest, res: Response): Promise<void> => { // route: /leaderboard/top/:leaderboard_id/:start_rank/:n_players/:find_requester_rank

	/** ID of leaderboard to be fetched */
	const leaderboard_id = Number(req.params["leaderboard_id"]) as Leaderboard;

	/** Highest rank of player to fetch from leaderboard */
	const start_rank = Number(req.params["start_rank"]);

	/** Number of players to fetch from leaderboard */
	const n_players = Number(req.params["n_players"]);

	/** Whether the server should also look for and return the rank of the user making the request */
	const find_requester_rank = Number(req.params["find_requester_rank"]) as 0 | 1;

	if (Number.isNaN(start_rank) || Number.isNaN(n_players) || Number.isNaN(leaderboard_id) || Number.isNaN(find_requester_rank)) {
		res.status(404).json({ message: "Request incorrectly formatted." });
		return;
	}
	if (n_players > MAX_N_PLAYERS_REQUEST_CAP) {
		res.status(404).json({ message: "Too many leaderboard positions requested at once." });
		return;
	}

	/** Username of user whose global ranking should be returned. Set to undefined if its global rank should not be found. */
	const requester_username = (find_requester_rank && req.memberInfo.signedIn ? req.memberInfo.username : undefined);

	// Query leaderboard database
	const top_players = getTopPlayersForLeaderboard(leaderboard_id, start_rank, n_players);
	if (top_players === undefined) {
		logEventsAndPrint(`Retrieval of top ${n_players} players from start rank ${start_rank} of leaderboard ${leaderboard_id} upon user request failed.`, 'errLog.txt');
		res.status(500).json({ message: "Server error." }); // Generic message for database retrieval failed
		return;
	}

	// Populate leaderboardData object with usernames and elos of players
	// Also look out for requester_username among usernames in order to set the value of requester_rank if possible
	let requester_rank: number | undefined = undefined;
	let running_rank = start_rank;
	const leaderboardData: Object[] = [];
	for (const player of top_players) {
		const username = getMemberDataByCriteria(['username'], 'user_id', player.user_id!, { skipErrorLogging: true }).username;
		if (username === undefined) {
			logEventsAndPrint(`Username of user with user_id ${player.user_id} could not be found in members table, even though it was found in leaderboard table by getTopPlayersForLeaderboard().`, 'errLog.txt');
			continue;
		}
		const playerData = {
			username: username,
			elo: String(Math.round(player.elo!))
		};
		leaderboardData.push(playerData);
		if (username === requester_username) requester_rank = running_rank; // We can now set requester_rank without a seperate query
		running_rank++;
	}

	// Construct rank_string of user
	// If there is a requester_username, but requester_rank is still undefined, we need another database query
	let rank_string: string | undefined = undefined;
	rank_string_constructor: if (requester_username !== undefined && requester_rank === undefined) {
		const requester_userid = getMemberDataByCriteria(['user_id'], 'username', requester_username, { skipErrorLogging: true })?.user_id;
		if (requester_userid === undefined) break rank_string_constructor;

		const requester_rank = getPlayerRankInLeaderboard(requester_userid, leaderboard_id);
		if (requester_rank !== undefined) {
			rank_string = `#${requester_rank}`;

			// If the display elo contains a ?, then the rank_string should also contain a ?
			const requester_elo = getEloOfPlayerInLeaderboard(requester_userid, leaderboard_id); // { value: number, confident: boolean }
			if (!requester_elo.confident) rank_string += "?";
		}
		else rank_string = "?";
	}
	else if (requester_username !== undefined) rank_string = `#${requester_rank}`; // case where the requester_username was already contained in the top leaderboard ranks

	const requesterData = {
		rank_string: rank_string
	};

	const sendData = {
		leaderboardData: leaderboardData,
		requesterData: requesterData
	};

	// Return data
	res.json(sendData);
};

export {
	getLeaderboardData
};