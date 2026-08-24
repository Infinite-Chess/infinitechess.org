// src/server/controllers/accountSeeder.ts

/**
 * Creates a verified member directly, skipping the register form's format checks,
 * bot gate, and email verification. For dev seeding and tests only — never routed.
 */

import bcrypt from 'bcrypt';

import memberManager from '../database/memberManager.js';
import { logEvents } from '../utility/logEvents.js';
import accountValidation from './accountValidation.js';

/**
 * Generate an account only from the provided username, email, and password.
 * Regex tests are skipped.
 * @returns If it was a success, the row ID of where the member was inserted (same as their user_id).
 * @throws If account creation fails for any reason.
 */
export async function generateAccount({
	username,
	email,
	password,
}: {
	username: string;
	email: string;
	password: string;
}): Promise<number> {
	// Use bcrypt to hash & salt password
	const hashedPassword = await bcrypt.hash(password, accountValidation.PASSWORD_SALT_ROUNDS); // Passes 10 salt rounds. (standard)
	const user_id = memberManager.add(username, email, hashedPassword);
	logEvents(`Manually generated new member: ${username}`, 'newMemberLog');
	return user_id;
}
