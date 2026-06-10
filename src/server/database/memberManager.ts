// src/server/database/memberManager.ts

/**
 * This script handles almost all of the queries we use to interact with the members table!
 */

import type { DeleteReason } from '../controllers/deleteAccountController.js';

import jsutil from '../../shared/util/jsutil.js';

import db, { dbCall } from './database.js';
import { allMemberColumns, uniqueMemberKeys, user_id_upper_cap } from './databaseTables.js';
import {
	isEmailTakenInPending,
	isUsernameTakenInPending,
	markPendingRegistrationVerified,
	PendingRegistrationRecord,
} from './pendingRegistrationManager.js';

// Types ---------------------------------------------------------------------

/** Structure of a complete member record. */
export interface MemberRecord {
	user_id: number;
	username: string;
	email: string;
	hashed_password: string;
	roles: string | null;
	joined: string;
	last_seen: string;
	login_count: number;
	is_verified: 0 | 1;
	verification_code: string | null;
	is_verification_notified: 0 | 1;
	preferences: string | null;
	username_history: string | null;
	checkmates_beaten: string;
	last_read_news_date: string | null;
}

type MembersColumn = keyof MemberRecord;

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
function addUser(
	username: string,
	email: string,
	hashedPassword: string,
	is_verified: 0 | 1,
	verification_code: string | null,
	is_verification_notified: 0 | 1,
): number {
	// prettier-ignore
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
			currentDate,
		];
		db.run(membersQuery, params);

		// Step 4: Insert into the 'player_stats' table.
		const statsQuery = `INSERT INTO player_stats (user_id) VALUES (?)`;
		db.run(statsQuery, [userId]);

		// If both inserts succeed, the transaction will commit and return the new user_id.
		return userId;
	});

	return dbCall(
		() =>
			createAccountTransaction({
				username,
				email,
				hashedPassword,
				is_verified,
				verification_code,
				is_verification_notified,
			}),
		`Account creation transaction for "${username}" failed and was rolled back`,
	);
}
// setTimeout(() => { console.log(addUser('na3v534', 'tes3t5em3a4il3', 'password', null)); }, 1000); // Set timeout needed so user_id_upper_cap is initialized before this function is called.

/**
 * Atomically promotes a pending registration into a real,
 * verified member, and marks the pending row verified.
 * @param pending - The pending registration to promote.
 * @returns The new member's user_id.
 * @throws If a database error occurrs during member creation (e.g. CONSTRAINT violation).
 */
function promotePendingRegistration(pending: PendingRegistrationRecord): number {
	const promoteTransaction = db.transaction<[PendingRegistrationRecord], number>((p) => {
		// addUser runs its own transaction; nested here it becomes a savepoint.
		const user_id = addUser(p.username, p.email, p.hashed_password, 1, null, 1);
		markPendingRegistrationVerified(p.claim_token, user_id);
		return user_id;
	});
	// Every db operation within the transaction already logs via dbCall() on failure.
	return promoteTransaction(pending);
}

/**
 * Deletes a user from the members table and adds them to the deleted_members table.
 * @param user_id - The ID of the user to delete.
 * @param reason_deleted - The reason the user is being deleted.
 * @throws If the member does not exist, or if a database error occurs during the deletion.
 */
function deleteUser(user_id: number, reason_deleted: DeleteReason): void {
	// Create a transaction function. better-sqlite3 will wrap the execution
	// of this function in BEGIN/COMMIT/ROLLBACK statements.
	const deleteTransaction = db.transaction<[number, string], void>((id, reason) => {
		// Step 1: Delete the user from the main 'members' table
		const deleteQuery = 'DELETE FROM members WHERE user_id = ?';
		const deleteResult = db.run(deleteQuery, [id]);

		// If no user was deleted, they didn't exist. Throw an error to
		// abort the transaction and prevent any further action.
		if (deleteResult.changes === 0)
			throw new Error(`No member found with user_id ${id} to delete`);

		// Step 2: Add their user_id to the 'deleted_members' table
		// If this fails (e.g., UNIQUE constraint), it will also throw an error
		// and cause the entire transaction (including the DELETE) to roll back.
		const insertQuery = 'INSERT INTO deleted_members (user_id, reason_deleted) VALUES (?, ?)';
		db.run(insertQuery, [id, reason]);

		// Step 3: Remove the promoted pending registration that
		// created this member, if it hasn't been cleaned up yet.
		db.run('DELETE FROM pending_registrations WHERE member_user_id = ?', [id]);
	});

	deleteTransaction(user_id, reason_deleted);
}
// console.log(deleteUser(3887110, 'security'));

// General SELECT/UPDATE methods ---------------------------------------------------------------------------------------

