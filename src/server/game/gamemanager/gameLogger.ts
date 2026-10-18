// src/server/game/gamemanager/gameLogger.ts

/**
 * Writes a finished game's permanent record: the "games" row, the rating changes of a
 * rated game, and the players' "player_stats" counters — one transaction, one concern.
 *
 * This is the WRITE side; `deadGameState.ts` is the READ side
 * that reconstructs a concluded game from these columns.
 *
 * The Cheat-report overturn section stays HERE rather than in `cheatReport.ts`: it reverses
 * cell-for-cell what the log side wrote, and shares three of its helpers. Apart they would drift.
 */

import type { RatingData } from '../../utility/ratingCalculation.js';
import type { GamesRecord } from '../../database/gamesManager.js';
import type { PlayerOutcome } from '../../database/playerStatsManager.js';
import type { GameConclusion } from '../../../shared/chess/util/typeschemas.js';
import type { MetaData, Rating } from '../../../shared/chess/util/metadatautil.js';
import type { PlayerGroup, Player } from '../../../shared/chess/util/typeutil.js';
import type { MatchInfo, PlayerData, ServerGame } from './serverGameTypes.js';

import jsutil from '../../../shared/util/jsutil.js';
import timeutil from '../../../shared/util/timeutil.js';
import clockutil from '../../../shared/chess/util/clockutil.js';
import metadatautil from '../../../shared/chess/util/metadatautil.js';
import icnconverter from '../../../shared/chess/logic/icn/icnconverter.js';
import leaderboardregistry from '../../../shared/chess/variants/leaderboardregistry.js';

import db from '../../database/database.js';
import logEvents from '../../utility/logEvents.js';
import gameUtility from './gameUtility.js';
import gamesManager from '../../database/gamesManager.js';
import modifierColumns from './modifierColumns.js';
import gameStateBuilder from './gameStateBuilder.js';
import liveGamesManager from '../../database/liveGamesManager.js';
import ratingCalculation from '../../utility/ratingCalculation.js';
import engineGamesManager from '../../database/engineGamesManager.js';
import playerStatsManager from '../../database/playerStatsManager.js';
import playerGamesManager from '../../database/playerGamesManager.js';
import leaderboardsManager from '../../database/leaderboardsManager.js';

// Functions -------------------------------------------------------------------

/**
 * Moves a completed game out of live storage and into permanent storage: it deletes the game's
 * `live_games` row, then adds to and updates the games, player_games, player_stats and
 * leaderboards tables in one atomic transaction (either all queries succeed, or none do).
 * @returns The rating data if the game was rated and not aborted, otherwise undefined.
 * @throws If a database error occurs during the transaction. The game will be recorded to
 *   unloggedGames.txt for debugging info, it WON'T contain enough info for recovery.
 */
function log(servergame: ServerGame): RatingData | undefined {
	// Dropped first, and outside the transaction below, so a logged game can never outlive its
	// live row. A failed log then merely loses the game, instead of leaving one to be revived.
	liveGamesManager.remove(servergame.match.id);

	// Zero-move games are not recorded permanently.
	if (servergame.moves.length === 0) return;

	try {
		return db.transaction(() => logGameInTransaction(servergame))();
	} catch (error) {
		// This block will only execute if the transaction throws an error, causing a rollback.
		const errorMessage = jsutil.getErrorMessage(error);
		const errorStack = error instanceof Error ? error.stack : 'No stack trace available';
		void logEvents.addAndPrint(
			`FATAL: Game log transaction failed and was rolled back for Game ID ${servergame.match.id}. Check unloggedGames log. Error: ${errorMessage}\n${errorStack}`,
			'errLog',
		);
		void logEvents.add(
			`Game: ${gameUtility.getSimplifiedGameString(servergame)}`,
			'unloggedGames.txt',
		);
		throw error; // Rethrow so callers know the log failed.
	}
}

/**
 * This is the core orchestrator that runs INSIDE the transaction of logging the game.
 * It performs all reads, calculations, and writes in a single, atomic operation.
 * It is designed to throw an error on any failure to trigger a rollback of the database.
 * Either ALL operations succeed, or NONE do.
 */
