
/**
 * This script interacts with our deleted_members table
 */

import db from './database.js';
import { logEvents } from "../middleware/logEvents.js";



function addDeletedMemberToDeletedMembersTable(user_id, reason_deleted) {
	if (user_id === undefined || reason_deleted === undefined) {
		return logEvents(`Not all required params are met to add member to deleted members table! ${user_id}, ${reason_deleted}`, 'errLog.txt', { print: true });
	}
	
	// The table looks like:
	// CREATE TABLE IF NOT EXISTS deleted_members (
	//     user_id INTEGER PRIMARY KEY,           
	//     reason_deleted TEXT NOT NULL,             
	// );

	const query = `
		INSERT INTO deleted_members (user_id, reason_deleted)
		VALUES (?, ?)
	`;

	try {
		// Execute the query with the provided values
		db.run(query, [user_id, reason_deleted]); // { changes: 1, lastInsertRowid: 7656846 }
	} catch (error) {
		// Log the error for debugging purposes
		logEvents(`Failed to add user ID "${user_id}" to deleted_members table for reason "${reason_deleted}": ${error.message}`, 'errLog.txt', { print: true });
	}
}



export {
	addDeletedMemberToDeletedMembersTable
};