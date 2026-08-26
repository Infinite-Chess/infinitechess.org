// src/server/database/migrations.ts

/**
 * The one-shot schema patches that bring an OLD database up to the shape
 * `databaseTables.ts` generates for a fresh one.
 *
 * Every migration is idempotent and self-skipping, so `run()` is safe on any database,
 * fresh or ancient. Each one is temporary: delete it, and its call in `run()`, once it
 * has run in production.
 */

import db from './database.js';
import memberManager from './memberManager.js';
import blacklistManager from './blacklistManager.js';

// Scheduling -----------------------------------------------------------------

/** Runs every migration, in order. Call after the tables exist and before the schema is read. */
function run(): void {
	dropLegacyLiveGamesPosPastedColumnIfPresent();
	dropLegacyLivePlayerGamesEloColumnIfPresent();
	addIsPersistentColumnToRefreshTokensIfNeeded();
	dropLegacyVerificationColumnsIfPresent();
	clearSpamReportBlacklistEntries();
	makeVariantColumnsNullableIfNeeded();
	addPositionColumnToLiveGamesIfNeeded();
	renameDisconnectResignTimeColumnIfNeeded();
	renameDisconnectByChoiceColumnIfNeeded();
	addBothDisconnectedEndTimeColumnToLiveGamesIfNeeded();
	dropLiveGamesConclusionColumnsIfPresent();
	dropPlayerGamesClockAtEndColumnIfPresent();
	addRatingDeviationColumnsToPlayerGamesIfNeeded();
	addModifierColumnsIfNeeded();
}

// Individual migrations ------------------------------------------------------

/**
 * TEMPORARY MIGRATION: remove (and its call in run) after it has run in production.
 *
 * The `position_pasted` column used to exist on `live_games` and needs to be removed from old DBs.
 * This only logs when the column is found and deleted.
 */
function dropLegacyLiveGamesPosPastedColumnIfPresent(): void {
	if (!db.columnExists('live_games', 'position_pasted')) return; // Already migrated.

	db.run('ALTER TABLE live_games DROP COLUMN position_pasted');
	console.log('Temporary DB migration: deleted live_games.position_pasted column.');

	db.run('ALTER TABLE live_games DROP COLUMN afk_resign_time');
	console.log('Temporary DB migration: deleted live_games.afk_resign_time column.');
}

/**
 * TEMPORARY MIGRATION: remove (and its call in run) after it has run in production.
 *
 * The `elo` column used to store a start-of-game elo snapshot on `live_player_games`.
 * Player elos are now derived live at log time, so the column is vestigial and needs
 * removing from old DBs. This only logs when the column is found and deleted.
 */
function dropLegacyLivePlayerGamesEloColumnIfPresent(): void {
	if (!db.columnExists('live_player_games', 'elo')) return; // Already migrated.

	db.run('ALTER TABLE live_player_games DROP COLUMN elo');
	console.log('Temporary DB migration: deleted live_player_games.elo column.');
}

/**
 * TEMPORARY MIGRATION: remove (and its call in run) after it has run in production.
 *
 * Adds the `is_persistent` column to the `refresh_tokens` table if it's missing. Only patches
 * existing databases (e.g. production) that predate the "keep me logged in" feature.
 * Fresh DBs get the column from `generate()`.
 */
function addIsPersistentColumnToRefreshTokensIfNeeded(): void {
	if (db.columnExists('refresh_tokens', 'is_persistent')) return; // Already migrated.
	db.run(
		`ALTER TABLE refresh_tokens ADD COLUMN is_persistent INTEGER NOT NULL DEFAULT 0 CHECK (is_persistent IN (0, 1));`,
	);
	console.log('Temporary DB migration: added the refresh_tokens.is_persistent column.');
}

/**
 * TEMPORARY MIGRATION: remove (and its call in run) after it has run in production.
 *
 * Drops the now-vestigial verification columns (`is_verified`, `verification_code`,
 * `is_verification_notified`) from the members table. Every account is now created
 * already-verified, so before losing the flag we purge any legacy member that was
 * registered under the old flow and never verified (`is_verified = 0`).
 */
