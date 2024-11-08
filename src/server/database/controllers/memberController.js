
import { logEvents } from '../../middleware/logEvents.js';
import db from '../database.js';


const user_id_upper_cap = 14_776_336; // Limit of unique user id with 4-digit base-62 user ids!



// Fetch all users
function getAllUsers() {
	return db.all('SELECT * FROM members');
}






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





/**
 * Adds a new user to the members table.
 * @param {string} username - The user's username.
 * @param {string} email - The user's email.
 * @param {string} hashed_password - The hashed password for the user.
 * @param {string} [roles] - The user's roles (e.g., ['owner'], ['admin']).
 * @param {string} [verification] - The verification string (optional).
 * @param {string} [preferences] - The user's preferences (optional).
 * @returns {object} - The result of the database operation or an error message.
 */
async function addUser(username, email, hashed_password, roles, verification, preferences) {
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

console.log(await addUser('nav', 'testemail', 'password'));

export default {
	getAllUsers,
	addUser,
};