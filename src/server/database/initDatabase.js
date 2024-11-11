
/**
 * This script creates our database tables if they aren't already present.
 */

import db from './database.js';



/** All unique columns of the members table. Each of these would be valid to search for to find a single member. */
const uniqueMemberKeys = ['user_id', 'username', 'email'];
	
/** All columns of the members table each of these would be valid to retrieve from any member. */
const allMemberColumns = [
	'user_id', 'username', 'email', 'hashed_password', 'roles', 
	'joined', 'refresh_tokens', 'preferences', 'verification', 
	'login_count', 'last_seen'
];



// Functions -----------------------------------------------------------------------------------



function initTables() {
	// Members table
	let createTableSQLQuery = `
		CREATE TABLE IF NOT EXISTS members (
			user_id INTEGER PRIMARY KEY,               
			username TEXT UNIQUE NOT NULL COLLATE NOCASE, 
			email TEXT UNIQUE NOT NULL,                
			hashed_password TEXT NOT NULL,             
			roles TEXT,                       
			joined TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			refresh_tokens TEXT,                        
			preferences TEXT,                          
			verification TEXT,                         
			login_count INTEGER DEFAULT 0,             
			last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
	`;
	db.run(createTableSQLQuery);

	// Bans table
	createTableSQLQuery = `
		CREATE TABLE IF NOT EXISTS bans (
			emails TEXT DEFAULT '[]',
			ips TEXT DEFAULT '[]',
			browser_ids TEXT DEFAULT '[]'
		)
	`;
	db.run(createTableSQLQuery);

	// Games table...
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
// deleteTable('members');




export {
	uniqueMemberKeys,
	allMemberColumns,
	initTables,
	deleteTable,
};