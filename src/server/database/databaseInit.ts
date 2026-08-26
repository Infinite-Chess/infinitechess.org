// src/server/database/databaseInit.ts

/**
 * Brings the database up at boot: the schema first, then the background work that runs
 * against it. The top of `database/` — everything else here is reached through it.
 *
 * Integration tests call {@link buildSchema} alone, skipping the periodic tasks.
 */

import db from './database.js';
import migrations from './migrations.js';
import cleanupTasks from './cleanupTasks.js';
import backupManager from './backupManager.js';
import databaseTables from './databaseTables.js';
import leaderboardsManager from './leaderboardsManager.js';

// Functions ------------------------------------------------------------------

/** Readies the database for use, and starts every recurring task that runs against it. */
function init(): void {
	buildSchema();
	startPeriodicTasks();
}

/**
 * Brings the schema to its current shape, then caches it. The cache MUST be filled last:
 * the migrations alter tables, so anything read before them would be out of date.
 */
function buildSchema(): void {
	databaseTables.generateTables();
	migrations.run();
	db.cacheAllColumns();
}

/** Starts every recurring database task: stale-data cleanup, rating decay, and backups. */
function startPeriodicTasks(): void {
	cleanupTasks.startPeriodic();
	leaderboardsManager.startPeriodicRatingDeviationUpdate();
	backupManager.startDaily();
}

// Exports --------------------------------------------------------------------

export default { init, buildSchema };
