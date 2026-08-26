// src/server/game/gamemanager/gamemanager.ts

/**
 * Drives the live games the server is hosting: creating them, attaching and
 * detaching their participants, and pushing their clocks.
 *
 * `activegames.ts` holds the collection itself, `gamelifecycle.ts` takes a game from
 * concluded to evicted, and `gamerestart.ts` carries them across a server restart.
 */

import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { Player, PlayerGroup } from '../../../shared/util/typeutil.js';
import type { GameSetup, ServerGame } from './servergametypes.js';
import type { EngineGamePageInfo, StaticGameState } from '../../../shared/transport/domain.js';

import clock from '../../../shared/chess/logic/clock.js';
import moveutil from '../../../shared/chess/logic/moveutil.js';
import typeutil from '../../../shared/util/typeutil.js';
import gamefile from '../../../shared/chess/logic/gamefile.js';
import gamefileutility from '../../../shared/chess/logic/gamefileutility.js';

import logEvents from '../../utility/logEvents.js';
import disconnect from './disconnect.js';
import socketsend from '../../socket/socketSend.js';
import gamesockets from './gamesockets.js';
import gameutility from './gameutility.js';
import activegames from './activegames.js';
import lobbymanager from '../seeksmanager/lobbymanager.js';
import activeplayers from './activeplayers.js';
import gamelifecycle from './gamelifecycle.js';
import deadgamestate from './deadgamestate.js';
import liveGameValues from './liveGameValues.js';
import memberinfoutil from '../../auth/memberinfoutil.js';
import gamestatebuilder from './gamestatebuilder.js';

// Creation --------------------------------------------------------------------

/**
 * Creates and persists the `ServerGame`, then signals each requesting socket to navigate to
 * the game page (where they re-subscribe to the live game), arming a silent disconnect cushion
 * in the meantime. A player with no socket is told on their next lobby subscribe instead.
 * @param setup - The variant, time control, and rated flag of the game to start.
 * @param assignments - The color each player has, and their socket if connected.
 * @returns The id of the newly created game.
 * @throws If a database error occurs.
 */
function createGame(
	setup: GameSetup,
	assignments: PlayerGroup<{ identifier: AuthMemberInfo; socket?: CustomWebSocket }>,
): number {
	// Joining a new game counts as leaving any concluded game still lingering for a rematch.
	for (const { identifier } of Object.values(assignments)) forceLeaveLingeringGame(identifier);

	const gameID = activegames.issueUniqueId();
	const dateTimestamp = Date.now();
	const construction = gameutility.resolveGameConstruction(
		setup.variant,
		dateTimestamp,
		setup.modifiers?.find((m) => m.kind === 'slide-limit')?.value,
		setup.engineParticipant !== undefined,
	);

	const game = gamefile.initGame(setup.time, dateTimestamp, construction.gameRules);
	const match = gameutility.initMatch(setup, gameID, assignments);

	const servergame: ServerGame = gameutility.initServerGame(game, construction, match);
	for (const [strcolor, { identifier, socket }] of Object.entries(assignments)) {
		// A player with no socket to push to is owed the navigate notice on their next lobby subscribe.
		activeplayers.add(
			identifier,
			servergame.match.id,
			Number(strcolor) as Player,
			socket === undefined,
		);
	}

	activegames.add(servergame);

	// Persist the new game to the database for restoration after server restart.
	// Must precede the per-player cushion below, which persists disconnect
	// state and therefore requires the game row to already exist.
	liveGameValues.onGameCreated(servergame);

	for (const [strcolor, { identifier, socket }] of Object.entries(assignments)) {
		const player = Number(strcolor) as Player;
		// Alert all their lobby-subscribed clients they are in a game. Only the socket that
		// asked for this game is taken into it; their other tabs get the rejoin banner.
		lobbymanager.broadcastMemberInGameStatus(identifier, socket);
		// Give them 5 seconds to navigate to the game page and re-connect
		// before they're considered disconnected.
		disconnect.startCushionTimer(servergame, player);
	}

	if (activegames.PRINT_GAMES) {
		console.log('Starting new game:');
		gameutility.printGame(servergame);
	}

	return gameID;
}