function logGameInTransaction(servergame: ServerGame): RatingData | undefined {
	const match = servergame.match;
	const conclusion = servergame.gameConclusion!;
	const victor = conclusion.victor;

	// --- Part 1: Snapshot ratings, updating them if the game counts ---
	const ratingData = readCurrentRatings(match);
	const changesRatings = match.rated && victor !== undefined; // Unrated and aborted games change no ratings
	if (changesRatings) updateLeaderboardsInTransaction(match, ratingData, victor);

	// --- Part 2: Create Game Records in games and player_games tables ---
	addGameRecordsInTransaction(servergame, conclusion, ratingData);

	// --- Part 3: Update Player Stats ---
	updateAllPlayerStatsInTransaction(servergame, victor);

	return changesRatings ? ratingData : undefined;
}

/**
 * Reads each signed-in player's current rating from the leaderboard of {@link leaderboardregistry.ratingSourceOf},
 * unchanged since the game began. A player not on it gets the default rating.
 * @throws If a database error occurs.
 */
function readCurrentRatings(match: MatchInfo): RatingData {
	const leaderboard_id = leaderboardregistry.ratingSourceOf(match.variant);

	const ratingData: RatingData = {};
	for (const playerStr in match.playerData) {
		const player = Number(playerStr) as Player;
		const user_id = getUserID(match.playerData[player]);
		if (user_id === undefined) continue; // Guests have no rating.

		const entry = leaderboardsManager.getPlayerRating(user_id, leaderboard_id);
		ratingData[player] = {
			elo_at_game: entry?.elo ?? ratingCalculation.DEFAULT_LEADERBOARD_ELO,
			rating_deviation_at_game: entry?.rating_deviation ?? ratingCalculation.DEFAULT_LEADERBOARD_RD, // prettier-ignore
			rd_last_update_date: entry?.rd_last_update_date ?? null,
		};
	}
	return ratingData;
}

/**
 * Computes a rated game's rating changes into its snapshot, and writes the new ratings to the leaderboard.
 * @throws If either player is a guest, or a database error occurs.
 */
function updateLeaderboardsInTransaction(
	match: MatchInfo,
	ratingData: RatingData,
	victor: Player | null,
): void {
	const leaderboard_id = leaderboardregistry.ofVariant(match.variant)!; // Will always be defined if the game is rated.

	ratingCalculation.computeChanges(ratingData, victor);

	for (const playerStr in ratingData) {
		const player = Number(playerStr) as Player;
		const user_id = getUserID(match.playerData[player])!; // The snapshot holds only signed-in players.
		const data = ratingData[player]!;
		if (!leaderboardsManager.isPlayerIn(user_id, leaderboard_id)) {
			leaderboardsManager.addUser(
				user_id,
				leaderboard_id,
				ratingCalculation.DEFAULT_LEADERBOARD_ELO,
				ratingCalculation.DEFAULT_LEADERBOARD_RD,
			);
		}
		leaderboardsManager.updatePlayerRating(
			user_id,
			leaderboard_id,
			data.elo_after_game!,
			data.rating_deviation_after_game!,
		);
	}
}

