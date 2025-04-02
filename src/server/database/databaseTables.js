
/**
 * This script creates our database tables if they aren't already present.
 */

import db from './database.js';


// Variables -----------------------------------------------------------------------------------


const user_id_upper_cap = 14_776_336; // Limit of unique user id with 4-digit base-62 user ids!

/** All unique columns of the members table. Each of these would be valid to search for to find a single member. */
const uniqueMemberKeys = ['user_id', 'username', 'email'];

/** All columns of the members table. Each of these would be valid to retrieve from any member. */
const allMemberColumns = [
	'user_id',
	'username',
	'username_history',
	'email',
	'hashed_password',
	'roles',
	'joined',
	'last_seen',
	'refresh_tokens',
	'preferences',
	'verification',
	'login_count',
	'checkmates_beaten'
];

/** All columns of the player_stats table. Each of these would be valid to retrieve from any member. */
const allPlayerStatsColumns = [
	'user_id',
	'moves_played',
	'last_played_rated_game',
	'game_history',
	'game_count',
	'game_count_rated',
	'game_count_casual',
	'game_count_public',
	'game_count_private',
	'game_count_wins',
	'game_count_losses',
	'game_count_draws',
	'game_count_wins_ranked',
	'game_count_losses_ranked',
	'game_count_draws_ranked',
	'game_count_wins_casual',
	'game_count_losses_casual',
	'game_count_draws_casual'
];


// Functions -----------------------------------------------------------------------------------


/** Creates the tables in our database if they do not exist. */
function generateTables() {
	// Members table
	let createTableSQLQuery = `
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
			refresh_tokens TEXT,                          
			verification TEXT, 
			username_history TEXT,
			checkmates_beaten TEXT NOT NULL DEFAULT ''
		);
	`;
	db.run(createTableSQLQuery);

	// Deleted Members table
	createTableSQLQuery = `
		CREATE TABLE IF NOT EXISTS deleted_members (
			user_id INTEGER PRIMARY KEY,             
			reason_deleted TEXT NOT NULL
		);
	`;
	// reason deleted: "unverified" / "user request" / "banned" / "inactive"
	db.run(createTableSQLQuery);

	// Ratings table
	createTableSQLQuery = `
		CREATE TABLE IF NOT EXISTS ratings (
			user_id INTEGER PRIMARY KEY REFERENCES members(user_id) ON DELETE CASCADE,
			infinite_elo REAL NOT NULL DEFAULT 1000.0,
			infinite_rating_deviation REAL NOT NULL DEFAULT 350.0
		);
	`;
	db.run(createTableSQLQuery);

	// Player Stats table
	createTableSQLQuery = `
		CREATE TABLE IF NOT EXISTS player_stats (
			user_id INTEGER PRIMARY KEY REFERENCES members(user_id) ON DELETE CASCADE,
			moves_played INTEGER NOT NULL DEFAULT 0,
			last_played_rated_game TIMESTAMP,
			game_history TEXT NOT NULL DEFAULT '',
			game_count INTEGER NOT NULL DEFAULT 0,
			game_count_rated INTEGER NOT NULL DEFAULT 0,
			game_count_casual INTEGER NOT NULL DEFAULT 0,
			game_count_public INTEGER NOT NULL DEFAULT 0,
			game_count_private INTEGER NOT NULL DEFAULT 0,
			game_count_wins INTEGER NOT NULL DEFAULT 0,
			game_count_losses INTEGER NOT NULL DEFAULT 0,
			game_count_draws INTEGER NOT NULL DEFAULT 0,
			game_count_wins_ranked INTEGER NOT NULL DEFAULT 0,
			game_count_losses_ranked INTEGER NOT NULL DEFAULT 0,
			game_count_draws_ranked INTEGER NOT NULL DEFAULT 0,
			game_count_wins_casual INTEGER NOT NULL DEFAULT 0,
			game_count_losses_casual INTEGER NOT NULL DEFAULT 0,
			game_count_draws_casual INTEGER NOT NULL DEFAULT 0
		);
	`;
	db.run(createTableSQLQuery);

	// Games table
	createTableSQLQuery = `
		CREATE TABLE IF NOT EXISTS games (
			id INTEGER PRIMAY KEY,
			date TIMESTAMP NOT NULL,
			players TEXT NOT NULL,
			elo TEXT,
			rating_diff TEXT,
			time_control TEXT NOT NULL,
			variant TEXT NOT NULL,
			rated BOOLEAN NOT NULL,
			private BOOLEAN NOT NULL,
			result TEXT NOT NULL,
			termination TEXT NOT NULL,
			movecount INTEGER NOT NULL,
			icn TEXT NOT NULL
		);
	`;
	db.run(createTableSQLQuery);

	// Bans table
	// createTableSQLQuery = `
	// 	CREATE TABLE IF NOT EXISTS bans (
	// 		emails TEXT DEFAULT '[]',
	// 		ips TEXT DEFAULT '[]',
	// 		browser_ids TEXT DEFAULT '[]'
	// 	)
	// `;
	// db.run(createTableSQLQuery);

	// Games table
	// ...
}

/**
 * Deletes a table from the database by its name.
 * @param {string} tableName - The name of the table to delete.
 */
function deleteTable(tableName) {
	try {
		// Prepare the SQL query to drop the table
		const deleteTableSQL = `DROP TABLE IF EXISTS ${tableName};`;

		// Run the query
		db.run(deleteTableSQL);
		console.log(`Table ${tableName} deleted successfully.`);
	} catch (error) {
		console.error(`Error deleting table ${tableName}:`, error);
	}
}
// deleteTable('test');




export {
	user_id_upper_cap,
	uniqueMemberKeys,
	allMemberColumns,
	allPlayerStatsColumns,
	generateTables,
};
