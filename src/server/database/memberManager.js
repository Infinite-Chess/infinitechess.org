
/**
 * This script handles almost all of the queries we use to interact with the members table!
 */

import { logEvents } from '../middleware/logEvents.js';
import { ensureJSONString } from '../utility/JSONUtils.js';
import db from './database.js';
import { allMemberColumns, uniqueMemberKeys, user_id_upper_cap } from './databaseTables.js';
import { addDeletedMemberToDeletedMembersTable } from './deletedMemberManager.js';


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
];



// Create / Delete Member methods ---------------------------------------------------------------------------------------


/**
 * Adds a new user to the members table.
 * @param {string} username - The user's username.
 * @param {string} email - The user's email.
 * @param {string} hashed_password - The hashed password for the user.
 * @param {object} [options] - Optional parameters for the user.
 * @param {string} [options.roles] - The user's roles (e.g., 'owner', 'admin').
 * @param {string} [options.verification] - The verification string (optional).
 * @param {string} [options.preferences] - The user's preferences (optional).
 * @returns {object} - The result of the database operation or an error message: { success (boolean), result: { lastInsertRowid } }
 */
function addUser(username, email, hashed_password, { roles, verification, preferences } = {}) {
	// The table looks like:

	// CREATE TABLE IF NOT EXISTS members (
	// 	user_id INTEGER PRIMARY KEY,               
	// 	username TEXT UNIQUE NOT NULL COLLATE NOCASE,
	// 	email TEXT UNIQUE NOT NULL,                
	// 	hashed_password TEXT NOT NULL,             
	// 	roles TEXT,        
	// 	joined TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	// 	last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,                         
	// 	login_count INTEGER NOT NULL DEFAULT 0,                        
	// 	preferences TEXT,
	// 	refresh_tokens TEXT,                          
	// 	verification TEXT, 
	// 	username_history TEXT,
	//  checkmates_beaten TEXT NOT NULL DEFAULT ''
	// );

	if (roles !== undefined && typeof roles !== 'string') throw new Error('Roles must be a string.');
	if (verification !== undefined && typeof verification !== 'string') throw new Error('Verification must be a string.');
	if (preferences !== undefined && typeof preferences !== 'string') throw new Error('Preferences must be a string.');

	// Generate a unique user ID
	const user_id = genUniqueUserID();

	// SQL query to insert a new user into the 'members' table
	const query = `
    INSERT INTO members (
    user_id,
    username,
    email,
    hashed_password,
    roles,
    verification,
    preferences
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
	`;
	
	try {
		// Execute the query with the provided values
		const result = db.run(query, [user_id, username, email, hashed_password, roles, verification, preferences]); // { changes: 1, lastInsertRowid: 7656846 }
		
		// Return success result
		return { success: true, result };

	} catch (error) {
		// Log the error for debugging purposes
		logEvents(`Error adding user "${username}": ${error.message}`, 'errLog.txt', { print: true });
		
		// Return an error message
		return { success: false };
	}
}
// addUser('na3v534', 'tes3t5em3a4il3', 'password');

/**
 * Deletes a user from the members table.
 * @param {number} user_id - The ID of the user to delete.
 * @param {string} reason_deleted - The reason the user is being deleted.
 * @param {Object} [options] - Optional settings for the function.
 * @param {boolean} [options.skipErrorLogging] - If true, errors will not be logged when no match is found.
 * @returns {object} A result object: { success (boolean), reason (string, if failed) }
 */
function deleteUser(user_id, reason_deleted, { skipErrorLogging } = {}) {
	if (!validDeleteReasons.includes(reason_deleted)) {
		const reason = `Cannot delete user of ID "${user_id}". Reason "${reason_deleted}" is invalid.`;
		if (!skipErrorLogging) logEvents(reason, 'errLog.txt', { print: true });
		return { success: false, reason };
	}

	// SQL query to delete a user by their user_id
	const query = 'DELETE FROM members WHERE user_id = ?';

	try {
		// Execute the delete query
		const result = db.run(query, [user_id]); // { changes: 1 }

		// Check if any rows were deleted
		if (result.changes === 0) {
			const reason = `Cannot delete user of ID "${user_id}", they were not found.`;
			if (!skipErrorLogging) logEvents(reason, 'errLog.txt', { print: true });
			return { success: false, reason };
		}

		// Add their user_id to the deleted members table
		addDeletedMemberToDeletedMembersTable(user_id, reason_deleted);

		return { success: true }; // Change made successfully

	} catch (error) {
		// Log the error for debugging purposes
		logEvents(`Error deleting user with ID "${user_id}": ${error.stack}`, 'errLog.txt', { print: true });
		return { success: false, reason: `Failed to delete user of ID "${user_id}", an internal error ocurred.`};
	}
}
// console.log(deleteUser(3408674));

/**
 * Generates a **UNIQUE** user_id.
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
		logEvents(`Error fetching all users: ${error.message}`, 'errLog.txt', { print: true });
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
		logEvents(`Error getting row of member "${username}": ${error.message}`, 'errLog.txt', { print: true });
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
 * @returns {Object} - An object containing the requested columns, or an empty object if no match is found.
 */
