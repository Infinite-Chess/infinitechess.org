// src/server/database/database.ts

/**
 * This module provides utility functions for managing SQLite database operations
 * using the `better-sqlite3` library.
 *
 * It supports executing SQL queries, retrieving results (single or multiple rows),
 * caching prepared statements for performance, and handling database transactions.
 */

import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

import jsutil from '../../shared/util/jsutil.js';
import jsonutil from '../../shared/util/jsonutil.js';

import logEvents from '../utility/logEvents.js';

// Types ---------------------------------------------------------------------------------------------------

type SupportedColumnTypes = string | number | boolean | null;

// Connection ----------------------------------------------------------------------------------------------

// Get the current file path and derive the directory (ESM doesn't support __dirname)
const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = path.dirname(__filename);

// Create or connect to the SQLite database file
const DB_LOCATION: string =
	process.env['NODE_ENV'] === 'test'
		? ':memory:' // For integration tests, use in-memory database
		: path.join(__dirname, '../../../', 'database.db'); // Normal database file
const db = new Database(DB_LOCATION);

// Enable WAL (Write-Ahead Logging) mode for better concurrency and crash safety.
// Writers no longer block readers, and the main database file is never modified mid-write.
db.pragma('journal_mode = WAL');
// With WAL, NORMAL synchronous is safe and faster than the default FULL.
// WAL provides its own durability guarantees that make FULL redundant.
db.pragma('synchronous = NORMAL');
// No `foreign_keys` pragma is needed: better-sqlite3 compiles SQLite with
// SQLITE_DEFAULT_FOREIGN_KEYS=1, so enforcement is already ON for every connection.

// State ---------------------------------------------------------------------------------------------------

/** Prepared statements cache */
const stmtCache: Record<string, Database.Statement> = {};

// Query Calls ---------------------------------------------------------------------------------------------

// Utility function to retrieve or prepare statements
function prepareStatement(query: string): Database.Statement {
	if (!stmtCache[query]) stmtCache[query] = db.prepare(query);
	return stmtCache[query];
}

/**
 * Executes a given SQL query with optional parameters and returns the result.
 * @param query - The SQL query to be executed.
 * @param [params=[]] - An array of parameters to bind to the query.
 * @returns - The result of the query execution.
 * @throws If a database error occurs.
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
 * @throws If a database error occurs.
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
 * @throws If a database error occurs.
 */
function all<T>(query: string, params: SupportedColumnTypes[] = []): T[] {
	const stmt = prepareStatement(query);
	return stmt.all(...params) as T[];
}

// Validation & Dynamic Updates ----------------------------------------------------------------------------

/**
 * Validates a column-selection argument of a read query: it must be a non-empty array
 * of strings that are all columns of the named table. Throws on the first problem.
 */
function assertColumnsValid(
	columns: unknown,
	allowedColumns: readonly string[],
	tableName: string,
): void {
	if (!Array.isArray(columns))
		throw new Error(`When getting ${tableName} data, columns must be an array of strings! Received: ${jsonutil.ensureJSONString(columns)}`); // prettier-ignore
	if (columns.length === 0 || !columns.every((column) => typeof column === 'string' && allowedColumns.includes(column)))
		throw new Error(`Invalid columns requested from ${tableName} table: ${jsonutil.ensureJSONString(columns)}`); // prettier-ignore
}

/**
 * Runs a dynamic UPDATE of exactly the provided columns against the row(s) matching `whereClause`.
 * Validates that `updates` is non-empty and every column belongs to the table, minus any
 * excluded (primary keys are never updatable). Normalizes undefined values to null.
 * @returns The run result, for callers that verify a row was actually changed.
 */
function runRowUpdate(params: {
	tableName: string;
	allowedColumns: readonly string[];
	excludedColumns?: readonly string[];
	updates: Record<string, SupportedColumnTypes>;
	errorContext: string;
	whereClause: string;
	whereValues: SupportedColumnTypes[];
}): Database.RunResult {
	const entries = Object.entries(params.updates);
	if (entries.length === 0)
		throw new Error(`Empty updates provided when ${params.errorContext}! Received: ${jsonutil.ensureJSONString(params.updates)}`); // prettier-ignore
	const excluded = params.excludedColumns ?? [];
	if (!entries.every(([column]) => !excluded.includes(column) && params.allowedColumns.includes(column)))
		throw new Error(`Invalid columns provided when ${params.errorContext}! Received: ${jsonutil.ensureJSONString(params.updates)}`); // prettier-ignore

	const setClauses = entries.map(([column]) => `${column} = ?`).join(', ');
	const values = entries.map(([, value]) => value ?? null);
	return run(`UPDATE ${params.tableName} SET ${setClauses} WHERE ${params.whereClause}`, [
		...values,
		...params.whereValues,
	]);
}

