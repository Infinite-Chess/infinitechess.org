// src/server/game/ratingabuse/ratingAbuseTypes.ts

/**
 * The shapes rating-abuse measurement works in: the trimmed database records it
 * reads, the evidence it assembles from them, and the suspicion its checks produce.
 *
 * Pure vocabulary — no logic, no dependencies on sibling modules. `ratingAbuse.ts`
 * gathers these, `abuseChecks.ts` weighs them, and `abuseReport.ts` renders them.
 */

import type { GamesRecord } from '../../database/gamesManager.js';
import type { PlayerGamesRecord } from '../../database/playerGamesManager.js';

// Database Records ------------------------------------------------------------

/** The entries of a {@link PlayerGamesRecord} the rating abuse calculation reads. */
export type AbusePlayerGamesRecord = Pick<
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
export type AbuseGameInfo = AbusePlayerGamesRecord &
	AbuseGamesRecord & {
		/**
		 * The fraction of all the time the player was given to think — base time plus the increment
		 * earned on their moves — they left unused, in [0, 1]. Derived from the ICN's clock stamps.
		 */
		unusedClockFraction: number;
		/** The game's `moveRule` gamerule, read off its ICN. */
		moveRule: number | undefined;
	};

/** The entries of a MemberRecord the rating abuse calculation reads. */
type AbuseMemberRecord = {
	username: string;
	user_id: number;
	joined: string;
};

// Measurement -----------------------------------------------------------------

/** Who the player faced across the measured games, and the identities behind them. */
export type IdentityEvidence = {
	/** Each game's opponent user_id, keyed by game_id. */
	opponentIdByGame: Record<number, number>;
	/** How many of those recent games each opponent user_id accounts for. */
	opponentFrequency: Record<number, number>;
	/** IP addresses seen on the player's own refresh tokens. */
	ipAddresses: string[];
	/**
	 * Whether the player shares an IP address with each opponent, keyed by user_id.
	 * An opponent has no entry when either side has no IP address to compare.
	 */
	opponentSharesIp: Record<number, boolean>;
	/** Account details of each unique opponent. */
	opponents: AbuseMemberRecord[];
};

/** Everything gathered about a player's recent rated games, fed to the suspicion checks. */
export type AbuseEvidence = IdentityEvidence & {
	/** The player's recent rated games. */
	games: AbuseGameInfo[];
};

/** One check's finding: how suspicious a single monitored characteristic looks. */
export type SuspicionRecord = {
	category: 'think_time' | 'same_opponents' | 'ip_addresses' | 'logged_out' | 'opponent_account_age'; // prettier-ignore
	weight: number;
};

/** The combined outcome of running every check over one player's evidence. */
export type SuspicionVerdict = {
	records: SuspicionRecord[];
	/** The sum of every record's weight. */
	totalWeight: number;
	/** Whether {@link totalWeight} cleared the threshold to flag the player. */
	suspicious: boolean;
};

/** Identifies the measurement a report is describing, alongside its evidence. */
export type AbuseReportContext = {
	user_id: number;
	username: string;
	/** The player's net elo change across the measured games. */
	netRatingChange: number;
	evidence: AbuseEvidence;
};
