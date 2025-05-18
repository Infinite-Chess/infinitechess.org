
/**
 * Route
 * Fetched by leaderboard script.
 * Sends the client the information about the leaderboard they are currently profile viewing.
 */

import { getTopPlayersForLeaderboard, getPlayerRankInLeaderboard, getDisplayEloOfPlayerInLeaderboard } from "../database/leaderboardsManager.js";
import { Leaderboard } from "../../client/scripts/esm/chess/variants/validleaderboard.js";
// @ts-ignore
import { getMemberDataByCriteria } from "../database/memberManager.js";
// @ts-ignore
import { logEvents } from "../middleware/logEvents.js";

import type { Request, Response } from "express";

// Functions -------------------------------------------------------------

/**
 * Responds to the request to fetch top (N = n_players) players of leaderboard leaderboard_id, starting from start_rank, and requested by requester_username (potentially = "(Guest)")
 */
const getLeaderboardData = async(req: Request, res: Response) => { // route: /leaderboard/top/:leaderboard_id/:start_rank/:n_players/:requester_username

	/** ID of leaderboard to be fetched */
	const leaderboard_id = Number(req.params["leaderboard_id"]) as Leaderboard;

	/** Highest rank of player to fetch from leaderboard */
	const start_rank = Number(req.params["start_rank"]);

	/** Number of players to fetch from leaderboard */
	const n_players = Number(req.params["n_players"]);

	/** Username of user whose global ranking should be returned. Ignored if equal to "(Guest)" */
	const requester_username = (req.params["requester_username"] === undefined || /\(|\)/.test(req.params["requester_username"] as string)) ? undefined : req.params["requester_username"];

	if (Number.isNaN(start_rank) || Number.isNaN(n_players) || Number.isNaN(leaderboard_id)) return res.status(404).json({ message: "Request incorrectly formatted." });

	// Query leaderboard database
	const top_players = getTopPlayersForLeaderboard(leaderboard_id, start_rank, n_players);
	if (top_players === undefined) {
		logEvents(`Retrieval of top ${n_players} players from start rank ${start_rank} of leaderboard ${leaderboard_id} upon user request failed.`, 'errLog.txt', { print: true });
		return res.status(404).json({ message: "Database retrieval failed." });
	}

	// Populate leaderboardData object with usernames and elos of players
	// Also look out for requester_username among usernames in order to set the value of requester_rank if possible
	let requester_rank: number | undefined = undefined;
	let running_rank = start_rank;
	const leaderboardData: Object[] = [];
	for (const player of top_players) {
		const username = getMemberDataByCriteria(['username'], 'user_id', player.user_id!, { skipErrorLogging: true }).username;
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

		const requester_elo = getDisplayEloOfPlayerInLeaderboard(requester_userid, leaderboard_id);
		const is_requester_elo_uncertain = /\?/.test(requester_elo); // If the display elo contains a ?, then the rank_string should also contain a ?
		const requester_rank = getPlayerRankInLeaderboard(requester_userid, leaderboard_id);
		if (requester_rank !== undefined) {
			rank_string = `#${requester_rank}`;
			if (is_requester_elo_uncertain) rank_string += "?";
		}
		else rank_string = "?";
	}
	else rank_string = `#${requester_rank}`;

	const requesterData = {
		rank_string: rank_string
	};

	const sendData = {
		leaderboardData: leaderboardData,
		requesterData: requesterData
	};

	// Return data
	return res.json(sendData);
};

export {
	getLeaderboardData
};