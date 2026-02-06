// src/server/api/Prefs.int.test.ts

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';

import { getMemberDataByCriteria } from '../database/memberManager.js';
import { generateTables, clearAllTables } from '../database/databaseTables.js';

import { testRequest } from '../../tests/testRequest.js';
import integrationUtils from '../../tests/integrationUtils.js';

/** An example of valid preferences. */
const VALID_PREFS_1 = {
	theme: 'wood_light',
	legal_moves: 'dots',
	animations: false,
	lingering_annotations: true,
} as const;

/** Another example of valid preferences. */
const VALID_PREFS_2 = {
	theme: 'sandstone',
	legal_moves: 'squares',
	animations: true,
	lingering_annotations: false,
} as const;

describe('Preferences Integration', () => {
	// Runs once at the very start of this file
	beforeAll(() => {
		generateTables();
	});

	// Runs before EVERY single 'it' block
	beforeEach(() => {
		clearAllTables();
	});

	it('should verify middleware sets preferences cookie on GET request', async () => {
		const cookie = (await integrationUtils.createAndLoginUser()).cookie;

		// 1. Manually set prefs in DB first (so we have something to fetch)
		// Since we can't easily inject into DB without the API, we'll use the API first
		await testRequest()
			.post('/api/set-preferences')
			.set('Cookie', cookie)
			.send({ preferences: VALID_PREFS_1 });

		// 2. Now test the GET request (HTML request)
		const response = await testRequest()
			.get('/') // Hitting the homepage (or any HTML route)
			.set('Cookie', cookie);
		// .set('Accept', 'text/html');

		// CAN'T KEEP THIS, because if `dist/` is not built, it will 404. Tests should NOT depend on the build process.
		// Luckily, the cookie is still set before then.
		// expect(response.status).toBe(200);

		const cookies = response.headers['set-cookie'] as unknown as string[]; // set-cookie is actually an array
		// Verify 'preferences' cookie is set and matches what we saved
		const prefCookie = cookies.find((c) => c.startsWith('preferences='));
		expect(prefCookie).toBeDefined();

		const prefValue = JSON.parse(decodeURIComponent(prefCookie!.split(';')[0]!.split('=')[1]!));
		expect(prefValue).toMatchObject(VALID_PREFS_1);
	});

	it('should reject request with no body', async () => {
		const cookie = (await integrationUtils.createAndLoginUser()).cookie;

		const response = await testRequest().post('/api/set-preferences').set('Cookie', cookie);

		expect(response.status).toBe(400);
	});

	it('should reject request with missing preferences', async () => {
		const cookie = (await integrationUtils.createAndLoginUser()).cookie;

		const response = await testRequest()
			.post('/api/set-preferences')
			.set('Cookie', cookie)
			.send({}); // No preferences

		expect(response.status).toBe(400);
	});

	it('should reject requests from unauthenticated users', async () => {
		const response = await testRequest()
			.post('/api/set-preferences')
			.send({ preferences: VALID_PREFS_1 });

		expect(response.status).toBe(401);
	});

	it('should reject invalid preferences', async () => {
		const cookie = (await integrationUtils.createAndLoginUser()).cookie;

		const invalidPrefs = {
			theme: 'invalid-theme-name',
			legal_moves: 'triangles', // Invalid shape
			animations: 'yes', // Should be boolean
		};

		const response = await testRequest()
			.post('/api/set-preferences')
			.set('Cookie', cookie)
			.send({ preferences: invalidPrefs });

		expect(response.status).toBe(400);
	});

	it('should allow logged-in user to save valid preferences', async () => {
		const user = await integrationUtils.createAndLoginUser();

		const response = await testRequest()
			.post('/api/set-preferences')
			.set('Cookie', user.cookie)
			.send({ preferences: VALID_PREFS_1 });

		expect(response.status).toBe(200);

		// Verify DB update
		const record = getMemberDataByCriteria(['preferences'], 'username', user.username);
		expect(record).toBeDefined();
		const savedPrefs = record!.preferences === null ? null : JSON.parse(record!.preferences);
		expect(savedPrefs).toMatchObject(VALID_PREFS_1);
	});

	it('should overwrite existing preferences', async () => {
		const user = await integrationUtils.createAndLoginUser();

		// 1. Save initial preferences
		await testRequest()
			.post('/api/set-preferences')
			.set('Cookie', user.cookie)
			.send({ preferences: VALID_PREFS_1 });

		// 2. Save new preferences to overwrite
		const response = await testRequest()
			.post('/api/set-preferences')
			.set('Cookie', user.cookie)
			.send({ preferences: VALID_PREFS_2 });

		expect(response.status).toBe(200);

		// Verify DB update
		const record = getMemberDataByCriteria(['preferences'], 'username', user.username);
		expect(record).toBeDefined();
		const savedPrefs = record!.preferences === null ? null : JSON.parse(record!.preferences);
		expect(savedPrefs).toMatchObject(VALID_PREFS_2);
	});
});
