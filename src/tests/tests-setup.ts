// src/tests/tests-setup.ts

import type { NextFunction, Request, Response } from 'express';

import { vi, afterAll } from 'vitest';

// Set up environment variables for testing.
// Prevents `test` workflow job failing due to missing secrets.
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

// Mock Logger to prevent file writes. Stub only the
// file-writing log functions; keep real pure helpers.
vi.mock('../server/middleware/logEvents.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../server/middleware/logEvents.js')>();
	return {
		...actual,
		logEvents: vi.fn(), // Do nothing
		logEventsAndPrint: vi.fn(), // Do nothing
		reqLogger: (_req: Request, _res: Response, next: NextFunction) => next(), // Continue to next middleware
		logWebsocketStart: vi.fn(), // Do nothing
		logReqWebsocketIn: vi.fn(), // Do nothing
		logReqWebsocketOut: vi.fn(), // Do nothing
	};
});

// Restore console functions after tests finish so Vitest can print the summary
afterAll(() => {
	console.log = originalLog;
	console.error = originalError;
	console.warn = originalWarn;
});