/**
 * When a player joins a new game: force them to leave their previous concluded game
 * still lingering for a rematch. Their old opponent's rematch option is withdrawn.
 */
function forceLeaveLingeringGame(identifier: AuthMemberInfo): void {
	for (const servergame of activegames.getAll()) {
		if (!gamefileutility.isGameOver(servergame)) continue; // Only concluded games linger for a rematch.
		for (const [c, data] of Object.entries(servergame.match.playerData)) {
			if (!memberinfoutil.eq(data.identifier, identifier)) continue;
			if (data.socket) {
				socketsend.send(data.socket, 'game', 'unsub', undefined); // Unsub the game on their old tab.
				gamesockets.detachParticipant(servergame.match, data.socket);
			}
			onPostGameLeave(servergame, Number(c) as Player, false);
			return; // A player can only be a participant of one lingering game.
		}
	}
}

/**
 * Handles a throw from {@link createGame}: logs it, then tells each connected
 * participant a server error prevented their game from starting.
 * @param error - The error thrown.
 * @param sockets - Every socket awaiting the game, undefined entries skipped.
 */
function onGameCreationError(error: unknown, sockets: (CustomWebSocket | undefined)[]): void {
	// The stack, not just the message — these are unexpected internal failures.
	const details = error instanceof Error ? (error.stack ?? error.message) : String(error);
	logEvents.addAndPrint(`Error creating game: ${details}`, 'errLog');
	for (const ws of sockets) {
		if (ws) socketsend.send(ws, 'general', 'notifyerror', ws.t.responses.errors.server_error);
	}
}

// Participant Subscription ----------------------------------------------------

/**
 * Links their socket to this game and runs reconnect side-effects (cancels disconnect/claim timer).
 * @returns `evicted` — whether a socket already attached as that player was kicked to make room.
 */
function subscribeParticipant(
	servergame: ServerGame,
	ws: CustomWebSocket,
	ourRole: Player,
): { evicted: boolean } {
	const match = servergame.match;
	// 1. Attach their socket to the game for receiving updates
	const playerData = match.playerData[ourRole];
	if (playerData === undefined) {
		console.error(`Cannot subscribe client to game when game does not expect color ${ourRole} to be present`); // prettier-ignore
		return { evicted: false };
	}
	const previousSocket = playerData.socket;
	if (previousSocket) {
		socketsend.send(previousSocket, 'game', 'leavegame', undefined);
		gamesockets.detachParticipant(match, previousSocket);
	}
	playerData.socket = ws;

	activeplayers.consumeNavigateNotice(playerData.identifier); // They've arrived; any pending lobby notice is moot.

	// 2. Modify their socket metadata to add the 'game', subscription,
	// and indicate what game the belong in and what color they are!
	ws.metadata.subscriptions.game = {
		id: match.id,
		color: ourRole,
	};

	runReconnectSideEffects(servergame, ourRole);

	return { evicted: previousSocket !== undefined };
}

/**
 * Runs the side-effects of a player (re)attaching their socket to a game.
 * While live: clears any disconnect/claim timer and notifies live-game tracking they reconnected.
 * Post-conclusion (game lingering for a rematch): clears the reconnection cushion and tells the
 * opponent we're back so their rematch button re-enables.
 */
function runReconnectSideEffects(servergame: ServerGame, ourRole: Player): void {
	/** Whether the opponent had been told they could claim (the claim window was set). */
	const claimWindowWasSet = gameutility.isClaimWindowSetForColor(servergame.match, ourRole);

	disconnect.cancelTimer(servergame.match, ourRole);

	const opponentRole = typeutil.invertPlayer(ourRole);
	if (!gamefileutility.isGameOver(servergame)) {
		liveGameValues.onPlayerReconnected(servergame, ourRole);
		// Alert their opponent we have returned, if they were informed of the disconnect
		if (claimWindowWasSet) {
			gamesockets.sendToColor(servergame.match, opponentRole, 'game', 'opponentdisconnectreturn', undefined); // prettier-ignore
		}
	} else {
		gamesockets.sendToColor(servergame.match, opponentRole, 'game', 'opponentreturn', undefined); // prettier-ignore
	}
}

