// src/server/utility/startupLogger.ts

/**
 * This module logs server startup and shutdown events to a log file.
 */

import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';

import paths from '../config/paths.js';

// Helpers -------------------------------------------------------------------------------

/** Writes a log entry to logs/startupLog.txt with the provided message and a timestamp. */
function writeStartupLog(message: string): void {
	const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
	const line = `${timestamp} | ${message}. PID: ${process.pid}\n`;
	try {
		fs.mkdirSync(paths.LOGS_DIR, { recursive: true });
		fs.appendFileSync(path.join(paths.LOGS_DIR, 'startupLog.txt'), line);
	} catch (err) {
		console.error('Failed to write to startupLog.txt:', err);
	}
}

// API -----------------------------------------------------------------------------------

/** Logs a server startup entry to logs/startupLog.txt. */
function logServerStarted(): void {
	writeStartupLog('🟢 Server started');
}

/**
 * Logs a server shutdown entry to logs/startupLog.txt.
 * Uses synchronous I/O so the write completes before process.exit().
 * @param signal - The signal that triggered the shutdown (e.g. 'SIGTERM').
 */
function logServerStopped(signal: string): void {
	writeStartupLog(`🔴 Server stopped (${signal})`);
}

// Exports -------------------------------------------------------------------------------

export { logServerStarted, logServerStopped };
