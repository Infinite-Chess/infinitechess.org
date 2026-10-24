// src/server/database/migrations.ts

/**
 * The one-shot schema patches that bring an OLD database up to the shape
 * `databaseTables.ts` generates for a fresh one.
 *
 * Every migration is idempotent and self-skipping, so `run()` is safe on any database,
 * fresh or ancient. Each one is temporary: delete it, and its call in `run()`, once it
 * has run in production.
 */

import type { RatingData } from '../utility/ratingCalculation.js';
import type { Player } from '../../shared/chess/util/typeutil.js';
import type { VariantCode } from '../../shared/chess/util/variantcodes.js';
import type { OutSeekVariant } from '../../shared/chess/util/variantselection.js';
import type { PlayerGamesRecord } from './playerGamesManager.js';

import timeutil from '../../shared/util/timeutil.js';
import leaderboardregistry from '../../shared/chess/variants/leaderboardregistry.js';

import db from './database.js';
import memberManager from './memberManager.js';
import blacklistManager from './blacklistManager.js';
import ratingCalculation from '../utility/ratingCalculation.js';

// Types -----------------------------------------------------------------------

/** A `player_games` row, beside the `games` columns its rating replay reads. */
type LoggedPlayerGameRow = {
	game_id: number;
	user_id: number;
	player_number: Player;
	score: number | null;
	elo_at_game: number | null;
	elo_change_from_game: number | null;
	date: string;
	time_duration_millis: number | null;
	variant: string | null;
	rated: 0 | 1;
};

/** A logged game, as its rating replay reads it. */
type LoggedGame = {
	game_id: number;
	/** Epoch ms the game ended. */
	ended: number;
	variant: OutSeekVariant;
	rated: boolean;
	rows: LoggedPlayerGameRow[];
};

/** A player's rating on one leaderboard, as a `leaderboards` row holds it. */
type LeaderboardRating = {
	elo: number;
	rating_deviation: number;
	rd_last_update_date: string | null;
};

// Constants -------------------------------------------------------------------

/** The rating a player not yet on a leaderboard holds, as `gameLogger` reads it. */
const DEFAULT_RATING: LeaderboardRating = {
	elo: ratingCalculation.DEFAULT_LEADERBOARD_ELO,
	rating_deviation: ratingCalculation.DEFAULT_LEADERBOARD_RD,
	rd_last_update_date: null,
};

/** How far a replayed elo or rating change may stray from a stored one. */
const REPLAY_TOLERANCE = 0.01;

// Scheduling ------------------------------------------------------------------

/**
 * Runs every migration, in order. Call after the tables exist and before the schema is read.
 * Production runs them all in one boot, each on the schema the ones above leave: new ones go last.
 */
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
	addEmptySinceColumnToLiveGamesIfNeeded();
	dropLiveGamesConclusionColumnsIfPresent();
	backfillPlayerGamesRatingsIfNeeded();
	addModifierColumnsIfNeeded();
	dropRatingAbuseLastAlertedAtColumnIfPresent();
}

// Individual migrations -------------------------------------------------------

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
 * Adds the nullable `empty_since` column to `live_games` — the epoch ms a game was found
 * with nobody connected to it, from which its abandonment timeout is measured.
 * Fresh DBs get the column from `generate()`.
 */
