
/**
 * This script ads and deletes members from the members table.
 * It does not verify their information.
 */

import uuid from '../../../client/scripts/game/misc/uuid.js';
import { logEvents } from '../../middleware/logEvents.js';
import db from '../database.js';



// Variables -----------------------------------------------------------------------------------


const user_id_upper_cap = 14_776_336; // Limit of unique user id with 4-digit base-62 user ids!


// Functions -----------------------------------------------------------------------------------



/**
 * Adds a new user to the members table.
 * @param {string} username - The user's username.
 * @param {string} email - The user's email.
 * @param {string} hashed_password - The hashed password for the user.
 * @param {object} [options] - Optional parameters for the user.
 * @param {string} [options.roles] - The user's roles (e.g., 'owner', 'admin').
 * @param {string} [options.verification] - The verification string (optional).
 * @param {string} [options.preferences] - The user's preferences (optional).
 * @returns {object} - The result of the database operation or an error message. 
 * The result contains:
 *   - {boolean} success - Whether the operation was successful.
 *   - {string} message - A message describing the outcome.
 *   - {object} result - The result of the database operation if successful.
 */
function addUser(username, email, hashed_password, { roles, verification, preferences } = {}) {
	// The table looks like:
	// CREATE TABLE IF NOT EXISTS members (
	// 	user_id INTEGER PRIMARY KEY,               
	// 	username TEXT UNIQUE NOT NULL COLLATE NOCASE, 
	// 	email TEXT UNIQUE NOT NULL,                
	// 	hashed_password TEXT NOT NULL,             
	// 	roles TEXT,                       
	// 	joined TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	// 	refresh_tokens TEXT,                       
	// 	preferences TEXT,                          
	// 	verification TEXT,                         
	// 	login_count INTEGER DEFAULT 1,             
	// 	last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
		return { success: true, message: `User "${username}" added successfully`, result };

	} catch (error) {
		// Log the error for debugging purposes
		logEvents(`Error adding user "${username}": ${error.message}`, 'errLog.txt', { print: true });
		
		// Return an error message
		return { success: false, message: error.message };
	}
}
// console.log(addUser('na3v534', 'tes3t5em3a4il3', 'password'));


/**
 * Deletes a user from the members table based on their user ID.
 * @param {number} user_id - The ID of the user to delete.
 * @returns {object} - The result of the database operation or an error message: `{ success, message, result }`
 */
function deleteUser(user_id) {
	// SQL query to delete a user by their user_id
	const query = 'DELETE FROM members WHERE user_id = ?';

	try {
		// Execute the delete query
		const result = db.run(query, [user_id]); // { changes: 1 }

		// Check if any rows were deleted
		if (result.changes === 0) return { success: false, message: `User with ID ${user_id} not found.` };

		// Return success result
		return { success: true, message: `User with ID ${user_id} deleted successfully.`, result };
	} catch (error) {
		// Log the error for debugging purposes
		logEvents(`Error deleting user with ID ${user_id}: ${error.message}`, 'errLog.txt', { print: true });

		// Return an error message
		return { success: false, message: error.message };
	}
}
// console.log(deleteUser(3408674));



// /**
//  * Fetches all users from the members table.
//  * @returns {Object[]} - An array of user objects. Each object represents a user 
//  * and contains all columns from the 'members' table. If there are no users, it returns an empty array.
//  */
// function getAllUsers() {
// 	return db.all('SELECT * FROM members');
// }
// console.log(getAllUsers());


// /**
//  * Fetches a user from the members table based on their username.
//  * @param {string} username - The username of the user to retrieve.
//  * @returns {object|undefined} - The user object if found, or undefined if not found.
//  */
// function getUserByUsername(username) {
// 	// SQL query to select a user by their username
// 	const query = 'SELECT * FROM members WHERE username = ?';
// 	// Execute the query and return the user object or undefined
// 	return db.get(query, [username]);
// }
// getUserByUsername('nav');



// /**
//  * Fetches a user from the members table based on their user ID.
//  * @param {number} userId - The user ID of the user to retrieve.
//  * @returns {object|undefined} - The user object if found, or undefined if not found.
//  */
// function getUserByUserId(userId) {
// 	// SQL query to select a user by their user_id
// 	const query = 'SELECT * FROM members WHERE user_id = ?';
// 	// Execute the query and return the user object or undefined
// 	return db.get(query, [userId]);
// }
// console.log(getUserByUserId(1103142));


// /**
//  * Fetches a user from the members table based on their email.
//  * @param {string} email - The email of the user to retrieve, case-sensitive.
//  * @returns {object|undefined} - The user object if found, or undefined if not found.
//  */
// function getUserByEmail(email) {
// 	// SQL query to select a user by their email
// 	const query = 'SELECT * FROM members WHERE email = ?';
// 	// Execute the query and return the user object or undefined
// 	return db.get(query, [email]);
// }
// console.log(getUserByEmail('testemail2'));



// Utility -----------------------------------------------------------------------------------



/**
 * Checks if a given user_id exists in the members table.
 * @param {number} userId - The user ID to check.
 * @returns {boolean} - Returns true if the user ID exists, false otherwise.
 */
function isUserIdTaken(userId) {
	// SQL query to check if a user_id exists in the 'members' table
	const query = 'SELECT 1 FROM members WHERE user_id = ?';
    
	// Execute the query with the user_id parameter
	const row = db.get(query, [userId]); // { '1': 1 }

	// If a row is found, the user_id exists
	return row !== undefined;
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

	// Execute the query with the username parameter
	const row = db.get(query, [username]); // { '1': 1 }

	// If a row is found, the username exists
	return row !== undefined;
}


/**
 * Checks if a given email exists in the members table.
 * @param {string} email - The email to check, in LOWERCASE.
 * @returns {boolean} - Returns true if the email exists, false otherwise.
 */
function isEmailTaken(email) {
	// SQL query to check if an email exists in the 'members' table
	const query = 'SELECT 1 FROM members WHERE email = ?';
	
	// Execute the query with the email parameter
	const row = db.get(query, [email]); // { '1': 1 }

	// If a row is found, the email exists
	return row !== undefined;
}

/**
 * Generates a **UNIQUE** user_id. It queries if it is taken to do so.
 * @returns {string} The ID
 */
function genUniqueUserID(length) { // object contains the key value list where the keys are the ids we want to not have duplicates of.
	let id;
	do {
		id = generateRandomUserId(length);
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




export {
	addUser,
	deleteUser,
	isUsernameTaken,
	isEmailTaken,
};