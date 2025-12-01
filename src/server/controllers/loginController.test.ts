import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-ignore
import { handleLogin } from './loginController.js';
import * as memberManager from '../database/memberManager.js';
import * as logEvents from '../middleware/logEvents.js';
import * as sessionManager from './authenticationTokens/sessionManager.js';
// @ts-ignore
import * as authController from './authController.js';

// Mock dependencies
vi.mock('../database/memberManager.js');
vi.mock('../middleware/logEvents.js');
vi.mock('./authenticationTokens/sessionManager.js');
vi.mock('./authController.js');

describe('loginController', () => {
	let req: any;
	let res: any;

	beforeEach(() => {
		// Setup a fresh mock request and response for each test
		req = {
			body: {
				username: 'NeverGonnaGiveYouUp',
				password: 'password123',
			},
		};
		res = {
			status: vi.fn().mockReturnThis(), // Allow chaining .status().json()
			json: vi.fn(),
			headersSent: false,
		};
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should login successfully with correct credentials', async () => {
		// Mock password check to pass
		vi.mocked(authController.testPasswordForRequest).mockResolvedValue(true);

		// Mock user data retrieval
		vi.mocked(memberManager.getMemberDataByCriteria).mockReturnValue({
			user_id: 1,
			username: 'NeverGonnaGiveYouUp',
			roles: JSON.stringify(['user']),
		} as any);

		await handleLogin(req, res);

		// Verify the password check was called
		expect(authController.testPasswordForRequest).toHaveBeenCalledWith(req, res);

		// Verify we tried to fetch the correct user
		expect(memberManager.getMemberDataByCriteria).toHaveBeenCalledWith(
			['user_id', 'username', 'roles'],
			'username',
			'NeverGonnaGiveYouUp',
			false,
		);

		// Verify session creation with correct data
		expect(sessionManager.createNewSession).toHaveBeenCalledWith(
			req,
			res,
			1,
			'NeverGonnaGiveYouUp',
			['user'],
		);

		// Verify successful response
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({ message: 'Logged in successfully.' });

		// Verify side effects (stats updates and logging)
		expect(memberManager.updateLoginCountAndLastSeen).toHaveBeenCalledWith(1);
		expect(logEvents.logEventsAndPrint).toHaveBeenCalledWith(
			expect.stringContaining('Logged in member "NeverGonnaGiveYouUp"'),
			'loginAttempts.txt',
		);
	});

	it('should return early if password check fails', async () => {
		// Mock password check to fail
		vi.mocked(authController.testPasswordForRequest).mockResolvedValue(false);

		await handleLogin(req, res);

		expect(authController.testPasswordForRequest).toHaveBeenCalledWith(req, res);
		// Should not proceed to get member data
		expect(memberManager.getMemberDataByCriteria).not.toHaveBeenCalled();
		expect(res.status).not.toHaveBeenCalled(); // testPasswordForRequest handles the response
	});

	it('should handle missing user after successful password check (integrity error)', async () => {
		vi.mocked(authController.testPasswordForRequest).mockResolvedValue(true);

		// Mock user not found
		vi.mocked(memberManager.getMemberDataByCriteria).mockReturnValue({
			user_id: undefined,
			username: undefined,
			roles: undefined,
		} as any);

		await handleLogin(req, res);

		expect(logEvents.logEventsAndPrint).toHaveBeenCalledWith(
			expect.stringContaining('not found by username'),
			'errLog.txt',
		);
		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				message: expect.stringContaining('internal server error'),
			}),
		);
	});

	it('should handle unexpected errors', async () => {
		vi.mocked(authController.testPasswordForRequest).mockResolvedValue(true);

		// Mock error during execution
		vi.mocked(memberManager.getMemberDataByCriteria).mockImplementation(() => {
			throw new Error('Database connection failed');
		});

		await handleLogin(req, res);

		expect(logEvents.logEventsAndPrint).toHaveBeenCalledWith(
			expect.stringContaining('Error during handleLogin'),
			'errLog.txt',
		);
		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				message: expect.stringContaining('unexpected error'),
			}),
		);
	});
});
