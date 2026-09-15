// src/tests/testsSetup.ts

/**
 * Runs inside every test process, before each test file: silences console output,
 * and stubs the log functions so tests never write log files.
 */

import { vi, afterAll } from 'vitest';

import logEvents from '../server/utility/logEvents.js';

// Stop Console Bloat
// Store the original functions so we can restore them after
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
// Redirect console functions to empty functions
console.log = vi.fn();
console.error = vi.fn();
console.warn = vi.fn();

// Stub only the file-writing log functions, so tests never touch logs/.
// Spied rather than module-mocked so a wrong name is a compile error.
vi.spyOn(logEvents, 'add').mockResolvedValue(undefined);
vi.spyOn(logEvents, 'addAndPrint').mockResolvedValue(undefined);

// Restore console functions after tests finish so Vitest can print the summary
afterAll(() => {
	console.log = originalLog;
	console.error = originalError;
	console.warn = originalWarn;
});
