
// src/server/database/memberManager.js

/**
 * This script handles almost all of the queries we use to interact with the members table!
 */

import jsutil from '../../shared/util/jsutil.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import db from './database.js';
import { allMemberColumns, uniqueMemberKeys, user_id_upper_cap } from './databaseTables.js';

/** @typedef {import('../controllers/sendMail.js').MemberRecord} MemberRecord */


// Variables ----------------------------------------------------------


/**
 * A list of all valid reasons to delete an account.
 * These reasons are stored in the deleted_members table in the database.
 * @type {string[]}
 */
const validDeleteReasons = [
	'unverified', // They failed to verify after 3 days
	'user request', // They deleted their own account, or requested it to be deleted.
	'security', // A choice by server admins, for security purpose.
	'rating abuse', // Unfairly boosted their own elo with a throwaway account
];



// Create / Delete Member methods ---------------------------------------------------------------------------------------


/**
 * Creates a new account. This is the single, authoritative function for user creation.
 * It atomically inserts records into both the `members` and `player_stats` tables
 * within a single database transaction, ensuring data integrity.
 * @param {string} username The user's username.
 * @param {string} email The user's email.
 * @param {string} hashedPassword The user's hashed password.
 * @param {0 | 1} is_verified The verification status.
 * @param {string | null} verification_code The unique code for verification, if they are not yet verified.
 * @param {0 | 1} is_verification_notified The verified notification status.
 * @returns {{success: true, user_id: number} | {success: false, reason: string}}
 */
function addUser(username, email, hashedPassword, is_verified, verification_code, is_verification_notified) {
	const createAccountTransaction = db.db.transaction((userData) => {
		// Step 1: Generate a unique user ID.
		const userId = genUniqueUserID();

		// Step 2: Insert into the members table.
		const membersQuery = `
			INSERT INTO members (
				user_id, username, email, hashed_password, 
				is_verified, verification_code, is_verification_notified
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`;
		const params = [
			userId,
			userData.username,
			userData.email,
			userData.hashedPassword,
			userData.is_verified,
			userData.verification_code,
			userData.is_verification_notified
		];
		db.run(membersQuery, params);

		// Step 3: Insert into the 'player_stats' table.
		const statsQuery = `INSERT INTO player_stats (user_id) VALUES (?)`;
		db.run(statsQuery, [userId]);
		
		// If both inserts succeed, the transaction will commit and return the new user_id.
		return userId;
	});

	try {
		const newUserId = createAccountTransaction({ username, email, hashedPassword, is_verified, verification_code, is_verification_notified });
		return { success: true, user_id: newUserId };
	} catch (error) {
		const errMessage = error.message || String(error);
		logEventsAndPrint(`Account creation transaction for "${username}" failed and was rolled back: ${errMessage}`, 'errLog.txt');
		let reason = 'An unexpected error occurred during account creation.';
		if (error.code?.includes('SQLITE_CONSTRAINT')) reason = 'This username or email has just been taken.';
		return { success: false, reason };
	}
}
// setTimeout(() => { console.log(addUser('na3v534', 'tes3t5em3a4il3', 'password', null)); }, 1000); // Set timeout needed so user_id_upper_cap is initialized before this function is called.

/**
 * Deletes a user from the members table and adds them to the deleted_members table.
 * @param {number} user_id - The ID of the user to delete.
 * @param {string} reason_deleted - The reason the user is being deleted.
 * @param {Object} [options] - Optional settings for the function.
 * @param {boolean} [options.skipErrorLogging] - If true, errors will not be logged when no match is found.
 * @returns {object} A result object: { success (boolean), reason (string, if failed) }
 */
