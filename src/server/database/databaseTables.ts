// src/server/database/databaseTables.ts

/**
 * This script creates our database tables if they aren't already present.
 */

import db from './database.js';
import { deleteAccount } from '../controllers/deleteAccountController.js';
import { startDailyBackups } from './backupManager.js';
import { removeFromBlacklist } from './blacklistManager.js';
import { startPeriodicDatabaseCleanupTasks } from './cleanupTasks.js';
import { startPeriodicLeaderboardRatingDeviationUpdate } from './leaderboardsManager.js';

// Variables -----------------------------------------------------------------------------------

/** 62**4: Limit of unique user id with 4-digit base-62 user ids! EXCLUSIVE. */
const user_id_upper_cap: number = 14_776_336;
/** 62**4: Limit of unique game id with 4-digit base-62 game ids! EXCLUSIVE. */
const game_id_upper_cap: number = 14_776_336;

/** All unique columns of the members table. Each of these would be valid to search for to find a single member. */
const uniqueMemberKeys: string[] = ['user_id', 'username', 'email'];

/** All columns of the members table. Each of these would be valid to retrieve from any member. */
const allMemberColumns: string[] = [
	'user_id',
	'username',
	'username_history',
	'email',
	'hashed_password',
	'roles',
	'joined',
	'last_seen',
	'preferences',
	'login_count',
	'checkmates_beaten',
	'last_read_news_date',
];

/** All columns of the player_stats table. Each of these would be valid to retrieve from any member. */
const _allPlayerStatsColumns: string[] = [
	'user_id',
	'moves_played',
	'game_count',
	'game_count_rated',
	'game_count_casual',
	'game_count_public',
	'game_count_private',
	'game_count_wins',
	'game_count_losses',
	'game_count_draws',
	'game_count_aborted',
	'game_count_wins_rated',
	'game_count_losses_rated',
	'game_count_draws_rated',
	'game_count_wins_casual',
	'game_count_losses_casual',
	'game_count_draws_casual',
];

/** All columns of the player_stats table. Each of these would be valid to retrieve from any member. */
const allPlayerGamesColumns: string[] = [
	'user_id',
	'game_id',
	'player_number',
	'score',
	'clock_at_end_millis',
	'elo_at_game',
	'elo_change_from_game',
	'rating_deviation_at_game',
	'rating_deviation_after_game',
];

/** All columns of the games table. Each of these would be valid to retrieve from any game. */
const allGamesColumns: string[] = [
	'game_id',
	'date',
	'base_time_seconds',
	'increment_seconds',
	'variant',
	'rated',
	'leaderboard_id',
	'private',
	'result',
	'termination',
	'move_count',
	'time_duration_millis',
	'icn',
];

/** All columns of the rating_abuse table. Each of these would be valid to retrieve from any member and/or leaderboard. */
const allRatingAbuseColumns: string[] = [
	'user_id',
	'leaderboard_id',
	'game_count_since_last_check',
	'last_alerted_at',
];

/** All columns of the live_games table. */
const allLiveGamesColumns: string[] = [
	'game_id',
	'time_created',
	'variant',
	'position',
	'clock',
	'rated',
	'private',
	'moves',
	'color_ticking',
	'clock_snapshot_time',
	'draw_offer_state',
	'validate_moves',
	'both_disconnected_end_time',
];

/** All columns of the engine_games table. */
const allEngineGamesColumns: string[] = [
	'game_id',
	'player_number',
	'score',
	'clock_at_end_millis',
	'engine',
	'engine_version',
	'strength_level',
];

/** All columns of the live_engine_games table. */
const allLiveEngineGamesColumns: string[] = [
	'game_id',
	'player_number',
	'time_remaining_ms',
	'engine',
	'engine_version',
	'strength_level',
];

/** All columns of the live_player_games table. */
const allLivePlayerGamesColumns: string[] = [
	'game_id',
	'player_number',
	'user_id',
	'browser_id',
	'last_draw_offer_ply',
	'time_remaining_ms',
	'disconnect_cushion_end_time',
	'disconnect_claim_time',
	'disconnect_voluntary',
];

// Functions -----------------------------------------------------------------------------------

