// src/server/database/memberManager.ts

/**
 * This script handles almost all of the queries we use to interact with the members table!
 */

import type { PendingRegistrationRecord } from './pendingRegistrationManager.js';

import jsonutil from '../../shared/util/jsonutil.js';

import db from './database.js';
import databaseTables from './databaseTables.js';
import pendingRegistrationManager from './pendingRegistrationManager.js';

// Types --------------------------------------------------------------------------------------

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
	preferences: string | null;
	username_history: string | null;
	checkmates_beaten: string;
	last_read_news_date: string | null;
}

type MembersColumn = keyof MemberRecord;

/** A valid account deletion reason, stored in the deleted_members table. */
export type DeleteReason = (typeof VALID_DELETE_REASONS)[number];

// Constants ----------------------------------------------------------------------------------

/**
 * A list of all valid reasons to delete an account.
 * These reasons are stored in the deleted_members table in the database.
 */
const VALID_DELETE_REASONS = [
	'unverified', // They failed to verify after 3 days
	'user request', // They deleted their own account, or requested it to be deleted.
	'security', // A choice by server admins, for security purpose.
	'rating abuse', // Unfairly boosted their own elo with a throwaway account
] as const;

// Creation -----------------------------------------------------------------------------------

/**
 * Creates a new account. This is the single, authoritative function for user creation.
 * It atomically inserts records into both the `members` and `player_stats` tables
 * within a single database transaction, ensuring data integrity.
 * @param username The user's username.
 * @param email The user's email. It will automatically be lowercased.
 * @param hashedPassword The user's hashed password.
 * @returns The user_id of the newly created user.
 *
 * @throws If the insertion fails (e.g., due to constraint violation or other unexpected error).
 */
function add(username: string, email: string, hashedPassword: string): number {
	// prettier-ignore
	const createAccountTransaction = db.transaction<[{ username: string; email: string; hashedPassword: string }], number>((userData) => {
		// Step 1: Generate a unique user ID.
		const userId = genUniqueUserID();

		// Step 2: Set initial last_read_news_date to current date so new users don't see all news as unread
		const currentDate = new Date().toISOString().split('T')[0]!; // 'YYYY-MM-DDThh:mm:ss.sssZ' -> 'YYYY-MM-DD'

		// Step 3: Insert into the members table.
		const membersQuery = `
			INSERT INTO members (
				user_id, username, email, hashed_password, last_read_news_date
			) VALUES (?, ?, ?, ?, ?)
		`;
		const params = [
			userId,
			userData.username,
			userData.email.toLowerCase(), // Emails are always stored lowercase
			userData.hashedPassword,
			currentDate,
		];
		db.run(membersQuery, params);

		// Step 4: Insert into the 'player_stats' table.
		const statsQuery = `INSERT INTO player_stats (user_id) VALUES (?)`;
		db.run(statsQuery, [userId]);

		// If both inserts succeed, the transaction will commit and return the new user_id.
		return userId;
	});

	return db.call(
		() => createAccountTransaction({ username, email, hashedPassword }),
		`Account creation transaction for "${username}" failed and was rolled back`,
	);
}

/**
 * Atomically promotes a pending registration into a real,
 * verified member, and marks the pending row verified.
 * @param pending - The pending registration to promote.
 * @returns The new member's user_id.
 * @throws If a database error occurs during member creation (e.g. CONSTRAINT violation).
 */
function promote(pending: PendingRegistrationRecord): number {
	const promoteTransaction = db.transaction<[PendingRegistrationRecord], number>((p) => {
		// add runs its own transaction; nested here it becomes a savepoint.
		const user_id = add(p.username, p.email, p.hashed_password);
		pendingRegistrationManager.markVerified(p.claim_token, user_id);
		return user_id;
	});
	// Unlike add/remove, this transaction is NOT wrapped
	// in dbCall: its steps each already log via their own dbCall.
	return promoteTransaction(pending);
}

// Reads --------------------------------------------------------------------------------------

