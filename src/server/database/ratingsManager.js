/**
 * This script handles queries to the ratings table. 
 */

import { logEvents } from '../middleware/logEvents.js';
import db from './database.js';

function addUserToRatingsTable(user_id) {
	const query = `
    INSERT INTO ratings (
    user_id
    ) VALUES (?)
	`;

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

function updatePlayerRatingValues(user_id, elo, rd) {
	const query = `
    UPDATE ratings
    SET infinity_elo = ${elo}, infinity_rating_deviation = ${rd}
    WHERE user_id = ${user_id}
	`
	// Check elo and rd are doubles before actually updating the records

};

function testRatingCode() {
	addUserToRatingsTable(2142397)
};

export {
	addUserToRatingsTable,
	updatePlayerRatingValues,
	testRatingCode,
};
