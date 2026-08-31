// src/server/game/gamemanager/gameRestart.ts

/**
 * How live games survive a server restart: stood down before shutdown, and stood
 * back up on startup with whatever timers they were mid-way through.
 *
 * `liveGameRestore.ts` reads the rows and rebuilds the {@link ServerGame} objects; this
 * decides what happens to them once rebuilt. Only ongoing games are ever persisted.
 *
 * See docs/systems/LIVE_GAME_PERSISTENCE.md for the schema and restoration details.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { ServerGame } from './serverGameTypes.js';
import type { PendingTimers } from './liveGameRestore.js';

import disconnect from './disconnect.js';
import gameSockets from './gameSockets.js';
import activeGames from './activeGames.js';
import activePlayers from './activePlayers.js';
import gameLifecycle from './gameLifecycle.js';
import liveGameRestore from './liveGameRestore.js';

// Shutdown --------------------------------------------------------------------

/**
 * Call when server's about to restart.
 * Stop all runtime timers and close sockets gracefully.
 * The games will be restored from the database on the next startup.
 * Their state is already stored inside live_* tables.
 */
function prepForShutdown(): void {
	for (const servergame of activeGames.getAll()) {
		// Cancel all runtime timers
		clearTimeout(servergame.match.autoTimeLossTimeoutID);
		disconnect.cancelAllTimers(servergame.match);
		gameLifecycle.cancelFinalizeTimer(servergame.match);

		// Unsubscribe all sockets (we will resub them when they reconnect)
		for (const data of Object.values(servergame.match.playerData)) {
			if (!data.socket) continue;
			gameSockets.detachParticipant(servergame.match, data.socket);
		}

		activeGames.remove(servergame.match.id);
	}
}

// Startup ---------------------------------------------------------------------

/**
 * Restores all live games from the database on server startup.
 * Should be called after databaseInit.init() and before accepting client connections.
 */
function restoreLiveGames(): void {
	const restoredGames = liveGameRestore.restoreAll();

	for (const { servergame, pendingTimers } of restoredGames) {
		// Add the game to the active games list
		activeGames.add(servergame);

		// Only ongoing games are ever restored: a game's live row is dropped the instant it
		// concludes (its result then lives permanently in the games table), so a concluded game
		// is never persisted to restore. Register its players in the active-players list (blocks
		// them from joining a second game, and shows their lobby in-game banner).
		for (const [strcolor, data] of Object.entries(servergame.match.playerData)) {
			// No navigate notice owed — the game predates the restart, so they already know of it.
			activePlayers.add(
				data.identifier,
				servergame.match.id,
				Number(strcolor) as Player,
				false,
			);
		}

		reinstateTimers(servergame, pendingTimers);
	}
}

/** Revives the auto-time-loss, disconnect and both-disconnected timers a restored game was mid-way through. */
function reinstateTimers(servergame: ServerGame, pendingTimers: PendingTimers): void {
	// 1. Auto time loss timer (for timed games)
	if (pendingTimers.autoTimeLossMs !== undefined) {
		if (pendingTimers.autoTimeLossMs <= 0) {
			// Clock already expired during downtime
			return gameLifecycle.concludeOnTime(servergame);
		}
		servergame.match.autoTimeLossTimeoutID = setTimeout(
			() => gameLifecycle.concludeOnTime(servergame),
			pendingTimers.autoTimeLossMs,
		);
	}

	// 2. Per-player disconnect state (claim windows).
	// An already-elapsed window simply restores as already-claimable.
	for (const [playerStr, timerState] of Object.entries(pendingTimers.disconnectTimers)) {
		const player = Number(playerStr) as Player;

		if (timerState.type === 'timer') {
			// The opponent's claim window was already open. Restore the timestamp; nothing
			// fires. If it's now in the past, the window is simply already claimable.
			const playerdata = servergame.match.playerData[player]!;
			playerdata.disconnect.startTime = undefined;
			playerdata.disconnect.timeOpponentMayClaim = Date.now() + timerState.remainingMs;
			playerdata.disconnect.voluntary = timerState.voluntary;
		} else if (timerState.type === 'cushion') {
			// Still in the 5-second cushion period
			if (timerState.remainingMs <= 0) {
				// Cushion has elapsed, open the claim window immediately and persist that state.
				disconnect.startClaimTimer(servergame, player, !timerState.voluntary);
			} else {
				// Revive the cushion timer for the remaining duration
				servergame.match.playerData[player]!.disconnect.startID = setTimeout(
					() => disconnect.startClaimTimer(servergame, player, !timerState.voluntary),
					timerState.remainingMs,
				);
				servergame.match.playerData[player]!.disconnect.startTime =
					Date.now() + timerState.remainingMs;
			}
		} else {
			// Fresh: was connected before restart, now disconnected due to server restart.
			// Give them the same 5-second cushion as a normal internet interruption.
			disconnect.startCushionTimer(servergame, player);
		}
	}

	// 3. Both-disconnected timer. If both players ended up disconnected, revive the
	//    persisted deadline (fires immediately if elapsed), or start fresh if the
	//    restart itself disconnected both (no deadline was persisted).
	gameLifecycle.maybeStartBothDisconnectedTimer(
		servergame,
		pendingTimers.bothDisconnectedEndTime,
	);
}

// Exports ---------------------------------------------------------------------

export default { prepForShutdown, restoreLiveGames };