function getMemberDataByCriteria(columns, searchKey, searchValue, { skipErrorLogging } = {}) {

	// Guard clauses... Validating the arguments...

	if (!Array.isArray(columns)) {
		logEvents(`When getting member data by criteria, columns must be an array of strings! Received: ${ensureJSONString(columns)}`, 'errLog.txt', { print: true });
		return {};
	}
	if (!columns.every(column => typeof column === 'string' && allMemberColumns.includes(column))) {
		logEvents(`Invalid columns requested from members table: ${ensureJSONString(columns)}`, 'errLog.txt', { print: true });
		return {};
	}

	// Check if the searchKey and searchValue are valid
	if (typeof searchKey !== 'string' || typeof searchValue !== 'string' && typeof searchValue !== 'number') {
		logEvents(`When getting member data by criteria, searchKey must be a string and searchValue must be a number or string! Received: ${ensureJSONString(searchKey)}, ${ensureJSONString(searchValue)}`, 'errLog.txt', { print: true });
		return {};
	}
	if (!uniqueMemberKeys.includes(searchKey)) {
		logEvents(`Invalid search key for members table "${searchKey}". Must be one of: ${uniqueMemberKeys.join(', ')}`, 'errLog.txt', { print: true });
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
			if (!skipErrorLogging) logEvents(`No matches found for ${searchKey} = ${searchValue}`, 'errLog.txt', { print: true });
			return {};
		}

		// Return the fetched row (single object)
		return row;
	} catch (error) {
		// Log the error and return an empty object
		logEvents(`Error executing query: ${error.message}`, 'errLog.txt', { print: true });
		return {};
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
		logEvents(`Invalid or empty columns and values provided for user ID "${userId}" when updating member columns!`, 'errLog.txt', { print: true });
		return false;
	}

	for (const column in columnsAndValues) {
		// Validate all provided columns
		if (!allMemberColumns.includes(column)) {
			logEvents(`Invalid column "${column}" provided for user ID "${userId}" when updating member columns!`, 'errLog.txt', { print: true });
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
			logEvents(`No changes made when updating columns ${JSON.stringify(columnsAndValues)} for member with id "${userId}"!`, 'errLog.txt', { print: true });
			return false;
		}
	} catch (error) {
		// Log the error for debugging purposes
		logEvents(`Error updating columns ${JSON.stringify(columnsAndValues)} for user ID "${userId}": ${error.message}`, 'errLog.txt', { print: true });

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
		if (result.changes === 0) logEvents(`No changes made when updating login_count and last_seen for member of id "${userId}"!`, 'errLog.txt', { print: true });

	} catch (error) {
		// Log the error for debugging purposes
		logEvents(`Error updating login_count and last_seen for member of id "${userId}": ${error.message}`, 'errLog.txt', { print: true });
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
		if (result.changes === 0) logEvents(`No changes made when updating last_seen for member of id "${userId}"!`, 'errLog.txt', { print: true });
	} catch (error) {
		// Log the error for debugging purposes
		logEvents(`Error updating last_seen for member of id "${userId}": ${error.message}`, 'errLog.txt', { print: true });
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
 * Checks if a given user_id exists in the members table.
 * @param {number} userId - The user ID to check.
 * @param {Object} [options] - Optional parameters for the function.
 * @param {boolean} [options.ignoreDeleted] - If true, skips checking the deleted_members table.
 * @returns {boolean} - Returns true if the user ID exists, false otherwise.
 */
function isUserIdTaken(userId, { ignoreDeleted } = {}) {
	let query = 'SELECT 1 FROM members WHERE user_id = ?';
	try {
		// Execute query to check if the user_id exists in the members table
		let row = db.get(query, [userId]); // { '1': 1 }

		// If a row is found, the user_id exists
		if (row !== undefined) return true;
		if (ignoreDeleted) return false;

		// Check if the user_id is in the deleted_members table
		query = 'SELECT 1 FROM deleted_members WHERE user_id = ?';
		row = db.get(query, [userId]); // { '1': 1 }

		// Return true if found in deleted_members, false otherwise
		return row !== undefined;

	} catch (error) {
		// Log the error if the query fails
		logEvents(`Error checking if user ID "${userId}" is taken: ${error.message}`, 'errLog.txt', { print: true });
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
		logEvents(`Error checking if username "${username}" is taken: ${error.message}`, 'errLog.txt', { print: true });

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
		logEvents(`Error checking if email "${email}" exists: ${error.message}`, 'errLog.txt', { print: true });
		return false;  // Return false if there's an error
	}
}



export {
	addUser,
	deleteUser,
	getMemberDataByCriteria,
	updateMemberColumns,
	updateLoginCountAndLastSeen,
	updateLastSeen,
	doesMemberOfIDExist,
	getUserIdByUsername,
	doesMemberOfUsernameExist,
	isUsernameTaken,
	isEmailTaken,
	genUniqueUserID
};
