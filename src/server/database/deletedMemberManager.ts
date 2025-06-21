
/**
 * This script interacts with our deleted_members table
 */

import db from './database.js';
import { logEventsAndPrint } from "../middleware/logEvents.js";



function addDeletedMemberToDeletedMembersTable(user_id: number, reason_deleted: string): void {
	
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
	} catch (error: unknown) {
		// Log the error for debugging purposes
		const errorMessage = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Failed to add user ID "${user_id}" to deleted_members table for reason "${reason_deleted}": ${errorMessage}`, 'errLog.txt');
	}
}



export {
	addDeletedMemberToDeletedMembersTable
};