function deleteUser(user_id, reason_deleted, { skipErrorLogging } = {}) {
	if (!validDeleteReasons.includes(reason_deleted)) {
		const reason = `Cannot delete user of ID "${user_id}". Delete reason "${reason_deleted}" is invalid.`;
		if (!skipErrorLogging) logEventsAndPrint(reason, 'errLog.txt');
		return { success: false, reason };
	}

	// Create a transaction function. better-sqlite3 will wrap the execution
	// of this function in BEGIN/COMMIT/ROLLBACK statements.
	const deleteTransaction = db.db.transaction((id, reason) => {
		// Step 1: Delete the user from the main 'members' table
		const deleteQuery = 'DELETE FROM members WHERE user_id = ?';
		const deleteResult = db.run(deleteQuery, [id]);

		// If no user was deleted, they didn't exist. Throw an error to
		// abort the transaction and prevent any further action.
		if (deleteResult.changes === 0) {
			throw new Error('USER_NOT_FOUND');
		}

		// Step 2: Add their user_id to the 'deleted_members' table
		// If this fails (e.g., UNIQUE constraint), it will also throw an error
		// and cause the entire transaction (including the DELETE) to roll back.
		const insertQuery = 'INSERT INTO deleted_members (user_id, reason_deleted) VALUES (?, ?)';
		db.run(insertQuery, [id, reason]);
	});

	try {
		// Execute the transaction
		deleteTransaction(user_id, reason_deleted);
		return { success: true }; // Transaction was successful (committed)

	} catch (error) {
		// The transaction was rolled back due to an error inside it.
		
		// Handle our custom "user not found" error
		if (error.message === 'USER_NOT_FOUND') {
			const reason = `Cannot delete user of ID "${user_id}", they were not found.`;
			if (!skipErrorLogging) logEventsAndPrint(reason, 'errLog.txt');
			return { success: false, reason };
		}
		
		// Handle any other unexpected database errors (like UNIQUE constraint)
		let reason = `Failed to delete user of ID "${user_id}", an internal error occurred.`;
		if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
			reason = `Failed to delete user of ID "${user_id}" because they already exist in the deleted_members tables. But the user was not deleted from the members table.`;
		}

		logEventsAndPrint(`User deletion transaction for ID "${user_id}" failed and was rolled back: ${error.stack}`, 'errLog.txt');
		return { success: false, reason };
	}
}
// console.log(deleteUser(3887110, 'security'));

/**
 * Generates a **UNIQUE** user_id by testing if it's taken already.
 * @returns {number} A unique user_id.
 */
function genUniqueUserID() {
	let id;
	do {
		id = generateRandomUserId();
	} while (isUserIdTaken(id));
	return id;
}

/**
 * Generates a random user_id. DOES NOT test if it's taken already.
 * @returns {number} A random user_id.
 */
function generateRandomUserId() {
	// Generate a random number between 0 and user_id_upper_cap
	return Math.floor(Math.random() * user_id_upper_cap);
}



// General SELECT/UPDATE methods ---------------------------------------------------------------------------------------



/**
 * Fetches all users from the members table.
 * @returns {Object[]} - An array of user objects. Each object represents a user 
 * and contains all columns from the 'members' table. If there are no users, it returns an empty array.
 */
function getAllUsers() {
	try {
		// Execute the query to get all users
		return db.all('SELECT * FROM members');
	} catch (error) {
		// Log the error if the query fails
		logEventsAndPrint(`Error fetching all users: ${error.message}`, 'errLog.txt');
		// Return an empty array in case of error
		return [];
	}
}
// console.log(getAllUsers());

/**
 * Fetches a single user from the 'members' table based on their username.
 * @param {string} username - The username of the member to retrieve.
 * @returns {Object | undefined} - An object representing the user, containing all columns 
 * from the 'members' table. Returns `undefined` if an error occurs or if the user is not found.
 */
function getMemberRowByUsername(username) {
	// SQL query to check if a username exists in the 'members' table
	const query = 'SELECT * FROM members WHERE username = ?';

	try {
		// Execute the query with the username parameter
		const row = db.get(query, [username]);
		return row;
	} catch (error) {
		// Log the error for debugging purposes
		logEventsAndPrint(`Error getting row of member "${username}": ${error.message}`, 'errLog.txt');
		return;
	}
}
// console.log("User:");
// console.log(getMemberRowByUsername("User"));

