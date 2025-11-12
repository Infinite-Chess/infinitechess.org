
// src/server/database/memberManager.ts

/**
 * This script handles almost all of the queries we use to interact with the members table!
 */

import jsutil from '../../shared/util/jsutil.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import db from './database.js';
import { allMemberColumns, uniqueMemberKeys, user_id_upper_cap } from './databaseTables.js';
import { SqliteError } from 'better-sqlite3';


// Type Definitions ----------------------------------------------------------


/** Structure of a member record. */
export interface MemberRecord {
	user_id?: number;
	username?: string;
	email?: string;
	hashed_password?: string;
	roles?: string | null;
	joined?: string;
	last_seen?: string;
	login_count?: number;
	is_verified?: 0 | 1;
	verification_code?: string | null;
	is_verification_notified?: 0 | 1;
	preferences?: string | null;
	username_history?: string | null;
	checkmates_beaten?: string;
	last_read_news_date?: string | null;
}


// Constants ----------------------------------------------------------


/** SQLite constraint error code constant */
const SQLITE_CONSTRAINT_ERROR = 'SQLITE_CONSTRAINT';

/** Custom error message for user not found during deletion */
const USER_NOT_FOUND_ERROR = 'USER_NOT_FOUND';


// Create / Delete Member methods ---------------------------------------------------------------------------------------


/**
 * Creates a new account. This is the single, authoritative function for user creation.
 * It atomically inserts records into both the `members` and `player_stats` tables
 * within a single database transaction, ensuring data integrity.
 * @param username The user's username.
 * @param email The user's email.
 * @param hashedPassword The user's hashed password.
 * @param is_verified The verification status.
 * @param verification_code The unique code for verification, if they are not yet verified.
 * @param is_verification_notified The verified notification status.
 * @returns The user_id of the newly created user.
 * 
 * @throws If the insertion fails (e.g., due to constraint violation or other unexpected error).
 */
function addUser(username: string, email: string, hashedPassword: string, is_verified: 0 | 1, verification_code: string | null, is_verification_notified: 0 | 1): number {
	const createAccountTransaction = db.transaction<[{ username: string; email: string; hashedPassword: string; is_verified: 0 | 1; verification_code: string | null; is_verification_notified: 0 | 1 }], number>((userData) => {
		// Step 1: Generate a unique user ID.
		const userId = genUniqueUserID();

		// Step 2: Set initial last_read_news_date to current date so new users don't see all news as unread
		const currentDate = new Date().toISOString().split('T')[0]!; // 'YYYY-MM-DDThh:mm:ss.sssZ' -> 'YYYY-MM-DD'

		// Step 3: Insert into the members table.
		const membersQuery = `
			INSERT INTO members (
				user_id, username, email, hashed_password, 
				is_verified, verification_code, is_verification_notified,
				last_read_news_date
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`;
		const params = [
			userId,
			userData.username,
			userData.email,
			userData.hashedPassword,
			userData.is_verified,
			userData.verification_code,
			userData.is_verification_notified,
			currentDate
		];
		db.run(membersQuery, params);

		// Step 4: Insert into the 'player_stats' table.
		const statsQuery = `INSERT INTO player_stats (user_id) VALUES (?)`;
		db.run(statsQuery, [userId]);
		
		// If both inserts succeed, the transaction will commit and return the new user_id.
		return userId;
	});

	try {
		return createAccountTransaction({ username, email, hashedPassword, is_verified, verification_code, is_verification_notified });
	} catch (error: unknown) {
		const detailedError = error instanceof SqliteError ? error.message : String(error);
		logEventsAndPrint(`Account creation transaction for "${username}" failed and was rolled back: ${detailedError}`, 'errLog.txt');
		
		let genericError: string = 'A database error occurred.'; // Generic error message to avoid leaking details
		if (error instanceof SqliteError && error.code === SQLITE_CONSTRAINT_ERROR) genericError = SQLITE_CONSTRAINT_ERROR;
		throw Error(genericError); // Rethrow with the generic error message, or specific constraint error
	}
}
// setTimeout(() => { console.log(addUser('na3v534', 'tes3t5em3a4il3', 'password', null)); }, 1000); // Set timeout needed so user_id_upper_cap is initialized before this function is called.

