// src/server/game/gamemanager/deadgamestate.ts

/**
 * Builds the {@link StaticGameState} / {@link DeadGameState} of a concluded game from DB.
 *
 * This is the READ side; `gamelogger.ts` is the WRITE
 * side that persists these columns when a game ends.
 */

import type { VariantCode } from '../../../shared/chess/util/variantcodes.js';
import type { GamesRecord } from '../../database/gamesManager.js';
import type { ValidEngine } from '../../../shared/chess/util/engine.js';
import type { GameConclusion } from '../../../shared/chess/util/typeschemas.js';
import type { SlideLimitValue } from '../../../shared/chess/util/modutil.js';
import type { PlayerGamesRecord } from '../../database/playerGamesManager.js';
import type { Player, PlayerGroup } from '../../../shared/util/typeutil.js';
import type {
	DeadGameState,
	EngineGamePageInfo,
	ServerUsernameContainer,
	StaticGameState,
} from '../../../shared/transport/domain.js';

import timeutil from '../../../shared/util/timeutil.js';
import clockutil from '../../../shared/chess/util/clockutil.js';
import { players } from '../../../shared/util/typeutil.js';
import metadatautil from '../../../shared/chess/util/metadatautil.js';
import { getFormattedEngineName } from '../../../shared/chess/util/engine.js';

import gamesManager from '../../database/gamesManager.js';
import memberManager from '../../database/memberManager.js';
import ratingcalculation from '../../utility/ratingcalculation.js';
import playerGamesManager from '../../database/playerGamesManager.js';
import engineGamesManager from '../../database/engineGamesManager.js';

// Types -----------------------------------------------------------------------

/** The engine participant of a concluded engine game, as stored in `engine_games`. */
type EngineParticipant = {
	color: Player;
	engine: ValidEngine;
	strengthLevel: number;
	container: ServerUsernameContainer;
};

// Constants -------------------------------------------------------------------

/** Display name for a player whose account was deleted (their `player_games` row remains, but no `members` row). */
const DELETED_USER_DISPLAY_NAME = '(Deleted User)';

/** The `games` columns needed to assemble a {@link StaticGameState}. */
const STATIC_GAME_COLUMNS = ['variant', 'rated', 'date', 'base_time_seconds', 'increment_seconds', 'result', 'termination', 'mod_slide_limit'] as const; // prettier-ignore
/** The `player_games` columns needed to assemble a {@link StaticGameState}. */
const STATIC_PLAYER_COLUMNS = ['player_number', 'user_id', 'elo_at_game', 'rating_deviation_at_game'] as const; // prettier-ignore

// Building the game states ----------------------------------------------------

/**
 * Returns the color a signed-in user played in a concluded game, or `undefined` if they
 * weren't a participant. Dead guests aren't identifiable (their browser-id isn't stored).
 * @throws If a database error occurs.
 */
function resolveParticipantColor(game_id: number, user_id: number): Player | undefined {
	const rows = playerGamesManager.getOfGame(game_id, ['player_number', 'user_id']);
	return rows.find((r) => r.user_id === user_id)?.player_number as Player | undefined;
}

/**
 * Builds the {@link StaticGameState} of a concluded game — the static
 * side bar info — plus its ply count, ICN, engine participant page info, and rating deltas.
 * @returns The state (+ deltas), or `undefined` if no such game row exists.
 * @throws If a database error occurs.
 */
function produceStaticState(game_id: number):
	| {
			state: StaticGameState;
			moveCount: number;
			/** The game's ICN. The only record of a custom game's start position and rules. */
			icn: string;
			engineGame?: EngineGamePageInfo;
			ratingChanges?: PlayerGroup<number>;
	  }
	| undefined {
	const game = gamesManager.getData(game_id, [...STATIC_GAME_COLUMNS, 'move_count', 'icn']);
	if (game === undefined) return undefined;
	const playerRows = playerGamesManager.getOfGame(game_id, [...STATIC_PLAYER_COLUMNS, 'elo_change_from_game']); // prettier-ignore
	const engineParticipant = getEngineParticipant(game_id);

	const state = assembleStaticGameState(game, playerRows, engineParticipant);

	/** Per signed-in player rating delta; populated only for rated games. */
	const ratingChanges: PlayerGroup<number> = {};
	for (const row of playerRows) {
		if (row.elo_change_from_game !== null)
			ratingChanges[row.player_number as Player] = row.elo_change_from_game;
	}

	return {
		state,
		moveCount: game.move_count,
		icn: game.icn,
		...(engineParticipant && {
			engineGame: {
				engine: engineParticipant.engine,
				strengthLevel: engineParticipant.strengthLevel,
			},
		}),
		...(Object.keys(ratingChanges).length > 0 && { ratingChanges }),
	};
}

