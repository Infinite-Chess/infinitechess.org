// src/server/game/gamemanager/gamelogger.ts

/**
 * Writes a finished game's permanent record: the "games" row, the rating changes of a
 * rated game, and the players' "player_stats" counters — one transaction, one concern.
 *
 * This is the WRITE side; `deadgamestate.ts` is the READ side
 * that reconstructs a concluded game from these columns.
 *
 * The Cheat-report overturn section stays HERE rather than in `cheatreport.ts`: it reverses
 * cell-for-cell what the log side wrote, and shares four of its helpers. Apart they would drift.
 */

import type { MetaData } from '../../../shared/chess/util/metadatautil.js';
import type { RatingData } from '../../utility/ratingcalculation.js';
import type { GameConclusion } from '../../../shared/chess/util/typeschemas.js';
import type { PlayerGroup, Player } from '../../../shared/util/typeutil.js';
import type { MatchInfo, PlayerData, ServerGame } from './servergametypes.js';

import jsutil from '../../../shared/util/jsutil.js';
import timeutil from '../../../shared/util/timeutil.js';
import clockutil from '../../../shared/chess/util/clockutil.js';
import icnconverter from '../../../shared/chess/logic/icn/icnconverter.js';
import leaderboardregistry from '../../../shared/chess/variants/leaderboardregistry.js';

import db from '../../database/database.js';
import logEvents from '../../utility/logEvents.js';
import gameutility from './gameutility.js';
import gamesManager from '../../database/gamesManager.js';
import gamestatebuilder from './gamestatebuilder.js';
import liveGamesManager from '../../database/liveGamesManager.js';
import ratingcalculation from '../../utility/ratingcalculation.js';
import engineGamesManager from '../../database/engineGamesManager.js';
import playerGamesManager from '../../database/playerGamesManager.js';
import leaderboardsManager from '../../database/leaderboardsManager.js';

// Types -----------------------------------------------------------------------

/** A single player's outcome in a game, from that player's perspective. */
type PlayerOutcome = 'wins' | 'losses' | 'draws' | 'aborted';

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

	if (servergame.moves.length === 0) return; // Zero-move games are not recorded permanently.

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
			`Game: ${gameutility.getSimplifiedGameString(servergame)}`,
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
	const { victor, condition: termination } = servergame.gameConclusion!;

	// --- Part 1: Handle Rating Updates ---
	const ratingData = updateLeaderboardsInTransaction(servergame.match, victor);

	// --- Part 2: Create Game Records in games and player_games tables ---
	addGameRecordsInTransaction(servergame, victor, termination, ratingData);

	// --- Part 3: Update Player Stats ---
	updateAllPlayerStatsInTransaction(servergame, victor);

	// If all steps succeed, return the rating data.
	return ratingData;
}

/**
 * Updates leaderboards within the transaction. It calculates rating changes
 * and calls the unsafe (error-throwing) _core functions to update the database.
 * @returns The final rating data object, or undefined if the game was not rated, or aborted.
 * @throws If a database error occurs.
 */
function updateLeaderboardsInTransaction(
	match: MatchInfo,
	victor: Player | null | undefined,
): RatingData | undefined {
	if (!match.rated || victor === undefined) return undefined; // If game is unrated or aborted, then no ratings get updated

	const leaderboard_id = leaderboardregistry.ofVariant(match.variant)!; // Will always be defined if the game is rated.

	// 1. Build initial rating data by reading from the DB.
	let ratingdata: RatingData = {};
	for (const playerStr in match.playerData) {
		const player: Player = Number(playerStr) as Player;
		const user_id = getUserID(match.playerData[player]);
		if (user_id === undefined)
			throw new Error(`Attempted to process rating for player ${playerStr} in rated game ${match.id} without a user_id.`); // prettier-ignore

		// If a player isn't on the leaderboard, add them first.
		// We use the _core (error-throwing) version because we are inside a transaction.
		if (!leaderboardsManager.isPlayerIn(user_id, leaderboard_id)) {
			leaderboardsManager.addUser(
				user_id,
				leaderboard_id,
				ratingcalculation.DEFAULT_LEADERBOARD_ELO,
				ratingcalculation.DEFAULT_LEADERBOARD_RD,
			);
		}

		// We can now safely assume the player has a rating record.
		const leaderboard_data = leaderboardsManager.getPlayerRating(user_id, leaderboard_id);
		if (leaderboard_data === undefined)
			throw Error(`Unable to read leaderboard data for user_id ${user_id} in leaderboard ${leaderboard_id}. This should never happen, they should have been added!`); // prettier-ignore

		ratingdata[player] = {
			elo_at_game: leaderboard_data.elo,
			rating_deviation_at_game: leaderboard_data.rating_deviation,
			rd_last_update_date: leaderboard_data.rd_last_update_date,
		};
	}

	// 2. Calculate the new ratings.
	ratingdata = ratingcalculation.computeChanges(ratingdata, victor);

	// 3. Write the new ratings to the database.
	for (const playerStr in ratingdata) {
		const player: Player = Number(playerStr) as Player;
		// TS is annoying sometimes, we already know all the players have user_ids
		const user_id = getUserID(match.playerData[player]);
		const data = ratingdata[player]!;
		leaderboardsManager.updatePlayerRating(
			user_id!,
			leaderboard_id,
			data.elo_after_game!,
			data.rating_deviation_after_game!,
		);
	}

	return ratingdata;
}