// Schema Introspection ------------------------------------------------------------------------------------

/**
 * Checks if a column exists in a table.
 * @throws If a database error occurs.
 */
function columnExists(tableName: string, columnName: string): boolean {
	try {
		// PRAGMA queries are special and should not use the statement cache.
		// We access the raw db instance's prepare method directly.
		const result = db
			.prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`)
			.get(tableName, columnName);
		return !!result;
	} catch (error) {
		console.error(`Error checking if column ${columnName} exists in ${tableName}:`, error);
		throw error; // Rethrow
	}
}

/**
 * Returns whether an existing column is nullable (i.e. NOT declared `NOT NULL`).
 * Returns false if the column does not exist.
 * @throws If a database error occurs.
 */
function columnIsNullable(tableName: string, columnName: string): boolean {
	try {
		// PRAGMA queries are special and should not use the statement cache.
		// We access the raw db instance's prepare method directly.
		const row = db
			.prepare(`SELECT * FROM pragma_table_info(?) WHERE name = ?`)
			.get(tableName, columnName) as { notnull: number } | undefined;
		return row !== undefined && row.notnull === 0;
	} catch (error) {
		console.error(`Error checking if column ${columnName} is nullable in ${tableName}:`, error);
		throw error; // Rethrow
	}
}

// Transactions --------------------------------------------------------------------------------------------

/**
 * Creates a transaction function that wraps the given callback in a database transaction.
 * The callback will be executed atomically - either all operations succeed or all are rolled back.
 *
 * @template Args - The argument types for the transaction function
 * @template Return - The return type of the transaction function
 * @param callback - The function to execute within the transaction context
 * @returns A transaction function that executes the callback atomically
 *
 * @example
 * ```typescript
 * const transferFunds = transaction((fromId: number, toId: number, amount: number) => {
 *   run('UPDATE accounts SET balance = balance - ? WHERE id = ?', [amount, fromId]);
 *   run('UPDATE accounts SET balance = balance + ? WHERE id = ?', [amount, toId]);
 * });
 *
 * // Execute the transaction
 * transferFunds(1, 2, 100);
 * ```
 */
function transaction<Args extends unknown[], Return>(
	callback: (...args: Args) => Return,
): (...args: Args) => Return {
	return db.transaction(callback);
}

// Error Handling & Maintenance ----------------------------------------------------------------------------

/**
 * Wraps a db call in a try/catch: on error, logs the description + full stack to errLog, then rethrows.
 * @param fn - The db call to execute.
 * @param description - Human-readable label for the operation. Goes into errLog if it fails. Exclude ending punctation.
 * @throws Re-throws the error after logging, if a database error occurs.
 */
function call<T>(fn: () => T, description: string): T {
	try {
		return fn();
	} catch (error: unknown) {
		const detail = jsutil.getErrorStack(error);
		logEvents.addAndPrint(`${description}: ${detail}`, 'errLog');
		throw error;
	}
}

/**
 * Creates a consistent point-in-time backup of the database to the given file path
 * using SQLite's Online Backup API. Safe to call while the database is open and being written to.
 * @param destPath - Absolute path for the destination backup file.
 * @throws If a database error occurs.
 */
async function backup(destPath: string): Promise<void> {
	await db.backup(destPath);
}

/**
 * Closes the database connection.
 * @throws If a database error occurs.
 */
function close(): void {
	db.close();
}

// Exports -------------------------------------------------------------------------------------------------

export default {
	// Query Calls
	run,
	get,
	all,
	call,
	// Validation & Dynamic Updates
	assertColumnsValid,
	runRowUpdate,
	// Schema Introspection
	columnExists,
	columnIsNullable,
	// Transactions
	transaction,
	// Error Handling & Maintenance
	backup,
	close,
};