function dropLegacyVerificationColumnsIfPresent(): void {
	if (!db.columnExists('members', 'is_verified')) return; // Already migrated.

	// Purge any remaining legacy unverified members before we drop the flag.
	const membersToDelete = db.all<{ user_id: number }>(
		`SELECT user_id FROM members WHERE is_verified = 0`,
	);
	for (const member of membersToDelete) {
		memberManager.remove(member.user_id, 'unverified');
	}
	console.log(`Temporary DB migration: purged ${membersToDelete.length} unverified member(s).`);

	db.run('ALTER TABLE members DROP COLUMN is_verified');
	db.run('ALTER TABLE members DROP COLUMN verification_code');
	db.run('ALTER TABLE members DROP COLUMN is_verification_notified');
	console.log('Temporary DB migration: dropped verification columns from members table.');
}

/**
 * TEMPORARY MIGRATION: remove (and its call in run) after it has run in production.
 *
 * Idempotent: clears every `reason = 'spam_report'` row from `email_blacklist`.
 * Policy changed so spam complaints no longer suppress anyone (every email we send is transactional).
 * Don't lock users out of their accounts.
 */
function clearSpamReportBlacklistEntries(): void {
	// Clear every spam_report suppression.
	const spamRows = db.all<{ email: string }>(
		`SELECT email FROM email_blacklist WHERE reason = 'spam_report'`,
	);
	for (const row of spamRows) {
		blacklistManager.remove(row.email); // Logs each removal to blacklistLog for auditability.
	}
	if (spamRows.length > 0)
		console.log(`Temporary DB migration: cleared ${spamRows.length} 'spam_report' blacklist entries.`); // prettier-ignore
}

/**
 * TEMPORARY MIGRATION: remove (and its call in run) after it has run in production.
 *
 * Makes the `variant` column nullable on `games` and `live_games` — NULL now marks a
 * custom-position game (no preset code; its position lives in the ICN). SQLite can't relax
 * NOT NULL in place, so we shuffle through a temp column: add nullable `variant_tmp`, copy
 * the codes across, drop the old `variant`, rename `variant_tmp` back. No table rebuild, so
 * the `player_games` → `games` FK cascade is never triggered. Idempotent: skips a table whose
 * `variant` is already nullable. Fresh DBs get nullable from `generate()` directly.
 */
function makeVariantColumnsNullableIfNeeded(): void {
	for (const table of ['games', 'live_games'] as const) {
		if (db.columnIsNullable(table, 'variant')) continue; // Already migrated.

		const migrate = db.transaction(() => {
			db.run(`ALTER TABLE ${table} ADD COLUMN variant_tmp TEXT`);
			db.run(`UPDATE ${table} SET variant_tmp = variant`);
			db.run(`ALTER TABLE ${table} DROP COLUMN variant`);
			db.run(`ALTER TABLE ${table} RENAME COLUMN variant_tmp TO variant`);
		});
		migrate();
		console.log(`Temporary DB migration: made ${table}.variant nullable.`);
	}
}

/**
 * TEMPORARY MIGRATION: remove (and its call in run) after it has run in production.
 *
 * Adds the nullable `position` column to `live_games` — holds a custom game's start position
 * (null for preset games), so custom games can be restored across a restart (preset games
 * rebuild from the variant code alone). Fresh DBs get the column from `generate()`.
 */
function addPositionColumnToLiveGamesIfNeeded(): void {
	if (db.columnExists('live_games', 'position')) return; // Already migrated.
	db.run('ALTER TABLE live_games ADD COLUMN position TEXT');
	console.log('Temporary DB migration: added live_games.position column.');
}

/**
 * TEMPORARY MIGRATION: remove (and its call in run) after it has run in production.
 *
 * Renames `live_player_games.disconnect_resign_time` → `disconnect_claim_time`. The column's
 * meaning changed: it no longer auto-resigns the player, it now marks the epoch ms from which
 * the opponent may claim victory/draw. The stored value (the same instant) carries over.
 * Fresh DBs get the new name from `generate()`.
 */
function renameDisconnectResignTimeColumnIfNeeded(): void {
	if (!db.columnExists('live_player_games', 'disconnect_resign_time')) return; // Already migrated.
	db.run(
		'ALTER TABLE live_player_games RENAME COLUMN disconnect_resign_time TO disconnect_claim_time',
	);
	console.log('Temporary DB migration: renamed live_player_games.disconnect_resign_time to disconnect_claim_time.'); // prettier-ignore
}

/**
 * TEMPORARY MIGRATION: remove (and its call in run) after it has run in production.
 *
 * Renames `live_player_games.disconnect_by_choice` → `disconnect_voluntary`. The column's
 * name was made more semantically clear. The stored value carries over unchanged.
 * Fresh DBs get the new name from `generate()`.
 */
