// src/server/game/gamemanager/liveGameValues.ts

/**
 * This script keeps the live-state of the active games in the database up to date.
 * It computes the column values to be persisted for each state-change event,
 * then updates the live_games and live_player_games tables accordingly.
 *
 * See dev-utils/live-game-persistence.md for the schema and event matrix.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { LiveGameData, LiveGamesRecord } from '../../database/liveGamesManager.js';
import type { ServerGame, PlayerData, PlayerDisconnect } from './gameutility.js';
import type {
	LivePlayerDisconnectData,
	LivePlayerGamesRecord,
} from '../../database/livePlayerGamesManager.js';

import { Game } from '../../../shared/chess/logic/gamefile.js';
import icnconverter from '../../../shared/chess/logic/icn/icnconverter.js';
import { players as p } from '../../../shared/chess/util/typeutil.js';

import { timeBeforeGameDeletionMillis } from './gameutility.js';
import { insertLiveGame, updateLiveGame, deleteLiveGame } from '../../database/liveGamesManager.js';
import {
	insertLivePlayerGame,
	updateLivePlayerGame,
} from '../../database/livePlayerGamesManager.js';

// Value Computation ----------------------------------------------------------------------------------

/**
 * Computes the moves string from a ServerGame's move list, including embedded clock stamps.
 * Uses the ICN compact format: `1,2>3,4{[%clk 0:09:56.7]}|5,6>7,8=Q{[%clk 0:09:45.2]}`
 */
function getMovesString(servergame: ServerGame): string {
	const { basegame } = servergame;
	if (basegame.moves.length === 0) return '';

	return icnconverter.getShortFormMovesFromMoves(basegame.moves, {
		compact: true,
		spaces: false,
		comments: !basegame.untimed,
		move_numbers: false,
	});
}

/**
 * Extracts the elo display string for a player from game metadata.
 */
function getPlayerEloString(basegame: Game, player: Player): string | null {
	// The elo is stored in metadata as WhiteElo/BlackElo strings like "1500" or "1200?"
	// prettier-ignore
	const eloKey = player === p.WHITE ? 'WhiteElo' :
				   player === p.BLACK ? 'BlackElo' :
				   (() => { throw new Error(`Invalid player ${player} when getting elo string`); })();
	return basegame.metadata[eloKey] ?? null;
}

/**
 * Returns the disconnect-related live_player_games columns for a player's current disconnect state.
 */
function getDisconnectColumnData(disconnect: PlayerDisconnect): LivePlayerDisconnectData {
	return {
		disconnect_cushion_end_time: disconnect.startTime ?? null,
		disconnect_resign_time: disconnect.timeToAutoLoss ?? null,
		disconnect_by_choice:
			disconnect.wasByChoice !== undefined ? (disconnect.wasByChoice ? 1 : 0) : null,
	};
}

/**
 * Updates time_remaining_ms for all players from the current clock state.
 * No-op for untimed games.
 */
function persistCurrentClockTimes(servergame: ServerGame): void {
	const { basegame, match } = servergame;
	if (basegame.untimed) return;
	for (const playerStr of Object.keys(match.playerData)) {
		const player = Number(playerStr) as Player;
		updateLivePlayerGame(match.id, player, {
			time_remaining_ms: basegame.clocks.currentTime[player] ?? null,
		});
	}
}

/**
 * Builds a LivePlayerGamesRecord from player data.
 */
function buildPlayerRecord(
	game_id: number,
	player: Player,
	playerData: PlayerData,
	basegame: Game,
): LivePlayerGamesRecord {
	const { identifier, disconnect } = playerData;

	return {
		game_id,
		player_number: player,
		user_id: identifier.signedIn ? identifier.user_id : null,
		browser_id: identifier.browser_id,
		elo: getPlayerEloString(basegame, player),
		last_draw_offer_ply: playerData.lastOfferPly ?? null,
		time_remaining_ms: basegame.untimed ? null : (basegame.clocks.currentTime[player] ?? null),
		...getDisconnectColumnData(disconnect),
	};
}

// Persistence Events ---------------------------------------------------------------------------------

/**
 * Called when a new game is created. Inserts the full initial state into both tables.
 */
function onGameCreated(servergame: ServerGame): void {
	const { basegame, match } = servergame;

	const record: LiveGamesRecord = {
		game_id: match.id,
		time_created: match.timeCreated,
		variant: match.variant,
		clock: match.clock,
		rated: match.rated ? 1 : 0,
		private: match.publicity === 'private' ? 1 : 0,
		moves: '',
		color_ticking: null,
		clock_snapshot_time: null,
		draw_offer_state: null,
		conclusion_condition: null,
		conclusion_victor: null,
		time_ended: null,
		afk_resign_time: null,
		delete_time: null,
		position_pasted: 0,
		validate_moves: servergame.boardsim !== undefined ? 1 : 0,
	};

	insertLiveGame(record);

	// Insert one row per player
	for (const [playerStr, playerData] of Object.entries(match.playerData)) {
		const player = Number(playerStr) as Player;
		const playerRecord = buildPlayerRecord(match.id, player, playerData, basegame);
		insertLivePlayerGame(playerRecord);
	}
}