/**
 * Deletes a user from the members table and adds them to the deleted_members table.
 * @param user_id - The ID of the user to delete.
 * @param reason_deleted - The reason the user is being deleted.
 * @returns A result object: { success: true } on success, or { success: false, reason: string } on failure.
 * 
 * @throws If a database error occurs during the deletion process.
 */
function deleteUser(user_id: number, reason_deleted: string): void {

	// Create a transaction function. better-sqlite3 will wrap the execution
	// of this function in BEGIN/COMMIT/ROLLBACK statements.
	const deleteTransaction = db.transaction<[number, string], void>((id, reason) => {
		// Step 1: Delete the user from the main 'members' table
		const deleteQuery = 'DELETE FROM members WHERE user_id = ?';
		const deleteResult = db.run(deleteQuery, [id]);

		// If no user was deleted, they didn't exist. Throw an error to
		// abort the transaction and prevent any further action.
		if (deleteResult.changes === 0) throw new Error(USER_NOT_FOUND_ERROR);

		// Step 2: Add their user_id to the 'deleted_members' table
		// If this fails (e.g., UNIQUE constraint), it will also throw an error
		// and cause the entire transaction (including the DELETE) to roll back.
		const insertQuery = 'INSERT INTO deleted_members (user_id, reason_deleted) VALUES (?, ?)';
		db.run(insertQuery, [id, reason]);
	});

	try {
		// Execute the transaction
		deleteTransaction(user_id, reason_deleted);
	} catch (error: unknown) {
		// The transaction was rolled back due to an error inside it.
		const errorMessage = error instanceof Error ? error.message : String(error);

		// Detailed error for logging
		let detailedError = `Delete user transaction for ID (${user_id}) for reason (${reason_deleted}) failed and was rolled back: ${errorMessage}`;
		// Handle any other unexpected database errors (like UNIQUE constraint)
		if (error instanceof SqliteError && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
			detailedError = `Delete user transaction for ID (${user_id}) for reason (${reason_deleted}) failed and was rolled back because they already exist in the deleted_members tables, but the user was not deleted from the members table.`;
		}
		logEventsAndPrint(detailedError, 'errLog.txt');

		// Generic error message for return value
		let genericError = 'A database error occurred.';
		// Handle our custom "user not found" error
		if (error instanceof Error && error.message === USER_NOT_FOUND_ERROR) genericError = USER_NOT_FOUND_ERROR;
		throw Error(genericError); // Rethrow with the generic error message
	}
}
// console.log(deleteUser(3887110, 'security'));



// General SELECT/UPDATE methods ---------------------------------------------------------------------------------------



/**
 * Fetches specified columns of a single member from the database based on user_id, username, or email.
 * @param columns - The columns to retrieve (e.g., ['user_id', 'username', 'email']).
 * @param searchKey - The search key to use. Must be either 'user_id', 'username', or 'email'.
 * @param searchValue - The value to search for, can be a user ID, username, or email.
 * @param skipErrorLogging - If true, errors will not be logged when no match is found.
 * @returns An object containing the requested columns, or an empty object if no match is found.
 */
