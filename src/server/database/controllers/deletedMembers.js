
/**
 * This script interacts with our deleted_members table
 */

import db from '../database.js';
import { logEvents } from "../../middleware/logEvents.js";

function addDeletedMemberToDeletedMembersTable(user_id, username, joined, login_count, reason_deleted) {
	if (user_id === undefined || username === undefined || joined === undefined || login_count === undefined || reason_deleted === undefined) {
		return logEvents(`Not all required params are met to add member to deleted members table! ${user_id}, ${username}, ${joined}, ${login_count}, ${reason_deleted}`, 'errLog.txt', { print: true });
	}
	
	// CREATE TABLE IF NOT EXISTS deleted_members (
	//     user_id INTEGER PRIMARY KEY,               
	//     username TEXT NOT NULL COLLATE NOCASE,    
	//     username_history TEXT,    
	//     joined INTEGER NOT NULL,
	//     left INTEGER NOT NULL,                              
	//     login_count INTEGER NOT NULL,             
	//     reason_deleted TEXT NOT NULL,             
	// );

	const left = Date.now(); // Current timestamp for when the member was deleted

	const query = `
		INSERT INTO deleted_members (user_id, username, joined, left, login_count, reason_deleted)
		VALUES (?, ?, ?, ?, ?, ?)
	`;

	try {
		// Execute the query with the provided values
		db.run(query, [user_id, username, joined, left, login_count, reason_deleted]); // { changes: 1, lastInsertRowid: 7656846 }
	} catch (error) {
		// Log the error for debugging purposes
		logEvents(`Failed to add user ID "${user_id}" name "${username}" to deleted_members table! ${error.message} ${user_id}, ${username}, ${joined}, ${login_count}, ${reason_deleted}`, 'errLog.txt', { print: true });
	}
}


export {
	addDeletedMemberToDeletedMembersTable
};