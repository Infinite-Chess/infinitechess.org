// src/server/game/gamemanager/deadgamestate.ts

/**
 * Builds the {@link DeadGameState} for a concluded game from DB columns alone —
 * never reading `activeGames` or parsing the ICN (passed through verbatim for the client).
 *
 * This is the READ side; `gamelogger.ts` is the WRITE
 * side that persists these columns when a game ends.
 */

import type { PlayerGroup } from '../../../shared/chess/util/typeutil.js';
import type { VariantCode } from '../../../shared/chess/variants/variantregistry.js';
import type { GameConclusion } from '../../../shared/chess/util/winconutil.js';
import type {
	DeadGameState,
	PlayerRatingChangeInfo,
	ServerUsernameContainer,
} from '../../../shared/types.js';

import timeutil from '../../../shared/util/timeutil.js';
import clockutil from '../../../shared/chess/util/clockutil.js';
import { players } from '../../../shared/chess/util/typeutil.js';
import metadatautil from '../../../shared/chess/util/metadatautil.js';

import { getGameData } from '../../database/gamesManager.js';
import { getPlayerGamesOfGame } from '../../database/playerGamesManager.js';
import { getMemberDataByCriteria } from '../../database/memberManager.js';

// Constants ----------------------------------------------------------------------------------------------

/** Display name for a player whose account was deleted (their `player_games` row remains, but no `members` row). */
const DELETED_USER_DISPLAY_NAME = '(Deleted User)';

// Methods ------------------------------------------------------------------------------------------------

/**
 * Builds the {@link DeadGameState} for a concluded game from the database.
 * @returns The state, or `undefined` if no such game row exists (caller 404s).
 * @throws If a database error occurs.
 */
export function produceDeadGameState(game_id: number): DeadGameState | undefined {
	const game = getGameData(game_id, ['variant', 'rated', 'date', 'base_time_seconds', 'increment_seconds', 'result', 'termination', 'icn']); // prettier-ignore
	if (game === undefined) return undefined;

	const playerRows = getPlayerGamesOfGame(game_id, ['player_number', 'user_id', 'elo_at_game', 'elo_change_from_game', 'clock_at_end_millis']); // prettier-ignore

	/** Per-color username container; a color absent from `playerRows` -> guest. */
	const playerContainers: PlayerGroup<ServerUsernameContainer> = {};
	/** Per signed-in player rating change; populated only for rated games. */
	const ratingChanges: PlayerGroup<PlayerRatingChangeInfo> = {};
	/** Per-color ms remaining at game end; populated only for timed games. */
	const finalClocks: PlayerGroup<number> = {};

	for (const color of [players.WHITE, players.BLACK]) {
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
		// at-game confidence isn't stored, so dead games are always confident.
		if (row.elo_at_game !== null) {
			container.rating = { value: row.elo_at_game, confident: true };
		}
		playerContainers[color] = container;

		if (row.elo_at_game !== null && row.elo_change_from_game !== null) {
			ratingChanges[color] = {
				newRating: { value: row.elo_at_game + row.elo_change_from_game, confident: true },
				change: row.elo_change_from_game,
			};
		}
		if (row.clock_at_end_millis !== null) finalClocks[color] = row.clock_at_end_millis;
	}

	const gameConclusion = {
		condition: game.termination,
		victor: metadatautil.getVictorFromResult(game.result),
	} as GameConclusion;

	const state: DeadGameState = {
		id: game_id,
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
		icn: game.icn,
	};

	if (Object.keys(ratingChanges).length > 0) state.ratingChanges = ratingChanges;
	if (Object.keys(finalClocks).length > 0) state.finalClocks = finalClocks;

	return state;
}