/** [INTERNAL] Adds the records to the `games`, `player_games` and `engine_games` tables. Throws on error. */
function addGameRecordsInTransaction(
	servergame: ServerGame,
	conclusion: GameConclusion,
	ratingData: RatingData,
): void {
	const match = servergame.match;
	const victor = conclusion.victor;
	const { baseTimeSeconds: base_time_seconds, incrementSeconds: increment_seconds } =
		clockutil.splitTimeControl(match.clock);

	// Assemble the ICN metadata once on demand from the game's source-of-truth props.
	const { ratings, ratingChanges } = splitRatingData(ratingData);
	const metadata = gameStateBuilder.buildMetadata(servergame, ratings, ratingChanges);

	// --- Prepare ICN ---
	const icn = getICNOfGame(servergame, metadata); // This will throw on failure.

	const dateSqliteString = timeutil.timestampToSqlite(match.timeCreated);

	// 1. Insert the main record into the 'games' table.
	gamesManager.insert({
		game_id: match.id,
		date: dateSqliteString,
		base_time_seconds,
		increment_seconds,
		// NULL marks a custom game, whose start position is in the ICN instead.
		variant: gameUtility.getVariantCode(match.variant),
		rated: match.rated ? 1 : 0,
		leaderboard_id: leaderboardregistry.ofVariant(match.variant) ?? null,
		private: match.private ? 1 : 0,
		...encodeConclusion(conclusion),
		move_count: servergame.moves.length,
		time_duration_millis: match.timeEnded ? match.timeEnded - match.timeCreated : null,
		icn, // Use the pre-generated ICN
		...modifierColumns.toColumns(match.modifiers),
	});

	// 2. Loop through players and insert records into the 'player_games' table.
	for (const playerStr in match.playerData) {
		const player = Number(playerStr) as Player;
		const user_id = getUserID(match.playerData[player]);
		if (!user_id) continue;
		const rating = ratingData[player]!; // Every signed-in player has a snapshot.

		playerGamesManager.insert({
			user_id,
			game_id: match.id,
			player_number: player,
			score: getScoreForPlayer(victor, player),
			elo_at_game: rating.elo_at_game,
			elo_change_from_game: rating.elo_change_from_game ?? null,
			rating_deviation_at_game: rating.rating_deviation_at_game,
			rating_deviation_after_game: rating.rating_deviation_after_game ?? null,
		});
	}
	if (match.engineParticipant) {
		const engine = match.engineParticipant;
		engineGamesManager.insert({
			game_id: match.id,
			player_number: engine.color,
			score: getScoreForPlayer(victor, engine.color), // prettier-ignore
			engine: engine.engine,
			engine_version: engine.version,
			strength_level: engine.strengthLevel,
		});
	}
}

/**
 * [INTERNAL] Loops through all players in a game and updates their stats by calling
 * the single-player update function.
 */
function updateAllPlayerStatsInTransaction(
	servergame: ServerGame,
	victor: Player | null | undefined,
): void {
	const match = servergame.match;
	const playerMoveCounts = getPlayerMoveCountsInGame(servergame);

	for (const playerStr in match.playerData) {
		const player = Number(playerStr) as Player;
		const user_id = getUserID(match.playerData[player]);
		if (!user_id) continue; // Guests don't have any stats to update.

		playerStatsManager.applyGameDelta(user_id, {
			moves_played_increment: playerMoveCounts[player]!,
			outcome: getOutcomeForPlayer(victor, player),
			is_rated: match.rated,
			is_private: match.private,
			sign: 1,
		});
	}
}

// Helpers ---------------------------------------------------------------------

/** A player's user_id, or undefined if they're a guest. */
function getUserID(data: PlayerData | undefined): number | undefined {
	if (!data) return undefined;
	return data.identifier.signedIn ? data.identifier.user_id : undefined;
}

/** Splits a rating snapshot into the ratings and, for a rated game, the rating changes its ICN records. */
function splitRatingData(ratingData: RatingData): {
	ratings: PlayerGroup<Rating>;
	ratingChanges?: PlayerGroup<number>;
} {
	const ratings: PlayerGroup<Rating> = {};
	let ratingChanges: PlayerGroup<number> | undefined;
	for (const [playerStr, data] of Object.entries(ratingData)) {
		const player = Number(playerStr) as Player;
		ratings[player] = ratingCalculation.toRating(data.elo_at_game, data.rating_deviation_at_game); // prettier-ignore
		if (data.elo_change_from_game !== undefined) {
			ratingChanges ??= {};
			ratingChanges[player] = data.elo_change_from_game;
		}
	}
	return { ratings, ratingChanges };
}

/** The `games` columns a {@link GameConclusion} is logged as. deadGameState's `decodeConclusion` reverses it. */
function encodeConclusion(conclusion: GameConclusion): Pick<GamesRecord, 'termination' | 'result'> {
	return {
		termination: conclusion.condition,
		result: metadatautil.getResultFromVictor(conclusion.victor),
	};
}

/** A player's score in a concluded game: `undefined` victor = aborted (null score), `null` = draw. */
function getScoreForPlayer(victor: Player | null | undefined, player: Player): number | null {
	return victor === undefined ? null : victor === player ? 1 : victor === null ? 0.5 : 0;
}

/** Derives a player's outcome from the game's victor: `undefined` victor = aborted, `null` = draw. */
function getOutcomeForPlayer(victor: Player | null | undefined, player: Player): PlayerOutcome {
	return victor === undefined ? 'aborted' : victor === player ? 'wins' : victor === null ? 'draws' : 'losses'; // prettier-ignore
}

