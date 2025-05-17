
/**
 * Route
 * Fetched by leaderboard script.
 * Sends the client the information about the leaderboard they are currently profile viewing.
 */

import { getTopPlayersForLeaderboard } from "../database/leaderboardsManager.js";
// @ts-ignore
import { logEvents } from "../middleware/logEvents.js";


import type { Request, Response } from "express";
import { Leaderboard } from "../../client/scripts/esm/chess/variants/leaderboard.js";



// Functions -------------------------------------------------------------

/**
 * Responds to the request to fetch top leaderboard players
 */
const getLeaderboardData = async(req: Request, res: Response) => { // route: /leaderboard/:leaderboard_id/:n_players

	const leaderboard_id = Number(req.params["leaderboard_id"]) as Leaderboard;
	const n_players = Number(req.params["n_players"]);
	if (Number.isNaN(n_players) || Number.isNaN(leaderboard_id)) return res.status(404).json({ message: "Request incorrectly formatted." });

	const top_players = getTopPlayersForLeaderboard(leaderboard_id, n_players);
	if (top_players === undefined) {
		logEvents(`Retrieval of top ${n_players} players of leaderboard ${leaderboard_id} upon user request failed.`, 'errLog.txt', { print: true });
		return res.status(404).json({ message: "Database retrieval failed." });
	}

	const sendData: Object[] = [];
	for (const player of top_players) {
		const playerData = { 
			username: player.user_id,
			elo: player.elo
		};
		sendData.push(playerData);
	}

	// Return data
	return res.json(sendData);
};

export {
	getLeaderboardData
};