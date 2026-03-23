// src/server/database/backupManager.ts

/**
 * This module handles automated SQLite database backups.
 *
 * It uses SQLite's Online Backup API (via better-sqlite3's db.backup())
 * to produce a single consistent .db snapshot while the database is live.
 */

import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';
import { fileURLToPath } from 'url';

import db from './database.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUPS_DIR = path.join(__dirname, '../../../backups');
const MAX_BACKUP_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const BACKUP_INTERVAL_MS = 1000 * 60 * 60 * 24; // 24 hours

/** The in-flight backup promise, or null if no backup is currently running. */
let activeBackup: Promise<void> | null = null;

// Functions -------------------------------------------------------------------------

/** Schedules a database backup to run once every 24 hours. */
function startDailyBackups(): void {
	setInterval(async () => {
		try {
			await performBackup();
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			logEventsAndPrint(`Daily database backup failed: ${message}`, 'errLog.txt');
		}
	}, BACKUP_INTERVAL_MS);
}

/**
 * Creates a timestamped backup of the database in the `backups/` directory,
 * then purges any backups older than 30 days.
 * If a backup is already in progress, returns the same promise so callers join it.
 * @throws If the SQLite backup or directory creation fails.
 */
function performBackup(): Promise<void> {
	if (activeBackup !== null) return activeBackup;
	activeBackup = doBackup().finally(() => {
		activeBackup = null;
	});
	return activeBackup;
}

/**
 * The actual backup implementation.
 * @throws If the SQLite backup or directory creation fails.
 */
async function doBackup(): Promise<void> {
	if (process.env['NODE_ENV'] === 'test') return; // In-memory DB — nothing to back up.

	fs.mkdirSync(BACKUPS_DIR, { recursive: true });

	const dateFormatted = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
	const destPath = path.join(BACKUPS_DIR, `database-${dateFormatted}.db`);

	const start = Date.now();
	await db.backup(destPath);
	const elapsed = Date.now() - start;

	console.log(`Database backup created: ${path.basename(destPath)} (${elapsed}ms)`);

	purgeOldBackups();
}

/** Deletes backup files in `backups/` that are older than 30 days. */
function purgeOldBackups(): void {
	try {
		const now = Date.now();
		for (const file of fs.readdirSync(BACKUPS_DIR)) {
			if (!file.endsWith('.db')) continue;
			const filePath = path.join(BACKUPS_DIR, file);
			const stat = fs.statSync(filePath);
			if (now - stat.mtimeMs > MAX_BACKUP_AGE_MS) {
				fs.unlinkSync(filePath);
			}
		}
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		void logEventsAndPrint(`Error purging old db backups: ${message}`, 'errLog.txt');
	}
}

export { startDailyBackups, performBackup };