function getMemberDataByCriteria(columns: string[], searchKey: string, searchValue: string | number, skipErrorLogging: boolean): MemberRecord {

	// Guard clauses... Validating the arguments...

	if (!Array.isArray(columns)) {
		logEventsAndPrint(`When getting member data by criteria, columns must be an array of strings! Received: ${jsutil.ensureJSONString(columns)}`, 'errLog.txt');
		return {};
	}
	if (!columns.every(column => typeof column === 'string' && allMemberColumns.includes(column))) {
		logEventsAndPrint(`Invalid columns requested from members table: ${jsutil.ensureJSONString(columns)}`, 'errLog.txt');
		return {};
	}

	// Check if the searchKey and searchValue are valid
	if (typeof searchKey !== 'string' || typeof searchValue !== 'string' && typeof searchValue !== 'number') {
		logEventsAndPrint(`When getting member data by criteria, searchKey must be a string and searchValue must be a number or string! Received: ${jsutil.ensureJSONString(searchKey)}, ${jsutil.ensureJSONString(searchValue)}`, 'errLog.txt');
		return {};
	}
	if (!uniqueMemberKeys.includes(searchKey)) {
		logEventsAndPrint(`Invalid search key for members table "${searchKey}". Must be one of: ${uniqueMemberKeys.join(', ')}`, 'errLog.txt');
		return {};
	}

	// Arguments are valid, move onto the SQL query...

	// Construct SQL query
	const query = `SELECT ${columns.join(', ')} FROM members WHERE ${searchKey} = ?`;

	try {
		// Execute the query and fetch result
		const row = db.get<MemberRecord>(query, [searchValue]);

		// If no row is found, return an empty object
		if (!row) {
			if (!skipErrorLogging) logEventsAndPrint(`No matches found for ${searchKey} = ${searchValue}`, 'errLog.txt');
			return {};
		}

		// Return the fetched row (single object)
		return row;
	} catch (error: unknown) {
		// Log the error and return an empty object
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error executing query: ${message}`, 'errLog.txt');
		return {};
	}
}

/**
 * Fetches specified columns of multiple members from the database based on a list of user_ids, usernames, or emails.
 * @param columns - The columns to retrieve (e.g., ['user_id', 'username', 'roles']).
 * @param searchKey - The search key to use. Must be either 'user_id', 'username', or 'email'.
 * @param searchValueList - The value to search for, can be a list of user IDs, usernames, or emails.
 * @param skipErrorLogging - If true, errors will not be logged when no match is found.
 * @returns An object containing a list of MemberRecords, or an empty list if no matches are found.
 */
function getMultipleMemberDataByCriteria(columns: string[], searchKey: string, searchValueList: string[] | number[]): MemberRecord[] {

	// Guard clauses... Validating the arguments...

	if (!Array.isArray(columns)) {
		logEventsAndPrint(`When getting multiple member data by criteria, columns must be an array of strings! Received: ${jsutil.ensureJSONString(columns)}`, 'errLog.txt');
		return [];
	}
	if (!columns.every(column => typeof column === 'string' && allMemberColumns.includes(column))) {
		logEventsAndPrint(`Invalid columns requested from members table: ${jsutil.ensureJSONString(columns)}`, 'errLog.txt');
		return [];
	}

	// Check if the searchKey and searchValueList are valid
	if (typeof searchKey !== 'string' || !Array.isArray(searchValueList)) {
		logEventsAndPrint(`When getting multiple member data by criteria, searchKey must be a string and searchValueList must be a list! Received: ${jsutil.ensureJSONString(searchKey)}, ${jsutil.ensureJSONString(searchValueList)}`, 'errLog.txt');
		return [];
	}
	if (!uniqueMemberKeys.includes(searchKey)) {
		logEventsAndPrint(`Invalid search key for members table "${searchKey}". Must be one of: ${uniqueMemberKeys.join(', ')}`, 'errLog.txt');
		return [];
	}

	// Arguments are valid, move onto the SQL query...

	// Construct SQL query
	const placeholders = searchValueList.map(() => '?').join(', ');
	const query = `
		SELECT ${columns.join(', ')}
		FROM members
		WHERE ${searchKey} IN (${placeholders})
	`;

	try {
		// Execute the query and fetch result
		const rows = db.all<MemberRecord>(query, searchValueList);

		// If no row is found, return an empty object
		if (!rows || rows.length === 0) {
			logEventsAndPrint(`No matches found for ${searchKey} in ${jsutil.ensureJSONString(searchValueList)}`, 'errLog.txt');
			return [];
		}

		// Return the fetched rows
		return rows;
	} catch (error: unknown) {
		// Log the error and return an empty list
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error executing query: ${message}`, 'errLog.txt');
		return [];
	}
}

