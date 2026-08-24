// src/server/controllers/roles.ts

/**
 * This module handles the addition and removal of roles from members.
 *
 * NOTE: Roles are baked into the JWT and read off the decoded token during auth — never
 * re-checked against the DB — so mutations here don't take effect until the token rotates.
 * Harmless today (only caller is additive dev seeding), but a demotion feature MUST close
 * this: resolve roles from `members.roles` per request, or re-issue + evict the member's
 * sessions/sockets on change.
 */

import memberManager from '../database/memberManager.js';
import { VALID_ROLES, Role } from '../types.js';

/**
 * Adds a specified role to a member's roles list.
 * @param userId - The user ID of the member.
 * @param role - The role to add (e.g., 'owner', 'patron').
 * @throws If the user doesn't exist, already has the role, or if a database error occurs.
 */
function add(userId: number, role: Role): void {
	// Fetch the member's current roles from the database
	const memberData = memberManager.getDataByCriteria(['roles'], 'user_id', userId);
	if (!memberData) throw new Error(`User with ID ${userId} does not exist`);
	const roles = parse(memberData.roles) ?? [];

	// If the role already exists, return early
	if (roles.includes(role))
		throw new Error(`User with ID ${userId} already has the role "${role}"`);

	// Add the new role to the roles array
	roles.push(role);

	// Save the updated roles back to the database
	memberManager.updateColumns(userId, { roles: JSON.stringify(roles) });
}

/**
 * Parses the stored `members.roles` JSON column into a role array.
 * Returns null for a null cell (the member has no roles).
 * @throws If the stored JSON is malformed.
 */
function parse(roles: string | null): Role[] | null {
	return roles === null ? null : JSON.parse(roles);
}

/**
 * Returns true if roles1 contains at least one role that is higher in priority than the highest role in roles2.
 *
 * If so, the user with roles1 would be able to perform destructive commands on user with roles2.
 * @param roles1 - List of roles for the first user.
 * @param roles2 - List of roles for the second user.
 */
function areHigherInPriority(roles1: Role[] | null, roles2: Role[] | null): boolean {
	// Make sure they are not null
	const r1: Role[] = roles1 || [];
	const r2: Role[] = roles2 || [];

	let roles1HighestPriority = -1; // -1 is the same as someone with zero roles
	r1.forEach((role) => {
		const priorityOfRole = VALID_ROLES.indexOf(role);
		if (priorityOfRole > roles1HighestPriority) roles1HighestPriority = priorityOfRole;
	});

	let roles2HighestPriority = -1; // -1 is the same as someone with zero roles
	r2.forEach((role) => {
		const priorityOfRole = VALID_ROLES.indexOf(role);
		if (priorityOfRole > roles2HighestPriority) roles2HighestPriority = priorityOfRole;
	});

	return roles1HighestPriority > roles2HighestPriority;
}

// Exports ---------------------------------------------------------------------------------

export default {
	add,
	parse,
	areHigherInPriority,
};
