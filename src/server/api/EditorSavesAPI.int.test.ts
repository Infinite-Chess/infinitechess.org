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
				.send({ name: 'A simple position', icn: 'icn-data-1', piece_count: 32 });

			await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Another simple position', icn: 'icn-data-2', piece_count: 76 });

			const response = await testRequest()
				.get('/api/editor-saves')
				.set('Cookie', user.cookie);

			expect(response.status).toBe(200);
			expect(response.body.saves).toMatchObject([
				{ name: 'A simple position', piece_count: 32 },
				{ name: 'Another simple position', piece_count: 76 },
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
				.send({ name: 'Test Position', icn: 'test-icn-data', piece_count: 32 });

			expect(response.status).toBe(201);
			expect(response.body).toMatchObject({ success: true });

			// Verify the position was actually saved to the database
			const saves = editorSavesManager.getAllSavedPositionsForUser(user.user_id);
			expect(saves[0]).toMatchObject({ name: 'Test Position', piece_count: 32 });
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
				.send({ name: '', icn: 'test-icn-data', piece_count: 13 });

			expect(response.status).toBe(400);
		});

		it('should return 400 if name exceeds max length', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const longName = 'a'.repeat(editorutil.POSITION_NAME_MAX_LENGTH + 1);

			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: longName, icn: 'test-icn-data', piece_count: 13 });

			expect(response.status).toBe(400);
		});

		it('should return 400 if icn is missing', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Test Position', piece_count: 13 });

			expect(response.status).toBe(400);
		});

		it('should return 400 if icn is empty', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Test Position', icn: '', piece_count: 0 });

			expect(response.status).toBe(400);
		});

		it('should return 400 if icn exceeds max length', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const longIcn = 'a'.repeat(EditorSavesAPI.MAX_ICN_LENGTH + 1);

			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Test Position', icn: longIcn, piece_count: 278_569 });

			expect(response.status).toBe(400);
		});

		it('should return 403 if quota is exceeded', async () => {
			const user = await integrationUtils.createAndLoginUser();

			// Add 50 positions to reach the quota limit
			for (let i = 0; i < editorSavesManager.MAX_SAVED_POSITIONS; i++) {
				await testRequest()
					.post('/api/editor-saves')
					.set('Cookie', user.cookie)
					.send({ name: `Position ${i}`, icn: 'test-icn', piece_count: 8 });
			}

			// Try to add one more, should fail
			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Test Position', icn: 'test-icn-data', piece_count: 13 });

			expect(response.status).toBe(403);
		});

		it('should return 409 if position name already exists', async () => {
			const user = await integrationUtils.createAndLoginUser();

			// Save first position
			await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Duplicate Name', icn: 'test-icn-1', piece_count: 10 });

			// Try to save another position with the same name
			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Duplicate Name', icn: 'test-icn-2', piece_count: 10 });

			expect(response.status).toBe(409);
		});

		it('should return 401 if user is not authenticated', async () => {
			const response = await testRequest()
				.post('/api/editor-saves')
				.send({ name: 'Test Position', icn: 'test-icn-data', piece_count: 13 });

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
				.send({ name: 'Test Position', icn: 'test-icn-data', piece_count: 13 });

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
				.send({ name: 'Position With Spaces', icn: 'test-icn-spaces', piece_count: 16 });

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
				.send({ name: 'Test Position', icn: 'test-icn-data', piece_count: 13 });

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
				.send({ name: 'Position With Spaces', icn: 'test-icn', piece_count: 8 });

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

	describe('Edge cases and integration', () => {
		it('should handle very long ICN within limit', async () => {
			const user = await integrationUtils.createAndLoginUser();

			const maxLengthIcn = 'a'.repeat(EditorSavesAPI.MAX_ICN_LENGTH);

			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({
					name: 'Test',
					icn: maxLengthIcn,
					piece_count: 250_592,
				});

			expect(response.status).toBe(201);

			// Verify it was saved correctly
			const save = editorSavesManager.getSavedPositionICN('Test', user.user_id);
			expect(save?.icn).toBe(maxLengthIcn);
		});

		it('should handle name at max length', async () => {
			const user = await integrationUtils.createAndLoginUser();

			const maxLengthName = 'a'.repeat(editorutil.POSITION_NAME_MAX_LENGTH);

			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: maxLengthName, icn: 'test', piece_count: 4 });

			expect(response.status).toBe(201);

			// Verify it was saved correctly
			const saves = editorSavesManager.getAllSavedPositionsForUser(user.user_id);
			expect(saves[0]?.name).toBe(maxLengthName);
		});

		it('should receive piece_count from client', async () => {
			const user = await integrationUtils.createAndLoginUser();

			const icn = '12345';

			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Test', icn, piece_count: 100 });

			expect(response.status).toBe(201);

			// Verify the piece_count was set correctly from client
			const saves = editorSavesManager.getAllSavedPositionsForUser(user.user_id);
			expect(saves[0]?.piece_count).toBe(100);
		});

		it('should allow two different users to have positions with the same name', async () => {
			const user1 = await integrationUtils.createAndLoginUser();
			const user2 = await integrationUtils.createAndLoginUser();

			// Both users save a position with the same name
			const response1 = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user1.cookie)
				.send({ name: 'Same Name', icn: 'icn-user1', piece_count: 10 });

			const response2 = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user2.cookie)
				.send({ name: 'Same Name', icn: 'icn-user2', piece_count: 10 });

			expect(response1.status).toBe(201);
			expect(response2.status).toBe(201);

			// Verify both positions exist independently
			const saves1 = editorSavesManager.getAllSavedPositionsForUser(user1.user_id);
			const saves2 = editorSavesManager.getAllSavedPositionsForUser(user2.user_id);

			expect(saves1[0]?.name).toBe('Same Name');
			expect(saves2[0]?.name).toBe('Same Name');
		});
	});
});