/**
 * Updates multiple column values in the members table for a given user.
 * @param userId - The user ID of the member.
 * @param columnsAndValues - An object containing column-value pairs to update.
 * @returns Returns true if the update was successful, false if no changes were made or validation failed.
 */
function updateMemberColumns(userId: number, columnsAndValues: Record<string, any>): boolean {
	// Ensure columnsAndValues is an object and not empty
	if (typeof columnsAndValues !== 'object' || Object.keys(columnsAndValues).length === 0) {
		logEventsAndPrint(`Invalid or empty columns and values provided for user ID "${userId}" when updating member columns!`, 'errLog.txt');
		return false;
	}

	for (const column in columnsAndValues) {
		// Validate all provided columns
		if (!allMemberColumns.includes(column)) {
			logEventsAndPrint(`Invalid column "${column}" provided for user ID "${userId}" when updating member columns!`, 'errLog.txt');
			return false;
		}
		// Convert objects (e.g., JSON) to strings for storage
		if (typeof columnsAndValues[column] === 'object' && columnsAndValues[column] !== null) {
			columnsAndValues[column] = JSON.stringify(columnsAndValues[column]);
		}
	}

	// Dynamically build the SET part of the query
	const setStatements = Object.keys(columnsAndValues).map(column => `${column} = ?`).join(', ');
	const values = Object.values(columnsAndValues);

	// Add the userId as the last parameter for the WHERE clause
	values.push(userId);

	// Update query to modify multiple columns
	const updateQuery = `UPDATE members SET ${setStatements} WHERE user_id = ?`;

	try {
		// Execute the update query
		const result = db.run(updateQuery, values);

		// Check if the update was successful
		if (result.changes > 0) return true;
		else {
			logEventsAndPrint(`No changes made when updating columns ${JSON.stringify(columnsAndValues)} for member with id "${userId}"!`, 'errLog.txt');
			return false;
		}
	} catch (error: unknown) {
		// Log the error for debugging purposes
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error updating columns ${JSON.stringify(columnsAndValues)} for user ID "${userId}": ${message}`, 'errLog.txt');

		// Return false indicating failure
		return false;
	}
}




// Login Count & Last Seen ---------------------------------------------------------------------------------------



/**
 * Increments the login count and updates the last_seen column for a member based on their user ID.
 * @param userId - The user ID of the member.
 */
function updateLoginCountAndLastSeen(userId: number): void {
	// SQL query to update the login_count and last_seen fields
	const query = `
		UPDATE members
		SET login_count = login_count + 1, last_seen = CURRENT_TIMESTAMP
		WHERE user_id = ?
	`;

	try {
		// Execute the query with the provided userId
		const result = db.run(query, [userId]);

		// Log if no changes were made
		if (result.changes === 0) logEventsAndPrint(`No changes made when updating login_count and last_seen for member of id "${userId}"!`, 'errLog.txt');

	} catch (error: unknown) {
		// Log the error for debugging purposes
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error updating login_count and last_seen for member of id "${userId}": ${message}`, 'errLog.txt');
	}
}

/**
 * Updates the last_seen column for a member based on their user ID.
 * @param userId - The user ID of the member.
 */
function updateLastSeen(userId: number): void {
	// SQL query to update the last_seen field
	const query = `
		UPDATE members
		SET last_seen = CURRENT_TIMESTAMP
		WHERE user_id = ?
	`;

	try {
		// Execute the query with the provided userId
		const result = db.run(query, [userId]);

		// Log if no changes were made
		if (result.changes === 0) logEventsAndPrint(`No changes made when updating last_seen for member of id "${userId}"!`, 'errLog.txt');
	} catch (error: unknown) {
		// Log the error for debugging purposes
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error updating last_seen for member of id "${userId}": ${message}`, 'errLog.txt');
	}
}


// Utility -----------------------------------------------------------------------------------


/**
 * Generates a unique user_id that no other member has ever used.
 * @throws If a database error occurs during uniqueness checks.
 */
function genUniqueUserID(): number {
	let id: number;
	do {
		id = Math.floor(Math.random() * user_id_upper_cap);
	} while (isUserIdTaken(id));
	return id;
}

/**
 * Checks if a member of a given id exists in the members table.
 * IGNORES whether the deleted_members table may contain the user_id.
 * @param user_id - The user ID to check.
 * @returns Returns true if the member exists, false otherwise.
 * 
 * @throws If a database error occurs during the check.
 */
function doesMemberOfIDExist(user_id: number): boolean {
	try {
		const query = 'SELECT EXISTS(SELECT 1 FROM members WHERE user_id = ?) AS found';
		// Execute query to check if the user_id exists in the members table
		const row = db.get<{ found: 0 | 1 }>(query, [user_id]);

		// row.found will be 0 or 1
		return Boolean(row?.found);

	} catch (error: unknown) {
		// Log the error if the query fails
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error checking if member of user_id (${user_id}) exists: ${message}`, 'errLog.txt');
		throw new Error('A database error occurred.'); // Rethrow generic error
	}
}