/**
 * Helper for validating the common arguments used for querying member data.
 * @param columns - The list of columns to retrieve (e.g., ['checkmates_beaten']).
 * @param searchKey - The database column to search by (e.g., 'username').
 * @param searchValues - An array of values to search for (e.g., ['user1', 'user2']).
 * @throws Error if any validation fails.
 */
function validateMemberQueryArgs(
	columns: string[],
	searchKey: string,
	searchValues: (string | number)[],
): void {
	// 1. Validate Columns
	if (
		!Array.isArray(columns) ||
		columns.length === 0 ||
		!columns.every((column) => typeof column === 'string' && allMemberColumns.includes(column))
	)
		throw new Error(
			`Invalid columns requested from members table: ${jsutil.ensureJSONString(columns)}`,
		);

	// 2. Validate Search Key
	if (typeof searchKey !== 'string' || !uniqueMemberKeys.includes(searchKey))
		throw new Error(
			`Invalid search key for members table "${searchKey}". Must be one of: ${uniqueMemberKeys.join(', ')}`,
		);

	// 3. Validate Search Values
	if (
		!Array.isArray(searchValues) ||
		searchValues.length === 0 ||
		!searchValues.every((value) => typeof value === 'string' || typeof value === 'number')
	)
		throw new Error(
			`Invalid search values for members table: ${jsutil.ensureJSONString(searchValues)}`,
		);
}

/**
 * Fetches specified columns of a single member from the database based on user_id, username, or email.
 * @param columns - The columns to retrieve (e.g., ['checkmates_beaten']).
 * @param searchKey - The search key to use. (e.g. 'username')
 * @param searchValue - The value to search for (e.g. 'user123').
 * @returns An object containing the requested columns, or undefined if no match is found.
 * @throws If invalid parameters are provided, or if a database error occurs during the query.
 */
function getMemberDataByCriteria<K extends MembersColumn>(
	columns: K[],
	searchKey: MembersColumn,
	searchValue: string | number,
): Pick<MemberRecord, K> | undefined {
	return dbCall(() => {
		// Runtime validation
		validateMemberQueryArgs(columns, searchKey, [searchValue]);

		const query = `SELECT ${columns.join(', ')} FROM members WHERE ${searchKey} = ?`;
		return db.get<Pick<MemberRecord, K>>(query, [searchValue]);
	}, 'Error getting member data by criteria');
}

/**
 * Fetches specified columns of multiple members from the database based on a list of user_ids, usernames, or emails.
 * @param columns - The columns to retrieve (e.g., ['user_id', 'username', 'roles']).
 * @param searchKey - The search key to use (e.g., 'checkmates_beaten').
 * @param searchValueList - The value to search for, can be a list of user IDs, usernames, or emails.
 * @returns An array of member records.
 * @throws If invalid parameters are provided, or if a database error occurs during the query.
 */
function getMultipleMemberDataByCriteria<K extends MembersColumn>(
	columns: K[],
	searchKey: MembersColumn,
	searchValueList: string[] | number[],
): Pick<MemberRecord, K>[] {
	return dbCall(() => {
		// Runtime validation
		validateMemberQueryArgs(columns, searchKey, searchValueList);

		// Construct SQL query
		const placeholders = searchValueList.map(() => '?').join(', ');
		const query = `
			SELECT ${columns.join(', ')}
			FROM members
			WHERE ${searchKey} IN (${placeholders})
		`;
		return db.all<Pick<MemberRecord, K>>(query, searchValueList);
	}, 'Error getting MULTIPLE member data by criteria');
}

/**
 * Updates specified columns for a member based on their user ID.
 * @param user_id - The user ID of the member to update.
 * @param columnsAndValues - An object mapping column names to their new values.
 * @throws If invalid parameters are provided, the member does not exist, or if a database error occurs.
 */
function updateMemberColumns(user_id: number, columnsAndValues: Partial<MemberRecord>): void {
	dbCall(() => {
		// Validate that we have columns to update
		if (typeof columnsAndValues !== 'object' || columnsAndValues === null)
			throw new Error(
				`Invalid columnsAndValues provided when updating member of ID "${user_id}": ${jsutil.ensureJSONString(columnsAndValues)}`,
			);

		const columns = Object.keys(columnsAndValues);
		const values = Object.values(columnsAndValues);

		// Validate they are all valid database columns
		if (
			columns.length === 0 ||
			!columns.every((col) => allMemberColumns.includes(col)) ||
			!values.every(
				(val) => typeof val === 'string' || typeof val === 'number' || val === null,
			)
		)
			throw new Error(
				`Invalid columns or values provided when updating member of ID "${user_id}": ${jsutil.ensureJSONString(columnsAndValues)}`,
			);

		// Dynamically build the query
		const setStatements = columns.map((column) => `${column} = ?`).join(', ');
		const query = `UPDATE members SET ${setStatements} WHERE user_id = ?`;
		const result = db.run(query, [...values, user_id]);

		// If no rows changed, the member doesn't exist.
		if (result.changes === 0)
			throw new Error(`User not found! Columns: ${JSON.stringify(columns)}!`);
	}, `Error updating columns for user ID "${user_id}"`);
}

