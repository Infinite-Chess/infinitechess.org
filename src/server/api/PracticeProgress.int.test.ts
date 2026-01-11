// src/server/api/PracticeProgress.int.test.ts

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';

import app from '../app.js';
import { generateTables, clearAllTables } from '../database/databaseTables.js';
import validcheckmates from '../../shared/chess/util/validcheckmates.js';
import { generateAccount } from '../controllers/createAccountController.js';
import { getMemberDataByCriteria } from '../database/memberManager.js';

// We'll use the first easy checkmate as our valid test case
const VALID_CHECKMATE_ID = validcheckmates.validCheckmates.easy[0];

if (!VALID_CHECKMATE_ID) throw new Error('No valid checkmate IDs found for testing!');

describe('Practice Progress Integration', () => {
	// Runs once at the very start of this file
	beforeAll(() => {
		generateTables();
	});

	// Runs before EVERY single 'it' block
	beforeEach(() => {
		clearAllTables();
	});

	/** Helper to create a user and get their login cookies. */
	async function loginAndGetCookie(): Promise<string> {
		await generateAccount({
			username: 'ChessMaster',
			email: 'master@example.com',
			password: 'Password123!',
			autoVerify: true,
		});

		const response = await request(app)
			.post('/auth')
			.set('X-Forwarded-Proto', 'https') // Fakes HTTPS to bypass middleware redirect
			.send({ username: 'ChessMaster', password: 'Password123!' });

		// Extract the session cookies
		const cookies = response.headers['set-cookie'] as unknown as string[]; // set-cookie is actually an array
		const jwtCookie = cookies.find((c) => c.startsWith('jwt='));
		const memberInfoCookie = cookies.find((c) => c.startsWith('memberInfo='));

		if (!jwtCookie || !memberInfoCookie) throw new Error('Missing login cookies');

		// Return both combined for the next request
		return [jwtCookie, memberInfoCookie].filter(Boolean).join(';');
	}

	it('should reject requests with no body', async () => {
		const cookie = await loginAndGetCookie();

		const response = await request(app)
			.post('/api/update-checkmatelist')
			.set('Cookie', cookie)
			.set('X-Forwarded-Proto', 'https'); // Fakes HTTPS to bypass middleware redirect

		expect(response.status).toBe(400);
	});

	it('should reject requests with missing new_checkmate_beaten', async () => {
		const cookie = await loginAndGetCookie();

		const response = await request(app)
			.post('/api/update-checkmatelist')
			.set('Cookie', cookie)
			.set('X-Forwarded-Proto', 'https') // Fakes HTTPS to bypass middleware redirect
			.send({}); // No new_checkmate_beaten

		expect(response.status).toBe(400);
	});

	it('should reject requests with non-string new_checkmate_beaten', async () => {
		const cookie = await loginAndGetCookie();

		const response = await request(app)
			.post('/api/update-checkmatelist')
			.set('Cookie', cookie)
			.set('X-Forwarded-Proto', 'https') // Fakes HTTPS to bypass middleware redirect
			.send({ new_checkmate_beaten: 12345 }); // Non-string

		expect(response.status).toBe(400);
	});

	it('should reject requests from unauthenticated users', async () => {
		const response = await request(app)
			.post('/api/update-checkmatelist')
			.set('X-Forwarded-Proto', 'https') // Fakes HTTPS to bypass middleware redirect
			.send({ new_checkmate_beaten: VALID_CHECKMATE_ID });

		expect(response.status).toBe(401);
	});

	it('should reject invalid checkmate IDs', async () => {
		const cookie = await loginAndGetCookie();

		const response = await request(app)
			.post('/api/update-checkmatelist')
			.set('Cookie', cookie)
			.set('X-Forwarded-Proto', 'https') // Fakes HTTPS to bypass middleware redirect
			.send({ new_checkmate_beaten: 'INVALID-ID-123' });

		expect(response.status).toBe(400);
		// expect(response.body.message).toBe('Invalid checkmate ID');
	});

	it('should allow a logged-in user to save a new checkmate', async () => {
		const cookie = await loginAndGetCookie();

		const response = await request(app)
			.post('/api/update-checkmatelist')
			.set('Cookie', cookie)
			.set('X-Forwarded-Proto', 'https') // Fakes HTTPS to bypass middleware redirect
			.send({ new_checkmate_beaten: VALID_CHECKMATE_ID });

		expect(response.status).toBe(200);

		// Check DB Side Effect
		const record = getMemberDataByCriteria(['checkmates_beaten'], 'username', 'ChessMaster');
		expect(record?.checkmates_beaten).toBe(VALID_CHECKMATE_ID);

		// Verify the response set the updated cookie
		const newCookies = response.headers['set-cookie'] as unknown as string[]; // set-cookie is actually an array
		expect(
			newCookies.some((c) =>
				c.startsWith(`checkmates_beaten=${encodeURIComponent(VALID_CHECKMATE_ID)}`),
			),
		).toBe(true);
	});

	it('should correctly store multiple checkmates', async () => {
		const cookie = await loginAndGetCookie();

		const secondCheckmateId = validcheckmates.validCheckmates.easy[1];
		if (!secondCheckmateId) throw new Error('Not enough valid checkmate IDs for this test!');

		// 1. Submit First Checkmate
		let response = await request(app)
			.post('/api/update-checkmatelist')
			.set('Cookie', cookie)
			.set('X-Forwarded-Proto', 'https') // Fakes HTTPS to bypass middleware redirect
			.send({ new_checkmate_beaten: VALID_CHECKMATE_ID });

		expect(response.status).toBe(200);

		// 2. Submit Second Checkmate
		response = await request(app)
			.post('/api/update-checkmatelist')
			.set('Cookie', cookie)
			.set('X-Forwarded-Proto', 'https') // Fakes HTTPS to bypass middleware redirect
			.send({ new_checkmate_beaten: secondCheckmateId });

		expect(response.status).toBe(200);

		// DB should have both IDs stored correctly
		const record = getMemberDataByCriteria(['checkmates_beaten'], 'username', 'ChessMaster');
		expect(record?.checkmates_beaten).toBe([VALID_CHECKMATE_ID, secondCheckmateId].join(','));
	});

	it('should handle duplicate checkmate submissions gracefully', async () => {
		const cookie = await loginAndGetCookie();

		// 1. Submit First Time
		let response = await request(app)
			.post('/api/update-checkmatelist')
			.set('Cookie', cookie)
			.set('X-Forwarded-Proto', 'https') // Fakes HTTPS to bypass middleware redirect
			.send({ new_checkmate_beaten: VALID_CHECKMATE_ID });

		expect(response.status).toBe(200);

		// 2. Submit Same ID Again
		response = await request(app)
			.post('/api/update-checkmatelist')
			.set('Cookie', cookie)
			.set('X-Forwarded-Proto', 'https') // Fakes HTTPS to bypass middleware redirect
			.send({ new_checkmate_beaten: VALID_CHECKMATE_ID });

		// Should now be 204 No Content, indicating no change in state
		expect(response.status).toBe(204);

		// DB should still only have it once (no duplicates like "ID,ID")
		const record = getMemberDataByCriteria(['checkmates_beaten'], 'username', 'ChessMaster');
		expect(record?.checkmates_beaten).toBe(VALID_CHECKMATE_ID);
	});
});
