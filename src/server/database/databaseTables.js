
/**
 * This script creates our database tables if they aren't already present.
 */

import db from '../database/database.js';


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
];


// Functions -----------------------------------------------------------------------------------


/** Creates the tables in our database if they do not exist. */
function generateTables() {
	// Members table
	let createTableSQLQuery = `
		CREATE TABLE IF NOT EXISTS members (
			user_id INTEGER PRIMARY KEY,               
			username TEXT UNIQUE NOT NULL COLLATE NOCASE, 
			username_history TEXT,
			email TEXT UNIQUE NOT NULL,                
			hashed_password TEXT NOT NULL,             
			roles TEXT,                       
			joined TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			refresh_tokens TEXT,                        
			preferences TEXT,                          
			verification TEXT,                         
			login_count INTEGER DEFAULT 0
		);
	`;
	db.run(createTableSQLQuery);

	// Deleted Members table
	createTableSQLQuery = `
		CREATE TABLE IF NOT EXISTS deleted_members (
			user_id INTEGER PRIMARY KEY,               
			username TEXT NOT NULL COLLATE NOCASE,    
			username_history TEXT,    
			joined INTEGER NOT NULL,
			left INTEGER NOT NULL,                              
			login_count INTEGER NOT NULL,             
			reason_deleted TEXT NOT NULL
		);
	`;
	// reason deleted: "user request" / "banned" / "inactive"
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
	generateTables,
};