/**
 * Converts a server-side game into an ICN. Takes the metadata assembled on demand for the game.
 * @throws If the ICN conversion fails.
 */
function getICNOfGame(servergame: ServerGame, metadata: MetaData): string {
	// Get ICN of game
	let ICN: string;
	// Only a server-validated game tracks a board; the rest hold their moves as text alone.
	const snapshot = servergame.validateMoves ? servergame.startSnapshot : undefined;
	const fullMove = snapshot?.fullMove ?? 1;
	const moveRuleState = snapshot
		? snapshot.state_global.moveRuleState
		: servergame.gameRules.moveRule !== undefined
			? 0
			: undefined;
	try {
		ICN = icnconverter.LongToShort_Format(
			{
				...servergame,
				metadata,
				fullMove,
				// Custom games are always server-validated, so this is always there for them.
				position: snapshot?.position,
				state_global: {
					moveRuleState,
					enpassant: snapshot?.state_global.enpassant,
					specialRights: snapshot?.state_global.specialRights,
				},
			},
			{
				// A custom game's start position survives nowhere but
				// here — a preset's is regenerated from its Variant tag.
				skipPosition: servergame.match.variant.kind === 'preset',
				compact: true,
				spaces: false,
				comments: true,
				make_new_lines: false,
				move_numbers: false,
			},
		);
	} catch (error: unknown) {
		const errMessage = jsutil.getErrorMessage(error);
		const errStack = error instanceof Error ? error.stack : 'No stack trace available';
		// Re-throw error with additional context, the orchestrator will catch it and roll back the transaction.
		throw Error(`Error converting game to ICN: ${errMessage}\n${errStack}`);
	}

	return ICN;
}

/**
 * Counts the number of moves each player has made in the game.
 *
 * TODO: Move to moveutil script, once its dependancies are healthy!!!
 */
function getPlayerMoveCountsInGame(servergame: ServerGame): PlayerGroup<number> {
	const match = servergame.match;
	// Optimized to not require iterating through each move in the list.
	const playerMoveCounts: PlayerGroup<number> = {};
	const fullmoves_completed_total = Math.floor(
		servergame.moves.length / servergame.gameRules.turnOrder.length,
	);
	const last_partial_move_length =
		servergame.moves.length % servergame.gameRules.turnOrder.length;
	for (const playerStr in match.playerData) {
		const player: Player = Number(playerStr) as Player;
		playerMoveCounts[player] =
			fullmoves_completed_total *
			servergame.gameRules.turnOrder.filter((p: Player) => p === player).length;
		playerMoveCounts[player] += servergame.gameRules.turnOrder
			.slice(0, last_partial_move_length)
			.filter((p: Player) => p === player).length;
	}
	return playerMoveCounts;
}

// Cheat-report overturn -------------------------------------------------------

/**
 * Re-logs an already-logged game after a cheat report overturns its result to an abort.
 * Rewrites the affected `games`/`player_games` cells — or deletes the whole record if the
 * report popped the game down to zero moves (never stored) — and reverses the `player_stats`
 * counters the original conclusion incremented. Runs as one atomic transaction.
 *
 * leaderboardregistry.IDS/ratings are never touched: only non-server-validated games can be reported,
 * and those are never rated. Errors are logged (not thrown): the overturn already happened
 * in memory and was broadcast, so a DB failure here can't be undone, only flagged.
 *
 * @param servergame - The game, already overturned in memory (last move popped, conclusion set to aborted).
 * @param originalConclusion - The conclusion that was logged, needed to reverse the right `player_stats` counters.
 * @param cheaterColor - The color whose now-popped move triggered the report; loses one from `moves_played`.
 */
function updateOverturned(
	servergame: ServerGame,
	originalConclusion: GameConclusion,
	cheaterColor: Player,
): void {
	const match = servergame.match;
	const gameStillExists = servergame.moves.length > 0;

	try {
		const transaction = db.transaction(() => {
			// --- Part 1: games + player_games cells (or full deletion) ---
			if (gameStillExists) {
				updateGameRecordForOverturn(servergame);
				// The `games` row survives, so its page still renders — the chat stays.
			} else {
				gamesManager.remove(match.id); // Zero-move games are never stored; cascades to player_games.
			}

			// --- Part 2: player_stats counters (kept separate from the record update above) ---
			reversePlayerStatsForOverturn(
				servergame,
				originalConclusion,
				cheaterColor,
				gameStillExists,
			);
		});
		transaction();
	} catch (error) {
		const errorMessage = jsutil.getErrorMessage(error);
		void logEvents.addAndPrint(
			`Failed to update overturned game ${match.id} in the database after a cheat report. The permanent record may be inconsistent with the in-memory (aborted) result. Error: ${errorMessage}`,
			'errLog',
		);
	}
}

