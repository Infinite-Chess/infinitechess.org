
// src/server/database/refreshTokenManager.test.ts

/**
 * Tests for refreshTokenManager error handling.
 * 
 * This test suite verifies that the refreshTokenManager functions properly handle
 * database errors by logging them and throwing generic errors.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request } from 'express';
import * as refreshTokenManager from './refreshTokenManager.js';
import db from './database.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';

// Mock the database module
vi.mock('./database.js');
vi.mock('../middleware/logEvents.js');
vi.mock('../utility/IP.js', () => ({
	getClientIP: vi.fn(() => '127.0.0.1'),
}));
vi.mock('../controllers/authenticationTokens/tokenSigner.js', () => ({
	refreshTokenExpiryMillis: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
}));

describe('refreshTokenManager error handling', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('findRefreshToken', () => {
		it('should throw a generic error when database error occurs', () => {
			const mockError = new Error('Database connection failed');
			vi.mocked(db.get).mockImplementation(() => {
				throw mockError;
			});

			expect(() => {
				refreshTokenManager.findRefreshToken('test-token');
			}).toThrow('A database error occurred while processing the refresh token.');

			expect(logEventsAndPrint).toHaveBeenCalledWith(
				'Database error while finding refresh token: Database connection failed',
				'errLog.txt'
			);
		});

		it('should return token record when database operation succeeds', () => {
			const mockRecord = {
				token: 'test-token',
				user_id: 1,
				created_at: Date.now(),
				expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000,
				ip_address: '127.0.0.1',
			};
			vi.mocked(db.get).mockReturnValue(mockRecord);

			const result = refreshTokenManager.findRefreshToken('test-token');

			expect(result).toEqual(mockRecord);
			expect(logEventsAndPrint).not.toHaveBeenCalled();
		});
	});

	describe('findRefreshTokensForUsers', () => {
		it('should throw a generic error when database error occurs', () => {
			const mockError = new Error('Database query failed');
			vi.mocked(db.all).mockImplementation(() => {
				throw mockError;
			});

			expect(() => {
				refreshTokenManager.findRefreshTokensForUsers([1, 2, 3]);
			}).toThrow('A database error occurred while processing the refresh token.');

			expect(logEventsAndPrint).toHaveBeenCalledWith(
				'Database error while finding refresh tokens for users [1,2,3]: Database query failed',
				'errLog.txt'
			);
		});

		it('should return token records when database operation succeeds', () => {
			const mockRecords = [
				{
					token: 'token1',
					user_id: 1,
					created_at: Date.now(),
					expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000,
					ip_address: '127.0.0.1',
				},
			];
			vi.mocked(db.all).mockReturnValue(mockRecords);

			const result = refreshTokenManager.findRefreshTokensForUsers([1]);

			expect(result).toEqual(mockRecords);
			expect(logEventsAndPrint).not.toHaveBeenCalled();
		});
	});

	describe('addRefreshToken', () => {
		it('should throw a generic error when database error occurs', () => {
			const mockError = new Error('Insert failed');
			vi.mocked(db.run).mockImplementation(() => {
				throw mockError;
			});

			const mockReq = {} as Request;

			expect(() => {
				refreshTokenManager.addRefreshToken(mockReq, 123, 'new-token');
			}).toThrow('A database error occurred while processing the refresh token.');

			expect(logEventsAndPrint).toHaveBeenCalledWith(
				'Database error while adding refresh token for userId 123: Insert failed',
				'errLog.txt'
			);
		});

		it('should successfully add token when database operation succeeds', () => {
			vi.mocked(db.run).mockReturnValue({ changes: 1, lastInsertRowid: 1 });

			const mockReq = {} as Request;

			expect(() => {
				refreshTokenManager.addRefreshToken(mockReq, 123, 'new-token');
			}).not.toThrow();

			expect(logEventsAndPrint).not.toHaveBeenCalled();
		});
	});

	describe('deleteRefreshToken', () => {
		it('should throw a generic error when database error occurs', () => {
			const mockError = new Error('Delete failed');
			vi.mocked(db.run).mockImplementation(() => {
				throw mockError;
			});

			expect(() => {
				refreshTokenManager.deleteRefreshToken('test-token');
			}).toThrow('A database error occurred while processing the refresh token.');

			expect(logEventsAndPrint).toHaveBeenCalledWith(
				'Database error while deleting refresh token: Delete failed',
				'errLog.txt'
			);
		});

		it('should successfully delete token when database operation succeeds', () => {
			vi.mocked(db.run).mockReturnValue({ changes: 1, lastInsertRowid: 0 });

			expect(() => {
				refreshTokenManager.deleteRefreshToken('test-token');
			}).not.toThrow();

			expect(logEventsAndPrint).not.toHaveBeenCalled();
		});
	});

	describe('deleteAllRefreshTokensForUser', () => {
		it('should throw a generic error when database error occurs', () => {
			const mockError = new Error('Batch delete failed');
			vi.mocked(db.run).mockImplementation(() => {
				throw mockError;
			});

			expect(() => {
				refreshTokenManager.deleteAllRefreshTokensForUser(456);
			}).toThrow('A database error occurred while processing the refresh token.');

			expect(logEventsAndPrint).toHaveBeenCalledWith(
				'Database error while deleting all refresh tokens for userId 456: Batch delete failed',
				'errLog.txt'
			);
		});

		it('should successfully delete all tokens when database operation succeeds', () => {
			vi.mocked(db.run).mockReturnValue({ changes: 3, lastInsertRowid: 0 });

			expect(() => {
				refreshTokenManager.deleteAllRefreshTokensForUser(456);
			}).not.toThrow();

			expect(logEventsAndPrint).not.toHaveBeenCalled();
		});
	});

	describe('updateRefreshTokenIP', () => {
		it('should throw a generic error when database error occurs', () => {
			const mockError = new Error('Update failed');
			vi.mocked(db.run).mockImplementation(() => {
				throw mockError;
			});

			expect(() => {
				refreshTokenManager.updateRefreshTokenIP('test-token', '192.168.1.1');
			}).toThrow('A database error occurred while processing the refresh token.');

			expect(logEventsAndPrint).toHaveBeenCalledWith(
				'Database error while updating refresh token IP: Update failed',
				'errLog.txt'
			);
		});

		it('should successfully update IP when database operation succeeds', () => {
			vi.mocked(db.run).mockReturnValue({ changes: 1, lastInsertRowid: 0 });

			expect(() => {
				refreshTokenManager.updateRefreshTokenIP('test-token', '192.168.1.1');
			}).not.toThrow();

			expect(logEventsAndPrint).not.toHaveBeenCalled();
		});

		it('should handle null IP address', () => {
			vi.mocked(db.run).mockReturnValue({ changes: 1, lastInsertRowid: 0 });

			expect(() => {
				refreshTokenManager.updateRefreshTokenIP('test-token', null);
			}).not.toThrow();

			expect(logEventsAndPrint).not.toHaveBeenCalled();
		});
	});

	describe('error message handling', () => {
		it('should handle non-Error objects in catch block', () => {
			vi.mocked(db.get).mockImplementation(() => {
				throw 'string error';
			});

			expect(() => {
				refreshTokenManager.findRefreshToken('test-token');
			}).toThrow('A database error occurred while processing the refresh token.');

			expect(logEventsAndPrint).toHaveBeenCalledWith(
				'Database error while finding refresh token: string error',
				'errLog.txt'
			);
		});
	});
});
