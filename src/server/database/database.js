/*
 * This module provides helper functions for managing SQLite database operations using the better-sqlite3 library.
 * It handles running queries, retrieving single  or multiple rows, and closing the database connection.
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

// Get the current file path and derive the directory (ESM doesn't support __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create or connect to the SQLite database file
const dbPath = path.join(__dirname, '../../../database.db');
// const db = new Database(dbPath);
const db = new Database(dbPath, { verbose: console.log }); // Outputs all queries to the console




function initTables() {
	// SQL to create the members table
	const createTableSQL = `
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
		login_count INTEGER DEFAULT 1,             
		last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	  );
	`;
	
	// Run the SQL command
	db.prepare(createTableSQL).run();
	console.log('Members table created or already exists.');
}
// initTables();

/**
 * Deletes a table from the database by its name.
 * @param {string} tableName - The name of the table to delete.
 */
function deleteTable(tableName) {
	try {
	  // Prepare the SQL query to drop the table
	  const deleteTableSQL = `DROP TABLE IF EXISTS ${tableName};`;
	  
	  // Run the query
	  db.prepare(deleteTableSQL).run();
	  console.log(`Table ${tableName} deleted successfully.`);
	} catch (error) {
	  console.error(`Error deleting table ${tableName}:`, error);
	}
}
// deleteTable('members');
  





// Functions -----------------------------------------------------------------------------------



/**
 * Executes a given SQL query with optional parameters and returns the result.
 * @param {string} query - The SQL query to be executed.
 * @param {Array} [params=[]] - An array of parameters to bind to the query.
 * @returns {object} - The result of the query execution.
 */
function run(query, params = []) {
	const stmt = db.prepare(query);
	return stmt.run(...params);
}

/**
 * Retrieves a single row from the database for a given SQL query.
 * @param {string} query - The SQL query to be executed.
 * @param {Array} [params=[]] - An array of parameters to bind to the query.
 * @returns {object|null} - The row object if found, otherwise null.
 */
function get(query, params = []) {
	const stmt = db.prepare(query);
	return stmt.get(...params);
}

/**
 * Retrieves all rows from the database for a given SQL query.
 * @param {string} query - The SQL query to be executed.
 * @param {Array} [params=[]] - An array of parameters to bind to the query.
 * @returns {Array} - An array of row objects.
 */
function all(query, params = []) {
	const stmt = db.prepare(query);
	return stmt.all(...params);
}

/** Closes the database connection. */
function close() {
	console.log('Closing database.');
	db.close();
}




// Export the functions for use in other modules
export default {
	run,
	get,
	all,
	close,
};
