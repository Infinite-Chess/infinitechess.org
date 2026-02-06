// src/server/controllers/roles.ts

/**
 * This module handles the addition
 * and removal of roles from members.
 */

import { logEventsAndPrint } from '../middleware/logevents.js';
import { getMemberDataByCriteria, updateMemberColumns } from '../database/membermanager.js';

/**
 * All possible roles, IN ORDER FROM LEAST TO MOST IMPORTANCE!
 * The ordering determines admin's capabilities in the admin console.
 */
const validRoles = ['patron', 'admin', 'owner'] as const;

/** A valid role of a user. */
export type Role = (typeof validRoles)[number];

/**
 * Adds a specified role to a member's roles list.
 * @param userId - The user ID of the member.
 * @param role - The role to add (e.g., 'owner', 'patron').
 */
function giveRole(userId: number, role: Role): void {
	// Fetch the member's current roles from the database
	const memberData = getMemberDataByCriteria(['roles'], 'user_id', userId);
	if (!memberData) {
		logEventsAndPrint(
			`Cannot give role "${role}" to user of ID "${userId}" when they don't exist!`,
			'errLog.txt',
		);
		return;
	}
	const roles: Role[] = memberData.roles === null ? [] : JSON.parse(memberData.roles); // ['role1','role2', ...]

	// If the role already exists, return early
	if (roles.includes(role)) {
		logEventsAndPrint(
			`Role "${role}" already exists for member with user ID "${userId}".`,
			'errLog.txt',
		);
		return;
	}

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

/**
 * Returns true if roles1 contains at least one role that is higher in priority than the highest role in roles2.
 *
 * If so, the user with roles1 would be able to perform destructive commands on user with roles2.
 * @param roles1 - List of roles for the first user.
 * @param roles2 - List of roles for the second user.
 */
function areRolesHigherInPriority(roles1: Role[] | null, roles2: Role[] | null): boolean {
	// Make sure they are not null
	const r1: Role[] = roles1 || [];
	const r2: Role[] = roles2 || [];

	let roles1HighestPriority = -1; // -1 is the same as someone with zero roles
	r1.forEach((role) => {
		const priorityOfRole = validRoles.indexOf(role);
		if (priorityOfRole > roles1HighestPriority) roles1HighestPriority = priorityOfRole;
	});

	let roles2HighestPriority = -1; // -1 is the same as someone with zero roles
	r2.forEach((role) => {
		const priorityOfRole = validRoles.indexOf(role);
		if (priorityOfRole > roles2HighestPriority) roles2HighestPriority = priorityOfRole;
	});

	return roles1HighestPriority > roles2HighestPriority;
}

export { giveRole, areRolesHigherInPriority };