function addEmptySinceColumnToLiveGamesIfNeeded(): void {
	if (db.columnExists('live_games', 'empty_since')) return; // Already migrated.
	db.run('ALTER TABLE live_games ADD COLUMN empty_since INTEGER');
	console.log('Temporary DB migration: added live_games.empty_since column.');
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
	if (db.get('SELECT 1 FROM live_games WHERE conclusion_condition IS NOT NULL'))
		throw new Error('live_games holds a concluded game the old build has yet to log, which dropping its conclusion would lose. Run the old build until it logs it (about 10 seconds), then upgrade again.'); // prettier-ignore
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
 * Rebuilds `player_games` with the RD columns and NOT NULL pre-game ratings, derived by replaying
 * every rated game in finishing order through the live rating code. Keeps every stored elo and
 * rating change, and writes nothing unless the replay reproduces them all. Elo is exact; a
 * pre-game RD includes idle decay up to the game, which live logging only applied as far as the
 * RD job's last, unrecorded run. Also drops the vestigial `clock_at_end_millis`.
 */
function backfillPlayerGamesRatingsIfNeeded(): void {
	if (!db.columnIsNullable('player_games', 'elo_at_game')) return; // Already migrated.
	const records = replayRatings(readGamesInFinishingOrder());
	db.transaction(() => rebuildPlayerGamesTable(records))();
	console.log('Temporary DB migration: backfilled player_games ratings and made them NOT NULL.');
}

/** Every logged game with its `player_games` rows, ordered by when it ended. */
function readGamesInFinishingOrder(): LoggedGame[] {
	const rows = db.all<LoggedPlayerGameRow>(`
		SELECT pg.game_id, pg.user_id, pg.player_number, pg.score, pg.elo_at_game, pg.elo_change_from_game,
			g.date, g.time_duration_millis, g.variant, g.rated
		FROM player_games pg JOIN games g ON g.game_id = pg.game_id
	`);
	const games = new Map<number, LoggedGame>();
	for (const row of rows) {
		let game = games.get(row.game_id);
		if (game === undefined) {
			const variant: OutSeekVariant = row.variant === null ? { kind: 'custom' } : { kind: 'preset', code: row.variant as VariantCode }; // prettier-ignore
			// Every game here lacking a duration predates rated play, so ordering it by start is exact.
			const ended = timeutil.sqliteToTimestamp(row.date) + (row.time_duration_millis ?? 0);
			game = { game_id: row.game_id, ended, variant, rated: row.rated === 1, rows: [] };
			games.set(row.game_id, game);
		}
		game.rows.push(row);
	}
	return [...games.values()].sort((a, b) => a.ended - b.ended || a.game_id - b.game_id);
}

/**
 * Replays every game in order, from every player starting on the default rating, completing
 * each row with the ratings live logging would have stored.
 * @throws If a derived elo or rating change disagrees with one already stored.
 */
function replayRatings(games: LoggedGame[]): PlayerGamesRecord[] {
	/** Each player's current rating, keyed by `user_id:leaderboard_id`. */
	const ratings = new Map<string, LeaderboardRating>();
	const records: PlayerGamesRecord[] = [];

	for (const game of games) {
		const leaderboard_id = leaderboardregistry.ratingSourceOf(game.variant);
		const keyOf = (row: LoggedPlayerGameRow): string => `${row.user_id}:${leaderboard_id}`;

		const ratingData: RatingData = {};
		for (const row of game.rows) {
			const rating = ratings.get(keyOf(row)) ?? DEFAULT_RATING;
			ratingData[row.player_number] = {
				elo_at_game: rating.elo,
				rating_deviation_at_game: rating.rating_deviation,
				rd_last_update_date: rating.rd_last_update_date,
			};
		}

		// Unrated and aborted games change no ratings.
		const changesRatings = game.rated && game.rows.every((row) => row.score !== null);
		if (changesRatings) {
			const victor = game.rows.find((row) => row.score === 1)?.player_number ?? null;
			ratingCalculation.computeChanges(ratingData, victor, game.ended);
		}

		for (const row of game.rows) {
			const data = ratingData[row.player_number]!;
			const elo_change_from_game = data.elo_change_from_game ?? null;
			if (!doesReplayMatch(row.elo_at_game, data.elo_at_game) || !doesReplayMatch(row.elo_change_from_game, elo_change_from_game))
				throw new Error(`Rating backfill aborted: game ${row.game_id}, player ${row.player_number} stored elo ${row.elo_at_game} / change ${row.elo_change_from_game}, but the replay derived ${data.elo_at_game} / ${elo_change_from_game}.`); // prettier-ignore
			records.push({
				user_id: row.user_id,
				game_id: row.game_id,
				player_number: row.player_number,
				score: row.score,
				elo_at_game: row.elo_at_game ?? data.elo_at_game,
				elo_change_from_game: row.elo_change_from_game ?? elo_change_from_game,
				rating_deviation_at_game: ratingCalculation.getTrueRD(data.rating_deviation_at_game, data.rd_last_update_date, game.ended), // prettier-ignore
				rating_deviation_after_game: data.rating_deviation_after_game ?? null,
			});
			if (changesRatings) {
				ratings.set(keyOf(row), {
					elo: data.elo_after_game!,
					rating_deviation: data.rating_deviation_after_game!,
					rd_last_update_date: timeutil.timestampToSqlite(game.ended),
				});
			}
		}
	}
	return records;
}

/** Whether a stored value, if any, matches the replay's within {@link REPLAY_TOLERANCE}. */
function doesReplayMatch(stored: number | null, replayed: number | null): boolean {
	return (
		stored === null || (replayed !== null && Math.abs(stored - replayed) <= REPLAY_TOLERANCE)
	);
}

/**
 * Replaces `player_games` with the given rows. Its shape is frozen as of this migration, so a
 * later `player_games` migration must run AFTER it. Nothing references `player_games`, so the
 * drop is safe with foreign keys on.
 */
function rebuildPlayerGamesTable(records: PlayerGamesRecord[]): void {
	db.run('DROP TABLE player_games');
	db.run(`
		CREATE TABLE player_games (
			user_id                     INTEGER NOT NULL,
			game_id                     INTEGER NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
			player_number               INTEGER NOT NULL,
			score                       REAL,
			elo_at_game                 REAL NOT NULL,
			elo_change_from_game        REAL,
			rating_deviation_at_game    REAL NOT NULL,
			rating_deviation_after_game REAL,
			PRIMARY KEY (user_id, game_id)
		)
	`);
	for (const r of records) {
		db.run('INSERT INTO player_games VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
			r.user_id, r.game_id, r.player_number, r.score,
			r.elo_at_game, r.elo_change_from_game,
			r.rating_deviation_at_game, r.rating_deviation_after_game,
		]); // prettier-ignore
	}
	db.run('CREATE INDEX idx_player_games_game ON player_games (game_id)');
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

/**
 * TEMPORARY MIGRATION: remove (and its call in run) after it has run in production.
 *
 * The `last_alerted_at` column throttled rating abuse emails to one per player per day.
 * Every flagged measurement is now emailed, so the column is vestigial and needs removing
 * from old DBs. This only logs when the column is found and deleted.
 */
function dropRatingAbuseLastAlertedAtColumnIfPresent(): void {
	if (!db.columnExists('rating_abuse', 'last_alerted_at')) return; // Already migrated.

	db.run('ALTER TABLE rating_abuse DROP COLUMN last_alerted_at');
	console.log('Temporary DB migration: deleted rating_abuse.last_alerted_at column.');
}

// Exports ---------------------------------------------------------------------

export default { run };
