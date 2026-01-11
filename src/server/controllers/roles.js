/**
 * This module handles the addition
 * and removal of roles from members.
 */

import { logEventsAndPrint } from '../middleware/logEvents.js';
import { getMemberDataByCriteria, updateMemberColumns } from '../database/memberManager.js';

/**
 * All possible roles, IN ORDER FROM LEAST TO MOST IMPORTANCE!
 * The ordering determines admin's capabilities in the admin console.
 */
const validRoles = ['patron', 'admin', 'owner'];

/**
 * Adds a specified role to a member's roles list.
 * @param {number} userId - The user ID of the member.
 * @param {string} role - The role to add (e.g., 'owner', 'patron').
 */
function giveRole(userId, role) {
	if (userId === undefined)
		return logEventsAndPrint(`Cannot give undefined user ID the role "${role}"!`, 'errLog.txt');
	if (!validRoles.includes(role))
		return logEventsAndPrint(
			`Cannot give INVALID role "${role}" to user of ID "${userId}"!`,
			'errLog.txt',
		);

	// Fetch the member's current roles from the database
	let { roles } = getMemberDataByCriteria(['roles'], 'user_id', userId);
	if (roles === undefined)
		return logEventsAndPrint(
			`Cannot give role "${role}" to user of ID "${userId}" when they don't exist!`,
			'errLog.txt',
		);
	roles = roles === null ? [] : JSON.parse(roles); // ['role1','role2', ...]

	// If the role already exists, return early
	if (roles.includes(role))
		return logEventsAndPrint(
			`Role "${role}" already exists for member with user ID "${userId}".`,
			'errLog.txt',
		);

	// Add the new role to the roles array
	roles.push(role);

	try {
		// Save the updated roles back to the database
		const result = updateMemberColumns(userId, { roles: JSON.stringify(roles) });

		if (result.changeMade) {
			logEventsAndPrint(
				`Added role "${role}" to member with ID "${userId}".`,
				'loginAttempts.txt',
			);
		} else {
			logEventsAndPrint(
				`Failed to add role "${role}" to member with ID "${userId}".`,
				'errLog.txt',
			);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error adding role "${role}" to member of ID "${userId}": ${message}`,
			'errLog.txt',
		);
	}
}

// /**
//  * Deletes all roles for a member and sets the roles column to null in the database.
//  * @param {number} userId - The user ID of the member whose roles are to be deleted.
//  */
// function removeAllRoles(userId) {
// 	if (userId === undefined) return logEventsAndPrint(`Cannot remove roles from an undefined user ID!`, 'errLog.txt');

// 	// Set roles to null (no roles left)
// 	updateMemberColumns(userId, { roles: null });

// 	logEventsAndPrint(`Deleted all roles of member with user ID "${userId}".`, 'loginAttempts.txt');
// }
// removeAllRoles(11784992);

/**
 * Returns true if roles1 contains at least one role that is higher in priority than the highest role in roles2.
 *
 * If so, the user with roles1 would be able to perform destructive commands on user with roles2.
 * @param {string[] | null} roles1
 * @param {string[] | null} roles2
 */
function areRolesHigherInPriority(roles1, roles2) {
	// Make sure they are not null
	roles1 = roles1 || [];
	roles2 = roles2 || [];

	let roles1HighestPriority = -1; // -1 is the same as someone with zero roles
	roles1.forEach((role) => {
		const priorityOfRole = validRoles.indexOf(role);
		if (priorityOfRole > roles1HighestPriority) roles1HighestPriority = priorityOfRole;
	});

	let roles2HighestPriority = -1; // -1 is the same as someone with zero roles
	roles2.forEach((role) => {
		const priorityOfRole = validRoles.indexOf(role);
		if (priorityOfRole > roles2HighestPriority) roles2HighestPriority = priorityOfRole;
	});

	// console.log('roles1 highest role: ' + roles1HighestRoles);
	// console.log('roles2 highest role: ' + roles2HighestRoles);

	return roles1HighestPriority > roles2HighestPriority;
}

export { giveRole, areRolesHigherInPriority };
