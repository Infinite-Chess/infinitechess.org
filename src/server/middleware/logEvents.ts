// src/server/middleware/logEvents.ts

/**
 * Writes all of our log files, appending one timestamped line per event.
 *
 * Lines are tagged with the correlation ID of the trigger that caused them:
 * 'R…' = an HTTP request, 'W…' = an incoming websocket message (see
 * requestContext.ts). Every line one trigger produces — across ALL log files —
 * shares its ID. The trigger's own entry is in reqLog/ (R) or wsInLog/ (W).
 *
 * A line timestamped well after its trigger is a DEFERRED effect, fired by a
 * timer the trigger scheduled (e.g. an AFK auto-resign). An all-dashes ID means
 * no request caused the line: startup, scheduled tasks, ws connection handshakes.
 *
 * Don't confuse correlation IDs with socket IDs (`of ID "..."`), which tie a
 * CONNECTION's messages together rather than one trigger's effects.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { format, startOfISOWeek } from 'date-fns';
import { promises as fsPromises } from 'fs';

import { REQUEST_ID_PLACEHOLDER, getRequestID } from './requestContext.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Constants ---------------------------------------------------

/** Absolute path to the project-root `logs/` directory. */
const LOGS_DIR = path.join(__dirname, '..', '..', '..', 'logs');

/**
 * Base names of high-volume logs that rotate weekly into their own dir.
 * Everything else is one permanent flat file at the {@link LOGS_DIR} root.
 */
const ROTATED_LOGS: readonly string[] = ['reqLog', 'wsInLog', 'wsOutLog'];

/** Rotated log files whose bucket was last written to longer ago than this are deleted. */
const LOG_RETENTION_MS = 1000 * 60 * 60 * 24 * 30 * 6; // ~6 months

/** How often the retention sweep runs. */
const LOG_CLEANUP_INTERVAL_MS = 1000 * 60 * 60 * 24; // 24 hours

// Logging ---------------------------------------------------------------

/**
 * Logs the provided message by appending a line to the end of the specified log file,
 * and prints it to the console as an error.
 * @param message - The message to log.
 * @param logName - The base name of the log file, without the `.txt` extension.
 */
async function logEventsAndPrint(message: string, logName: string): Promise<void> {
	if (logName === 'errLog') console.error(message);
	else console.log(message); // Prevents non error logs from going to PM2's error logs.

	await logEvents(message, logName);
}

/**
 * Logs the provided message by appending a line to the end of the specified log file.
 * @param message - The message to log.
 * @param logName - The base name of the log file, without the `.txt` extension.
 */
async function logEvents(message: string, logName: string): Promise<void> {
	if (typeof message !== 'string')
		return console.trace('Cannot log message when it is not a string.');
	if (!logName) return console.trace('Log name MUST be provided when logging an event!');

	const dateTime = format(new Date(), 'yyyy/MM/dd  HH:mm:ss');
	// Tag the line with the ID of the request/socket-message that triggered
	// it, if any, so all log lines it produced (across files) can be joined.
	const requestID = getRequestID() ?? REQUEST_ID_PLACEHOLDER;
	const logItem = `${dateTime}  ${requestID}   ${message}\n`;

	try {
		const filePath = resolveLogPath(logName);
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		await fsPromises.appendFile(filePath, logItem);
	} catch (err: unknown) {
		console.error('Error logging event:', err);
	}
}

/**
 * Resolves the absolute path a log line should be written to.
 * Rotated logs live in their own directory with one file per week.
 * All other logs are a single flat file at the {@link LOGS_DIR} root.
 * @param logName - The base name of the log file, without the `.txt` extension.
 */
function resolveLogPath(logName: string): string {
	if (!ROTATED_LOGS.includes(logName)) return path.join(LOGS_DIR, `${logName}.txt`);

	const bucketDate = format(startOfISOWeek(new Date()), 'yyyy-MM-dd'); // ISO weeks start on Monday.
	return path.join(LOGS_DIR, logName, `${bucketDate}.txt`);
}

// Cleanup ----------------------------------------------------

/** Starts the periodic retention sweep of rotated logs. */
function startPeriodicLogCleanup(): void {
	purgeOldRotatedLogs();
	setInterval(() => purgeOldRotatedLogs(), LOG_CLEANUP_INTERVAL_MS);
}

function purgeOldRotatedLogs(): void {
	const now = Date.now();
	for (const base of ROTATED_LOGS) {
		const dir = path.join(LOGS_DIR, base);
		let files: string[];
		try {
			files = fs.readdirSync(dir);
		} catch {
			continue; // Directory doesn't exist — nothing to purge.
		}
		for (const file of files) {
			if (!file.endsWith('.txt')) continue;
			const filePath = path.join(dir, file);
			try {
				if (now - fs.statSync(filePath).mtimeMs > LOG_RETENTION_MS) {
					fs.unlinkSync(filePath);
				}
			} catch (err: unknown) {
				const detail = err instanceof Error ? err.stack : String(err);
				logEventsAndPrint(`Error purging old log file '${filePath}': ${detail}`, 'errLog');
			}
		}
	}
}

// Exports --------------------------------

export { LOGS_DIR, logEvents, logEventsAndPrint, startPeriodicLogCleanup };