// Login Count & Last Seen ---------------------------------------------------------------------------------------

/**
 * Increments the login count and updates the last_seen column for a member based on their user ID.
 * @param userId - The user ID of the member.
 * @throws If the member does not exist, or if a database error occurs.
 */
function updateLoginCountAndLastSeen(userId: number): void {
	const query = `
		UPDATE members
		SET login_count = login_count + 1, last_seen = CURRENT_TIMESTAMP
		WHERE user_id = ?
	`;
	dbCall(() => {
		const result = db.run(query, [userId]);

		// If no rows changed, the member doesn't exist.
		if (result.changes === 0)
			throw new Error(
				`No changes made when updating login_count and last_seen for member of id "${userId}"!`,
			);
	}, `Error updating login_count and last_seen for member of id "${userId}"`);
}

/**
 * Updates the last_seen column for a member based on their user ID.
 * @param userId - The user ID of the member.
 * @throws If the member does not exist, or if a database error occurs.
 */
function updateLastSeen(userId: number): void {
	const query = `
		UPDATE members
		SET last_seen = CURRENT_TIMESTAMP
		WHERE user_id = ?
	`;
	dbCall(() => {
		const result = db.run(query, [userId]);

		// If no rows changed, the member doesn't exist.
		if (result.changes === 0)
			throw new Error(
				`No changes made when updating last_seen for member of id "${userId}"!`,
			);
	}, `Error updating last_seen for member of id "${userId}"`);
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
	const query = 'SELECT EXISTS(SELECT 1 FROM members WHERE user_id = ?) AS found';
	const row = dbCall(
		() => db.get<{ found: 0 | 1 }>(query, [user_id]),
		`Error checking if member of user_id (${user_id}) exists`,
	);
	return Boolean(row?.found);
}

/**
 * Checks if a given user_id exists in the members table OR deleted_members table.
 * @param userId - The user ID to check.
 * @returns Returns true if the user_id has been used, false otherwise.
 *
 * @throws If a database error occurs during the check.
 */
function isUserIdTaken(userId: number): boolean {
	const query = `
		SELECT
			EXISTS(SELECT 1 FROM members WHERE user_id = ?)
			OR
			EXISTS(SELECT 1 FROM deleted_members WHERE user_id = ?)
		AS found
	`;
	const row = dbCall(
		() => db.get<{ found: 0 | 1 }>(query, [userId, userId]),
		`Error checking if user_id (${userId}) has been used`,
	);
	return Boolean(row?.found);
}
// console.log("taken? " + isUserIdTaken(14443702));

/**
 * Checks if a member with the given username exists in the members table (case-insensitive,
 * a username is taken even if it has the same spelling but different capitalization).
 * @param username - The username to check.
 * @returns Returns true if the username exists, false otherwise.
 * @throws If a database error occurs.
 */
function isUsernameTaken(username: string): boolean {
	const query = 'SELECT 1 FROM members WHERE username = ?';
	const row = dbCall(
		() => db.get<{ '1': 1 }>(query, [username]),
		`Error checking if username "${username}" is taken`,
	);
	return row !== undefined;
}

/**
 * Checks if a member with the given email exists in the members table.
 * @param email - The email to check, in LOWERCASE.
 * @returns Returns true if the email exists, false otherwise.
 * @throws If a database error occurs.
 */
function isEmailTaken(email: string): boolean {
	const query = 'SELECT 1 FROM members WHERE email = ?';
	const row = dbCall(
		() => db.get<{ '1': 1 }>(query, [email]),
		`Error checking if email "${email}" exists`,
	);
	return row !== undefined;
}

/**
 * Checks if a username is taken by either a `members`
 * row OR a non-expired `pending_registrations` row.
 * @throws If a database error occurs.
 */
function isUsernameTakenOrPending(username: string): boolean {
	return isUsernameTaken(username) || isUsernameTakenInPending(username);
}

/**
 * Checks if an email is taken by either a `members`
 * row OR a non-expired `pending_registrations` row.
 * @param email - The email to check, in LOWERCASE.
 * @throws If a database error occurs.
 */
function isEmailTakenOrPending(email: string): boolean {
	return isEmailTaken(email) || isEmailTakenInPending(email);
}

// Exports -----------------------------------------------------------------------------

export {
	addUser,
	promotePendingRegistration,
	deleteUser,
	getMemberDataByCriteria,
	getMultipleMemberDataByCriteria,
	updateMemberColumns,
	updateLoginCountAndLastSeen,
	updateLastSeen,
	doesMemberOfIDExist,
	isUsernameTaken,
	isEmailTaken,
	isUsernameTakenOrPending,
	isEmailTakenOrPending,
};
