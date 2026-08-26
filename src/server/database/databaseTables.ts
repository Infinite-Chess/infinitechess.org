// src/server/database/databaseTables.ts

/**
 * The schema definition: every `CREATE TABLE` statement and index a fresh database gets.
 * Also home to `clear` (wipes all data, test-only).
 *
 * Patching an old database up to this shape is `migrations.ts`; sequencing both at boot
 * is `databaseInit.ts`.
 */

import db from './database.js';

// Functions -------------------------------------------------------------------

/** Creates the tables in our database if they do not exist. */
function generate(): void {
	// --- Accounts ---

	// Members table
	db.run(`
		CREATE TABLE IF NOT EXISTS members (
			user_id             INTEGER PRIMARY KEY,
			username            TEXT UNIQUE NOT NULL COLLATE NOCASE,
			email               TEXT UNIQUE NOT NULL,
			hashed_password     TEXT NOT NULL,
			roles               TEXT,
			joined              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			last_seen           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			login_count         INTEGER NOT NULL DEFAULT 0,
			preferences         TEXT,
			username_history    TEXT,
			checkmates_beaten   TEXT NOT NULL DEFAULT '',
			last_read_news_date TEXT
		);
	`);

	// Player Stats table
	db.run(`
		CREATE TABLE IF NOT EXISTS player_stats (
			user_id                  INTEGER PRIMARY KEY REFERENCES members(user_id) ON DELETE CASCADE,
			moves_played             INTEGER NOT NULL DEFAULT 0,
			game_count               INTEGER NOT NULL DEFAULT 0,
			game_count_rated         INTEGER NOT NULL DEFAULT 0,
			game_count_casual        INTEGER NOT NULL DEFAULT 0,
			game_count_public        INTEGER NOT NULL DEFAULT 0,
			game_count_private       INTEGER NOT NULL DEFAULT 0,
			game_count_wins          INTEGER NOT NULL DEFAULT 0,
			game_count_losses        INTEGER NOT NULL DEFAULT 0,
			game_count_draws         INTEGER NOT NULL DEFAULT 0,
			game_count_aborted       INTEGER NOT NULL DEFAULT 0,
			game_count_wins_rated    INTEGER NOT NULL DEFAULT 0,
			game_count_losses_rated  INTEGER NOT NULL DEFAULT 0,
			game_count_draws_rated   INTEGER NOT NULL DEFAULT 0,
			game_count_wins_casual   INTEGER NOT NULL DEFAULT 0,
			game_count_losses_casual INTEGER NOT NULL DEFAULT 0,
			game_count_draws_casual  INTEGER NOT NULL DEFAULT 0
		);
	`);

	// Leaderboards table
	db.run(`
		CREATE TABLE IF NOT EXISTS leaderboards (
			user_id             INTEGER NOT NULL REFERENCES members(user_id) ON DELETE CASCADE,
			leaderboard_id      INTEGER NOT NULL, -- Each leaderboard's id and variants are declared in the code
			elo                 REAL NOT NULL,
			rating_deviation    REAL NOT NULL,
			-- Add other Glicko fields if needed (volatility)
			rd_last_update_date TIMESTAMP,
			PRIMARY KEY (user_id, leaderboard_id) -- Composite key essential
		);
	`);
	// To quickly get all leaderboards for a specific user
	db.run(`CREATE INDEX IF NOT EXISTS idx_leaderboards_user ON leaderboards (user_id);`);
	// To quickly get rankings for a specific leaderboard (ESSENTIAL)
	db.run(
		`CREATE INDEX IF NOT EXISTS idx_leaderboards_leaderboard_elo ON leaderboards (leaderboard_id, elo DESC);`,
	);

	// Rating Abuse table
	db.run(`
		CREATE TABLE IF NOT EXISTS rating_abuse (
			user_id                     INTEGER NOT NULL,
			leaderboard_id              INTEGER NOT NULL,
			game_count_since_last_check INTEGER,
			last_alerted_at             TIMESTAMP,

			PRIMARY KEY (user_id, leaderboard_id),
			FOREIGN KEY (user_id, leaderboard_id)
				REFERENCES leaderboards(user_id, leaderboard_id) ON DELETE CASCADE
		);
	`);
	// To quickly get all rating_abuse entries for a specific user
	db.run(`CREATE INDEX IF NOT EXISTS idx_rating_abuse_user ON rating_abuse (user_id);`);

	// --- Authentication & Account Lifecycle ---

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
	// To quickly find expired registrations for the expiry sweep
	db.run(
		`CREATE INDEX IF NOT EXISTS idx_pending_registrations_expires_at ON pending_registrations (expires_at);`,
	);

	// Refresh Tokens table
	db.run(`
		CREATE TABLE IF NOT EXISTS refresh_tokens (
			token         TEXT PRIMARY KEY NOT NULL,
			user_id       INTEGER NOT NULL REFERENCES members(user_id) ON DELETE CASCADE,
			created_at    INTEGER NOT NULL, -- Unix timestamp (milliseconds)
			expires_at    INTEGER NOT NULL, -- Unix timestamp (milliseconds)
			is_persistent INTEGER NOT NULL DEFAULT 0 CHECK (is_persistent IN (0, 1)), -- "Keep me logged in" flag
			consumed_at   INTEGER, -- Allows a grace period for using old tokens when renewing sessions
			ip_address    TEXT
		);
	`);
	db.run(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);`);
	db.run(
		`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);`,
	);

	// Password Reset Tokens table
	db.run(`
		CREATE TABLE IF NOT EXISTS password_reset_tokens (
			hashed_token TEXT PRIMARY KEY NOT NULL,
			user_id      INTEGER NOT NULL REFERENCES members(user_id) ON DELETE CASCADE,
			expires_at   INTEGER NOT NULL, -- Unix timestamp (milliseconds)
			created_at   INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000) -- Unix timestamp (milliseconds)
		);
	`);
	db.run(`CREATE INDEX IF NOT EXISTS idx_prt_user_id ON password_reset_tokens (user_id);`);
	db.run(`CREATE INDEX IF NOT EXISTS idx_prt_expires_at ON password_reset_tokens (expires_at);`);

	// Deleted Members table
	db.run(`
		CREATE TABLE IF NOT EXISTS deleted_members (
			user_id        INTEGER PRIMARY KEY,
			reason_deleted TEXT NOT NULL -- "unverified" / "user request" / "security" / "rating abuse"
		);
	`);

	// Email Blacklist table
	db.run(`
		CREATE TABLE IF NOT EXISTS email_blacklist (
			email      TEXT PRIMARY KEY NOT NULL,
			reason     TEXT NOT NULL, -- e.g. 'bounce', 'spam_report', 'banned'
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
	`);

	// --- User Content ---

	// Editor Saves table
	db.run(`
		CREATE TABLE IF NOT EXISTS editor_saves (
			user_id          INTEGER NOT NULL REFERENCES members(user_id) ON DELETE CASCADE,
			name             TEXT NOT NULL,
			piece_count      INTEGER NOT NULL,
			timestamp        INTEGER NOT NULL,
			icn              TEXT NOT NULL,
			compression      TEXT NOT NULL DEFAULT 'none',
			pawn_double_push INTEGER NOT NULL CHECK (pawn_double_push IN (-1, 0, 1)),
			castling         INTEGER NOT NULL CHECK (castling IN (-1, 0, 1)),

			PRIMARY KEY (user_id, name)
		);
	`);

	// --- Concluded Games ---

	// Games table
	db.run(`
		CREATE TABLE IF NOT EXISTS games (
			game_id              INTEGER PRIMARY KEY,
			date                 TIMESTAMP NOT NULL,
			base_time_seconds    INTEGER, -- null if untimed
			increment_seconds    INTEGER, -- null if untimed
			variant              TEXT, -- preset variant code, or null for a custom-position game (position lives in the ICN)
			rated                BOOLEAN NOT NULL CHECK (rated IN (0, 1)), -- Ensures only 0 or 1
			leaderboard_id       INTEGER, -- Specified only if the variant belongs to a leaderboard, ignoring whether the game was rated
			private              BOOLEAN NOT NULL CHECK (private IN (0, 1)), -- Ensures only 0 or 1
			result               TEXT NOT NULL,
			termination          TEXT NOT NULL,
			move_count           INTEGER NOT NULL,
			time_duration_millis INTEGER, -- Number of milliseconds that the game lasted in total on the server. Null if info is missing.
			icn                  TEXT NOT NULL, -- Also includes clock timestamps after each move
			mod_slide_limit      INTEGER, -- Slide Limit modifier: max squares a sliding piece may travel. NULL = modifier inactive.

			-- Add a CHECK constraint to ensure consistency:
			-- EITHER both are NULL (untimed) OR both are NOT NULL and >= 0 (timed)
			CHECK (
				(base_time_seconds IS NULL AND increment_seconds IS NULL)
				OR
				(base_time_seconds > 0 AND increment_seconds >= 0)
			)
		);
	`);
	db.run(`CREATE INDEX IF NOT EXISTS idx_games_date ON games (date DESC);`);

	// Player Games table
	db.run(`
		CREATE TABLE IF NOT EXISTS player_games (
			user_id                     INTEGER NOT NULL, -- Account deletion does not delete rows in this table
			game_id                     INTEGER NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
			player_number               INTEGER NOT NULL, -- 1 => White  2 => Black
			score                       REAL, -- 1 => Win   0.5 => Draw   0 => Loss   NULL => Aborted
			elo_at_game                 REAL, -- Specified if they have a rating for the leaderboard, ignoring whether the game was rated
			elo_change_from_game        REAL, -- Specified only if the game was rated
			rating_deviation_at_game    REAL, -- Glicko RD before the game; drives the pre-game rating's confidence. Specified only if the game was rated.
			rating_deviation_after_game REAL, -- Glicko RD after the game; drives the new rating's confidence. Specified only if the game was rated.
			PRIMARY KEY (user_id, game_id) -- Ensures unique link
		);
	`);
	// To quickly get all players in a specific game
	db.run(`CREATE INDEX IF NOT EXISTS idx_player_games_game ON player_games (game_id);`);

	// Engine Games table
	db.run(`
		CREATE TABLE IF NOT EXISTS engine_games (
			game_id             INTEGER NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
			player_number       INTEGER NOT NULL,
			score               REAL,
			engine              TEXT NOT NULL,
			engine_version      TEXT NOT NULL,
			strength_level      INTEGER NOT NULL,
			PRIMARY KEY (game_id, player_number)
		);
	`);

	// --- Live Games ---

	// The live-game tables below are documented in docs/systems/LIVE_GAME_PERSISTENCE.md.
	// Keep it in sync with any edit made here.

	// Live Games table — persists active games across server restarts
	db.run(`
		CREATE TABLE IF NOT EXISTS live_games (
			game_id                    INTEGER PRIMARY KEY,
			time_created               INTEGER NOT NULL,
			variant                    TEXT, -- preset variant code, or null for a custom-position game (see position)
			position                   TEXT, -- custom game's start position; null for preset games (complementary to variant)
			clock                      TEXT NOT NULL,
			rated                      BOOLEAN NOT NULL CHECK (rated IN (0, 1)),
			private                    BOOLEAN NOT NULL CHECK (private IN (0, 1)),
			moves                      TEXT NOT NULL DEFAULT '',
			color_ticking              INTEGER,
			clock_snapshot_time        INTEGER,
			draw_offer_state           INTEGER,
			validate_moves             BOOLEAN NOT NULL DEFAULT 1 CHECK (validate_moves IN (0, 1)),
			both_disconnected_end_time INTEGER, -- Epoch ms the both-disconnected timer concludes the game. NULL unless both players are disconnected.
			mod_slide_limit            INTEGER -- Slide Limit modifier: max squares a sliding piece may travel. NULL = modifier inactive.
		);
	`);

	// Live Player Games table — per-player state for active games
	db.run(`
		CREATE TABLE IF NOT EXISTS live_player_games (
			game_id                     INTEGER NOT NULL REFERENCES live_games(game_id) ON DELETE CASCADE,
			player_number               INTEGER NOT NULL,
			user_id                     INTEGER,
			browser_id                  TEXT NOT NULL,
			last_draw_offer_ply         INTEGER,
			time_remaining_ms           INTEGER,
			disconnect_cushion_end_time INTEGER,
			disconnect_claim_time       INTEGER, -- Epoch ms from which the opponent may claim victory/draw. NULL if no claim window.
			disconnect_voluntary        INTEGER CHECK (disconnect_voluntary IN (0, 1)),
			PRIMARY KEY (game_id, player_number)
		);
	`);

	// Live Engine Games table — engines have no disconnect state, so live participants use a separate table
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

/** Wipes all data from all tables. ONLY call in a test environment! */
function clear(): void {
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

// Exports ---------------------------------------------------------------------

export default { generate, clear };
