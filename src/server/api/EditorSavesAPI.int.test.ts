// src/server/api/EditorSavesAPI.int.test.ts

/**
 * Integration tests for the EditorSavesAPI endpoints.
 *
 * This test suite verifies that the editor saves API endpoints work correctly,
 * including authentication, validation, quota limits, and ownership verification.
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';

import editorutil from '../../shared/editor/editorutil.js';
import EditorSavesAPI from './EditorSavesAPI.js';
import integrationUtils from '../../tests/integrationUtils.js';
import editorSavesManager from '../database/editorSavesManager.js';
import { testRequest } from '../../tests/testRequest.js';
import { generateTables, clearAllTables } from '../database/databaseTables.js';
import { generateAccount } from '../controllers/createAccountController.js';

describe('EditorSavesAPI Integration', () => {
	// Runs once at the very start of this file
	beforeAll(() => {
		generateTables();
	});

	// Runs before EVERY single 'it' block
	beforeEach(() => {
		clearAllTables();
	});

	describe('GET /api/editor-saves', () => {
		it('should return all saved positions for authenticated user', async () => {
			const user = await integrationUtils.createAndLoginUser();

			// Save positions to the database through the API
			await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'A simple position', icn: 'icn-data-1' });

			await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Another simple position', icn: 'icn-data-2.0' });

			const response = await testRequest()
				.get('/api/editor-saves')
				.set('Cookie', user.cookie);

			expect(response.status).toBe(200);
			expect(response.body.saves).toMatchObject([
				{ name: 'A simple position', piece_count: 10 }, // 'icn-data-1'.length = 10
				{ name: 'Another simple position', piece_count: 12 }, // 'icn-data-2.0'.length = 12
			]);
		});

		it('should return 401 if user is not authenticated', async () => {
			const response = await testRequest().get('/api/editor-saves');

			expect(response.status).toBe(401);
		});
	});

	describe('POST /api/editor-saves', () => {
		it('should save a new position successfully', async () => {
			const user = await integrationUtils.createAndLoginUser();

			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Test Position', icn: 'test-icn-data' });

			expect(response.status).toBe(201);
			expect(response.body).toMatchObject({ success: true });

			// Verify the position was actually saved to the database
			const saves = editorSavesManager.getAllSavedPositionsForUser(user.user_id);
			expect(saves[0]).toMatchObject({ name: 'Test Position', piece_count: 13 }); // 'test-icn-data'.length = 13
		});

		it('should return 400 if name is missing', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ icn: 'test-icn-data' });

			expect(response.status).toBe(400);
		});

		it('should return 400 if name is empty', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: '', icn: 'test-icn-data' });

			expect(response.status).toBe(400);
		});

		it('should return 400 if name exceeds max length', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const longName = 'a'.repeat(editorutil.POSITION_NAME_MAX_LENGTH + 1);

			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: longName, icn: 'test-icn-data' });

			expect(response.status).toBe(400);
		});

		it('should return 400 if icn is missing', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Test Position' });

			expect(response.status).toBe(400);
		});

		it('should return 400 if icn is empty', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Test Position', icn: '' });

			expect(response.status).toBe(400);
		});

		it('should return 400 if icn exceeds max length', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const longIcn = 'a'.repeat(EditorSavesAPI.MAX_ICN_LENGTH + 1);

			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Test Position', icn: longIcn });

			expect(response.status).toBe(400);
		});

		it('should return 403 if quota is exceeded', async () => {
			const user = await integrationUtils.createAndLoginUser();

			// Add 50 positions to reach the quota limit
			for (let i = 0; i < editorSavesManager.MAX_SAVED_POSITIONS; i++) {
				await testRequest()
					.post('/api/editor-saves')
					.set('Cookie', user.cookie)
					.send({ name: `Position ${i}`, icn: 'test-icn' });
			}

			// Try to add one more, should fail
			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Test Position', icn: 'test-icn-data' });

			expect(response.status).toBe(403);
		});

		it('should return 409 if position name already exists', async () => {
			const user = await integrationUtils.createAndLoginUser();

			// Save first position
			await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Duplicate Name', icn: 'test-icn-1' });

			// Try to save another position with the same name
			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Duplicate Name', icn: 'test-icn-2' });

			expect(response.status).toBe(409);
		});

		it('should return 401 if user is not authenticated', async () => {
			const response = await testRequest()
				.post('/api/editor-saves')
				.send({ name: 'Test Position', icn: 'test-icn-data' });

			expect(response.status).toBe(401);
		});
	});

	describe('GET /api/editor-saves/:position_name', () => {
		it('should return position ICN if user owns it', async () => {
			const user = await integrationUtils.createAndLoginUser();

			// Save a position first
			await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Test Position', icn: 'test-icn-data' });

			const response = await testRequest()
				.get(`/api/editor-saves/${encodeURIComponent('Test Position')}`)
				.set('Cookie', user.cookie);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ icn: 'test-icn-data' });
		});

		it('should return 404 if position not found or not owned', async () => {
			const user = await integrationUtils.createAndLoginUser();

			const response = await testRequest()
				.get(`/api/editor-saves/${encodeURIComponent('Nonexistent Position')}`)
				.set('Cookie', user.cookie);

			expect(response.status).toBe(404);
		});

		it('should handle position names with spaces', async () => {
			const user = await integrationUtils.createAndLoginUser();

			// Save a position with spaces in the name
			await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Position With Spaces', icn: 'test-icn-spaces' });

			const response = await testRequest()
				.get(`/api/editor-saves/${encodeURIComponent('Position With Spaces')}`)
				.set('Cookie', user.cookie);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ icn: 'test-icn-spaces' });
		});

		it('should return 401 if user is not authenticated', async () => {
			const response = await testRequest().get(
				`/api/editor-saves/${encodeURIComponent('Test Position')}`,
			);

			expect(response.status).toBe(401);
		});
	});

	describe('DELETE /api/editor-saves/:position_name', () => {
		it('should delete position successfully', async () => {
			const user = await integrationUtils.createAndLoginUser();

			// Save a position first
			await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Test Position', icn: 'test-icn-data' });

			const response = await testRequest()
				.delete(`/api/editor-saves/${encodeURIComponent('Test Position')}`)
				.set('Cookie', user.cookie);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });

			// Verify the position was actually deleted from the database
			const saves = editorSavesManager.getAllSavedPositionsForUser(user.user_id);
			expect(saves).toHaveLength(0);
		});

		it('should return 404 if position not found or not owned', async () => {
			const user = await integrationUtils.createAndLoginUser();

			const response = await testRequest()
				.delete(`/api/editor-saves/${encodeURIComponent('Nonexistent Position')}`)
				.set('Cookie', user.cookie);

			expect(response.status).toBe(404);
		});

		it('should handle position names with spaces', async () => {
			const user = await integrationUtils.createAndLoginUser();

			// Save a position with spaces
			await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Position With Spaces', icn: 'test-icn' });

			const response = await testRequest()
				.delete(`/api/editor-saves/${encodeURIComponent('Position With Spaces')}`)
				.set('Cookie', user.cookie);

			expect(response.status).toBe(200);
		});

		it('should return 401 if user is not authenticated', async () => {
			const response = await testRequest().delete(
				`/api/editor-saves/${encodeURIComponent('Test Position')}`,
			);

			expect(response.status).toBe(401);
		});
	});

	describe('PATCH /api/editor-saves/:position_name', () => {
		it('should rename position successfully', async () => {
			const user = await integrationUtils.createAndLoginUser();

			// Save a position first
			await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Old Name', icn: 'test-icn-data' });

			const response = await testRequest()
				.patch(`/api/editor-saves/${encodeURIComponent('Old Name')}`)
				.set('Cookie', user.cookie)
				.send({ name: 'New Name' });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });

			// Verify the position was actually renamed in the database
			const saves = editorSavesManager.getAllSavedPositionsForUser(user.user_id);
			expect(saves[0]?.name).toBe('New Name');
		});

		it('should return 404 if position not found or not owned', async () => {
			const user = await integrationUtils.createAndLoginUser();

			const response = await testRequest()
				.patch(`/api/editor-saves/${encodeURIComponent('Nonexistent Position')}`)
				.set('Cookie', user.cookie)
				.send({ name: 'New Name' });

			expect(response.status).toBe(404);
		});

		it('should return 409 if new name already exists', async () => {
			const user = await integrationUtils.createAndLoginUser();

			// Save two positions
			await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Position 1', icn: 'test-icn-1' });

			await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Position 2', icn: 'test-icn-2' });

			// Try to rename Position 1 to Position 2 (which already exists)
			const response = await testRequest()
				.patch(`/api/editor-saves/${encodeURIComponent('Position 1')}`)
				.set('Cookie', user.cookie)
				.send({ name: 'Position 2' });

			expect(response.status).toBe(409);
			expect(response.body.error).toBe('Position name already exists');
		});

		it('should return 400 if name is missing', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest()
				.patch(`/api/editor-saves/${encodeURIComponent('Old Name')}`)
				.set('Cookie', user.cookie)
				.send({});

			expect(response.status).toBe(400);
		});

		it('should return 400 if name is empty', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest()
				.patch(`/api/editor-saves/${encodeURIComponent('Old Name')}`)
				.set('Cookie', user.cookie)
				.send({ name: '' });

			expect(response.status).toBe(400);
		});

		it('should return 400 if name exceeds max length', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const longName = 'a'.repeat(editorutil.POSITION_NAME_MAX_LENGTH + 1);

			const response = await testRequest()
				.patch(`/api/editor-saves/${encodeURIComponent('Old Name')}`)
				.set('Cookie', user.cookie)
				.send({ name: longName });

			expect(response.status).toBe(400);
		});

		it('should handle position names with spaces', async () => {
			const user = await integrationUtils.createAndLoginUser();

			// Save a position with spaces
			await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Old Name With Spaces', icn: 'test-icn' });

			const response = await testRequest()
				.patch(`/api/editor-saves/${encodeURIComponent('Old Name With Spaces')}`)
				.set('Cookie', user.cookie)
				.send({ name: 'New Name With Spaces' });

			expect(response.status).toBe(200);

			// Verify the rename worked
			const saves = editorSavesManager.getAllSavedPositionsForUser(user.user_id);
			expect(saves[0]?.name).toBe('New Name With Spaces');
		});

		it('should return 401 if user is not authenticated', async () => {
			const response = await testRequest()
				.patch(`/api/editor-saves/${encodeURIComponent('Old Name')}`)
				.send({ name: 'New Name' });

			expect(response.status).toBe(401);
		});
	});

	describe('Edge cases and integration', () => {
		it('should handle very long ICN within limit', async () => {
			const user = await integrationUtils.createAndLoginUser();

			const maxLengthIcn = 'a'.repeat(EditorSavesAPI.MAX_ICN_LENGTH);

			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Test', icn: maxLengthIcn });

			expect(response.status).toBe(201);

			// Verify it was saved correctly
			const saves = editorSavesManager.getAllSavedPositionsForUser(user.user_id);
			expect(saves[0]?.piece_count).toBe(EditorSavesAPI.MAX_ICN_LENGTH);
		});

		it('should handle name at max length', async () => {
			const user = await integrationUtils.createAndLoginUser();

			const maxLengthName = 'a'.repeat(editorutil.POSITION_NAME_MAX_LENGTH);

			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: maxLengthName, icn: 'test' });

			expect(response.status).toBe(201);

			// Verify it was saved correctly
			const saves = editorSavesManager.getAllSavedPositionsForUser(user.user_id);
			expect(saves[0]?.name).toBe(maxLengthName);
		});

		it('should calculate piece_count correctly from ICN length', async () => {
			const user = await integrationUtils.createAndLoginUser();

			const icn = '12345';

			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Test', icn });

			expect(response.status).toBe(201);

			// Verify the piece_count was calculated correctly
			const saves = editorSavesManager.getAllSavedPositionsForUser(user.user_id);
			expect(saves[0]?.piece_count).toBe(5);
		});

		it('should allow two different users to have positions with the same name', async () => {
			// Create first user with unique name to avoid conflicts
			const user1Username = `ChessMaster${Math.random().toString(36).substring(2, 10)}`;
			const user1_id = await generateAccount({
				username: user1Username,
				email: `${user1Username}@example.com`,
				password: 'Password123!',
				autoVerify: true,
			});

			const loginResponse1 = await testRequest()
				.post('/auth')
				.send({ username: user1Username, password: 'Password123!' });

			const cookies1 = loginResponse1.headers['set-cookie'] as unknown as string[];
			const jwt1 = cookies1.find((c) => c.startsWith('jwt='));
			const memberInfo1 = cookies1.find((c) => c.startsWith('memberInfo='));
			const user1Cookie = [jwt1, memberInfo1].filter(Boolean).join(';');

			// Create second user with unique name
			const user2Username = `ChessGrandmaster${Math.random().toString(36).substring(2, 10)}`;
			const user2_id = await generateAccount({
				username: user2Username,
				email: `${user2Username}@example.com`,
				password: 'Password123!',
				autoVerify: true,
			});

			const loginResponse2 = await testRequest()
				.post('/auth')
				.send({ username: user2Username, password: 'Password123!' });

			const cookies2 = loginResponse2.headers['set-cookie'] as unknown as string[];
			const jwt2 = cookies2.find((c) => c.startsWith('jwt='));
			const memberInfo2 = cookies2.find((c) => c.startsWith('memberInfo='));
			const user2Cookie = [jwt2, memberInfo2].filter(Boolean).join(';');

			// Both users save a position with the same name
			const response1 = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user1Cookie)
				.send({ name: 'Same Name', icn: 'icn-user1' });

			const response2 = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user2Cookie)
				.send({ name: 'Same Name', icn: 'icn-user2' });

			expect(response1.status).toBe(201);
			expect(response2.status).toBe(201);

			// Verify both positions exist independently
			const saves1 = editorSavesManager.getAllSavedPositionsForUser(user1_id);
			const saves2 = editorSavesManager.getAllSavedPositionsForUser(user2_id);

			expect(saves1).toHaveLength(1);
			expect(saves2).toHaveLength(1);
			expect(saves1[0]?.name).toBe('Same Name');
			expect(saves2[0]?.name).toBe('Same Name');
		});
	});
});