/**
 * Fetches specified columns of a single member from the database based on user_id, username, or email.
 * @param columns - The columns to retrieve (e.g., ['checkmates_beaten']).
 * @param searchKey - The search key to use. (e.g. 'username')
 * @param searchValue - The value to search for (e.g. 'user123').
 * @returns An object containing the requested columns, or undefined if no match is found.
 * @throws If invalid parameters are provided, or if a database error occurs during the query.
 */
function getDataByCriteria<K extends MembersColumn>(
	columns: K[],
	searchKey: MembersColumn,
	searchValue: string | number,
): Pick<MemberRecord, K> | undefined {
	return db.call(() => {
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
function getMultipleDataByCriteria<K extends MembersColumn>(
	columns: K[],
	searchKey: MembersColumn,
	searchValueList: string[] | number[],
): Pick<MemberRecord, K>[] {
	return db.call(() => {
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

// Updates ------------------------------------------------------------------------------------

/**
 * Updates specified columns for a member based on their user ID.
 * @param user_id - The user ID of the member to update.
 * @param updates - An object mapping column names to their new values.
 * @throws If invalid parameters are provided, the member does not exist, or if a database error occurs.
 */
function updateColumns(user_id: number, updates: Partial<MemberRecord>): void {
	db.call(() => {
		const result = db.runRowUpdate({
			tableName: 'members',
			allowedColumns: databaseTables.ALL_MEMBERS_COLUMNS,
			updates,
			errorContext: `updating member of ID "${user_id}"`,
			whereClause: 'user_id = ?',
			whereValues: [user_id],
		});

		// If no rows changed, the member doesn't exist.
		if (result.changes === 0)
			throw new Error(`No member found with user_id "${user_id}" when updating columns: ${JSON.stringify(Object.keys(updates))}`); // prettier-ignore
	}, `Error updating columns for user ID "${user_id}"`);
}

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
	db.call(() => {
		const result = db.run(query, [userId]);

		// If no rows changed, the member doesn't exist.
		if (result.changes === 0)
			throw new Error(`No member found with user_id "${userId}" when updating login_count and last_seen`); // prettier-ignore
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
	db.call(() => {
		const result = db.run(query, [userId]);

		// If no rows changed, the member doesn't exist.
		if (result.changes === 0)
			throw new Error(`No member found with user_id "${userId}" when updating last_seen`); // prettier-ignore
	}, `Error updating last_seen for member of id "${userId}"`);
}

// Deletion -----------------------------------------------------------------------------------

/** Type Guard: Checks if a string is a valid DeleteReason. */
function isValidDeleteReason(reason: string): reason is DeleteReason {
	return VALID_DELETE_REASONS.some((r) => r === reason);
}

/**
 * Deletes a user from the members table and adds them to the deleted_members table.
 * @param user_id - The ID of the user to delete.
 * @param reason_deleted - The reason the user is being deleted.
 * @throws If the member does not exist, or if a database error occurs during the deletion.
 */
function remove(user_id: number, reason_deleted: DeleteReason): void {
	// Create a transaction function. better-sqlite3 will wrap the execution
	// of this function in BEGIN/COMMIT/ROLLBACK statements.
	const deleteTransaction = db.transaction<[number, string], void>((id, reason) => {
		// Step 1: Delete the user from the main 'members' table
		const deleteQuery = 'DELETE FROM members WHERE user_id = ?';
		const deleteResult = db.run(deleteQuery, [id]);

		// If no user was deleted, they didn't exist. Throw an error to
		// abort the transaction and prevent any further action.
		if (deleteResult.changes === 0)
			throw new Error(`No member found with user_id ${id} to delete`); // prettier-ignore

		// Add their user_id to the 'deleted_members' table.
		const insertQuery = 'INSERT INTO deleted_members (user_id, reason_deleted) VALUES (?, ?)';
		db.run(insertQuery, [id, reason]);

		// Remove the promoted pending registration that created
		// this member, if it hasn't been cleaned up yet.
		db.run('DELETE FROM pending_registrations WHERE member_user_id = ?', [id]);
	});

	db.call(
		() => deleteTransaction(user_id, reason_deleted),
		`Deletion transaction for user_id "${user_id}" failed and was rolled back`,
	);
}

// Existence & Availability Checks ------------------------------------------------------------

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
	const row = db.call(
		() => db.get<{ found: 0 | 1 }>(query, [userId, userId]),
		`Error checking if user_id (${userId}) has been used`,
	);
	return Boolean(row?.found);
}

/**
 * Checks if a member with the given username exists in the members table (case-insensitive,
 * a username is taken even if it has the same spelling but different capitalization).
 * @param username - The username to check.
 * @returns Returns true if the username exists, false otherwise.
 * @throws If a database error occurs.
 */
function isUsernameTaken(username: string): boolean {
	const query = 'SELECT EXISTS(SELECT 1 FROM members WHERE username = ?) AS found';
	const row = db.call(
		() => db.get<{ found: 0 | 1 }>(query, [username]),
		`Error checking if username "${username}" is taken`,
	);
	return Boolean(row?.found);
}

/**
 * Checks if a member with the given email exists in the members table.
 * @param email - The email to check. Case-insensitive.
 * @returns Returns true if the email exists, false otherwise.
 * @throws If a database error occurs.
 */
function isEmailTaken(email: string): boolean {
	const query = 'SELECT EXISTS(SELECT 1 FROM members WHERE email = ?) AS found';
	const row = db.call(
		() => db.get<{ found: 0 | 1 }>(query, [email.toLowerCase()]), // Lowercased to match the stored (lowercase) rows
		`Error checking if email "${email}" exists`,
	);
	return Boolean(row?.found);
}

/**
 * Checks if a username is taken by either a `members`
 * row OR a non-expired `pending_registrations` row.
 * @throws If a database error occurs.
 */
function isUsernameTakenOrPending(username: string): boolean {
	return isUsernameTaken(username) || pendingRegistrationManager.isUsernameTaken(username);
}

/**
 * Checks if an email is taken by either a `members`
 * row OR a non-expired `pending_registrations` row.
 * @param email - The email to check. Case-insensitive.
 * @throws If a database error occurs.
 */
function isEmailTakenOrPending(email: string): boolean {
	return isEmailTaken(email) || pendingRegistrationManager.isEmailTaken(email);
}

// Internal Helpers ---------------------------------------------------------------------------

/**
 * Generates a unique user_id that no other member has ever used.
 * @throws If a database error occurs during uniqueness checks.
 */
function genUniqueUserID(): number {
	let id: number;
	do {
		id = Math.floor(Math.random() * databaseTables.USER_ID_UPPER_CAP);
	} while (isUserIdTaken(id));
	return id;
}

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
	db.assertColumnsValid(columns, databaseTables.ALL_MEMBERS_COLUMNS, 'members');

	// 2. Validate Search Key
	if (typeof searchKey !== 'string' || !databaseTables.UNIQUE_MEMBERS_COLUMNS.includes(searchKey))
		throw new Error(`Invalid search key for members table "${searchKey}". Must be one of: ${databaseTables.UNIQUE_MEMBERS_COLUMNS.join(', ')}`); // prettier-ignore

	// 3. Validate Search Values
	if (
		!Array.isArray(searchValues) ||
		searchValues.length === 0 ||
		!searchValues.every((value) => typeof value === 'string' || typeof value === 'number')
	)
		throw new Error(`Invalid search values for members table: ${jsonutil.ensureJSONString(searchValues)}`); // prettier-ignore
}

// Exports ------------------------------------------------------------------------------------

export default {
	// Creation
	add,
	promote,
	// Reads
	getDataByCriteria,
	getMultipleDataByCriteria,
	// Updates
	updateColumns,
	updateLoginCountAndLastSeen,
	updateLastSeen,
	// Deletion
	isValidDeleteReason,
	remove,
	// Existence & Availability Checks
	isUsernameTaken,
	isEmailTaken,
	isUsernameTakenOrPending,
	isEmailTakenOrPending,
};