/**
 * Checks if a given user_id exists in the members table OR deleted_members table.
 * @param userId - The user ID to check.
 * @returns Returns true if the user_id has been used, false otherwise.
 * 
 * @throws If a database error occurs during the check.
 */
function isUserIdTaken(userId: number): boolean {
	try {
		const query = `
			SELECT
				EXISTS(SELECT 1 FROM members WHERE user_id = ?)
				OR
				EXISTS(SELECT 1 FROM deleted_members WHERE user_id = ?)
			AS found
		`;

		// Execute query to check if the user_id exists in the members table
		const row = db.get<{ found: 0 | 1 }>(query, [userId, userId]);

		// row.found will be 0 or 1
		return Boolean(row?.found);

	} catch (error: unknown) {
		// Log the error if the query fails
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error checking if user_id (${userId}) has been used: ${message}`, 'errLog.txt');
		throw new Error('A database error occurred.'); // Rethrow generic error
	}
}
// console.log("taken? " + isUserIdTaken(14443702));


/**
 * Checks if a member of a given username exists in the members table.
 * @param username - The username check.
 * @returns Returns true if the member exists, false otherwise.
 */
function doesMemberOfUsernameExist(username: string): boolean {
	return isUsernameTaken(username);
}

/**
 * Checks if a given username exists in the members table (case-insensitive,
 * a username is taken even if it has the same spelling but different capitalization).
 * @param username - The username to check.
 * @returns Returns true if the username exists, false otherwise.
 */
function isUsernameTaken(username: string): boolean {
	// SQL query to check if a username exists in the 'members' table
	const query = 'SELECT 1 FROM members WHERE username = ?';

	try {
		// Execute the query with the username parameter
		const row = db.get<{ '1': 1 }>(query, [username]);

		// If a row is found, the username exists
		return row !== undefined;
	} catch (error: unknown) {
		// Log the error for debugging purposes
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error checking if username "${username}" is taken: ${message}`, 'errLog.txt');

		// Return false if there's an error (indicating the username is not found)
		return false;
	}
}



/**
 * Checks if a given email exists in the members table.
 * @param email - The email to check, in LOWERCASE.
 * @returns Returns true if the email exists, false otherwise.
 */
function isEmailTaken(email: string): boolean {
	// SQL query to check if an email exists in the 'members' table
	const query = 'SELECT 1 FROM members WHERE email = ?';

	try {
		// Execute the query with the email parameter
		const row = db.get<{ '1': 1 }>(query, [email]);

		// If a row is found, the email exists
		return row !== undefined;
	} catch (error: unknown) {
		// Log error if the query fails
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error checking if email "${email}" exists: ${message}`, 'errLog.txt');
		return false;  // Return false if there's an error
	}
}



export {
	SQLITE_CONSTRAINT_ERROR,

	addUser,
	deleteUser,
	getMemberDataByCriteria,
	getMultipleMemberDataByCriteria,
	updateMemberColumns,
	updateLoginCountAndLastSeen,
	updateLastSeen,
	doesMemberOfIDExist,
	doesMemberOfUsernameExist,
	isUsernameTaken,
	isEmailTaken
};
