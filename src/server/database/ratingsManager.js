/**
 * This script handles queries to the ratings table. 
 */

import { logEvents } from '../middleware/logEvents.js';
import db from './database.js';

/*
 * Adds an entry to the ratings table, defaulting to 1000 elo and 350 rd
 * @param {number} user_id - The id for the user (fails if it doesn't exist in members)
 * @returns {object} A result object: { success (boolean), reason (string, if failed) } 
 * */
function addUserToRatingsTable(user_id) {
	const query = `
    INSERT INTO ratings (
    user_id
    ) VALUES (?)
	`; // Only inserting user_id is needed as the other values have defaults (100.0 and 350.0)

	try {
		// Execute the query with the provided values
		const result = db.run(query, [user_id]); // 

		// Return success result
		return { success: true, result };

	} catch (error) {
		// Log the error for debugging purposes
		logEvents(`Error adding user to ratings table "${user_id}": ${error.message}`, 'errLog.txt', { print: true });

		// Return an error message
		return { success: false };
	}
}

/*
 * Updates the values related to the rating of the player. 
 * @param {number} user_id - The id for the user
 * @param {number} elo - The new elo value for the player
 * @param {number} rd - The new rating deviation for the player
 * @returns {object} A result object: { success (boolean), reason (string, if failed) } 
 * */

function updatePlayerRatingValues(user_id, elo, rd) {
	const query = `
    UPDATE ratings
    SET infinite_elo = ${elo}, infinite_rating_deviation = ${rd}
    WHERE user_id = ${user_id}
	`
	// Tries to execute the query to modify the data.
	try {
		// Execute the query
		const result = db.run(query); // 

		// Return success result
		return { success: true, result };

	} catch (error) {
		// Log the error for debugging purposes
		logEvents(`Error modifying user ratings data for user: "${user_id}": ${error.message}`, 'errLog.txt', { print: true });

		// Return an error message
		return { success: false };
	}

};

/*
 * Updates the values related to the rating of the player. 
 * @param {number} user_id - The id for the user
 * @returns {object | undefined} A result object: {user_id: (number), infinite_elo: (number), infinite_rating_deviation: (number)} 
 * */

function getPlayerRatingValues(user_id) {
	// SQL query to check if a username exists in the 'ratings' table
	const query = 'SELECT * FROM ratings WHERE user_id = ?';

	try {
		// Execute the query with the user_id parameter
		const row = db.get(query, [user_id]);
		return row;
	} catch (error) {
		// Log the error for debugging purposes
		logEvents(`Error getting row of member "${user_id}": ${error.message}`, 'errLog.txt', { print: true });
		return;
	}
};

export {
	addUserToRatingsTable,
	updatePlayerRatingValues,
	getPlayerRatingValues,
};	