/** Rewrites the `games` row and nulls each signed-in player's `player_games.score` for an overturned (aborted) game. */
function updateGameRecordForOverturn(servergame: ServerGame): void {
	const match = servergame.match;

	// Regenerate the ICN from the now-popped move list and the aborted metadata.
	const ratings = readLoggedRatings(match.id);
	const metadata = gameStateBuilder.buildMetadata(servergame, ratings);
	const icn = getICNOfGame(servergame, metadata);

	gamesManager.update(match.id, {
		...encodeConclusion(servergame.gameConclusion!),
		move_count: servergame.moves.length,
		icn,
	});

	// An aborted game has no per-player score.
	for (const playerStr in match.playerData) {
		const player = Number(playerStr) as Player;
		if (!match.playerData[player]!.identifier.signedIn) continue; // Guests have no row.
		playerGamesManager.update(match.id, player, { score: null });
	}
}

/** The ratings a logged game's signed-in players went into it with. */
function readLoggedRatings(game_id: number): PlayerGroup<Rating> {
	const rows = playerGamesManager.getOfGame(game_id, ['player_number', 'elo_at_game', 'rating_deviation_at_game']); // prettier-ignore
	const ratings: PlayerGroup<Rating> = {};
	for (const row of rows) {
		// Only legacy rows have a null elo_at_game, and those games are long finalized: never overturned.
		ratings[row.player_number as Player] = ratingCalculation.toRating(row.elo_at_game!, row.rating_deviation_at_game); // prettier-ignore
	}
	return ratings;
}

/**
 * Corrects the `player_stats` counters for an overturned game: un-counts the original outcome,
 * then re-counts the game as aborted (skipped if it popped down to 0 moves and no longer exists).
 *
 * The single popped move belongs to the cheater, so their pre-pop move count is one higher than
 * their current (post-pop) count; every other player's is unchanged.
 *
 * @param servergame - The game, already overturned in memory (last move popped, conclusion set to aborted).
 * @param originalConclusion - The conclusion that was logged, whose counters need un-counting.
 * @param cheaterColor - The color whose now-popped move triggered the report; their pre-pop move count is one higher.
 * @param gameStillExists - False if the report popped the game to 0 moves (deleted, not re-counted as aborted).
 */
function reversePlayerStatsForOverturn(
	servergame: ServerGame,
	originalConclusion: GameConclusion,
	cheaterColor: Player,
	gameStillExists: boolean,
): void {
	const match = servergame.match;
	const postPopMoveCounts = getPlayerMoveCountsInGame(servergame);

	for (const playerStr in match.playerData) {
		const player = Number(playerStr) as Player;
		const identifier = match.playerData[player]!.identifier;
		if (!identifier.signedIn) continue; // Guests have no stats.
		const user_id = identifier.user_id;

		const postPopMoves = postPopMoveCounts[player]!;
		const prePopMoves = postPopMoves + (player === cheaterColor ? 1 : 0);

		// Un-count exactly what the original conclusion counted (its pre-pop move counts).
		playerStatsManager.applyGameDelta(user_id, {
			moves_played_increment: prePopMoves,
			outcome: getOutcomeForPlayer(originalConclusion.victor, player),
			is_rated: match.rated,
			is_private: match.private,
			sign: -1,
		});

		// Re-count the game as aborted — unless it popped down to nothing (0 moves = never stored).
		if (gameStillExists)
			playerStatsManager.applyGameDelta(user_id, {
				moves_played_increment: postPopMoves,
				outcome: 'aborted',
				is_rated: match.rated,
				is_private: match.private,
				sign: 1,
			});
	}
}

// Exports ---------------------------------------------------------------------

export default {
	// Functions
	log,
	// Cheat-report overturn
	updateOverturned,
};
