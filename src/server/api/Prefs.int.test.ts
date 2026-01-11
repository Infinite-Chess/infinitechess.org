// src/server/api/Prefs.int.test.ts

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';

import app from '../app.js';
import { generateTables, clearAllTables } from '../database/databaseTables.js';
import { generateAccount } from '../controllers/createAccountController.js';
import { getMemberDataByCriteria } from '../database/memberManager.js';

describe('Preferences Integration', () => {
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
			username: 'PrefUser',
			email: 'pref@example.com',
			password: 'Password123!',
			autoVerify: true,
		});

		const response = await request(app)
			.post('/auth')
			.set('X-Forwarded-Proto', 'https')
			.send({ username: 'PrefUser', password: 'Password123!' });

		const cookies = response.headers['set-cookie'] as unknown as string[]; // set-cookie is actually an array
		const jwt = cookies.find((c) => c.startsWith('jwt='));
		const memberInfo = cookies.find((c) => c.startsWith('memberInfo='));

		if (!jwt || !memberInfo) throw new Error('Missing login cookies');

		return [jwt, memberInfo].join(';');
	}

	/** An example of valid preferences. */
	const VALID_PREFS = {
		theme: 'wood_light',
		legal_moves: 'dots',
		animations: false,
		lingering_annotations: true,
		premove_enabled: true,
	} as const;

	/** Another example of valid preferences. */
	const VALID_PREFS_2 = {
		theme: 'sandstone',
		legal_moves: 'squares',
		animations: true,
		lingering_annotations: false,
		premove_enabled: false,
	} as const;

	it('should verify middleware sets preferences cookie on GET request', async () => {
		const cookie = await loginAndGetCookie();

		// 1. Manually set prefs in DB first (so we have something to fetch)
		// Since we can't easily inject into DB without the API, we'll use the API first
		await request(app)
			.post('/api/set-preferences')
			.set('Cookie', cookie)
			.set('X-Forwarded-Proto', 'https')
			.send({ preferences: VALID_PREFS });

		// 2. Now test the GET request (HTML request)
		const response = await request(app)
			.get('/') // Hitting the homepage (or any HTML route)
			.set('Cookie', cookie)
			.set('X-Forwarded-Proto', 'https'); // Fakes HTTPS to bypass middleware redirect
		// .set('Accept', 'text/html');

		expect(response.status).toBe(200);

		const cookies = response.headers['set-cookie'] as unknown as string[]; // set-cookie is actually an array
		// Verify 'preferences' cookie is set and matches what we saved
		const prefCookie = cookies.find((c) => c.startsWith('preferences='));
		expect(prefCookie).toBeDefined();

		const prefValue = JSON.parse(decodeURIComponent(prefCookie!.split(';')[0].split('=')[1]));
		expect(prefValue).toMatchObject(VALID_PREFS);
	});

	it('should reject request with no body', async () => {
		const cookie = await loginAndGetCookie();

		const response = await request(app)
			.post('/api/set-preferences')
			.set('Cookie', cookie)
			.set('X-Forwarded-Proto', 'https'); // Fakes HTTPS to bypass middleware redirect

		expect(response.status).toBe(400);
	});

	it('should reject request with missing preferences', async () => {
		const cookie = await loginAndGetCookie();

		const response = await request(app)
			.post('/api/set-preferences')
			.set('Cookie', cookie)
			.set('X-Forwarded-Proto', 'https') // Fakes HTTPS to bypass middleware redirect
			.send({}); // No preferences

		expect(response.status).toBe(400);
	});

	it('should reject requests from unauthenticated users', async () => {
		const response = await request(app)
			.post('/api/set-preferences')
			.set('X-Forwarded-Proto', 'https') // Fakes HTTPS to bypass middleware redirect
			.send({ preferences: VALID_PREFS });

		expect(response.status).toBe(401);
	});

	it('should reject invalid preferences', async () => {
		const cookie = await loginAndGetCookie();

		const invalidPrefs = {
			theme: 'invalid-theme-name',
			legal_moves: 'triangles', // Invalid shape
			animations: 'yes', // Should be boolean
		};

		const response = await request(app)
			.post('/api/set-preferences')
			.set('Cookie', cookie)
			.set('X-Forwarded-Proto', 'https') // Fakes HTTPS to bypass middleware redirect
			.send({ preferences: invalidPrefs });

		expect(response.status).toBe(400);
		expect(response.body.message).toMatch(/not valid/);
	});

	it('should allow logged-in user to save valid preferences', async () => {
		const cookie = await loginAndGetCookie();

		const response = await request(app)
			.post('/api/set-preferences')
			.set('Cookie', cookie)
			.set('X-Forwarded-Proto', 'https') // Fakes HTTPS to bypass middleware redirect
			.send({ preferences: VALID_PREFS });

		expect(response.status).toBe(200);

		// Verify DB update
		const record = getMemberDataByCriteria(['preferences'], 'username', 'PrefUser');
		expect(record).toBeDefined();
		const savedPrefs = record!.preferences === null ? null : JSON.parse(record!.preferences);
		expect(savedPrefs).toMatchObject(VALID_PREFS);
	});

	it('should overwrite existing preferences', async () => {
		const cookie = await loginAndGetCookie();

		// 1. Save initial preferences
		let response = await request(app)
			.post('/api/set-preferences')
			.set('Cookie', cookie)
			.set('X-Forwarded-Proto', 'https') // Fakes HTTPS to bypass middleware redirect
			.send({ preferences: VALID_PREFS });

		expect(response.status).toBe(200);

		// 2. Save new preferences to overwrite
		response = await request(app)
			.post('/api/set-preferences')
			.set('Cookie', cookie)
			.set('X-Forwarded-Proto', 'https') // Fakes HTTPS to bypass middleware redirect
			.send({ preferences: VALID_PREFS_2 });

		expect(response.status).toBe(200);

		// Verify DB update
		const record = getMemberDataByCriteria(['preferences'], 'username', 'PrefUser');
		expect(record).toBeDefined();
		const savedPrefs = record!.preferences === null ? null : JSON.parse(record!.preferences);
		expect(savedPrefs).toMatchObject(VALID_PREFS_2);
	});
});
