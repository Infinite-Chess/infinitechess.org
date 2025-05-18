
/**
 * Route
 * Fetched by leaderboard script.
 * Sends the client the information about the leaderboard they are currently profile viewing.
 */

import { getTopPlayersForLeaderboard, getPlayerRankInLeaderboard } from "../database/leaderboardsManager.js";
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

	const leaderboard_id = Number(req.params["leaderboard_id"]) as Leaderboard;
	const start_rank = Number(req.params["start_rank"]);
	const n_players = Number(req.params["n_players"]);
	const requester_username = (req.params["requester_username"] === undefined || /\(|\)/.test(req.params["requester_username"] as string)) ? undefined : req.params["requester_username"];

	if (Number.isNaN(start_rank) || Number.isNaN(n_players) || Number.isNaN(leaderboard_id)) return res.status(404).json({ message: "Request incorrectly formatted." });

	const top_players = getTopPlayersForLeaderboard(leaderboard_id, start_rank, n_players);
	if (top_players === undefined) {
		logEvents(`Retrieval of top ${n_players} players from start rank ${start_rank} of leaderboard ${leaderboard_id} upon user request failed.`, 'errLog.txt', { print: true });
		return res.status(404).json({ message: "Database retrieval failed." });
	}

	let requester_rank: Number | undefined = undefined;
	let running_rank = start_rank;
	const leaderboardData: Object[] = [];
	for (const player of top_players) {
		const username = getMemberDataByCriteria(['username'], 'user_id', player.user_id!, { skipErrorLogging: true }).username;
		const playerData = {
			username: username,
			elo: String(Math.round(player.elo!))
		};
		leaderboardData.push(playerData);
		if (username === requester_username) requester_rank = running_rank;
		running_rank++;
	}

	if (requester_username !== undefined && requester_rank === undefined) {
		const requester_userid = getMemberDataByCriteria(['user_id'], 'username', requester_username, { skipErrorLogging: true }).user_id;
		requester_rank = getPlayerRankInLeaderboard(leaderboard_id, requester_userid);
	}

	const requesterData = { 
		rank: requester_rank
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