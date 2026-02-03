// src/server/controllers/loginController.int.test.ts

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';

import app from '../app.js';
import { testRequest } from '../../tests/testRequest.js';
import { generateAccount } from './createAccountController.js';
import { generateTables, clearAllTables } from '../database/databaseTables.js';

describe('Login Controller Integration', () => {
	// Runs once at the very start of this file
	beforeAll(() => {
		generateTables();
	});

	// Runs before EVERY single 'it' block
	beforeEach(() => {
		clearAllTables();
	});

	it('should reject login with no body', async () => {
		const response = await testRequest(app).post('/auth').send(); // No body

		expect(response.status).toBe(400);
	});

	it('should reject login with missing username', async () => {
		const response = await testRequest(app).post('/auth').send({ username: 'OnlyUserNoPass' }); // Missing password

		expect(response.status).toBe(400);
	});

	it('should reject login with missing password', async () => {
		const response = await testRequest(app).post('/auth').send({ password: 'OnlyPassNoUser' }); // Missing username

		expect(response.status).toBe(400);
	});

	it('should reject login with non-string username', async () => {
		const response = await testRequest(app)
			.post('/auth')
			.send({ username: 12345, password: 'SomePassword' }); // Non-string username

		expect(response.status).toBe(400);
	});

	it('should reject login with non-string password', async () => {
		const response = await testRequest(app)
			.post('/auth')
			.send({ username: 'SomeUser', password: 67890 }); // Non-string password

		expect(response.status).toBe(400);
	});

	it('should reject login for non-existent user', async () => {
		const response = await testRequest(app)
			.post('/auth')
			.send({ username: 'GhostUser', password: 'password123' });

		expect(response.status).toBe(401);
	});

	it('should reject login with incorrect password', async () => {
		// 1. Setup
		await generateAccount({
			username: 'RealUser',
			email: 'test@example.com',
			password: 'CorrectPassword!',
			autoVerify: true,
		});

		// 2. Test
		const response = await testRequest(app)
			.post('/auth')
			.send({ username: 'RealUser', password: 'WRONG_PASSWORD' });

		expect(response.status).toBe(401);
	});

	it('should login successfully with correct credentials', async () => {
		// 1. Setup
		await generateAccount({
			username: 'RealUser',
			email: 'test@example.com',
			password: 'CorrectPassword!',
			autoVerify: true,
		});

		// 2. Test
		const response = await testRequest(app)
			.post('/auth')
			.send({ username: 'RealUser', password: 'CorrectPassword!' });

		expect(response.status).toBe(200);

		// Ensure that the session cookies are set
		const cookies = response.headers['set-cookie'] as unknown as string[]; // set-cookie is actually an array

		expect(cookies).toBeDefined();
		expect(cookies.some((c) => c.startsWith('jwt='))).toBe(true);
		expect(cookies.some((c) => c.startsWith('memberInfo='))).toBe(true);
	});
});
