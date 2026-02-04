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

			const position1 = {
				name: 'A simple position',
				piece_count: 32,
				timestamp: Date.now(),
				icn: 'icn-data-1',
				pawn_double_push: true,
				castling: true,
			};

			const position2 = {
				name: 'Another simple position',
				piece_count: 76,
				timestamp: Date.now(),
				icn: 'icn-data-2',
				pawn_double_push: false,
				castling: true,
			};

			// Save positions to the database through the API
			await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send(position1);

			await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send(position2);

			const response = await testRequest()
				.get('/api/editor-saves')
				.set('Cookie', user.cookie);

			expect(response.status).toBe(200);
			expect(response.body.saves).toMatchObject([
				{
					name: position1.name,
					piece_count: position1.piece_count,
					timestamp: position1.timestamp,
				},
				{
					name: position2.name,
					piece_count: position2.piece_count,
					timestamp: position2.timestamp,
				},
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

			const position = {
				name: 'Test Position',
				piece_count: 32,
				timestamp: Date.now(),
				icn: 'test-icn-data',
				pawn_double_push: true,
				castling: false,
			};

			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send(position);

			expect(response.status).toBe(201);
			expect(response.body).toMatchObject({ success: true });

			// Verify the position was actually saved to the database
			const saves = editorSavesManager.getAllSavedPositionsForUser(user.user_id);
			expect(saves[0]).toMatchObject({
				name: position.name,
				piece_count: position.piece_count,
				timestamp: position.timestamp,
			});
		});

		it('should return 400 if name is missing', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({
					piece_count: 10,
					timestamp: Date.now(),
					icn: 'test-icn-data',
					pawn_double_push: true,
					castling: true,
				});

			expect(response.status).toBe(400);
		});

		it('should return 400 if name is empty', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({
					name: '',
					piece_count: 13,
					timestamp: Date.now(),
					icn: 'test-icn-data',
					pawn_double_push: false,
					castling: false,
				});

			expect(response.status).toBe(400);
		});

		it('should return 400 if name exceeds max length', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const longName = 'a'.repeat(editorutil.POSITION_NAME_MAX_LENGTH + 1);

			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({
					name: longName,
					piece_count: 13,
					timestamp: Date.now(),
					icn: 'test-icn-data',
					pawn_double_push: true,
					castling: true,
				});

			expect(response.status).toBe(400);
		});

		it('should return 400 if icn is missing', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({
					name: 'Test Position',
					piece_count: 13,
					timestamp: Date.now(),
					pawn_double_push: true,
					castling: true,
				});

			expect(response.status).toBe(400);
		});

		it('should return 400 if icn is empty', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({
					name: 'Test Position',
					piece_count: 0,
					timestamp: Date.now(),
					icn: '',
					pawn_double_push: false,
					castling: false,
				});

			expect(response.status).toBe(400);
		});

		it('should return 400 if icn exceeds max length', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const longIcn = 'a'.repeat(EditorSavesAPI.MAX_ICN_LENGTH + 1);

			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({
					name: 'Test Position',
					piece_count: 278_569,
					timestamp: Date.now(),
					icn: longIcn,
					pawn_double_push: true,
					castling: false,
				});

			expect(response.status).toBe(400);
		});

		it('should return 403 if quota is exceeded', async () => {
			const user = await integrationUtils.createAndLoginUser();

			// Add 50 positions to reach the quota limit
			for (let i = 0; i < editorSavesManager.MAX_SAVED_POSITIONS; i++) {
				await testRequest()
					.post('/api/editor-saves')
					.set('Cookie', user.cookie)
					.send({
						name: `Position ${i}`,
						piece_count: 8,
						timestamp: Date.now(),
						icn: 'test-icn',
						pawn_double_push: true,
						castling: true,
					});
			}

			// Try to add one more, should fail
			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({
					name: 'Test Position',
					piece_count: 13,
					timestamp: Date.now(),
					icn: 'test-icn-data',
					pawn_double_push: false,
					castling: false,
				});

			expect(response.status).toBe(403);
		});

		it('should overwrite position if name already exists', async () => {
			const user = await integrationUtils.createAndLoginUser();

			// Save first position
			await testRequest().post('/api/editor-saves').set('Cookie', user.cookie).send({
				name: 'Duplicate Name',
				piece_count: 10,
				timestamp: 1000,
				icn: 'test-icn-1',
				pawn_double_push: true,
				castling: false,
			});

			// Save another position with the same name but different data
			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({
					name: 'Duplicate Name',
					piece_count: 20,
					timestamp: 2000,
					icn: 'test-icn-2',
					pawn_double_push: false,
					castling: true,
				});

			// Should succeed
			expect(response.status).toBe(201);

			// Verify only one position exists with the new data
			const saves = editorSavesManager.getAllSavedPositionsForUser(user.user_id);
			expect(saves).toMatchObject([
				{
					name: 'Duplicate Name',
					piece_count: 20,
					timestamp: 2000,
				},
			]);

			// Verify the ICN was also overwritten
			const icnData = editorSavesManager.getSavedPositionICN('Duplicate Name', user.user_id);
			expect(icnData?.icn).toBe('test-icn-2');
			expect(icnData?.pawn_double_push).toBe(0);
			expect(icnData?.castling).toBe(1);
		});

		it('should return 401 if user is not authenticated', async () => {
			const response = await testRequest().post('/api/editor-saves').send({
				name: 'Test Position',
				piece_count: 13,
				timestamp: Date.now(),
				icn: 'test-icn-data',
				pawn_double_push: true,
				castling: true,
			});

			expect(response.status).toBe(401);
		});

		it('should return 400 if timestamp is missing', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({
					name: 'Test Position',
					piece_count: 13,
					icn: 'test-icn-data',
					pawn_double_push: true,
					castling: true,
				});

			expect(response.status).toBe(400);
		});

		it('should return 400 if piece_count is missing', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({
					name: 'Test Position',
					timestamp: Date.now(),
					icn: 'test-icn-data',
					pawn_double_push: true,
					castling: true,
				});

			expect(response.status).toBe(400);
		});

		it('should return 400 if pawn_double_push is missing', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({
					name: 'Test Position',
					piece_count: 13,
					timestamp: Date.now(),
					icn: 'test-icn-data',
					castling: true,
				});

			expect(response.status).toBe(400);
		});

		it('should return 400 if castling is missing', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({
					name: 'Test Position',
					piece_count: 13,
					timestamp: Date.now(),
					icn: 'test-icn-data',
					pawn_double_push: true,
				});

			expect(response.status).toBe(400);
		});
	});

	describe('GET /api/editor-saves/:position_name', () => {
		it('should return position ICN if user owns it', async () => {
			const user = await integrationUtils.createAndLoginUser();

			// Save a position first
			await testRequest().post('/api/editor-saves').set('Cookie', user.cookie).send({
				name: 'Test Position',
				piece_count: 13,
				timestamp: Date.now(),
				icn: 'test-icn-data',
				pawn_double_push: true,
				castling: false,
			});

			const response = await testRequest()
				.get(`/api/editor-saves/${encodeURIComponent('Test Position')}`)
				.set('Cookie', user.cookie);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				icn: 'test-icn-data',
				pawn_double_push: 1,
				castling: 0,
			});
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
			await testRequest().post('/api/editor-saves').set('Cookie', user.cookie).send({
				name: 'Position With Spaces',
				piece_count: 16,
				timestamp: Date.now(),
				icn: 'test-icn-spaces',
				pawn_double_push: false,
				castling: true,
			});

			const response = await testRequest()
				.get(`/api/editor-saves/${encodeURIComponent('Position With Spaces')}`)
				.set('Cookie', user.cookie);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				icn: 'test-icn-spaces',
				pawn_double_push: 0,
				castling: 1,
			});
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
			await testRequest().post('/api/editor-saves').set('Cookie', user.cookie).send({
				name: 'Test Position',
				piece_count: 13,
				timestamp: Date.now(),
				icn: 'test-icn-data',
				pawn_double_push: true,
				castling: true,
			});

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
			await testRequest().post('/api/editor-saves').set('Cookie', user.cookie).send({
				name: 'Position With Spaces',
				piece_count: 8,
				timestamp: Date.now(),
				icn: 'test-icn',
				pawn_double_push: false,
				castling: false,
			});

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
					piece_count: 250_592,
					timestamp: Date.now(),
					icn: maxLengthIcn,
					pawn_double_push: true,
					castling: false,
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
				.send({
					name: maxLengthName,
					piece_count: 4,
					timestamp: Date.now(),
					icn: 'test',
					pawn_double_push: false,
					castling: true,
				});

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
				.send({
					name: 'Test',
					piece_count: 100,
					timestamp: Date.now(),
					icn,
					pawn_double_push: true,
					castling: true,
				});

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
				.send({
					name: 'Same Name',
					piece_count: 10,
					timestamp: Date.now(),
					icn: 'icn-user1',
					pawn_double_push: true,
					castling: false,
				});

			const response2 = await testRequest()
				.post('/api/editor-saves')
				.set('Cookie', user2.cookie)
				.send({
					name: 'Same Name',
					piece_count: 10,
					timestamp: Date.now(),
					icn: 'icn-user2',
					pawn_double_push: false,
					castling: true,
				});

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
