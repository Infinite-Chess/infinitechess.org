// src/server/game/gamemanager/liveGameValues.ts

/**
 * This script keeps the live-state of the active games in the database up to date.
 * It computes the column values to be persisted for each state-change event,
 * then updates the live game and participant tables accordingly.
 *
 * See docs/systems/LIVE_GAME_PERSISTENCE.md for the schema and event matrix.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { LiveGameData, LiveGamesRecord } from '../../database/liveGamesManager.js';
import type { ServerGame, PlayerData, PlayerDisconnect } from './gameutility.js';
import type {
	LivePlayerDisconnectData,
	LivePlayerGamesRecord,
} from '../../database/livePlayerGamesManager.js';

import icnconverter from '../../../shared/chess/logic/icn/icnconverter.js';

import db from '../../database/database.js';
import { insertLiveGame, updateLiveGame, deleteLiveGame } from '../../database/liveGamesManager.js';
import {
	insertLivePlayerGame,
	updateLivePlayerGame,
} from '../../database/livePlayerGamesManager.js';
import {
	insertLiveEngineGame,
	updateLiveEngineGame,
} from '../../database/liveEngineGamesManager.js';

// Value Computation ----------------------------------------------------------------------------------

/**
 * Computes the moves string from a ServerGame's move list, including embedded clock stamps.
 * Uses the ICN compact format: `1,2>3,4{[%clk 0:09:56.7]}|5,6>7,8=Q{[%clk 0:09:45.2]}`
 */
function getMovesString(servergame: ServerGame): string {
	if (servergame.moves.length === 0) return '';

	return icnconverter.getShortFormMovesFromMoves(servergame.moves, {
		compact: true,
		spaces: false,
		comments: !servergame.untimed,
		move_numbers: false,
		abbrev: true, // Irrelevant here — only applies when compact is false.
	});
}

/**
 * Returns the disconnect-related live_player_games columns for a player's current disconnect state.
 */
function getDisconnectColumnData(disconnect: PlayerDisconnect): LivePlayerDisconnectData {
	return {
		disconnect_cushion_end_time: disconnect.startTime ?? null,
		disconnect_claim_time: disconnect.timeOpponentMayClaim ?? null,
		disconnect_voluntary:
			disconnect.voluntary !== undefined ? (disconnect.voluntary ? 1 : 0) : null,
	};
}

/**
 * Updates time_remaining_ms for all players from the current clock state.
 * No-op for untimed games.
 */
function persistCurrentClockTimes(servergame: ServerGame): void {
	if (servergame.untimed) return;
	for (const playerStr of Object.keys(servergame.match.playerData)) {
		const player = Number(playerStr) as Player;
		updateLivePlayerGame(servergame.match.id, player, {
			time_remaining_ms: servergame.clocks.currentTime[player] ?? null,
		});
	}
	const engine = servergame.match.engineParticipant;
	if (engine)
		updateLiveEngineGame(servergame.match.id, engine.color, {
			time_remaining_ms: servergame.clocks.currentTime[engine.color] ?? null,
		});
}

/**
 * Builds a LivePlayerGamesRecord from player data.
 */
function buildPlayerRecord(
	game_id: number,
	player: Player,
	playerData: PlayerData,
	servergame: ServerGame,
): LivePlayerGamesRecord {
	const { identifier, disconnect } = playerData;

	return {
		game_id,
		player_number: player,
		user_id: identifier.signedIn ? identifier.user_id : null,
		browser_id: identifier.browser_id,
		last_draw_offer_ply: playerData.lastOfferPly ?? null,
		time_remaining_ms: servergame.untimed
			? null
			: (servergame.clocks.currentTime[player] ?? null),
		...getDisconnectColumnData(disconnect),
	};
}

// Persistence Events ---------------------------------------------------------------------------------

/**
 * Runs a best-effort live-game persistence write, swallowing any database error (already
 * logged by dbCall) so it can't abort the game lifecycle or crash a timer callback.
 * Atomic: several events touch multiple tables, and a partial write would leave a live
 * game the restorer can't reconstruct.
 */
function persist(operation: () => void): void {
	try {
		db.transaction(operation)();
	} catch {
		// Already logged by dbCall. The in-memory game continues
		// uninterrupted, and the transaction rolled back.
	}
}

/**
 * Called when a new game is created. Inserts the full initial state into both tables.
 */
