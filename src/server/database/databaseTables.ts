
// src/server/database/databaseTables.ts

/**
 * This script creates our database tables if they aren't already present.
 */


import db from './database.js';
import { startPeriodicLeaderboardRatingDeviationUpdate } from './leaderboardsManager.js';
import { startPeriodicDatabaseCleanupTasks } from './cleanupTasks.js';


// Variables -----------------------------------------------------------------------------------


const user_id_upper_cap: number = 14_776_336; // 62**4: Limit of unique user id with 4-digit base-62 user ids!
const game_id_upper_cap: number = 14_776_336; // 62**4: Limit of unique game id with 4-digit base-62 game ids!

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
	'is_verified',
	'verification_code',
	'is_verification_notified',
	'last_read_news_date',
];

/** All columns of the player_stats table. Each of these would be valid to retrieve from any member. */
const allPlayerStatsColumns: string[] = [
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
	'game_count_draws_casual'
];

/** All columns of the player_stats table. Each of these would be valid to retrieve from any member. */
const allPlayerGamesColumns: string[] = [
	'user_id',
	'game_id',
	'player_number',
	'score',
	'clock_at_end_millis',
	'elo_at_game',
	'elo_change_from_game'
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
	'icn'
];

/** All columns of the rating_abuse table. Each of these would be valid to retrieve from any member and/or leaderboard. */
const allRatingAbuseColumns: string[] = [
	'user_id',
	'leaderboard_id',
	'game_count_since_last_check',
	'last_alerted_at'
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
			is_verified INTEGER NOT NULL DEFAULT 0,
			verification_code TEXT,
			is_verification_notified INTEGER NOT NULL DEFAULT 0,
			preferences TEXT,
			username_history TEXT,
			checkmates_beaten TEXT NOT NULL DEFAULT '',
			last_read_news_date TEXT
		);
	`);

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
	db.run(`CREATE INDEX IF NOT EXISTS idx_leaderboards_leaderboard_elo ON leaderboards (leaderboard_id, elo DESC);`);

	// Games table
	db.run(`
		CREATE TABLE IF NOT EXISTS games (
			game_id INTEGER PRIMARY KEY,
			date TIMESTAMP NOT NULL,
			base_time_seconds INTEGER, -- null if untimed
			increment_seconds INTEGER, -- null if untimed
			variant TEXT NOT NULL,
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
			user_id INTEGER NOT NULL,
			expires_at INTEGER NOT NULL, -- Unix timestamp (milliseconds)
			created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000), -- Unix timestamp (milliseconds)

			FOREIGN KEY (user_id) REFERENCES members(user_id) ON DELETE CASCADE
		);
	`);
	// Indexes for password_reset_tokens table
	db.run(`CREATE INDEX IF NOT EXISTS idx_prt_user_id ON password_reset_tokens (user_id);`);
	db.run(`CREATE INDEX IF NOT EXISTS idx_prt_expires_at ON password_reset_tokens (expires_at);`);


	// Refresh Tokens table
	db.run(`
		CREATE TABLE IF NOT EXISTS refresh_tokens (
			token TEXT PRIMARY KEY NOT NULL,
			user_id INTEGER NOT NULL,
			created_at INTEGER NOT NULL,   -- Unix timestamp (milliseconds)
			expires_at INTEGER NOT NULL,   -- Unix timestamp (milliseconds)
			ip_address TEXT,

			FOREIGN KEY (user_id) REFERENCES members(user_id) ON DELETE CASCADE
		);
	`);
	// Indexes for refresh_tokens table
	db.run(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);`);
	db.run(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);`);

	// Editor Saves table
	db.run(`
		CREATE TABLE IF NOT EXISTS editor_saves (
			position_id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			name TEXT NOT NULL,
			size INTEGER NOT NULL,
			icn TEXT NOT NULL,

			FOREIGN KEY (user_id) REFERENCES members(user_id) ON DELETE CASCADE
		);
	`);
	// Indexes for editor_saves table
	db.run(`CREATE INDEX IF NOT EXISTS idx_editor_saves_user_id ON editor_saves (user_id);`);

	// Bans table
	// createTableSQLQuery = `
	// 	CREATE TABLE IF NOT EXISTS bans (
	// 		emails TEXT DEFAULT '[]',
	// 		ips TEXT DEFAULT '[]',
	// 		browser_ids TEXT DEFAULT '[]'
	// 	)
	// `;
	// db.run(createTableSQLQuery);
}

// /**
//  * Deletes a table from the database by its name.
//  * @param tableName - The name of the table to delete.
//  */
// function deleteTable(tableName: string): void {
// 	try {
// 		// Prepare the SQL query to drop the table
// 		const deleteTableSQL = `DROP TABLE IF EXISTS ${tableName};`;

// 		// Run the query
// 		db.run(deleteTableSQL);
// 		console.log(`Table ${tableName} deleted successfully.`);
// 	} catch (error) {
// 		console.error(`Error deleting table ${tableName}:`, error);
// 	}
// }
// deleteTable('test');

/**
 * Adds the last_read_news_date column to the members table if it doesn't exist.
 * This migration sets the default value to current date for existing users so they don't see all old news as unread.
 * 
 * DELETE AFTER PROD DB MIGRATES!
 */
function migrateAddLastReadNewsDate(): void {
	if (!db.columnExists('members', 'last_read_news_date')) {
		console.log('Adding last_read_news_date column to members table...');
		db.run('ALTER TABLE members ADD COLUMN last_read_news_date TEXT');
		
		// Set default value to current date for existing users
		const currentDate = new Date().toISOString().split('T')[0]!; // 'YYYY-MM-DDThh:mm:ss.sssZ' -> 'YYYY-MM-DD'
		console.log(`Setting last_read_news_date to ${currentDate} for existing users...`);
		db.run('UPDATE members SET last_read_news_date = ? WHERE last_read_news_date IS NULL', [currentDate]);
		
		console.log('Successfully added and initialized last_read_news_date column.');
	}
}


function initDatabase(): void {
	generateTables();
	migrateAddLastReadNewsDate(); // Add news tracking column. DELETE AFTER PROD DB MIGRATES!
	startPeriodicDatabaseCleanupTasks();
	startPeriodicLeaderboardRatingDeviationUpdate();
}


export {
	user_id_upper_cap,
	game_id_upper_cap,
	uniqueMemberKeys,
	allMemberColumns,
	allPlayerStatsColumns,
	allPlayerGamesColumns,
	allGamesColumns,
	allRatingAbuseColumns,
	initDatabase,
};
