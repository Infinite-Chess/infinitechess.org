
// src/server/api/EditorSavesAPI.test.ts

/**
 * Tests for the EditorSavesAPI endpoints.
 * 
 * This test suite verifies that the editor saves API endpoints work correctly,
 * including authentication, validation, quota limits, and ownership verification.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Express, Request, Response, NextFunction } from 'express';
import EditorSavesAPI from './EditorSavesAPI.js';
import editorSavesManager from '../database/editorSavesManager.js';

// Mock the database manager
vi.mock('../database/editorSavesManager.js');
vi.mock('../middleware/logEvents.js', () => ({
	logEventsAndPrint: vi.fn(),
}));

describe('EditorSavesAPI', () => {
	let app: Express;

	beforeEach(() => {
		// Create a fresh Express app for each test
		app = express();
		// Increase body size limit for large ICN testing
		app.use(express.json({ limit: '10mb' }));

		// Mock middleware to set up authenticated user
		app.use((req: Request, res: Response, next: NextFunction) => {
			// Default to authenticated user
			req.memberInfo = {
				signedIn: true,
				user_id: 1,
				username: 'testuser',
				roles: null,
			};
			next();
		});

		// Register the routes
		app.get('/api/editor-saves', EditorSavesAPI.getSavedPositions);
		app.post('/api/editor-saves', EditorSavesAPI.savePosition);
		app.get('/api/editor-saves/:position_id', EditorSavesAPI.getPosition);
		app.delete('/api/editor-saves/:position_id', EditorSavesAPI.deletePosition);
		app.patch('/api/editor-saves/:position_id', EditorSavesAPI.renamePosition);

		// Error handler middleware
		app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
			console.error('Error caught:', err.message || err);
			res.status(500).json({ error: err.message || 'Internal server error' });
		});

		// Reset all mocks
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('GET /api/editor-saves', () => {
		it('should return all saved positions for authenticated user', async() => {
			const mockSaves = [
				{ position_id: 1, name: 'Position 1', size: 100 },
				{ position_id: 2, name: 'Position 2', size: 200 },
			];

			vi.mocked(editorSavesManager.getAllSavedPositionsForUser).mockReturnValue(mockSaves);

			const response = await request(app).get('/api/editor-saves');

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ saves: mockSaves });
			expect(editorSavesManager.getAllSavedPositionsForUser).toHaveBeenCalledWith(1);
		});

		it('should return 401 if user is not authenticated', async() => {
			// Create app with unauthenticated user
			const unauthApp = express();
			unauthApp.use(express.json());
			unauthApp.use((req: Request, res: Response, next: NextFunction) => {
				req.memberInfo = { signedIn: false };
				next();
			});
			unauthApp.get('/api/editor-saves', EditorSavesAPI.getSavedPositions);

			const response = await request(unauthApp).get('/api/editor-saves');

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: 'Must be signed in' });
		});

		it('should return 500 if database error occurs', async() => {
			vi.mocked(editorSavesManager.getAllSavedPositionsForUser).mockImplementation(() => {
				throw new Error('Database error');
			});

			const response = await request(app).get('/api/editor-saves');

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: 'Failed to retrieve saved positions' });
		});
	});

	describe('POST /api/editor-saves', () => {
		it('should save a new position successfully', async() => {
			vi.mocked(editorSavesManager.addSavedPosition).mockReturnValue({
				changes: 1,
				lastInsertRowid: 123
			});

			const response = await request(app)
				.post('/api/editor-saves')
				.send({ name: 'Test Position', icn: 'test-icn-data' });

			expect(response.status).toBe(201);
			expect(response.body).toEqual({ success: true, position_id: 123 });
			expect(editorSavesManager.addSavedPosition).toHaveBeenCalledWith(
				1,
				'Test Position',
				13, // length of 'test-icn-data'
				'test-icn-data'
			);
		});

		it('should return 400 if name is missing', async() => {
			const response = await request(app)
				.post('/api/editor-saves')
				.send({ icn: 'test-icn-data' });

			expect(response.status).toBe(400);
			// Zod returns a generic message for missing required fields
			expect(response.body.error).toBeTruthy();
		});

		it('should return 400 if name is empty', async() => {
			const response = await request(app)
				.post('/api/editor-saves')
				.send({ name: '', icn: 'test-icn-data' });

			expect(response.status).toBe(400);
			expect(response.body.error).toContain('Name is required');
		});

		it('should return 400 if name exceeds max length', async() => {
			const longName = 'a'.repeat(EditorSavesAPI.MAX_NAME_LENGTH + 1);

			const response = await request(app)
				.post('/api/editor-saves')
				.send({ name: longName, icn: 'test-icn-data' });

			expect(response.status).toBe(400);
			expect(response.body.error).toContain(`${EditorSavesAPI.MAX_NAME_LENGTH} characters or less`);
		});

		it('should return 400 if icn is missing', async() => {
			const response = await request(app)
				.post('/api/editor-saves')
				.send({ name: 'Test Position' });

			expect(response.status).toBe(400);
			expect(response.body.error).toBeTruthy();
		});

		it('should return 400 if icn is empty', async() => {
			const response = await request(app)
				.post('/api/editor-saves')
				.send({ name: 'Test Position', icn: '' });

			expect(response.status).toBe(400);
			expect(response.body.error).toContain('ICN is required');
		});

		it('should return 400 if icn exceeds max length', async() => {
			const longIcn = 'a'.repeat(EditorSavesAPI.MAX_ICN_LENGTH + 1);

			const response = await request(app)
				.post('/api/editor-saves')
				.send({ name: 'Test Position', icn: longIcn });

			expect(response.status).toBe(400);
			expect(response.body.error).toContain(`${EditorSavesAPI.MAX_ICN_LENGTH} characters or less`);
		});

		it('should return 403 if quota is exceeded', async() => {
			vi.mocked(editorSavesManager.addSavedPosition).mockImplementation(() => {
				throw new Error(editorSavesManager.QUOTA_EXCEEDED_ERROR);
			});

			const response = await request(app)
				.post('/api/editor-saves')
				.send({ name: 'Test Position', icn: 'test-icn-data' });

			expect(response.status).toBe(403);
			expect(response.body.error).toContain(`Maximum saved positions exceeded`);
			expect(editorSavesManager.addSavedPosition).toHaveBeenCalled();
		});

		it('should return 401 if user is not authenticated', async() => {
			const unauthApp = express();
			unauthApp.use(express.json());
			unauthApp.use((req: Request, res: Response, next: NextFunction) => {
				req.memberInfo = { signedIn: false };
				next();
			});
			unauthApp.post('/api/editor-saves', EditorSavesAPI.savePosition);

			const response = await request(unauthApp)
				.post('/api/editor-saves')
				.send({ name: 'Test Position', icn: 'test-icn-data' });

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: 'Must be signed in' });
		});
	});

	describe('GET /api/editor-saves/:position_id', () => {
		it('should return position ICN if user owns it', async() => {
			vi.mocked(editorSavesManager.getSavedPositionICN).mockReturnValue({
				icn: 'test-icn-data'
			});

			const response = await request(app).get('/api/editor-saves/123');

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ icn: 'test-icn-data' });
			expect(editorSavesManager.getSavedPositionICN).toHaveBeenCalledWith(123, 1);
		});

		it('should return 404 if position not found or not owned', async() => {
			vi.mocked(editorSavesManager.getSavedPositionICN).mockReturnValue(undefined);

			const response = await request(app).get('/api/editor-saves/999');

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: 'Position not found' });
		});

		it('should return 400 if position_id is invalid', async() => {
			const response = await request(app).get('/api/editor-saves/invalid');

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: 'Invalid position_id' });
		});

		it('should return 400 if position_id is zero', async() => {
			const response = await request(app).get('/api/editor-saves/0');

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: 'Invalid position_id' });
		});

		it('should return 400 if position_id is negative', async() => {
			const response = await request(app).get('/api/editor-saves/-5');

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: 'Invalid position_id' });
		});

		it('should return 401 if user is not authenticated', async() => {
			const unauthApp = express();
			unauthApp.use(express.json());
			unauthApp.use((req: Request, res: Response, next: NextFunction) => {
				req.memberInfo = { signedIn2: false };
				next();
			});
			unauthApp.get('/api/editor-saves/:position_id', EditorSavesAPI.getPosition);

			const response = await request(unauthApp).get('/api/editor-saves/123');

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: 'Must be signed in' });
		});
	});

	describe('DELETE /api/editor-saves/:position_id', () => {
		it('should delete position successfully', async() => {
			vi.mocked(editorSavesManager.deleteSavedPosition).mockReturnValue({
				changes: 1,
				lastInsertRowid: 0
			});

			const response = await request(app).delete('/api/editor-saves/123');

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });
			expect(editorSavesManager.deleteSavedPosition).toHaveBeenCalledWith(123, 1);
		});

		it('should return 404 if position not found or not owned', async() => {
			vi.mocked(editorSavesManager.deleteSavedPosition).mockReturnValue({
				changes: 0,
				lastInsertRowid: 0
			});

			const response = await request(app).delete('/api/editor-saves/999');

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: 'Position not found' });
		});

		it('should return 400 if position_id is invalid', async() => {
			const response = await request(app).delete('/api/editor-saves/invalid');

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: 'Invalid position_id' });
		});

		it('should return 401 if user is not authenticated', async() => {
			const unauthApp = express();
			unauthApp.use(express.json());
			unauthApp.use((req: Request, res: Response, next: NextFunction) => {
				req.memberInfo = { signedIn: false };
				next();
			});
			unauthApp.delete('/api/editor-saves/:position_id', EditorSavesAPI.deletePosition);

			const response = await request(unauthApp).delete('/api/editor-saves/123');

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: 'Must be signed in' });
		});
	});

	describe('PATCH /api/editor-saves/:position_id', () => {
		it('should rename position successfully', async() => {
			vi.mocked(editorSavesManager.renameSavedPosition).mockReturnValue({
				changes: 1,
				lastInsertRowid: 0
			});

			const response = await request(app)
				.patch('/api/editor-saves/123')
				.send({ name: 'New Name' });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });
			expect(editorSavesManager.renameSavedPosition).toHaveBeenCalledWith(123, 1, 'New Name');
		});

		it('should return 404 if position not found or not owned', async() => {
			vi.mocked(editorSavesManager.renameSavedPosition).mockReturnValue({
				changes: 0,
				lastInsertRowid: 0
			});

			const response = await request(app)
				.patch('/api/editor-saves/999')
				.send({ name: 'New Name' });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: 'Position not found' });
		});

		it('should return 400 if name is missing', async() => {
			const response = await request(app)
				.patch('/api/editor-saves/123')
				.send({});

			expect(response.status).toBe(400);
			expect(response.body.error).toBeTruthy();
		});

		it('should return 400 if name is empty', async() => {
			const response = await request(app)
				.patch('/api/editor-saves/123')
				.send({ name: '' });

			expect(response.status).toBe(400);
			expect(response.body.error).toContain('Name is required');
		});

		it('should return 400 if name exceeds max length', async() => {
			const longName = 'a'.repeat(EditorSavesAPI.MAX_NAME_LENGTH + 1);

			const response = await request(app)
				.patch('/api/editor-saves/123')
				.send({ name: longName });

			expect(response.status).toBe(400);
			expect(response.body.error).toContain(`${EditorSavesAPI.MAX_NAME_LENGTH} characters or less`);
		});

		it('should return 400 if position_id is invalid', async() => {
			const response = await request(app)
				.patch('/api/editor-saves/invalid')
				.send({ name: 'New Name' });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: 'Invalid position_id' });
		});

		it('should return 401 if user is not authenticated', async() => {
			const unauthApp = express();
			unauthApp.use(express.json());
			unauthApp.use((req: Request, res: Response, next: NextFunction) => {
				req.memberInfo = { signedIn: false };
				next();
			});
			unauthApp.patch('/api/editor-saves/:position_id', EditorSavesAPI.renamePosition);

			const response = await request(unauthApp)
				.patch('/api/editor-saves/123')
				.send({ name: 'New Name' });

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: 'Must be signed in' });
		});
	});

	describe('Edge cases and integration', () => {
		it('should handle very long ICN within limit', async() => {
			vi.mocked(editorSavesManager.addSavedPosition).mockReturnValue({ 
				changes: 1, 
				lastInsertRowid: 123 
			});

			const maxLengthIcn = 'a'.repeat(EditorSavesAPI.MAX_ICN_LENGTH);

			const response = await request(app)
				.post('/api/editor-saves')
				.send({ name: 'Test', icn: maxLengthIcn });

			expect(response.status).toBe(201);
			expect(editorSavesManager.addSavedPosition).toHaveBeenCalledWith(
				1,
				'Test',
				EditorSavesAPI.MAX_ICN_LENGTH,
				maxLengthIcn
			);
		});

		it('should handle name at max length', async() => {
			vi.mocked(editorSavesManager.addSavedPosition).mockReturnValue({ 
				changes: 1, 
				lastInsertRowid: 123 
			});

			const maxLengthName = 'a'.repeat(EditorSavesAPI.MAX_NAME_LENGTH);

			const response = await request(app)
				.post('/api/editor-saves')
				.send({ name: maxLengthName, icn: 'test' });

			expect(response.status).toBe(201);
		});

		it('should calculate size correctly from ICN length', async() => {
			vi.mocked(editorSavesManager.addSavedPosition).mockReturnValue({ 
				changes: 1, 
				lastInsertRowid: 123 
			});

			const icn = '12345';

			const response = await request(app)
				.post('/api/editor-saves')
				.send({ name: 'Test', icn });

			expect(response.status).toBe(201);
			expect(editorSavesManager.addSavedPosition).toHaveBeenCalledWith(
				1,
				'Test',
				5, // length of '12345'
				'12345'
			);
		});
	});
});
