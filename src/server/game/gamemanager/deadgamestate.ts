// src/server/game/gamemanager/deadgamestate.ts

/**
 * Builds the {@link StaticGameState} / {@link DeadGameState} of a concluded game from DB.
 *
 * This is the READ side; `gamelogger.ts` is the WRITE
 * side that persists these columns when a game ends.
 */

import type { VariantCode } from '../../../shared/chess/variants/variantregistry.js';
import type { GamesRecord } from '../../database/gamesManager.js';
import type { GameConclusion } from '../../../shared/chess/util/winconutil.js';
import type { PlayerGamesRecord } from '../../database/playerGamesManager.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';
import type {
	DeadGameState,
	EngineGamePageInfo,
	ServerUsernameContainer,
	StaticGameState,
} from '../../../shared/types.js';

import timeutil from '../../../shared/util/timeutil.js';
import clockutil from '../../../shared/chess/util/clockutil.js';
import { players } from '../../../shared/chess/util/typeutil.js';
import metadatautil from '../../../shared/chess/util/metadatautil.js';
import { getFormattedEngineName, type ValidEngine } from '../../../shared/chess/engine.js';

import { getGameData } from '../../database/gamesManager.js';
import { getEngineGamesForGame } from '../../database/engineGamesManager.js';
import { getPlayerGamesOfGame } from '../../database/playerGamesManager.js';
import { getMemberDataByCriteria } from '../../database/memberManager.js';
import { UNCERTAIN_LEADERBOARD_RD } from './ratingcalculation.js';

// Constants ----------------------------------------------------------------------------------------------

/** Display name for a player whose account was deleted (their `player_games` row remains, but no `members` row). */
const DELETED_USER_DISPLAY_NAME = '(Deleted User)';

/** The `games` columns needed to assemble a {@link StaticGameState}. */
const STATIC_GAME_COLUMNS = ['variant', 'rated', 'date', 'base_time_seconds', 'increment_seconds', 'result', 'termination'] as const; // prettier-ignore
/** The `player_games` columns needed to assemble a {@link StaticGameState}. */
const STATIC_PLAYER_COLUMNS = ['player_number', 'user_id', 'elo_at_game', 'rating_deviation_at_game'] as const; // prettier-ignore

// Methods ------------------------------------------------------------------------------------------------

/**
 * Returns the color a signed-in user played in a concluded game, or `undefined` if they
 * weren't a participant. Dead guests aren't identifiable (their browser-id isn't stored).
 * @throws If a database error occurs.
 */
export function resolveDeadParticipantColor(game_id: number, user_id: number): Player | undefined {
	const rows = getPlayerGamesOfGame(game_id, ['player_number', 'user_id']);
	return rows.find((r) => r.user_id === user_id)?.player_number as Player | undefined;
}

/**
 * Builds the {@link StaticGameState} of a concluded game — the
 * static side bar info — plus its per-player rating deltas.
 * @returns The state (+ deltas), or `undefined` if no such game row exists.
 * @throws If a database error occurs.
 */
export function produceDeadStaticGameState(
	game_id: number,
): { state: StaticGameState; ratingChanges?: PlayerGroup<number> } | undefined {
	const game = getGameData(game_id, [...STATIC_GAME_COLUMNS]);
	if (game === undefined) return undefined;
	const playerRows = getPlayerGamesOfGame(game_id, [...STATIC_PLAYER_COLUMNS, 'elo_change_from_game']); // prettier-ignore
	const engineParticipant = getEngineParticipant(game_id);

	const state = assembleStaticGameState(game, playerRows, engineParticipant);

	/** Per signed-in player rating delta; populated only for rated games. */
	const ratingChanges: PlayerGroup<number> = {};
	for (const row of playerRows) {
		if (row.elo_change_from_game !== null)
			ratingChanges[row.player_number] = row.elo_change_from_game;
	}

	return Object.keys(ratingChanges).length > 0 ? { state, ratingChanges } : { state };
}

/**
 * Builds the full {@link DeadGameState} for a concluded game from the database — the static base
 * plus the `icn` and final clocks. Rating deltas are NOT included: the client displays them from
 * SSR (see {@link produceDeadStaticGameState}), never from this HTTP payload.
 * @returns The state, or `undefined` if no such game row exists.
 * @throws If a database error occurs.
 */
