// src/server/api/EditorSavesAPI.unit.test.ts

/**
 * Tests for the EditorSavesAPI endpoints.
 *
 * This test suite verifies that the editor saves API endpoints work correctly,
 * including authentication, validation, quota limits, and ownership verification.
 */

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';

import app from '../app.js';
import editorutil from '../../shared/editor/editorutil.js';
import integrationUtils from '../../tests/integrationUtils.js';
import editorSavesManager from '../database/editorSavesManager.js';
import { testRequest } from '../../tests/testRequest.js';
import { generateTables, clearAllTables } from '../database/databaseTables.js';

// Mock the database manager
vi.mock('../database/editorSavesManager.js');

describe('EditorSavesAPI', () => {
	// Runs once at the very start of this file
	beforeAll(() => {
		generateTables();
	});

	// Runs before EVERY single 'it' block
	beforeEach(() => {
		clearAllTables();
		// Reset all mocks
		vi.clearAllMocks();
	});

	describe('GET /api/editor-saves', () => {
		it('should return all saved positions for authenticated user', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const mockSaves = [
				{ position_id: 1, name: 'Position 1', size: 100 },
				{ position_id: 2, name: 'Position 2', size: 200 },
			];

			vi.mocked(editorSavesManager.getAllSavedPositionsForUser).mockReturnValue(mockSaves);

			const response = await testRequest(app)
				.get('/api/editor-saves')
				.set('Cookie', user.cookie);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ saves: mockSaves });
			expect(editorSavesManager.getAllSavedPositionsForUser).toHaveBeenCalled();
		});

		it('should return 401 if user is not authenticated', async () => {
			const response = await testRequest(app).get('/api/editor-saves');

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: 'Must be signed in' });
		});

		it('should return 500 if database error occurs', async () => {
			const user = await integrationUtils.createAndLoginUser();
			vi.mocked(editorSavesManager.getAllSavedPositionsForUser).mockImplementation(() => {
				throw new Error('Database error');
			});

			const response = await testRequest(app)
				.get('/api/editor-saves')
				.set('Cookie', user.cookie);

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: 'Failed to retrieve saved positions' });
		});
	});

	describe('POST /api/editor-saves', () => {
		it('should save a new position successfully', async () => {
			const user = await integrationUtils.createAndLoginUser();
			vi.mocked(editorSavesManager.addSavedPosition).mockReturnValue({
				changes: 1,
				lastInsertRowid: 123,
			});

			const response = await testRequest(app)
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Test Position', icn: 'test-icn-data' });

			expect(response.status).toBe(201);
			expect(response.body).toEqual({ success: true, position_id: 123 });
			expect(editorSavesManager.addSavedPosition).toHaveBeenCalledWith(
				expect.any(Number),
				'Test Position',
				13, // length of 'test-icn-data'
				'test-icn-data',
			);
		});

		it('should return 400 if name is missing', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest(app)
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ icn: 'test-icn-data' });

			expect(response.status).toBe(400);
			// Zod returns a generic message for missing required fields
			expect(response.body.error).toBeTruthy();
		});

		it('should return 400 if name is empty', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest(app)
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: '', icn: 'test-icn-data' });

			expect(response.status).toBe(400);
			expect(response.body.error).toContain('Name is required');
		});

		it('should return 400 if name exceeds max length', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const longName = 'a'.repeat(editorutil.POSITION_NAME_MAX_LENGTH + 1);

			const response = await testRequest(app)
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: longName, icn: 'test-icn-data' });

			expect(response.status).toBe(400);
			expect(response.body.error).toContain(
				`${editorutil.POSITION_NAME_MAX_LENGTH} characters or less`,
			);
		});

		it('should return 400 if icn is missing', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest(app)
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Test Position' });

			expect(response.status).toBe(400);
			expect(response.body.error).toBeTruthy();
		});

		it('should return 400 if icn is empty', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest(app)
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Test Position', icn: '' });

			expect(response.status).toBe(400);
			expect(response.body.error).toContain('ICN is required');
		});

		it('should return 400 if icn exceeds max length', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const longIcn = 'a'.repeat(EditorSavesAPI.MAX_ICN_LENGTH + 1);

			const response = await testRequest(app)
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Test Position', icn: longIcn });

			expect(response.status).toBe(400);
			expect(response.body.error).toContain(
				`${EditorSavesAPI.MAX_ICN_LENGTH} characters or less`,
			);
		});

		it('should return 403 if quota is exceeded', async () => {
			const user = await integrationUtils.createAndLoginUser();
			vi.mocked(editorSavesManager.addSavedPosition).mockImplementation(() => {
				throw new Error(editorSavesManager.QUOTA_EXCEEDED_ERROR);
			});

			const response = await testRequest(app)
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Test Position', icn: 'test-icn-data' });

			expect(response.status).toBe(403);
			expect(response.body.error).toContain(`Maximum saved positions exceeded`);
			expect(editorSavesManager.addSavedPosition).toHaveBeenCalled();
		});

		it('should return 401 if user is not authenticated', async () => {
			const response = await testRequest(app)
				.post('/api/editor-saves')
				.send({ name: 'Test Position', icn: 'test-icn-data' });

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: 'Must be signed in' });
		});
	});

	describe('GET /api/editor-saves/:position_id', () => {
		it('should return position ICN if user owns it', async () => {
			const user = await integrationUtils.createAndLoginUser();
			vi.mocked(editorSavesManager.getSavedPositionICN).mockReturnValue({
				icn: 'test-icn-data',
			});

			const response = await testRequest(app)
				.get('/api/editor-saves/123')
				.set('Cookie', user.cookie);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ icn: 'test-icn-data' });
			expect(editorSavesManager.getSavedPositionICN).toHaveBeenCalled();
		});

		it('should return 404 if position not found or not owned', async () => {
			const user = await integrationUtils.createAndLoginUser();
			vi.mocked(editorSavesManager.getSavedPositionICN).mockReturnValue(undefined);

			const response = await testRequest(app)
				.get('/api/editor-saves/999')
				.set('Cookie', user.cookie);

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: 'Position not found' });
		});

		it('should return 400 if position_id is invalid', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest(app)
				.get('/api/editor-saves/invalid')
				.set('Cookie', user.cookie);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: 'Invalid position_id' });
		});

		it('should return 400 if position_id is zero', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest(app)
				.get('/api/editor-saves/0')
				.set('Cookie', user.cookie);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: 'Invalid position_id' });
		});

		it('should return 400 if position_id is negative', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest(app)
				.get('/api/editor-saves/-5')
				.set('Cookie', user.cookie);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: 'Invalid position_id' });
		});

		it('should return 401 if user is not authenticated', async () => {
			const response = await testRequest(app).get('/api/editor-saves/123');

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: 'Must be signed in' });
		});
	});

	describe('DELETE /api/editor-saves/:position_id', () => {
		it('should delete position successfully', async () => {
			const user = await integrationUtils.createAndLoginUser();
			vi.mocked(editorSavesManager.deleteSavedPosition).mockReturnValue({
				changes: 1,
				lastInsertRowid: 0,
			});

			const response = await testRequest(app)
				.delete('/api/editor-saves/123')
				.set('Cookie', user.cookie);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });
			expect(editorSavesManager.deleteSavedPosition).toHaveBeenCalled();
		});

		it('should return 404 if position not found or not owned', async () => {
			const user = await integrationUtils.createAndLoginUser();
			vi.mocked(editorSavesManager.deleteSavedPosition).mockReturnValue({
				changes: 0,
				lastInsertRowid: 0,
			});

			const response = await testRequest(app)
				.delete('/api/editor-saves/999')
				.set('Cookie', user.cookie);

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: 'Position not found' });
		});

		it('should return 400 if position_id is invalid', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest(app)
				.delete('/api/editor-saves/invalid')
				.set('Cookie', user.cookie);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: 'Invalid position_id' });
		});

		it('should return 401 if user is not authenticated', async () => {
			const response = await testRequest(app).delete('/api/editor-saves/123');

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: 'Must be signed in' });
		});
	});

	describe('PATCH /api/editor-saves/:position_id', () => {
		it('should rename position successfully', async () => {
			const user = await integrationUtils.createAndLoginUser();
			vi.mocked(editorSavesManager.renameSavedPosition).mockReturnValue({
				changes: 1,
				lastInsertRowid: 0,
			});

			const response = await testRequest(app)
				.patch('/api/editor-saves/123')
				.set('Cookie', user.cookie)
				.send({ name: 'New Name' });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });
			expect(editorSavesManager.renameSavedPosition).toHaveBeenCalled();
		});

		it('should return 404 if position not found or not owned', async () => {
			const user = await integrationUtils.createAndLoginUser();
			vi.mocked(editorSavesManager.renameSavedPosition).mockReturnValue({
				changes: 0,
				lastInsertRowid: 0,
			});

			const response = await testRequest(app)
				.patch('/api/editor-saves/999')
				.set('Cookie', user.cookie)
				.send({ name: 'New Name' });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: 'Position not found' });
		});

		it('should return 400 if name is missing', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest(app)
				.patch('/api/editor-saves/123')
				.set('Cookie', user.cookie)
				.send({});

			expect(response.status).toBe(400);
			expect(response.body.error).toBeTruthy();
		});

		it('should return 400 if name is empty', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest(app)
				.patch('/api/editor-saves/123')
				.set('Cookie', user.cookie)
				.send({ name: '' });

			expect(response.status).toBe(400);
			expect(response.body.error).toContain('Name is required');
		});

		it('should return 400 if name exceeds max length', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const longName = 'a'.repeat(editorutil.POSITION_NAME_MAX_LENGTH + 1);

			const response = await testRequest(app)
				.patch('/api/editor-saves/123')
				.set('Cookie', user.cookie)
				.send({ name: longName });

			expect(response.status).toBe(400);
			expect(response.body.error).toContain(
				`${editorutil.POSITION_NAME_MAX_LENGTH} characters or less`,
			);
		});

		it('should return 400 if position_id is invalid', async () => {
			const user = await integrationUtils.createAndLoginUser();
			const response = await testRequest(app)
				.patch('/api/editor-saves/invalid')
				.set('Cookie', user.cookie)
				.send({ name: 'New Name' });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: 'Invalid position_id' });
		});

		it('should return 401 if user is not authenticated', async () => {
			const response = await testRequest(app)
				.patch('/api/editor-saves/123')
				.send({ name: 'New Name' });

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: 'Must be signed in' });
		});
	});

	describe('Edge cases and integration', () => {
		it('should handle very long ICN within limit', async () => {
			const user = await integrationUtils.createAndLoginUser();
			vi.mocked(editorSavesManager.addSavedPosition).mockReturnValue({
				changes: 1,
				lastInsertRowid: 123,
			});

			const maxLengthIcn = 'a'.repeat(EditorSavesAPI.MAX_ICN_LENGTH);

			const response = await testRequest(app)
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Test', icn: maxLengthIcn });

			expect(response.status).toBe(201);
			expect(editorSavesManager.addSavedPosition).toHaveBeenCalledWith(
				expect.any(Number),
				'Test',
				EditorSavesAPI.MAX_ICN_LENGTH,
				maxLengthIcn,
			);
		});

		it('should handle name at max length', async () => {
			const user = await integrationUtils.createAndLoginUser();
			vi.mocked(editorSavesManager.addSavedPosition).mockReturnValue({
				changes: 1,
				lastInsertRowid: 123,
			});

			const maxLengthName = 'a'.repeat(editorutil.POSITION_NAME_MAX_LENGTH);

			const response = await testRequest(app)
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: maxLengthName, icn: 'test' });

			expect(response.status).toBe(201);
		});

		it('should calculate size correctly from ICN length', async () => {
			const user = await integrationUtils.createAndLoginUser();
			vi.mocked(editorSavesManager.addSavedPosition).mockReturnValue({
				changes: 1,
				lastInsertRowid: 123,
			});

			const icn = '12345';

			const response = await testRequest(app)
				.post('/api/editor-saves')
				.set('Cookie', user.cookie)
				.send({ name: 'Test', icn });

			expect(response.status).toBe(201);
			expect(editorSavesManager.addSavedPosition).toHaveBeenCalledWith(
				expect.any(Number),
				'Test',
				5, // length of '12345'
				'12345',
			);
		});
	});
});
