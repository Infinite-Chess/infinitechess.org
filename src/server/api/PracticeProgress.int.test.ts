// src/server/api/PracticeProgress.int.test.ts

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';

import validcheckmates from '../../shared/chess/util/validcheckmates.js';

import { getMemberDataByCriteria } from '../database/memberManager.js';
import { generateTables, clearAllTables } from '../database/databaseTables.js';

import { testRequest } from '../../tests/testRequest.js';
import integrationUtils from '../../tests/integrationUtils.js';

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

	it('should reject requests with no body', async () => {
		const cookie = (await integrationUtils.createAndLoginUser()).cookie;

		const response = await testRequest()
			.post('/api/update-checkmatelist')
			.set('Cookie', cookie);

		expect(response.status).toBe(400);
	});

	it('should reject requests with missing new_checkmate_beaten', async () => {
		const cookie = (await integrationUtils.createAndLoginUser()).cookie;

		const response = await testRequest()
			.post('/api/update-checkmatelist')
			.set('Cookie', cookie)
			.send({}); // No new_checkmate_beaten

		expect(response.status).toBe(400);
	});

	it('should reject requests with non-string new_checkmate_beaten', async () => {
		const cookie = await integrationUtils.createAndLoginUser();

		const response = await testRequest()
			.post('/api/update-checkmatelist')
			.set('Cookie', cookie.cookie)
			.send({ new_checkmate_beaten: 12345 }); // Non-string

		expect(response.status).toBe(400);
	});

	it('should reject requests from unauthenticated users', async () => {
		const response = await testRequest()
			.post('/api/update-checkmatelist')
			.send({ new_checkmate_beaten: VALID_CHECKMATE_ID });

		expect(response.status).toBe(401);
	});

	it('should reject invalid checkmate IDs', async () => {
		const cookie = (await integrationUtils.createAndLoginUser()).cookie;

		const response = await testRequest()
			.post('/api/update-checkmatelist')
			.set('Cookie', cookie)
			.send({ new_checkmate_beaten: 'INVALID-ID-123' });

		expect(response.status).toBe(400);
		// expect(response.body.message).toBe('Invalid checkmate ID');
	});

	it('should allow a logged-in user to save a new checkmate', async () => {
		const user = await integrationUtils.createAndLoginUser();

		const response = await testRequest()
			.post('/api/update-checkmatelist')
			.set('Cookie', user.cookie)
			.send({ new_checkmate_beaten: VALID_CHECKMATE_ID });
		expect(response.status).toBe(200);

		// Check DB Side Effect
		const record = getMemberDataByCriteria(['checkmates_beaten'], 'username', user.username);
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
		const user = await integrationUtils.createAndLoginUser();

		const secondCheckmateId = validcheckmates.validCheckmates.easy[1];
		if (!secondCheckmateId) throw new Error('Not enough valid checkmate IDs for this test!');

		// 1. Submit First Checkmate
		await testRequest()
			.post('/api/update-checkmatelist')
			.set('Cookie', user.cookie)
			.send({ new_checkmate_beaten: VALID_CHECKMATE_ID });

		// 2. Submit Second Checkmate
		const response = await testRequest()
			.post('/api/update-checkmatelist')
			.set('Cookie', user.cookie)
			.send({ new_checkmate_beaten: secondCheckmateId });

		expect(response.status).toBe(200);

		// DB should have both IDs stored correctly
		const record = getMemberDataByCriteria(['checkmates_beaten'], 'username', user.username);
		expect(record?.checkmates_beaten).toBe([VALID_CHECKMATE_ID, secondCheckmateId].join(','));
	});

	it('should handle duplicate checkmate submissions gracefully', async () => {
		const user = await integrationUtils.createAndLoginUser();

		// 1. Submit First Time
		await testRequest()
			.post('/api/update-checkmatelist')
			.set('Cookie', user.cookie)
			.send({ new_checkmate_beaten: VALID_CHECKMATE_ID });

		// 2. Submit Same ID Again
		const response = await testRequest()
			.post('/api/update-checkmatelist')
			.set('Cookie', user.cookie)
			.send({ new_checkmate_beaten: VALID_CHECKMATE_ID });

		// Should now be 204 No Content, indicating no change in state
		expect(response.status).toBe(204);

		// DB should still only have it once (no duplicates like "ID,ID")
		const record = getMemberDataByCriteria(['checkmates_beaten'], 'username', user.username);
		expect(record?.checkmates_beaten).toBe(VALID_CHECKMATE_ID);
	});
});