/**
 * Unsubscribes a websocket from the game their connected to.
 * Entry points: Socket closure, or explicitly requested by the client.
 * @param involuntary - Whether we should give them a 5-second cushion to re-sub before we
 * start a disconnect claim timer. Set to false if we call this due to them closing the tab.
 */
function unsubscribeParticipant(ws: CustomWebSocket, involuntary: boolean): void {
	const gameID = ws.metadata.subscriptions.game?.id;
	if (gameID === undefined) return; // Not subscribed to any game

	const servergame = activegames.getByID(gameID)!;

	const role = gamesockets.getRole(servergame, ws)!;
	gamesockets.detachParticipant(servergame.match, ws);

	if (!gamefileutility.isGameOver(servergame)) {
		// Game is ongoing: inform the opponent they disconnected.
		if (involuntary) {
			// Internet interruption. Give them 5 seconds before opening the opponent's claim window.
			disconnect.startCushionTimer(servergame, role);
			// The tab lives on and its engine keeps searching, so its clock keeps ticking.
		} else {
			// Immediately open the opponent's claim window.
			disconnect.startClaimTimer(servergame, role, involuntary);
			// Closed tab manually: the page is gone, taking the engine's worker with it.
			freezeEngineClock(servergame);
		}

		// If this leaves BOTH players disconnected, start the timer that concludes the
		// game if neither returns (no one is present to claim victory/draw).
		gamelifecycle.maybeStartBothDisconnectedTimer(servergame);
	} else {
		// Post-conclusion: the game only lingers for the rematch handshake — no claim window applies.
		onPostGameLeave(servergame, role, involuntary);
	}
}

/**
 * Game is concluded: Handles a player leaving a concluded game's rematch window.
 * Withdraws their rematch offer and informs the opponent, then memory-evicts
 * either now or after a short cushion timer if it was involuntary.
 * Entry points: Socket close, client choice, or joined new game.
 */
function onPostGameLeave(servergame: ServerGame, role: Player, involuntary: boolean): void {
	const match = servergame.match;

	// Withdraw their rematch offer, if any, and tell the opponent they've left (disable + unglow).
	match.rematchOffers.delete(role);
	gamesockets.sendToColor(match, typeutil.invertPlayer(role), 'game', 'opponentleft', undefined); // prettier-ignore

	const playerdata = match.playerData[role]!;
	clearTimeout(playerdata.disconnect.startID);
	delete playerdata.disconnect.startID;

	if (!involuntary) {
		// Gone immediately.
		delete playerdata.disconnect.startTime;
		gamelifecycle.evictIfBothLeft(servergame);
	} else {
		// Network drop — give them the reconnection cushion before considering them gone.
		playerdata.disconnect.startID = setTimeout(() => {
			delete playerdata.disconnect.startTime;
			gamelifecycle.evictIfBothLeft(servergame);
		}, disconnect.RECONNECT_CUSHION_MS);
		playerdata.disconnect.startTime = Date.now() + disconnect.RECONNECT_CUSHION_MS;
	}
}

/**
 * Unsubscribes a spectator's websocket from the game their spectating.
 * Unlike participants, spectators have no disconnect timers or opponent to notify.
 * Entry points: Socket closure, or explicitly requested by the client.
 */
function unsubscribeSpectator(ws: CustomWebSocket): void {
	const gameID = ws.metadata.subscriptions.spectating?.id;
	if (gameID === undefined) return; // Not spectating any game
	gamesockets.detachSpectator(activegames.getByID(gameID)!, ws);
}

// Clocks ----------------------------------------------------------------------

/**
 * Pushes the game clock, adding increment. Resets the timer
 * to auto terminate the game when a player loses on time.
 * @returns The new time (in ms) of the player that just moved after increment is added.
 */
function pushClock(servergame: ServerGame): number | undefined {
	servergame.whosTurn =
		servergame.gameRules.turnOrder[
			servergame.moves.length % servergame.gameRules.turnOrder.length
		]!;

	if (servergame.untimed) return; // Don't adjust the times if the game isn't timed.

	const data = clock.push(servergame);

	armAutoTimeLoss(servergame);

	return data;
}

