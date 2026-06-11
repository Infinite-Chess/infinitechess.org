// src/server/api/LeaderboardAPI.ts

/**
 * Route
 * Fetched by leaderboard script.
 * Sends the client the information about the leaderboard they are currently profile viewing.
 */

import type { Request, Response } from 'express';

import { Leaderboard } from '../../shared/chess/variants/validleaderboard.js';

import { logEventsAndPrint } from '../middleware/logEvents.js';
import { getMemberDataByCriteria } from '../database/memberManager.js';
import {
	getTopPlayersForLeaderboard,
	getPlayerRankInLeaderboard,
	getEloOfPlayerInLeaderboard,
} from '../database/leaderboardsManager.js';

// Constants -------------------------------------------------------------

/** Number of players returned when the request omits the `n_players` query param. */
const DEFAULT_N_PLAYERS = 50;

/** Maximum number of players allowed to be requested in a single request. */
const MAX_N_PLAYERS_REQUEST_CAP = 100;

// Functions -------------------------------------------------------------

/**
 * Responds to the request to fetch top (N = n_players) players of leaderboard
 * leaderboard_id, starting from start_rank, and also finds the requester's rank if include_requester_rank is true.
 */
function getLeaderboardData(req: Request, res: Response): void {
	// route: GET /api/leaderboards/:leaderboard_id/top?start_rank&n_players&include_requester_rank

	/** ID of leaderboard to be fetched (lives in the path b/c it identifies the resource) */
	const leaderboard_id = Number(req.params['leaderboard_id']) as Leaderboard;

	/** Highest rank of player to fetch from leaderboard. 1-based; defaults to the top (rank 1). */
	const start_rank = req.query['start_rank'] !== undefined ? Number(req.query['start_rank']) : 1;

	/** Number of players to fetch from leaderboard. Page size; defaults to DEFAULT_N_PLAYERS. */
	const n_players =
		req.query['n_players'] !== undefined ? Number(req.query['n_players']) : DEFAULT_N_PLAYERS;

	/** Whether the server should also look for and return the rank of the user making the request */
	const include_requester_rank = req.query['include_requester_rank'] === 'true';

	if (Number.isNaN(leaderboard_id) || Number.isNaN(start_rank) || Number.isNaN(n_players)) {
		res.status(400).json({ message: 'Request incorrectly formatted.' });
		return;
	}
	if (n_players > MAX_N_PLAYERS_REQUEST_CAP) {
		res.status(400).json({ message: 'Too many leaderboard positions requested at once.' });
		return;
	}

	/** Username of user whose global ranking should be returned. Set to undefined if its global rank should not be found. */
	const requester_username =
		include_requester_rank && req.memberInfo?.signedIn ? req.memberInfo.username : undefined;

	try {
		// Query leaderboard database
		const top_players = getTopPlayersForLeaderboard(leaderboard_id, start_rank, n_players);

		// Populate leaderboardData object with usernames and elos of players
		// Also look out for requester_username among usernames in order to set the value of requester_rank if possible
		let requester_rank: number | undefined = undefined;
		let running_rank = start_rank;
		const leaderboardData: Object[] = [];
		for (const player of top_players) {
			const record = getMemberDataByCriteria(['username'], 'user_id', player.user_id!);
			if (record === undefined) {
				logEventsAndPrint(
					`Username of user with user_id ${player.user_id} could not be found in members table, even though it was found in leaderboard table by getTopPlayersForLeaderboard().`,
					'errLog.txt',
				);
				continue;
			}
			const playerData = {
				username: record.username,
				elo: String(Math.round(player.elo!)),
			};
			leaderboardData.push(playerData);
			if (record.username === requester_username) requester_rank = running_rank; // We can now set requester_rank without a seperate query
			running_rank++;
		}

		// Construct rank_string of user
		// If there is a requester_username, but requester_rank is still undefined, we need another database query
		let rank_string: string | undefined = undefined;
		rank_string_constructor: if (
			requester_username !== undefined &&
			requester_rank === undefined
		) {
			const requesterRecord = getMemberDataByCriteria(
				['user_id'],
				'username',
				requester_username,
			);
			if (requesterRecord === undefined) break rank_string_constructor;

			const requester_rank = getPlayerRankInLeaderboard(
				requesterRecord.user_id,
				leaderboard_id,
			);
			if (requester_rank !== undefined) {
				rank_string = `#${requester_rank}`;

				// If the display elo contains a ?, then the rank_string should also contain a ?
				const requester_elo = getEloOfPlayerInLeaderboard(
					requesterRecord.user_id,
					leaderboard_id,
				); // { value: number, confident: boolean }
				if (!requester_elo.confident) rank_string += '?';
			} else rank_string = '?';
		} else if (requester_username !== undefined) rank_string = `#${requester_rank}`; // case where the requester_username was already contained in the top leaderboard ranks

		const requesterData = {
			rank_string: rank_string,
		};

		const sendData = {
			leaderboardData: leaderboardData,
			requesterData: requesterData,
		};

		// Return data
		res.json(sendData);
	} catch {
		// already logged
		res.status(500).json({
			message: req.t.responses.errors.server_error,
		});
	}
}

export { getLeaderboardData };