function onGameCreated(servergame: ServerGame): void {
	const match = servergame.match;

	const record: LiveGamesRecord = {
		game_id: match.id,
		time_created: match.timeCreated,
		variant: match.variant,
		position: null, // Custom games (which would set this) aren't yet startable; preset games have no custom position.
		clock: match.clock,
		rated: match.rated ? 1 : 0,
		private: 0, // All games are public for now, even "Challenge a friend" games.
		moves: '',
		color_ticking: null,
		clock_snapshot_time: null,
		draw_offer_state: null,
		validate_moves: servergame.validateMoves ? 1 : 0,
		both_disconnected_end_time: null,
	};

	// Build one record per player (pure) before touching the database.
	const playerRecords = Object.entries(match.playerData).map(([playerStr, playerData]) =>
		buildPlayerRecord(match.id, Number(playerStr) as Player, playerData, servergame),
	);

	persist(() => {
		insertLiveGame(record);
		for (const playerRecord of playerRecords) insertLivePlayerGame(playerRecord);
		if (match.engineParticipant) {
			const engine = match.engineParticipant;
			insertLiveEngineGame({
				game_id: match.id,
				player_number: engine.color,
				time_remaining_ms: servergame.clocks?.currentTime[engine.color] ?? null,
				engine: engine.engine,
				engine_version: engine.version,
				strength_level: engine.strengthLevel,
			});
		}
	});
}

/**
 * Called after a move is submitted and the game state is updated.
 * Updates the moves string, clock state, and per-player time.
 */
function onMoveSubmitted(servergame: ServerGame): void {
	const gameUpdates: Partial<LiveGameData> = {
		moves: getMovesString(servergame),
	};

	if (!servergame.untimed) {
		gameUpdates.color_ticking = servergame.clocks.colorTicking ?? null;
		gameUpdates.clock_snapshot_time = servergame.clocks.timeAtTurnStart ?? null;
	}

	persist(() => {
		updateLiveGame(servergame.match.id, gameUpdates);
		persistCurrentClockTimes(servergame);
	});
}

/**
 * Called when a draw offer is extended.
 */
function onDrawOfferExtended(servergame: ServerGame, offeringColor: Player): void {
	persist(() => {
		updateLiveGame(servergame.match.id, {
			draw_offer_state: offeringColor,
		});

		updateLivePlayerGame(servergame.match.id, offeringColor, {
			last_draw_offer_ply: servergame.match.playerData[offeringColor]!.lastOfferPly ?? null,
		});
	});
}

/**
 * Called when a draw offer is declined (or auto-declined on move).
 */
function onDrawOfferDeclined(servergame: ServerGame): void {
	persist(() => {
		updateLiveGame(servergame.match.id, {
			draw_offer_state: null,
		});
	});
}

/**
 * Called when a player disconnects (either by choice or network interruption).
 * Persists the disconnect state for that player.
 */
function onPlayerDisconnected(servergame: ServerGame, color: Player): void {
	const playerDisconnectData = servergame.match.playerData[color]!.disconnect;
	persist(() =>
		updateLivePlayerGame(
			servergame.match.id,
			color,
			getDisconnectColumnData(playerDisconnectData),
		),
	);
}

/**
 * Called when a player reconnects. Clears their disconnect state, and the game-level
 * both-disconnected timer (a reconnect means the players are no longer both gone).
 */
function onPlayerReconnected(servergame: ServerGame, color: Player): void {
	persist(() => {
		updateLivePlayerGame(servergame.match.id, color, {
			disconnect_cushion_end_time: null,
			disconnect_claim_time: null,
			disconnect_voluntary: null,
		});
		updateLiveGame(servergame.match.id, { both_disconnected_end_time: null });
	});
}

/**
 * Called when the game-level both-disconnected timer is started or cleared.
 * Persists its deadline so it can be revived (or fired) on server restart.
 */
function onBothDisconnectedTimerChanged(servergame: ServerGame): void {
	persist(() =>
		updateLiveGame(servergame.match.id, {
			both_disconnected_end_time: servergame.match.bothDisconnectedEndTime ?? null,
		}),
	);
}

/** Persists a paused or resumed engine turn. */
function onEngineClockChanged(servergame: ServerGame): void {
	if (servergame.untimed) return;
	persist(() =>
		// Only the ticking state is written: freezing rewinds the engine's turn rather
		// than charging it, so no player's remaining time changes across either event.
		updateLiveGame(servergame.match.id, {
			color_ticking: servergame.clocks.colorTicking ?? null,
			clock_snapshot_time: servergame.clocks.timeAtTurnStart ?? null,
		}),
	);
}

/**
 * Called when a concluded game is logged to the permanent database. Removes the row: the result
 * now lives in the permanent tables, so there's nothing left to restore across a restart. The game
 * may keep lingering in memory for the rematch handshake, but that state is never persisted.
 */
function onGameLogged(servergame: ServerGame): void {
	persist(() => deleteLiveGame(servergame.match.id));
}

// Exports --------------------------------------------------------------------------------------------

export default {
	// Persistence Events
	onGameCreated,
	onMoveSubmitted,
	onDrawOfferExtended,
	onDrawOfferDeclined,
	onPlayerDisconnected,
	onPlayerReconnected,
	onBothDisconnectedTimerChanged,
	onEngineClockChanged,
	onGameLogged,
};