/** Creates the tables in our database if they do not exist. */
function generateTables(): void {
	// Members table
	db.run(`
		CREATE TABLE IF NOT EXISTS members (
			user_id INTEGER PRIMARY KEY,
			username TEXT UNIQUE NOT NULL COLLATE NOCASE,
			email TEXT UNIQUE NOT NULL,
			hashed_password TEXT NOT NULL,
			roles TEXT,
			joined TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			login_count INTEGER NOT NULL DEFAULT 0,
			preferences TEXT,
			username_history TEXT,
			checkmates_beaten TEXT NOT NULL DEFAULT '',
			last_read_news_date TEXT
		);
	`);

	// Pending Registrations table — verify-first registration staging, before a real member row exists
	db.run(`
		CREATE TABLE IF NOT EXISTS pending_registrations (
			claim_token        TEXT PRIMARY KEY NOT NULL, -- httpOnly cookie secret; unchanging
			verification_token TEXT UNIQUE NOT NULL, -- email-link secret; rotates on email change
			username           TEXT UNIQUE NOT NULL COLLATE NOCASE,
			email              TEXT UNIQUE NOT NULL,
			hashed_password    TEXT NOT NULL,
			created_at         INTEGER NOT NULL, -- Unix timestamp (milliseconds)
			expires_at         INTEGER NOT NULL, -- Unix timestamp (milliseconds)
			member_user_id     INTEGER -- NULL until verified; doubles as the "verified" flag
		);
	`);
	// Index for the expiry sweep
	db.run(
		`CREATE INDEX IF NOT EXISTS idx_pending_registrations_expires_at ON pending_registrations (expires_at);`,
	);

	// Deleted Members table
	db.run(`
		CREATE TABLE IF NOT EXISTS deleted_members (
			user_id INTEGER PRIMARY KEY,             
			reason_deleted TEXT NOT NULL -- "unverified" / "user request" / "security" / "rating abuse"
		);
	`);

	// Leaderboards table
	db.run(`
		CREATE TABLE IF NOT EXISTS leaderboards (
        	user_id INTEGER NOT NULL REFERENCES members(user_id) ON DELETE CASCADE,
   			leaderboard_id INTEGER NOT NULL, -- Each leaderboard's id and variants are declared in the code
			elo REAL NOT NULL,
			rating_deviation REAL NOT NULL,
			-- Add other Glicko fields if needed (volatility)
			rd_last_update_date TIMESTAMP,
			PRIMARY KEY (user_id, leaderboard_id) -- Composite key essential
		);
	`);

	// Indexes for leaderboards table

	// To quickly get all leaderboards for a specific user
	db.run(`CREATE INDEX IF NOT EXISTS idx_leaderboards_user ON leaderboards (user_id);`);
	// To quickly get rankings for a specific leaderboard (ESSENTIAL)
	db.run(
		`CREATE INDEX IF NOT EXISTS idx_leaderboards_leaderboard_elo ON leaderboards (leaderboard_id, elo DESC);`,
	);

	// Games table
	db.run(`
		CREATE TABLE IF NOT EXISTS games (
			game_id INTEGER PRIMARY KEY,
			date TIMESTAMP NOT NULL,
			base_time_seconds INTEGER, -- null if untimed
			increment_seconds INTEGER, -- null if untimed
			variant TEXT, -- preset variant code, or null for a custom-position game (position lives in the ICN)
			rated BOOLEAN NOT NULL CHECK (rated IN (0, 1)), -- Ensures only 0 or 1
			leaderboard_id INTEGER, -- Specified only if the variant belongs to a leaderboard, ignoring whether the game was rated
			private BOOLEAN NOT NULL CHECK (private IN (0, 1)), -- Ensures only 0 or 1
			result TEXT NOT NULL,
			termination TEXT NOT NULL,
			move_count INTEGER NOT NULL,
			time_duration_millis INTEGER, -- Number of milliseconds that the game lasted in total on the server. Null if info is missing.
			icn TEXT NOT NULL -- Also includes clock timestamps after each move

			-- Add a CHECK constraint to ensure consistency:
			-- EITHER both are NULL (untimed) OR both are NOT NULL and >= 0 (timed)
			CHECK (
				(base_time_seconds IS NULL AND increment_seconds IS NULL)
				OR
				(base_time_seconds > 0 AND increment_seconds >= 0)
			)
		);
	`);

	// Create an index on the date column of the games table for faster queries
	db.run(`CREATE INDEX IF NOT EXISTS idx_games_date ON games (date DESC);`);

	// Player Games Table
	db.run(`
		CREATE TABLE IF NOT EXISTS player_games (
			user_id INTEGER NOT NULL, -- Account deletion does not delete rows in this table
			game_id INTEGER NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
			player_number INTEGER NOT NULL, -- 1 => White  2 => Black
			score REAL, -- 1 => Win   0.5 => Draw   0 => Loss   NULL => Aborted
			clock_at_end_millis INTEGER, -- Number of milliseconds that player still has left on his clock when the game ended. Null if game has no clock or info is missing.
			elo_at_game REAL, -- Specified if they have a rating for the leaderboard, ignoring whether the game was rated
			elo_change_from_game REAL, -- Specified only if the game was rated
			rating_deviation_at_game REAL, -- Glicko RD before the game; drives the pre-game rating's confidence. Specified only if the game was rated.
			rating_deviation_after_game REAL, -- Glicko RD after the game; drives the new rating's confidence. Specified only if the game was rated.
			PRIMARY KEY (user_id, game_id) -- Ensures unique link
		);
	`);

	// Create an index for efficiently finding players in a specific game
	db.run(`CREATE INDEX IF NOT EXISTS idx_player_games_game ON player_games (game_id);`);

	// Player Stats table
	db.run(`
		CREATE TABLE IF NOT EXISTS player_stats (
			user_id INTEGER PRIMARY KEY REFERENCES members(user_id) ON DELETE CASCADE,
			moves_played INTEGER NOT NULL DEFAULT 0,
			game_count INTEGER NOT NULL DEFAULT 0,
			game_count_rated INTEGER NOT NULL DEFAULT 0,
			game_count_casual INTEGER NOT NULL DEFAULT 0,
			game_count_public INTEGER NOT NULL DEFAULT 0,
			game_count_private INTEGER NOT NULL DEFAULT 0,
			game_count_wins INTEGER NOT NULL DEFAULT 0,
			game_count_losses INTEGER NOT NULL DEFAULT 0,
			game_count_draws INTEGER NOT NULL DEFAULT 0,
			game_count_aborted INTEGER NOT NULL DEFAULT 0,
			game_count_wins_rated INTEGER NOT NULL DEFAULT 0,
			game_count_losses_rated INTEGER NOT NULL DEFAULT 0,
			game_count_draws_rated INTEGER NOT NULL DEFAULT 0,
			game_count_wins_casual INTEGER NOT NULL DEFAULT 0,
			game_count_losses_casual INTEGER NOT NULL DEFAULT 0,
			game_count_draws_casual INTEGER NOT NULL DEFAULT 0
		);
	`);

	// Rating Abuse table
	db.run(`
		CREATE TABLE IF NOT EXISTS rating_abuse (
			user_id INTEGER NOT NULL,
			leaderboard_id INTEGER NOT NULL,
			game_count_since_last_check INTEGER,
			last_alerted_at TIMESTAMP,

			PRIMARY KEY (user_id, leaderboard_id),
			FOREIGN KEY (user_id, leaderboard_id)
				REFERENCES leaderboards(user_id, leaderboard_id) ON DELETE CASCADE
		);
	`);

	// To quickly get all rating_abuse entries for a specific user
	db.run(`CREATE INDEX IF NOT EXISTS idx_rating_abuse_user ON rating_abuse (user_id);`);

	// Password Reset Tokens table
	db.run(`
		CREATE TABLE IF NOT EXISTS password_reset_tokens (
			hashed_token TEXT PRIMARY KEY NOT NULL,
			user_id INTEGER NOT NULL REFERENCES members(user_id) ON DELETE CASCADE,
			expires_at INTEGER NOT NULL, -- Unix timestamp (milliseconds)
			created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000) -- Unix timestamp (milliseconds)
		);
	`);
	// Indexes for password_reset_tokens table
	db.run(`CREATE INDEX IF NOT EXISTS idx_prt_user_id ON password_reset_tokens (user_id);`);
	db.run(`CREATE INDEX IF NOT EXISTS idx_prt_expires_at ON password_reset_tokens (expires_at);`);

	// Refresh Tokens table
	db.run(`
		CREATE TABLE IF NOT EXISTS refresh_tokens (
			token TEXT PRIMARY KEY NOT NULL,
			user_id INTEGER NOT NULL REFERENCES members(user_id) ON DELETE CASCADE,
			created_at INTEGER NOT NULL,   -- Unix timestamp (milliseconds)
			expires_at INTEGER NOT NULL,   -- Unix timestamp (milliseconds)
			is_persistent INTEGER NOT NULL DEFAULT 0 CHECK (is_persistent IN (0, 1)), -- "Keep me logged in" flag
			consumed_at INTEGER,           -- Allows a grace period for using old tokens when renewing sessions
			ip_address TEXT
		);
	`);
	// Indexes for refresh_tokens table
	db.run(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);`);
	db.run(
		`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);`,
	);

	// Editor Saves table
	db.run(`
		CREATE TABLE IF NOT EXISTS editor_saves (
			user_id INTEGER NOT NULL REFERENCES members(user_id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			piece_count INTEGER NOT NULL,
			timestamp INTEGER NOT NULL,
			icn TEXT NOT NULL,
			compression TEXT NOT NULL DEFAULT 'none',
			pawn_double_push INTEGER NOT NULL CHECK (pawn_double_push IN (-1, 0, 1)),
			castling INTEGER NOT NULL CHECK (castling IN (-1, 0, 1)),

			PRIMARY KEY (user_id, name)
		);
	`);

	// Blacklisted Emails table
	db.run(`
		CREATE TABLE IF NOT EXISTS email_blacklist (
			email TEXT PRIMARY KEY NOT NULL,
			reason TEXT NOT NULL, -- e.g. 'bounce', 'spam_report', 'banned'
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
	`);

	// Live Games table — persists active games across server restarts
	db.run(`
		CREATE TABLE IF NOT EXISTS live_games (
			game_id               INTEGER PRIMARY KEY,
			time_created          INTEGER NOT NULL,
			variant               TEXT, -- preset variant code, or null for a custom-position game (see position)
			position              TEXT, -- custom game's start position; null for preset games (complementary to variant)
			clock                 TEXT NOT NULL,
			rated                 BOOLEAN NOT NULL CHECK (rated IN (0, 1)),
			private               BOOLEAN NOT NULL CHECK (private IN (0, 1)),
			moves                 TEXT NOT NULL DEFAULT '',
			color_ticking         INTEGER,
			clock_snapshot_time   INTEGER,
			draw_offer_state      INTEGER,
			validate_moves        BOOLEAN NOT NULL DEFAULT 1 CHECK (validate_moves IN (0, 1)),
			both_disconnected_end_time INTEGER -- Epoch ms the both-disconnected timer concludes the game. NULL unless both players are disconnected.
		);
	`);

	// Live Player Games table — per-player state for active games
	db.run(`
		CREATE TABLE IF NOT EXISTS live_player_games (
			game_id                         INTEGER NOT NULL REFERENCES live_games(game_id) ON DELETE CASCADE,
			player_number                   INTEGER NOT NULL,
			user_id                         INTEGER,
			browser_id                      TEXT NOT NULL,
			last_draw_offer_ply             INTEGER,
			time_remaining_ms               INTEGER,
			disconnect_cushion_end_time     INTEGER,
			disconnect_claim_time           INTEGER, -- Epoch ms from which the opponent may claim victory/draw. NULL if no claim window.
			disconnect_voluntary            INTEGER CHECK (disconnect_voluntary IN (0, 1)),
			PRIMARY KEY (game_id, player_number)
		);
	`);

	createEngineGamesTable();

	// Engines have no disconnect state, so live participants use a separate table.
	db.run(`
		CREATE TABLE IF NOT EXISTS live_engine_games (
			game_id           INTEGER NOT NULL REFERENCES live_games(game_id) ON DELETE CASCADE,
			player_number     INTEGER NOT NULL,
			time_remaining_ms INTEGER,
			engine            TEXT NOT NULL,
			engine_version    TEXT NOT NULL,
			strength_level    INTEGER NOT NULL,
			PRIMARY KEY (game_id, player_number)
		);
	`);
}

function createEngineGamesTable(): void {
	db.run(`
		CREATE TABLE IF NOT EXISTS engine_games (
			game_id             INTEGER NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
			player_number       INTEGER NOT NULL,
			score               REAL,
			clock_at_end_millis INTEGER,
			engine              TEXT NOT NULL,
			engine_version      TEXT NOT NULL,
			strength_level      INTEGER NOT NULL,
			PRIMARY KEY (game_id, player_number)
		);
	`);
}

function initDatabase(): void {
	generateTables();
	dropLegacyLiveGamesPosPastedColumnIfPresent();
	dropLegacyLivePlayerGamesEloColumnIfPresent();
	addIsPersistentColumnToRefreshTokens();
	dropLegacyVerificationColumnsIfPresent();
	clearSpamReportBlacklistEntries();
	makeVariantColumnsNullableIfNeeded();
	addPositionColumnToLiveGamesIfNeeded();
	renameDisconnectResignTimeColumnIfNeeded();
	renameDisconnectByChoiceColumnIfNeeded();
	addBothDisconnectedEndTimeColumnToLiveGamesIfNeeded();
	dropLiveGamesConclusionColumnsIfPresent();
	addRatingDeviationColumnsToPlayerGamesIfNeeded();
	startPeriodicDatabaseCleanupTasks();
	startPeriodicLeaderboardRatingDeviationUpdate();
	startDailyBackups();
}

/**
 * TEMPORARY MIGRATION: Remove this function (and its call in initDatabase) once it has run in production.
 *
 * The `position_pasted` column used to exist on `live_games` and needs to be removed from old DBs.
 * This only logs when the column is found and deleted.
 */
function dropLegacyLiveGamesPosPastedColumnIfPresent(): void {
	if (!db.columnExists('live_games', 'position_pasted')) return; // Already migrated

	db.run('ALTER TABLE live_games DROP COLUMN position_pasted');
	console.log('Temporary DB migration: deleted live_games.position_pasted column.');

	db.run('ALTER TABLE live_games DROP COLUMN afk_resign_time');
	console.log('Temporary DB migration: deleted live_games.afk_resign_time column.');
}

/**
 * TEMPORARY MIGRATION: Remove this function once it has run in production.
 *
 * The `elo` column used to store a start-of-game elo snapshot on `live_player_games`.
 * Player elos are now derived live at log time, so the column is vestigial and needs
 * removing from old DBs. This only logs when the column is found and deleted.
 */
function dropLegacyLivePlayerGamesEloColumnIfPresent(): void {
	if (!db.columnExists('live_player_games', 'elo')) return; // Already migrated

	db.run('ALTER TABLE live_player_games DROP COLUMN elo');
	console.log('Temporary DB migration: deleted live_player_games.elo column.');
}

/**
 * One-off migration: adds the `is_persistent` column to the `refresh_tokens` table if it's missing.
 * Fresh databases already get the column from `generateTables()`; this only patches existing
 * databases (e.g. production) that predate the "keep me logged in" feature.
 *
 * SAFE TO DELETE once it has run a single time on production.
 */
function addIsPersistentColumnToRefreshTokens(): void {
	if (db.columnExists('refresh_tokens', 'is_persistent')) return; // Already present, nothing to do.
	db.run(
		`ALTER TABLE refresh_tokens ADD COLUMN is_persistent INTEGER NOT NULL DEFAULT 0 CHECK (is_persistent IN (0, 1));`,
	);
	console.log('Added the "is_persistent" column to the refresh_tokens table.');
}

/**
 * TEMPORARY MIGRATION: remove after it has run in production.
 *
 * Drops the now-vestigial verification columns (`is_verified`, `verification_code`,
 * `is_verification_notified`) from the members table. Every account is now created
 * already-verified, so before losing the flag we purge any legacy member that was
 * registered under the old flow and never verified (`is_verified = 0`).
 */
function dropLegacyVerificationColumnsIfPresent(): void {
	if (!db.columnExists('members', 'is_verified')) return; // Already migrated

	// Purge any remaining legacy unverified members before we drop the flag.
	const membersToDelete = db.all<{ user_id: number }>(
		`SELECT user_id FROM members WHERE is_verified = 0`,
	);
	for (const member of membersToDelete) {
		deleteAccount(member.user_id, 'unverified');
	}
	console.log(`Temporary DB migration: purged ${membersToDelete.length} unverified member(s).`);

	db.run('ALTER TABLE members DROP COLUMN is_verified');
	db.run('ALTER TABLE members DROP COLUMN verification_code');
	db.run('ALTER TABLE members DROP COLUMN is_verification_notified');
	console.log('Temporary DB migration: dropped verification columns from members table.');
}

/**
 * TEMPORARY MIGRATION: remove (and its call in initDatabase) after it has run in production.
 *
 * Idempotent: clears every `reason = 'spam_report'` row from `email_blacklist`.
 * Policy changed so spam complaints no longer suppress anyone (every email we send is transactional).
 * Don't lock users out of their accounts.
 */
function clearSpamReportBlacklistEntries(): void {
	// Clear every spam_report suppression.
	const spamRows = db.all<{ email: string }>(
		`SELECT email FROM email_blacklist WHERE reason = 'spam_report'`,
	);
	for (const row of spamRows) {
		removeFromBlacklist(row.email); // Logs each removal to blacklistLog for auditability.
	}
	if (spamRows.length > 0)
		console.log(
			`Temporary DB migration: cleared ${spamRows.length} 'spam_report' blacklist entries.`,
		);
}

/**
 * TEMPORARY MIGRATION: remove (and its call in initDatabase) after it has run in production.
 *
 * Makes the `variant` column nullable on `games` and `live_games` — NULL now marks a
 * custom-position game (no preset code; its position lives in the ICN). SQLite can't relax
 * NOT NULL in place, so we shuffle through a temp column: add nullable `variant_tmp`, copy
 * the codes across, drop the old `variant`, rename `variant_tmp` back. No table rebuild, so
 * the `player_games` → `games` FK cascade is never triggered. Idempotent: skips a table whose
 * `variant` is already nullable. Fresh DBs get nullable from `generateTables()` directly.
 */
function makeVariantColumnsNullableIfNeeded(): void {
	for (const table of ['games', 'live_games'] as const) {
		if (db.columnIsNullable(table, 'variant')) continue; // Fresh DB or already migrated.

		const migrate = db.transaction(() => {
			db.run(`ALTER TABLE ${table} ADD COLUMN variant_tmp TEXT`);
			db.run(`UPDATE ${table} SET variant_tmp = variant`);
			db.run(`ALTER TABLE ${table} DROP COLUMN variant`);
			db.run(`ALTER TABLE ${table} RENAME COLUMN variant_tmp TO variant`);
		});
		migrate();
		console.log(`Temporary DB migration: made ${table}.variant nullable.`);
	}
}

/**
 * TEMPORARY MIGRATION: remove (and its call in initDatabase) after it has run in production.
 *
 * Adds the nullable `position` column to `live_games` — holds a custom game's start position
 * (null for preset games), so custom games can be restored across a restart (preset games
 * rebuild from the variant code alone). Fresh DBs get the column from `generateTables()`.
 */
function addPositionColumnToLiveGamesIfNeeded(): void {
	if (db.columnExists('live_games', 'position')) return; // Already present, nothing to do.
	db.run('ALTER TABLE live_games ADD COLUMN position TEXT');
	console.log('Temporary DB migration: added live_games.position column.');
}

/**
 * TEMPORARY MIGRATION: remove (and its call in initDatabase) after it has run in production.
 *
 * Renames `live_player_games.disconnect_resign_time` → `disconnect_claim_time`. The column's
 * meaning changed: it no longer auto-resigns the player, it now marks the epoch ms from which
 * the opponent may claim victory/draw. The stored value (the same instant) carries over.
 * Fresh DBs get the new name from `generateTables()`.
 */
function renameDisconnectResignTimeColumnIfNeeded(): void {
	if (!db.columnExists('live_player_games', 'disconnect_resign_time')) return; // Already migrated.
	db.run(
		'ALTER TABLE live_player_games RENAME COLUMN disconnect_resign_time TO disconnect_claim_time',
	);
	console.log(
		'Temporary DB migration: renamed live_player_games.disconnect_resign_time to disconnect_claim_time.',
	);
}

/**
 * TEMPORARY MIGRATION: remove (and its call in initDatabase) after it has run in production.
 *
 * Renames `live_player_games.disconnect_by_choice` → `disconnect_voluntary`. The column's
 * name was made more semantically clear. The stored value carries over unchanged.
 * Fresh DBs get the new name from `generateTables()`.
 */
function renameDisconnectByChoiceColumnIfNeeded(): void {
	if (!db.columnExists('live_player_games', 'disconnect_by_choice')) return; // Already migrated.
	db.run(
		'ALTER TABLE live_player_games RENAME COLUMN disconnect_by_choice TO disconnect_voluntary',
	);
	console.log(
		'Temporary DB migration: renamed live_player_games.disconnect_by_choice to disconnect_voluntary.',
	);
}

/**
 * TEMPORARY MIGRATION: remove (and its call in initDatabase) after it has run in production.
 *
 * Adds the nullable `both_disconnected_end_time` column to `live_games` — the epoch ms the
 * both-disconnected timer concludes the game (draw by abandonment, or abort) when neither
 * player is present to claim. Fresh DBs get the column from `generateTables()`.
 */
function addBothDisconnectedEndTimeColumnToLiveGamesIfNeeded(): void {
	if (db.columnExists('live_games', 'both_disconnected_end_time')) return; // Already present.
	db.run('ALTER TABLE live_games ADD COLUMN both_disconnected_end_time INTEGER');
	console.log('Temporary DB migration: added live_games.both_disconnected_end_time column.');
}

/**
 * TEMPORARY MIGRATION: remove (and its call in initDatabase) after it has run in production.
 *
 * Concluded games are now logged to the permanent `games` table the instant they end, and their
 * `live_games` row is dropped immediately — so only ongoing games are ever persisted/restored.
 * The conclusion snapshot columns (`conclusion_condition`, `conclusion_victor`, `time_ended`) and
 * the `delete_time` finalize deadline are therefore vestigial and need removing from old DBs.
 * Fresh DBs never have them.
 */
function dropLiveGamesConclusionColumnsIfPresent(): void {
	if (!db.columnExists('live_games', 'delete_time')) return; // Already migrated (or fresh DB).
	for (const column of [
		'conclusion_condition',
		'conclusion_victor',
		'time_ended',
		'delete_time',
	]) {
		db.run(`ALTER TABLE live_games DROP COLUMN ${column}`);
	}
	console.log('Temporary DB migration: dropped live_games conclusion snapshot columns.');
}

/**
 * TEMPORARY MIGRATION: remove (and its call in initDatabase) after it has run in production.
 *
 * Adds the nullable `rating_deviation_at_game` / `rating_deviation_after_game` columns to
 * `player_games` — the Glicko RDs before/after the game, so a concluded game's pre-game and
 * new ratings can each report faithful confidence in review (mirroring the live path) instead
 * of being hardcoded confident. Old rows stay NULL (treated as confident, unrecoverable).
 * Fresh DBs get the columns from `generateTables()`.
 */
function addRatingDeviationColumnsToPlayerGamesIfNeeded(): void {
	if (db.columnExists('player_games', 'rating_deviation_at_game')) return; // Already present, nothing to do.
	db.run('ALTER TABLE player_games ADD COLUMN rating_deviation_at_game REAL');
	db.run('ALTER TABLE player_games ADD COLUMN rating_deviation_after_game REAL');
	console.log('Temporary DB migration: added player_games rating_deviation columns.');
}

/** Wipes all data from all tables. ONLY call in a test environment! */
function clearAllTables(): void {
	if (process.env['NODE_ENV'] !== 'test') {
		return console.error('CANNOT CLEAR DATABASE TABLES OUTSIDE OF TEST ENVIRONMENT!');
	}

	// Get all table names dynamically
	const tables = db.all<{ name: string }>(
		"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
	);

	// Disable foreign keys temporarily to avoid constraint errors (e.g. deleting Parent before Child)
	db.run('PRAGMA foreign_keys = OFF');

	// Wrap deletions in a transaction for speed
	const wipeTransaction = db.transaction(() => {
		for (const table of tables) {
			db.run(`DELETE FROM ${table.name}`);
		}
	});
	wipeTransaction();

	// Re-enable foreign keys
	db.run('PRAGMA foreign_keys = ON');
}

export {
	user_id_upper_cap,
	game_id_upper_cap,
	uniqueMemberKeys,
	allMemberColumns,
	allPlayerGamesColumns,
	allGamesColumns,
	allRatingAbuseColumns,
	allLiveGamesColumns,
	allLivePlayerGamesColumns,
	allEngineGamesColumns,
	allLiveEngineGamesColumns,
	initDatabase,
	generateTables,
	clearAllTables,
};
