
/**
 * This script creates our database tables if they aren't already present.
 */

import db from './database.js';


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


	// Stats table


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
	initTables,
	deleteTable,
};