/**
 * Called after a move is submitted and the game state is updated.
 * Updates the moves string, clock state, and per-player time.
 */
function onMoveSubmitted(servergame: ServerGame): void {
	const { basegame, match } = servergame;

	const gameUpdates: Partial<LiveGameData> = {
		moves: getMovesString(servergame),
	};

	if (!basegame.untimed) {
		gameUpdates.color_ticking = basegame.clocks.colorTicking ?? null;
		gameUpdates.clock_snapshot_time = basegame.clocks.timeAtTurnStart ?? null;
	}

	updateLiveGame(match.id, gameUpdates);

	persistCurrentClockTimes(servergame);
}

/**
 * Called when a game conclusion is set (checkmate, resignation, time loss, etc.).
 * Updates conclusion columns and sets the delete timer target.
 */
function onGameConcluded(servergame: ServerGame): void {
	const { basegame, match } = servergame;
	const conclusion = basegame.gameConclusion!;

	const gameUpdates: Partial<LiveGameData> = {
		conclusion_condition: conclusion.condition,
		conclusion_victor: conclusion.victor ?? null,
		time_ended: match.timeEnded!,
		delete_time: match.timeEnded! + timeBeforeGameDeletionMillis,
		draw_offer_state: null, // Draw offers are closed on conclusion
		afk_resign_time: null, // AFK timers are cancelled on conclusion
	};

	// Stop clock state
	if (!basegame.untimed) {
		// Both color ticking and timeAtTurnStart are set to null on game end
		gameUpdates.color_ticking = null;
		gameUpdates.clock_snapshot_time = null;
	}

	updateLiveGame(match.id, gameUpdates);

	// Update time_remaining_ms for timed games (e.g., time loss sets loser to 0)
	persistCurrentClockTimes(servergame);
}

/**
 * Called when a draw offer is extended.
 */
function onDrawOfferExtended(servergame: ServerGame, offeringColor: Player): void {
	updateLiveGame(servergame.match.id, {
		draw_offer_state: offeringColor,
	});

	updateLivePlayerGame(servergame.match.id, offeringColor, {
		last_draw_offer_ply: servergame.match.playerData[offeringColor]!.lastOfferPly ?? null,
	});
}

/**
 * Called when a draw offer is declined (or auto-declined on move).
 */
function onDrawOfferDeclined(servergame: ServerGame): void {
	updateLiveGame(servergame.match.id, {
		draw_offer_state: null,
	});
}

/**
 * Called when a player disconnects (either by choice or network interruption).
 * Persists the disconnect state for that player.
 */
function onPlayerDisconnected(servergame: ServerGame, color: Player): void {
	const playerDisconnectData = servergame.match.playerData[color]!.disconnect;
	updateLivePlayerGame(servergame.match.id, color, getDisconnectColumnData(playerDisconnectData));
}

/**
 * Called when a player reconnects. Clears their disconnect state.
 */
function onPlayerReconnected(servergame: ServerGame, color: Player): void {
	updateLivePlayerGame(servergame.match.id, color, {
		disconnect_cushion_end_time: null,
		disconnect_resign_time: null,
		disconnect_by_choice: null,
	});
}

/**
 * Called when a player goes AFK. Persists the AFK resign timestamp.
 */
function onPlayerAFK(servergame: ServerGame): void {
	updateLiveGame(servergame.match.id, {
		afk_resign_time: servergame.match.autoAFKResignTime ?? null,
	});
}

/**
 * Called when a player returns from AFK. Clears the AFK resign timestamp.
 */
function onPlayerAFKReturn(servergame: ServerGame): void {
	updateLiveGame(servergame.match.id, {
		afk_resign_time: null,
	});
}

/**
 * Called when a position is pasted. Sets position_pasted and clears validate_moves.
 */
function onPositionPasted(servergame: ServerGame): void {
	updateLiveGame(servergame.match.id, {
		position_pasted: 1,
		validate_moves: 0,
	});
}

/**
 * Called when a game is fully deleted/logged. Removes the live game from the database.
 */
function onGameDeleted(game_id: number): void {
	deleteLiveGame(game_id);
}

// Exports --------------------------------------------------------------------------------------------

export default {
	// Persistence Events
	onGameCreated,
	onMoveSubmitted,
	onGameConcluded,
	onDrawOfferExtended,
	onDrawOfferDeclined,
	onPlayerDisconnected,
	onPlayerReconnected,
	onPlayerAFK,
	onPlayerAFKReturn,
	onPositionPasted,
	onGameDeleted,
};
