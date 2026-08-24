// src/server/api/LeaderboardAPI.ts

/**
 * Serves the ranked entries of a leaderboard to the client's leaderboard/profile script.
 */

import type { Request, Response } from 'express';

import { Leaderboard } from '../../shared/chess/variants/validleaderboard.js';

import { logEventsAndPrint } from '../utility/logEvents.js';
import {
	getMemberDataByCriteria,
	getMultipleMemberDataByCriteria,
} from '../database/memberManager.js';
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
 * `GET /api/leaderboards/:leaderboard_id/top` — returns the top N (`n_players`) players from
 * `start_rank`, plus the requester's own rank when `include_requester_rank` is set.
 */
function getLeaderboardData(req: Request, res: Response): void {
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

		// Fetch every username on this page in ONE query.
		const usernameByUserID = getUsernamesByUserID(top_players.map((player) => player.user_id));

		// Populate leaderboardData object with usernames and elos of players
		// Also look out for requester_username among usernames in order to set the value of requester_rank if possible
		let requester_rank: number | undefined = undefined;
		let running_rank = start_rank;
		const leaderboardData: Object[] = [];
		for (const player of top_players) {
			const username = usernameByUserID.get(player.user_id);
			if (username === undefined) {
				logEventsAndPrint(
					`Username of user with user_id ${player.user_id} could not be found in members table, even though it was found in leaderboard table by getTopPlayersForLeaderboard().`,
					'errLog',
				);
				continue;
			}
			const playerData = {
				username,
				elo: String(Math.round(player.elo)),
			};
			leaderboardData.push(playerData);
			if (username === requester_username) requester_rank = running_rank; // We can now set requester_rank without a seperate query
			running_rank++;
		}

		const rank_string =
			requester_username !== undefined
				? getRankStringOfRequester(requester_username, requester_rank, leaderboard_id)
				: undefined;

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

/**
 * Looks up the usernames of many members at once, keyed by their user_id.
 * @param user_ids - May be empty, in which case no query is made.
 */
function getUsernamesByUserID(user_ids: number[]): Map<number, string> {
	if (user_ids.length === 0) return new Map(); // getMultipleMemberDataByCriteria rejects an empty search list
	const records = getMultipleMemberDataByCriteria(['user_id', 'username'], 'user_id', user_ids);
	return new Map(records.map((record) => [record.user_id, record.username]));
}

/**
 * Builds the requester's displayed rank string, e.g. `#42`, or `?` if they are unranked.
 * @param rank_in_page - Their rank if they appeared in the page just fetched. If
 *   undefined, resolving their rank costs extra queries.
 * @returns The rank string, or undefined if they have no members table record.
 */
function getRankStringOfRequester(
	requester_username: string,
	rank_in_page: number | undefined,
	leaderboard_id: Leaderboard,
): string | undefined {
	if (rank_in_page !== undefined) return `#${rank_in_page}`;

	const requesterRecord = getMemberDataByCriteria(['user_id'], 'username', requester_username);
	if (requesterRecord === undefined) return undefined;

	const requester_rank = getPlayerRankInLeaderboard(requesterRecord.user_id, leaderboard_id);
	if (requester_rank === undefined) return '?';

	// If the display elo contains a ?, then the rank_string should also contain a ?
	const requester_elo = getEloOfPlayerInLeaderboard(requesterRecord.user_id, leaderboard_id);
	return requester_elo.confident ? `#${requester_rank}` : `#${requester_rank}?`;
}

export { getLeaderboardData };