function renameDisconnectByChoiceColumnIfNeeded(): void {
	if (!db.columnExists('live_player_games', 'disconnect_by_choice')) return; // Already migrated.
	db.run(
		'ALTER TABLE live_player_games RENAME COLUMN disconnect_by_choice TO disconnect_voluntary',
	);
	console.log('Temporary DB migration: renamed live_player_games.disconnect_by_choice to disconnect_voluntary.'); // prettier-ignore
}

/**
 * TEMPORARY MIGRATION: remove (and its call in run) after it has run in production.
 *
 * Adds the nullable `both_disconnected_end_time` column to `live_games` — the epoch ms the
 * both-disconnected timer concludes the game (draw by abandonment, or abort) when neither
 * player is present to claim. Fresh DBs get the column from `generate()`.
 */
function addBothDisconnectedEndTimeColumnToLiveGamesIfNeeded(): void {
	if (db.columnExists('live_games', 'both_disconnected_end_time')) return; // Already migrated.
	db.run('ALTER TABLE live_games ADD COLUMN both_disconnected_end_time INTEGER');
	console.log('Temporary DB migration: added live_games.both_disconnected_end_time column.');
}

/**
 * TEMPORARY MIGRATION: remove (and its call in run) after it has run in production.
 *
 * Concluded games are now logged to the permanent `games` table the instant they end, and their
 * `live_games` row is dropped immediately — so only ongoing games are ever persisted/restored.
 * The conclusion snapshot columns (`conclusion_condition`, `conclusion_victor`, `time_ended`) and
 * the `delete_time` finalize deadline are therefore vestigial and need removing from old DBs.
 * Fresh DBs never have them.
 */
function dropLiveGamesConclusionColumnsIfPresent(): void {
	if (!db.columnExists('live_games', 'delete_time')) return; // Already migrated.
	for (const column of [
		'conclusion_condition',
		'conclusion_victor',
		'time_ended',
		'delete_time',
	]) {
		db.run(`ALTER TABLE live_games DROP COLUMN ${column}`);
	}
	console.log('Temporary DB migration: dropped live_games conclusion snapshot columns.');
}

/**
 * TEMPORARY MIGRATION: remove (and its call in run) after it has run in production.
 *
 * A concluded game's final clocks are now read back off its ICN's `clk` stamps, matching how
 * PGN records them, so the stored `clock_at_end_millis` is vestigial. Fresh DBs never have it.
 * `engine_games` needs no such migration — it doesn't exist in production yet.
 */
function dropPlayerGamesClockAtEndColumnIfPresent(): void {
	if (!db.columnExists('player_games', 'clock_at_end_millis')) return; // Already migrated.
	db.run(`ALTER TABLE player_games DROP COLUMN clock_at_end_millis`);
	console.log('Temporary DB migration: dropped player_games.clock_at_end_millis column.');
}

/**
 * TEMPORARY MIGRATION: remove (and its call in run) after it has run in production.
 *
 * Adds the nullable `rating_deviation_at_game` / `rating_deviation_after_game` columns to
 * `player_games` — the Glicko RDs before/after the game, so a concluded game's pre-game and
 * new ratings can each report faithful confidence in review (mirroring the live path) instead
 * of being hardcoded confident. Old rows stay NULL (treated as confident, unrecoverable).
 * Fresh DBs get the columns from `generate()`.
 */
function addRatingDeviationColumnsToPlayerGamesIfNeeded(): void {
	if (db.columnExists('player_games', 'rating_deviation_at_game')) return; // Already migrated.
	db.run('ALTER TABLE player_games ADD COLUMN rating_deviation_at_game REAL');
	db.run('ALTER TABLE player_games ADD COLUMN rating_deviation_after_game REAL');
	console.log('Temporary DB migration: added player_games rating_deviation columns.');
}

/**
 * TEMPORARY MIGRATION: remove (and its call in run) after it has run in production.
 *
 * Adds the `mod_slide_limit` column to `games` and `live_games` — the Slide Limit modifier's
 * value, with NULL marking the modifier inactive. Existing rows need no backfill: every game
 * played before modifiers existed had none. Fresh DBs get the column from `generate()`.
 */
function addModifierColumnsIfNeeded(): void {
	for (const table of ['games', 'live_games'] as const) {
		if (db.columnExists(table, 'mod_slide_limit')) continue; // Already migrated.
		db.run(`ALTER TABLE ${table} ADD COLUMN mod_slide_limit INTEGER`);
		console.log(`Temporary DB migration: added ${table}.mod_slide_limit column.`);
	}
}

// Exports --------------------------------------------------------------------

export default { run };
