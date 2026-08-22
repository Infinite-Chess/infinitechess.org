// src/server/game/ratingabuse/ratingabusetypes.ts

/**
 * The shapes rating-abuse measurement works in: the trimmed database records it
 * reads, the evidence it assembles from them, and the suspicion its checks produce.
 *
 * Pure vocabulary — no logic, no dependencies on sibling modules. `ratingabuse.ts`
 * gathers these, `abusechecks.ts` weighs them, and `abusereport.ts` renders them.
 */

import type { GamesRecord } from '../../database/gamesManager.js';
import type { PlayerGamesRecord } from '../../database/playerGamesManager.js';

// Database Records ------------------------------------------------------------------------------

/** The entries of a {@link PlayerGamesRecord} the rating abuse calculation reads. */
type AbusePlayerGamesRecord = Pick<
	PlayerGamesRecord,
	'game_id' | 'score' | 'player_number' | 'elo_change_from_game'
>;

/** The entries of a {@link GamesRecord} the rating abuse calculation reads. */
type AbuseGamesRecord = Pick<
	GamesRecord,
	| 'game_id'
	| 'date'
	| 'base_time_seconds'
	| 'increment_seconds'
	| 'termination'
	| 'result'
	| 'move_count'
>;

/** One of the player's recent games, joined across the `player_games` and `games` tables. */
type AbuseGameInfo = AbusePlayerGamesRecord &
	AbuseGamesRecord & {
		/**
		 * The player's remaining millis at game end, derived from
		 * the ICN's clock stamps. Undefined if the game was untimed.
		 */
		finalClockMillis: number | undefined;
	};

/** The entries of a MemberRecord the rating abuse calculation reads. */
type AbuseMemberRecord = {
	username: string;
	user_id: number;
	joined: string;
};

// Measurement -----------------------------------------------------------------------------------

/** Who the player faced across the measured games, and the identities behind them. */
type IdentityEvidence = {
	/** Opponent user_ids, one entry per game played against them. */
	opponentIds: number[];
	/** How many of those recent games each opponent user_id accounts for. */
	opponentFrequency: Record<number, number>;
	/** IP addresses seen on the player's own refresh tokens. */
	ipAddresses: string[];
	/** IP addresses seen on each opponent's refresh tokens, keyed by user_id. */
	opponentIpAddresses: Record<number, string[]>;
	/** Account details of each unique opponent. */
	opponents: AbuseMemberRecord[];
};

/** Everything gathered about a player's recent rated games, fed to the suspicion checks. */
type AbuseEvidence = IdentityEvidence & {
	/** The player's recent rated games. */
	games: AbuseGameInfo[];
};

/** One check's finding: how suspicious a single monitored characteristic looks. */
type SuspicionRecord = {
	category: 'think_time' | 'same_opponents' | 'ip_addresses' | 'opponent_account_age';
	weight: number;
	comment?: string;
};

/** The combined outcome of running every check over one player's evidence. */
type SuspicionVerdict = {
	records: SuspicionRecord[];
	/** The sum of every record's weight. */
	totalWeight: number;
	/** Whether {@link totalWeight} cleared the threshold to flag the player. */
	suspicious: boolean;
};

/** Identifies the measurement a report is describing, alongside its evidence. */
type AbuseReportContext = {
	user_id: number;
	username: string;
	leaderboard_id: number;
	/** The player's net elo change across the measured games. */
	netRatingChange: number;
	gameIds: number[];
	evidence: AbuseEvidence;
};

export type {
	AbusePlayerGamesRecord,
	AbuseGamesRecord,
	AbuseGameInfo,
	AbuseMemberRecord,
	IdentityEvidence,
	AbuseEvidence,
	SuspicionRecord,
	SuspicionVerdict,
	AbuseReportContext,
};