/** [INTERNAL] Adds the records to the `games`, `player_games` and `engine_games` tables. Throws on error. */
function addGameRecordsInTransaction(
	servergame: ServerGame,
	victor: Player | null | undefined,
	termination: string,
	ratingData: RatingData | undefined,
): void {
	const match = servergame.match;
	const { baseTimeSeconds: base_time_seconds, incrementSeconds: increment_seconds } =
		clockutil.splitTimeControl(match.clock);

	// Assemble the ICN metadata once on demand from the game's source-of-truth props.
	const metadata = gamestatebuilder.buildMetadata(servergame, ratingData);

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
		variant: gameutility.getVariantCode(match.variant),
		rated: match.rated ? 1 : 0,
		leaderboard_id: leaderboardregistry.ofVariant(match.variant) ?? null,
		private: 0, // All matches are considered public for now, even "Challenge a friend" games.
		result: metadata.Result!,
		termination,
		move_count: servergame.moves.length,
		time_duration_millis: match.timeEnded ? match.timeEnded - match.timeCreated : null,
		icn, // Use the pre-generated ICN
		mod_slide_limit: match.modifiers?.find((m) => m.kind === 'slide-limit')?.value ?? null,
	});

	// 2. Loop through players and insert records into the 'player_games' table.
	for (const playerStr in match.playerData) {
		const player = Number(playerStr) as Player;
		const user_id = getUserID(match.playerData[player]);
		if (!user_id) continue;

		playerGamesManager.insert({
			user_id,
			game_id: match.id,
			player_number: player,
			score: getScoreForPlayer(victor, player),
			elo_at_game: ratingData?.[player]?.elo_at_game ?? null,
			elo_change_from_game: ratingData?.[player]?.elo_change_from_game ?? null,
			rating_deviation_at_game: ratingData?.[player]?.rating_deviation_at_game ?? null,
			rating_deviation_after_game: ratingData?.[player]?.rating_deviation_after_game ?? null,
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

		updateSinglePlayerStatsInTransaction(user_id, {
			moves_played_increment: playerMoveCounts[player]!,
			outcome: getOutcomeForPlayer(victor, player),
			is_rated: match.rated,
			sign: 1,
		});
	}
}

/**
 * [INTERNAL] Applies a single player's aggregate-stat deltas to the `player_stats` table.
 * `sign: 1` counts a game (logging), `sign: -1` un-counts it (reversing an overturned game)
 * @throws If the user has no `player_stats` row — impossible unless they deleted their account mid-game.
 */
function updateSinglePlayerStatsInTransaction(
	user_id: number,
	statsToUpdate: {
		moves_played_increment: number;
		outcome: PlayerOutcome;
		is_rated: boolean;
		sign: 1 | -1;
	},
): void {
	const op = statsToUpdate.sign === 1 ? '+' : '-'; // The arithmetic operator applied to every counter.

	const setClauses: string[] = [`moves_played = moves_played ${op} ?`, `game_count = game_count ${op} 1`]; // prettier-ignore
	const values: (number | string)[] = [statsToUpdate.moves_played_increment];

	if (statsToUpdate.outcome === 'aborted') {
		setClauses.push(`game_count_aborted = game_count_aborted ${op} 1`);
	} else {
		const ratedString: 'rated' | 'casual' = statsToUpdate.is_rated ? 'rated' : 'casual';
		const publicity: 'public' | 'private' = 'public'; // All games are considered public for now, even "Challenge a friend" games.
		const outcome = statsToUpdate.outcome;
		// The rated/casual, public/private, win/loss/draw, and combined outcome+rated/casual counters.
		setClauses.push(`game_count_${ratedString} = game_count_${ratedString} ${op} 1`);
		setClauses.push(`game_count_${publicity} = game_count_${publicity} ${op} 1`);
		setClauses.push(`game_count_${outcome} = game_count_${outcome} ${op} 1`);
		setClauses.push(`game_count_${outcome}_${ratedString} = game_count_${outcome}_${ratedString} ${op} 1`); // prettier-ignore
	}

	const query = `UPDATE player_stats SET ${setClauses.join(', ')} WHERE user_id = ?`;
	values.push(user_id);

	const result = db.run(query, values);

	if (result.changes === 0) {
		// This should be impossible. If it happens, it's a critical error.
		throw new Error(`CRITICAL: User ${user_id} not found in player_stats during a stats update. This should not be possible. Did we allow them to delete their account mid-game?`); // prettier-ignore
	}
}

// Helpers ---------------------------------------------------------------------

/** A player's user_id, or undefined if they're a guest. */
function getUserID(data: PlayerData | undefined): number | undefined {
	if (!data) return undefined;
	return data.identifier.signedIn ? data.identifier.user_id : undefined;
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
			if (gameStillExists) updateGameRecordForOverturn(servergame);
			else gamesManager.remove(match.id); // Zero-move games are never stored; cascades to player_games.

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
	const metadata = gamestatebuilder.buildMetadata(servergame); // Unrated (no ratingData).
	const icn = getICNOfGame(servergame, metadata);

	gamesManager.update(match.id, {
		result: metadata.Result!,
		termination: servergame.gameConclusion!.condition,
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
		updateSinglePlayerStatsInTransaction(user_id, {
			moves_played_increment: prePopMoves,
			outcome: getOutcomeForPlayer(originalConclusion.victor, player),
			is_rated: match.rated,
			sign: -1,
		});

		// Re-count the game as aborted — unless it popped down to nothing (0 moves = never stored).
		if (gameStillExists)
			updateSinglePlayerStatsInTransaction(user_id, {
				moves_played_increment: postPopMoves,
				outcome: 'aborted',
				is_rated: match.rated,
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
