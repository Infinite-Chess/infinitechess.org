
// src/server/database/database.ts

/*
 * This module provides utility functions for managing SQLite database operations 
 * using the `better-sqlite3` library.
 * 
 * It supports executing SQL queries, retrieving  results (single or multiple rows),
 * caching prepared statements for performance,  and handling database transactions.
 */


import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

// Get the current file path and derive the directory (ESM doesn't support __dirname)
const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = path.dirname(__filename);

// Create or connect to the SQLite database file
const dbPath: string = path.join(__dirname, '../../../database.db');
const db = new Database(dbPath); // Optional for logging queries
// const db = new Database(dbPath, { verbose: console.log }); // Optional for logging queries


// Variables ----------------------------------------------------------------------------------------------


// Prepared statements cache
const stmtCache: Record<string, Database.Statement> = {};


// Query Calls --------------------------------------------------------------------------------------------


// Utility function to retrieve or prepare statements
function prepareStatement(query: string): Database.Statement {
	if (!stmtCache[query]) {
		// console.log(`Added statement to stmtCache: "${query}"`);
		stmtCache[query] = db.prepare(query);
	}
	return stmtCache[query];
}

type SupportedColumnTypes = string | number | boolean | null;

/**
 * Executes a given SQL query with optional parameters and returns the result.
 * @param {string} query - The SQL query to be executed.
 * @param {Array} [params=[]] - An array of parameters to bind to the query.
 * @returns {object} - The result of the query execution.
 */
function run(query: string, params: SupportedColumnTypes[] = []): Database.RunResult {
	const stmt = prepareStatement(query);
	return stmt.run(...params);
}

/**
 * Retrieves a single row from the database for a given SQL query.
 * @param query - The SQL query to be executed.
 * @param [params=[]] - An array of parameters to bind to the query.
 * @returns - The row object if found, otherwise undefined.
 */
function get<T>(query: string, params: SupportedColumnTypes[] = []): T | undefined {
	const stmt = prepareStatement(query);
	return stmt.get(...params) as T | undefined;
}

/**
 * Retrieves all rows from the database for a given SQL query.
 * @param query - The SQL query to be executed.
 * @param [params=[]] - An array of parameters to bind to the query.
 * @returns - An array of row objects.
 */
function all<T>(query: string, params: SupportedColumnTypes[] = []): T[] {
	const stmt = prepareStatement(query);
	return stmt.all(...params) as T[];
}

type QueryObject = { query: string; params: any[]; };

/**
 * Executes multiple queries in a single transaction for better performance.
 * @param queries - An array of query objects containing SQL and parameters.
 * @returns - An array of results for each query in the transaction.
 */
function transaction(queries: QueryObject[]): Database.RunResult[] {
	const transaction = db.transaction((queries) => {
		return queries.map(({ query, params }: QueryObject) => {
			const stmt = prepareStatement(query);
			return stmt.run(...params);
		});
	});
	return transaction(queries);
}

/** Closes the database connection. */
function close() {
	db.close();
	console.log('Closed database.');
}



export default {
	db,
	run,
	get,
	all,
	transaction,
	close,
};