/**
 * Fetches specified columns of a single member from the database based on user_id, username, or email.
 * @param {string[]} columns - The columns to retrieve (e.g., ['user_id', 'username', 'email']).
 * @param {string} searchKey - The search key to use. Must be either 'user_id', 'username', or 'email'.
 * @param {string | number} searchValue - The value to search for, can be a user ID, username, or email.
 * @param {Object} [options] - Optional settings for the function.
 * @param {boolean} [options.skipErrorLogging] - If true, errors will not be logged when no match is found.
 * @returns {MemberRecord} - An object containing the requested columns, or an empty object if no match is found.
 */
function getMemberDataByCriteria(columns, searchKey, searchValue, { skipErrorLogging } = {}) {

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
		const row = db.get(query, [searchValue]);

		// If no row is found, return an empty object
		if (!row) {
			if (!skipErrorLogging) logEventsAndPrint(`No matches found for ${searchKey} = ${searchValue}`, 'errLog.txt');
			return {};
		}

		// Return the fetched row (single object)
		return row;
	} catch (error) {
		// Log the error and return an empty object
		logEventsAndPrint(`Error executing query: ${error.message}`, 'errLog.txt');
		return {};
	}
}

/**
 * Fetches specified columns of multiple members from the database based on a list of user_ids, usernames, or emails.
 * @param {string[]} columns - The columns to retrieve (e.g., ['user_id', 'username', 'roles']).
 * @param {string} searchKey - The search key to use. Must be either 'user_id', 'username', or 'email'.
 * @param {string[] | number[]} searchValueList - The value to search for, can be a list of user IDs, usernames, or emails.
 * @param {Object} [options] - Optional settings for the function.
 * @param {boolean} [options.skipErrorLogging] - If true, errors will not be logged when no match is found.
 * @returns {MemberRecord[]} - An object containing a list of MemberRecords, or an empty list if no matches are found.
 */
function getMultipleMemberDataByCriteria(columns, searchKey, searchValueList, { skipErrorLogging } = {}) {

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
		const rows = db.all(query, searchValueList);

		// If no row is found, return an empty object
		if (!rows || rows.length === 0) {
			if (!skipErrorLogging) logEventsAndPrint(`No matches found for ${searchKey} in ${jsutil.ensureJSONString(searchValueList)}`, 'errLog.txt');
			return [];
		}

		// Return the fetched rows
		return rows;
	} catch (error) {
		// Log the error and return an empty list
		logEventsAndPrint(`Error executing query: ${error.message}`, 'errLog.txt');
		return [];
	}
}

/**
 * Updates multiple column values in the members table for a given user.
 * @param {number} userId - The user ID of the member.
 * @param {object} columnsAndValues - An object containing column-value pairs to update.
 * @returns {boolean} - Returns true if the update was successful, false if no changes were made or validation failed.
 */
function updateMemberColumns(userId, columnsAndValues) {
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
	} catch (error) {
		// Log the error for debugging purposes
		logEventsAndPrint(`Error updating columns ${JSON.stringify(columnsAndValues)} for user ID "${userId}": ${error.message}`, 'errLog.txt');

		// Return false indicating failure
		return false;
	}
}




// Login Count & Last Seen ---------------------------------------------------------------------------------------



/**
 * Increments the login count and updates the last_seen column for a member based on their user ID.
 * @param {number} userId - The user ID of the member.
 */
function updateLoginCountAndLastSeen(userId) {
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

	} catch (error) {
		// Log the error for debugging purposes
		logEventsAndPrint(`Error updating login_count and last_seen for member of id "${userId}": ${error.message}`, 'errLog.txt');
	}
}

/**
 * Updates the last_seen column for a member based on their user ID.
 * @param {number} userId - The user ID of the member.
 */
function updateLastSeen(userId) {
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
	} catch (error) {
		// Log the error for debugging purposes
		logEventsAndPrint(`Error updating last_seen for member of id "${userId}": ${error.message}`, 'errLog.txt');
	}
}



// Utility -----------------------------------------------------------------------------------



/**
 * Checks if a member of a given id exists in the members table.
 * @param {number} userId - The user ID to check.
 * @returns {boolean} - Returns true if the member exists, false otherwise.
 */
