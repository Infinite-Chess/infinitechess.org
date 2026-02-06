// src/tests/tests-setup.ts

import type { NextFunction, Request, Response } from 'express';

import { vi, afterAll } from 'vitest';

// Set up environment variables for testing.
// Prevents `test` workflow job failing due to missing secrets.
process.env['ACCESS_TOKEN_SECRET'] = 'test_access_secret';
process.env['REFRESH_TOKEN_SECRET'] = 'test_refresh_secret';

// Stop Console Bloat
// Store the original functions so we can restore them after
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
// Redirect console functions to empty functions
console.log = vi.fn();
console.error = vi.fn();
console.warn = vi.fn();

// Mock Logger to prevent file writes
// This tells Vitest whenever any file imports logEvents.js, give them these empty functions instead.
vi.mock('../server/middleware/logevents.js', () => ({
	logEvents: vi.fn(), // Do nothing
	logEventsAndPrint: vi.fn(), // Do nothing
	reqLogger: (_req: Request, _res: Response, next: NextFunction) => next(), // Continue to next middleware
	logWebsocketStart: vi.fn(), // Do nothing
	logReqWebsocketIn: vi.fn(), // Do nothing
	logReqWebsocketOut: vi.fn(), // Do nothing
}));

// Restore console functions after tests finish so Vitest can print the summary
afterAll(() => {
	console.log = originalLog;
	console.error = originalError;
	console.warn = originalWarn;
});
