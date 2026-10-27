// src/server/database/databaseInit.ts

/**
 * Brings the database up at boot: the schema first, then the background work that runs
 * against it. The top of the `database/` ladder — everything else here is reached
 * through it.
 *
 * Integration tests call {@link buildSchema} alone, skipping the periodic tasks.
 */

import db from './database.js';
import migrations from './migrations.js';
import cleanupTasks from './cleanupTasks.js';
import backupManager from './backupManager.js';
import databaseTables from './databaseTables.js';

// Functions -------------------------------------------------------------------

/** Readies the database for use, and starts every recurring task that runs against it. */
function init(): void {
	buildSchema();
	startPeriodicTasks();
}

/** Brings the schema to its current shape, then caches it. */
function buildSchema(): void {
	databaseTables.generate();
	migrations.run();
	// MUST be filled last: the migrations alter tables.
	db.cacheAllColumns();
}

/** Starts every recurring database task: stale-data cleanup and backups. */
function startPeriodicTasks(): void {
	cleanupTasks.startPeriodic();
	backupManager.startDaily();
}

// Exports ---------------------------------------------------------------------

export default { init, buildSchema };