function doesMemberOfIDExist(userId) {
	return isUserIdTaken(userId, { ignoreDeleted: true });
}

/**
 * Checks if a given user_id exists in the members table OR deleted_members table.
 * @param {number} userId - The user ID to check.
 * @param {Object} [options] - Optional parameters for the function.
 * @param {boolean} [options.ignoreDeleted] - If true, skips checking the deleted_members table.
 * @returns {boolean} - Returns true if the user ID exists, false otherwise.
 */
function isUserIdTaken(userId, { ignoreDeleted } = {}) {
	try {
		const query = ignoreDeleted ? 'SELECT EXISTS(SELECT 1 FROM members WHERE user_id = ?) AS found'
			: `
				SELECT
					EXISTS(SELECT 1 FROM members WHERE user_id = ?)
					OR
					EXISTS(SELECT 1 FROM deleted_members WHERE user_id = ?)
				AS found
			`;
		const params = ignoreDeleted ? [userId] : [userId, userId];

		// Execute query to check if the user_id exists in the members table
		const row = db.get(query, params); // { found: 0 | 1 }

		// row.found will be 0 or 1
		return Boolean(row?.found);

	} catch (error) {
		// Log the error if the query fails
		logEventsAndPrint(`Error checking if user ID "${userId}" is taken: ${error.message}`, 'errLog.txt');
		return false; // Return false if an error occurs
	}
}
// console.log("taken? " + isUserIdTaken(14443702));

/**
 * Fetches a member's user ID based on their username.
 * @param {string} username - The username to search for.
 * @returns {number | undefined} - The user ID if found, or undefined if no match is found.
 */
function getUserIdByUsername(username) {
	// Use the getMemberDataByCriteria function to fetch the user ID
	const { user_id } = getMemberDataByCriteria(['user_id'], 'username', username); // { user_id } || {}
	return user_id;
}


/**
 * Checks if a member of a given username exists in the members table.
 * @param {number} username - The username check.
 * @returns {boolean} - Returns true if the member exists, false otherwise.
 */
function doesMemberOfUsernameExist(username) {
	return isUsernameTaken(username);
}

/**
 * Checks if a given username exists in the members table (case-insensitive,
 * a username is taken even if it has the same spelling but different capitalization).
 * @param {string} username - The username to check.
 * @returns {boolean} - Returns true if the username exists, false otherwise.
 */
function isUsernameTaken(username) {
	// SQL query to check if a username exists in the 'members' table
	const query = 'SELECT 1 FROM members WHERE username = ?';

	try {
		// Execute the query with the username parameter
		const row = db.get(query, [username]); // { '1': 1 }

		// If a row is found, the username exists
		return row !== undefined;
	} catch (error) {
		// Log the error for debugging purposes
		logEventsAndPrint(`Error checking if username "${username}" is taken: ${error.message}`, 'errLog.txt');

		// Return false if there's an error (indicating the username is not found)
		return false;
	}
}



/**
 * Checks if a given email exists in the members table.
 * @param {string} email - The email to check, in LOWERCASE.
 * @returns {boolean} - Returns true if the email exists, false otherwise.
 */
function isEmailTaken(email) {
	// SQL query to check if an email exists in the 'members' table
	const query = 'SELECT 1 FROM members WHERE email = ?';

	try {
		// Execute the query with the email parameter
		const row = db.get(query, [email]); // { '1': 1 }

		// If a row is found, the email exists
		return row !== undefined;
	} catch (error) {
		// Log error if the query fails
		logEventsAndPrint(`Error checking if email "${email}" exists: ${error.message}`, 'errLog.txt');
		return false;  // Return false if there's an error
	}
}



export {
	addUser,
	deleteUser,
	getMemberDataByCriteria,
	getMultipleMemberDataByCriteria,
	updateMemberColumns,
	updateLoginCountAndLastSeen,
	updateLastSeen,
	doesMemberOfIDExist,
	getUserIdByUsername,
	doesMemberOfUsernameExist,
	isUserIdTaken,
	isUsernameTaken,
	isEmailTaken,
	genUniqueUserID
};