/** Arms a timer that auto-concludes the game when the player whose turn it is runs out of time. */
function armAutoTimeLoss(servergame: ServerGame): void {
	if (
		servergame.untimed ||
		gamefileutility.isGameOver(servergame) ||
		!moveutil.isGameResignable(servergame) ||
		servergame.clocks.colorTicking === undefined
	)
		return;

	// Cancel previous auto loss timer if it exists
	clearTimeout(servergame.match.autoTimeLossTimeoutID);
	servergame.match.autoTimeLossTimeoutID = setTimeout(
		() => gamelifecycle.concludeOnTime(servergame),
		Math.max(servergame.clocks.timeRemainAtTurnStart, 0),
	);
}

/** If it's an engine game: Pauses the engine's clock, rewinding its turn. */
function freezeEngineClock(servergame: ServerGame): void {
	const engine = servergame.match.engineParticipant;
	if (
		engine === undefined || // Not an engine game
		servergame.untimed || // No clocks
		servergame.clocks.colorTicking === undefined || // Already frozen
		servergame.whosTurn !== engine.color || // Not the engine's turn
		gamefileutility.isGameOver(servergame)
	)
		return;

	servergame.clocks.currentTime[engine.color] = servergame.clocks.timeRemainAtTurnStart;
	clock.endGame(servergame);
	clearTimeout(servergame.match.autoTimeLossTimeoutID);
	liveGameValues.onEngineClockChanged(servergame);
	gamesockets.broadcastEngineClock(servergame);
}

/** Restarts the engine's frozen clock: a client has attached to think for it. */
function resumeEngineClock(servergame: ServerGame): void {
	const engine = servergame.match.engineParticipant;
	if (
		engine === undefined || // Not an engine game
		servergame.untimed || // No clocks
		servergame.clocks.colorTicking !== undefined || // Already ticking
		servergame.whosTurn !== engine.color || // Not the engine's turn
		gamefileutility.isGameOver(servergame) ||
		!moveutil.isGameResignable(servergame)
	)
		return;

	const remaining = servergame.clocks.currentTime[engine.color]!;
	clock.edit(servergame.clocks, {
		clocks: { ...servergame.clocks.currentTime },
		colorTicking: engine.color,
		timeColorTickingLosesAt: Date.now() + remaining,
	});
	armAutoTimeLoss(servergame);
	liveGameValues.onEngineClockChanged(servergame);
	gamesockets.broadcastEngineClock(servergame);
}

// SSR Page State --------------------------------------------------------------

/**
 * Resolves a game id's {@link StaticGameState} — live (in memory) or dead (in the DB) —
 * plus its ply count and liveness, for the SSR game page. `undefined` if no such game.
 * @throws If a database error occurs.
 */
function produceStaticGameState(id: number):
	| {
			state: StaticGameState;
			moveCount: number;
			game?: ServerGame;
			/** Only concluded games have one — a live game's start position rides in its setup. */
			icn?: string;
			engineGame?: EngineGamePageInfo;
			ratingChanges?: PlayerGroup<number>;
	  }
	| undefined {
	const game = activegames.getByID(id); // Defined if live
	if (game !== undefined)
		return {
			game,
			state: gamestatebuilder.buildStaticState(game),
			moveCount: game.moves.length,
			...(game.match.engineParticipant && {
				engineGame: {
					engine: game.match.engineParticipant.engine,
					strengthLevel: game.match.engineParticipant.strengthLevel,
				},
			}),
			ratingChanges: gamestatebuilder.getRatingChanges(game),
		};

	return deadgamestate.produceStaticState(id); // undefined if the game doesn't exist
}

// Exports ---------------------------------------------------------------------

export default {
	// Creation
	createGame,
	onGameCreationError,
	// Participant Subscription
	subscribeParticipant,
	unsubscribeParticipant,
	unsubscribeSpectator,
	// Clocks
	pushClock,
	freezeEngineClock,
	resumeEngineClock,
	// SSR Page State
	produceStaticGameState,
};
