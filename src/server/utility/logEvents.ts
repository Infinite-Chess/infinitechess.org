// src/server/utility/logEvents.ts

/**
 * Core log writer: appends one timestamped line per event to the right file,
 * handling weekly rotation and retention. (The trigger entries themselves are
 * written by reqLogger.ts for HTTP and wsLogger.ts for websockets.)
 *
 * Each line is tagged with the correlation ID of the trigger that caused it:
 * 'R…' = an HTTP request, 'W…' = an incoming websocket message (see
 * requestContext.ts). Every line one trigger produces — across ALL log files —
 * shares its ID. The trigger's own entry is in reqLog/ (R) or wsInLog/ (W).
 *
 * A line timestamped well after its trigger is a DEFERRED effect, fired by a
 * timer the trigger scheduled. An all-dashes ID means no request caused the
 * line: startup, scheduled tasks, network-initiated closes.
 *
 * Don't confuse correlation IDs with socket IDs (`of ID "..."`), which tie a
 * CONNECTION's messages together rather than one trigger's effects.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { format, startOfISOWeek } from 'date-fns';
import { promises as fsPromises } from 'fs';

import jsutil from '../../shared/util/jsutil.js';

import requestContext from './requestContext.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Constants -------------------------------------------------------------------

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

/** Untrusted text longer than this is cut down before it reaches a log line. */
const MAX_LOGGED_TEXT_LENGTH = 2048;

/**
 * Control characters no log line may contain verbatim: C0, DEL and C1, minus the
 * `\t`, `\n` and `\r` that trusted content legitimately uses. Logs are read in a
 * terminal, where a raw ESC from untrusted data would recolor it, clear it, or
 * overwrite text to hide a record.
 */
// eslint-disable-next-line no-control-regex
const UNSAFE_LOG_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

// Text ------------------------------------------------------------------------

/**
 * Prepares untrusted, client-controlled text for a log line: capped first, then
 * newline-escaped, so the cap counts the client's characters, not our escaping of them.
 *
 * The standard path for anything a client supplied. Reach for {@link truncate} or
 * {@link escapeLogNewlines} alone only where one of the two is deliberately unwanted.
 */
function escapeUntrusted(str: string): string {
	return escapeLogNewlines(truncate(str));
}

/**
 * Escapes `\r`/`\n` to their literal forms so a raw newline in untrusted,
 * client-controlled data can't terminate the current log line and forge extra
 * records (log injection). Records are one newline-delimited line each.
 *
 * Call on the untrusted value alone, never the assembled line, so trusted
 * multi-line content (e.g. stack traces) beside it stays readable.
 */
function escapeLogNewlines(str: string): string {
	return str.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
}

/**
 * Caps untrusted text at {@link MAX_LOGGED_TEXT_LENGTH}, marking how much was cut,
 * so one client-supplied string can't bloat a log file.
 *
 * Call BEFORE escaping, so the cap counts the client's own characters, and on the
 * untrusted value alone, never the assembled line, so the rest of it survives a cut.
 */
function truncate(str: string): string {
	if (str.length <= MAX_LOGGED_TEXT_LENGTH) return str;
	const omitted = str.length - MAX_LOGGED_TEXT_LENGTH;
	return `${str.slice(0, MAX_LOGGED_TEXT_LENGTH)}…[truncated, ${omitted} more chars]`;
}

// Writing ---------------------------------------------------------------------

/**
 * Logs the provided message by appending a line to the end of the specified log file,
 * and prints it to the console as an error.
 * @param message - The message to log.
 * @param logName - The base name of the log file, without the `.txt` extension.
 */
async function addAndPrint(message: string, logName: string): Promise<void> {
	// Sanitized here too — the console is a terminal, and `add` can't reach what it prints.
	// Sanitizing the same text twice is a no-op; the first pass leaves nothing to escape.
	const sanitized = sanitizeLogText(message);
	if (logName === 'errLog') console.error(sanitized);
	else console.log(sanitized); // Prevents non error logs from going to PM2's error logs.

	await add(sanitized, logName);
}

/**
 * Logs the provided message by appending a line to the end of the specified log file.
 * @param message - The message to log.
 * @param logName - The base name of the log file, without the `.txt` extension.
 */
async function add(message: string, logName: string): Promise<void> {
	const dateTime = format(new Date(), 'yyyy/MM/dd  HH:mm:ss');
	// Tag the line with the ID of the request/socket-message that triggered
	// it, if any, so all log lines it produced (across files) can be joined.
	const requestID = requestContext.getID() ?? requestContext.REQUEST_ID_PLACEHOLDER;
	const logItem = `${dateTime}  ${requestID}   ${sanitizeLogText(message)}\n`;

	try {
		const filePath = resolveLogPath(logName);
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		await fsPromises.appendFile(filePath, logItem);
	} catch (err: unknown) {
		console.error('Error logging event:', err);
	}
}

/**
 * Renders control characters inert as their `\uXXXX` form. Applied to every line
 * at the sink, so no caller can forget it, and whitespace-only escaping stays a
 * separate, opt-in concern — see {@link escapeLogNewlines}.
 */
function sanitizeLogText(str: string): string {
	return str.replace(
		UNSAFE_LOG_CHARACTERS,
		(char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
	);
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

// Cleanup ---------------------------------------------------------------------

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
				const detail = jsutil.getErrorStack(err);
				addAndPrint(`Error purging old log file '${filePath}': ${detail}`, 'errLog');
			}
		}
	}
}

// Exports ---------------------------------------------------------------------

export default {
	LOGS_DIR,
	// Text
	escapeUntrusted,
	escapeLogNewlines,
	truncate,
	// Writing
	addAndPrint,
	add,
	// Cleanup
	startPeriodicLogCleanup,
};