export function produceDeadGameState(game_id: number): DeadGameState | undefined {
	const game = getGameData(game_id, ['variant', 'rated', 'date', 'base_time_seconds', 'increment_seconds', 'result', 'termination', 'icn']); // prettier-ignore
	if (game === undefined) return undefined;

	const playerRows = getPlayerGamesOfGame(game_id, ['player_number', 'user_id', 'elo_at_game', 'clock_at_end_millis', 'rating_deviation_at_game']); // prettier-ignore
	const engineParticipant = getEngineParticipant(game_id);

	/** Per-color ms remaining at game end; populated only for timed games. */
	const finalClocks: PlayerGroup<number> = {};
	for (const row of playerRows) {
		if (row.clock_at_end_millis !== null)
			finalClocks[row.player_number] = row.clock_at_end_millis;
	}
	if (engineParticipant?.clockAtEnd !== null && engineParticipant?.clockAtEnd !== undefined)
		finalClocks[engineParticipant.color] = engineParticipant.clockAtEnd;

	const state: DeadGameState = {
		...assembleStaticGameState(game, playerRows, engineParticipant),
		icn: game.icn,
	};

	if (Object.keys(finalClocks).length > 0) state.finalClocks = finalClocks;

	return state;
}

export function getDeadEngineGameInfo(game_id: number): EngineGamePageInfo | undefined {
	const row = getEngineGamesForGame(game_id, ['engine', 'strength_level'])[0];
	if (!row) return undefined;
	return {
		engine: row.engine as ValidEngine,
		strengthLevel: row.strength_level,
	};
}

/**
 * Maps already-fetched DB rows into the {@link StaticGameState} base,
 * so both readers above share one field mapping.
 */
function assembleStaticGameState(
	game: Pick<GamesRecord, (typeof STATIC_GAME_COLUMNS)[number]>,
	playerRows: Pick<PlayerGamesRecord, (typeof STATIC_PLAYER_COLUMNS)[number]>[],
	engineParticipant: ReturnType<typeof getEngineParticipant>,
): StaticGameState {
	/** Per-color username container; a color absent from `playerRows` -> guest. */
	const playerContainers: PlayerGroup<ServerUsernameContainer> = {};
	for (const color of [players.WHITE, players.BLACK]) {
		if (engineParticipant?.color === color) {
			playerContainers[color] = engineParticipant.container;
			continue;
		}
		const row = playerRows.find((r) => r.player_number === color);
		if (row === undefined) {
			// No row -> this color was a guest.
			playerContainers[color] = {
				type: 'guest',
				username: metadatautil.GUEST_NAME_ICN_METADATA,
			};
			continue;
		}

		// A deleted account keeps its row but loses its members lookup.
		const member = getMemberDataByCriteria(['username'], 'user_id', row.user_id);
		const container: ServerUsernameContainer = {
			type: 'player',
			username: member?.username ?? DELETED_USER_DISPLAY_NAME,
		};
		if (row.elo_at_game !== null)
			container.rating = {
				value: row.elo_at_game,
				confident: isRatingConfident(row.rating_deviation_at_game),
			};
		playerContainers[color] = container;
	}

	const gameConclusion = {
		condition: game.termination,
		victor: metadatautil.getVictorFromResult(game.result),
	} as GameConclusion;

	return {
		rated: Boolean(game.rated),
		// A null `variant` column marks a custom game; its position comes from the ICN (parsed client-side), never here.
		variant:
			game.variant !== null
				? { kind: 'preset', code: game.variant as VariantCode }
				: { kind: 'custom' },
		timeControl: clockutil.buildTimeControl(game.base_time_seconds, game.increment_seconds),
		timeCreated: timeutil.sqliteToTimestamp(game.date),
		players: playerContainers,
		gameConclusion,
	};
}

function getEngineParticipant(game_id: number):
	| {
			color: Player;
			container: ServerUsernameContainer;
			clockAtEnd: number | null;
	  }
	| undefined {
	const row = getEngineGamesForGame(game_id, [
		'player_number',
		'clock_at_end_millis',
		'engine',
		'strength_level',
	])[0];
	if (!row) return undefined;
	return {
		color: row.player_number as Player,
		container: {
			type: 'engine',
			username: getFormattedEngineName(row.engine as ValidEngine, row.strength_level),
		},
		clockAtEnd: row.clock_at_end_millis,
	};
}

/**
 * Derives a stored rating's confidence from its Glicko RD, mirroring the live path.
 * Pre-migration rows have no stored RD (null) -> fall back to confident (unrecoverable).
 */
function isRatingConfident(rating_deviation: number | null): boolean {
	return rating_deviation === null || rating_deviation <= UNCERTAIN_LEADERBOARD_RD;
}