/**
 * Builds the full {@link DeadGameState} for a concluded game from the database — the static base
 * plus the `icn`, which the client also reads the final clocks off of. Rating deltas are NOT included:
 * the client displays them from SSR (see {@link produceStaticState}), never from this HTTP payload.
 * @returns The state, or `undefined` if no such game row exists.
 * @throws If a database error occurs.
 */
function produceGameState(game_id: number): DeadGameState | undefined {
	const game = gamesManager.getData(game_id, [...STATIC_GAME_COLUMNS, 'icn']);
	if (game === undefined) return undefined;

	const playerRows = playerGamesManager.getOfGame(game_id, [...STATIC_PLAYER_COLUMNS]);
	const engineParticipant = getEngineParticipant(game_id);

	return {
		...assembleStaticGameState(game, playerRows, engineParticipant),
		icn: game.icn,
	};
}

/**
 * Maps already-fetched DB rows into the {@link StaticGameState} base,
 * so both readers above share one field mapping.
 */
function assembleStaticGameState(
	game: Pick<GamesRecord, (typeof STATIC_GAME_COLUMNS)[number]>,
	playerRows: Pick<PlayerGamesRecord, (typeof STATIC_PLAYER_COLUMNS)[number]>[],
	engineParticipant: EngineParticipant | undefined,
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
		const member = memberManager.getDataByCriteria(['username'], 'user_id', row.user_id);
		const container: ServerUsernameContainer = {
			type: 'player',
			username: member?.username ?? DELETED_USER_DISPLAY_NAME,
		};
		if (row.elo_at_game !== null)
			container.rating = {
				value: row.elo_at_game,
				confident: ratingcalculation.isRatingConfident(row.rating_deviation_at_game),
			};
		playerContainers[color] = container;
	}

	const gameConclusion = {
		condition: game.termination,
		victor: metadatautil.getVictorFromResult(game.result),
	} as GameConclusion;

	return {
		setup: {
			// A null `variant` column marks a custom game; its position comes from the ICN (parsed client-side), never here.
			variant:
				game.variant !== null
					? { kind: 'preset', code: game.variant as VariantCode }
					: { kind: 'custom' },
			timeControl: clockutil.buildTimeControl(game.base_time_seconds, game.increment_seconds),
			timeCreated: timeutil.sqliteToTimestamp(game.date),
			modifiers:
				game.mod_slide_limit !== null
					? [{ kind: 'slide-limit', value: game.mod_slide_limit as SlideLimitValue }]
					: undefined,
		},
		rated: Boolean(game.rated),
		players: playerContainers,
		gameConclusion,
	};
}

/**
 * Reads the engine participant of a concluded game.
 * @returns The participant, or `undefined` if the game had no engine (human vs human).
 * @throws If a database error occurs.
 */
function getEngineParticipant(game_id: number): EngineParticipant | undefined {
	const row = engineGamesManager.getOfGame(game_id, [
		'player_number',
		'engine',
		'strength_level',
	])[0];
	if (!row) return undefined;
	return {
		color: row.player_number as Player,
		engine: row.engine as ValidEngine,
		strengthLevel: row.strength_level,
		container: {
			type: 'engine',
			username: getFormattedEngineName(row.engine as ValidEngine, row.strength_level),
		},
	};
}

// Exports ---------------------------------------------------------------------

export default {
	resolveParticipantColor,
	produceStaticState,
	produceGameState,
};
