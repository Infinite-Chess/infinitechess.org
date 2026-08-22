// src/server/game/gamemanager/gamesockets.ts

/**
 * The wiring between a live game and the sockets attached to it:
 * attaching/detaching them, and addressing messages to one color,
 * to both participants, to the spectators, or to everyone.
 *
 * Deliberately side-effect free beyond the socket itself — attaching a PARTICIPANT
 * also cancels timers and notifies their opponent, so that lives in `gamemanager.ts`.
 */

import type { Exact } from '../../../shared/util/socketutil.js';
import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { MatchInfo, ServerGame } from './servergametypes.js';
import type { OutAction, OutRoute, OutValue } from '../../socket/socketSend.js';

import gamestatebuilder from './gamestatebuilder.js';
import { memberInfoEq } from '../../utility/memberInfoUtil.js';
import { sendSocketMessage } from '../../socket/socketSend.js';

// Attaching & Detaching -------------------------------------------------------------------------

/** Attaches a spectator's socket to a game, marking its subscription metadata. */
function attachSpectator(servergame: ServerGame, ws: CustomWebSocket): void {
	servergame.spectators.add(ws);
	ws.metadata.subscriptions.spectating = { id: servergame.match.id };
}

/** Detaches the socket from the game and clears its subscription metadata. */
function detachParticipant(match: MatchInfo, ws: CustomWebSocket): void {
	if (ws.metadata.subscriptions.game === undefined) return; // Already detached

	delete match.playerData[ws.metadata.subscriptions.game.color]!.socket; // Ceases regular updates
	delete ws.metadata.subscriptions.game;
}

/** Detaches a spectator's socket from the game, clearing its subscription metadata. */
function detachSpectator(servergame: ServerGame, ws: CustomWebSocket): void {
	servergame.spectators.delete(ws);
	delete ws.metadata.subscriptions.spectating;
}

/**
 * Resolves the color a websocket is playing as in a specific live game, if they are a participant.
 * Uses game subscription metadata when valid, with identity fallback for resync/refresh cases.
 * @returns The player's color if the socket belongs to the game, otherwise undefined.
 */
function getRole(servergame: ServerGame, ws: CustomWebSocket): Player | undefined {
	const match = servergame.match;
	if (match.id === ws.metadata.subscriptions.game?.id)
		return ws.metadata.subscriptions.game.color;
	// Color isn't provided in subscriptions (e.g. resync/refresh), resolve by identity.
	const identity = ws.metadata.memberInfo;
	for (const [splayer, data] of Object.entries(match.playerData)) {
		const playercolor = Number(splayer) as Player;
		if (memberInfoEq(identity, data.identifier)) return playercolor;
	}
	return undefined;
}

// Addressed Messages ----------------------------------------------------------------------------

/**
 * Sends a websocket message to the specified color in the game.
 * @param match - The game
 * @param role - The color of the player in this game to send the message to
 * @param sub - Where this message should be routed to, client side.
 * @param action - The action the client should perform.
 * @param value - The value to send to the client. Already-translated text for notify/notifyerror.
 */
function sendToColor<R extends OutRoute, A extends OutAction<R>, V extends OutValue<R, A>>(
	match: MatchInfo,
	role: Player,
	sub: R,
	action: A,
	value: Exact<V, OutValue<R, A>>,
): void {
	const ws = match.playerData[role]?.socket;
	if (!ws) return; // They are not connected, can't send message
	sendSocketMessage(ws, sub, action, value);
}

/**
 * Sends the current game state (`gamestate`) to the player of the specified color: the
 * move list, timers, conclusion, and finalized flag, with their participant overlay.
 * @param forceSync - If true, the client forces its move list to exactly match the server's
 * (not re-submitting any extra move). Set only when the server rejected their last move.
 */
function sendGameState(servergame: ServerGame, role: Player, forceSync: boolean): void {
	const playerdata = servergame.match.playerData[role];
	if (playerdata?.socket === undefined) return; // Not connected, can't send message

	const messageContents = gamestatebuilder.buildStateMessage(servergame, role, forceSync);
	sendSocketMessage(playerdata.socket, 'game', 'gamestate', messageContents);
}

/**
 * Hands every connected participant their rematch overlay, the moment the game's conclusion
 * brings it into existence. The conclusion itself reaches them over several recipient-agnostic
 * messages (`gameconclusion`, `move`) that spectators receive too, so none of them can carry it.
 * Recipients also getting a full `gamestate` receive it twice — the participant overlay
 * embeds the same one — which is idempotent, and the price of one un-missable call site.
 */
function sendRematchState(servergame: ServerGame): void {
	for (const color of Object.keys(servergame.match.playerData)) {
		const role = Number(color) as Player;
		// Guaranteed defined — callers invoke this only once the conclusion is applied.
		const rematch = gamestatebuilder.getRematchOfferInfo(servergame, role)!;
		sendToColor(servergame.match, role, 'game', 'rematchstate', rematch);
	}
}

// Broadcasts ------------------------------------------------------------------------------------

/** Broadcasts a message to every connected participant of the game. */
function broadcastToParticipants<
	R extends OutRoute,
	A extends OutAction<R>,
	V extends OutValue<R, A>,
>(servergame: ServerGame, sub: R, action: A, value: Exact<V, OutValue<R, A>>): void {
	for (const color of Object.keys(servergame.match.playerData))
		sendToColor(servergame.match, Number(color) as Player, sub, action, value);
}

/** Broadcasts a role-agnostic game-route message to every spectator of the game. */
function broadcastToSpectators<A extends OutAction<'game'>, V extends OutValue<'game', A>>(
	servergame: ServerGame,
	action: A,
	value: Exact<V, OutValue<'game', A>>,
): void {
	for (const ws of servergame.spectators) {
		sendSocketMessage(ws, 'game', action, value);
	}
}

/** Broadcasts a role-agnostic game-route message to every connected client of the game. */
function broadcastToEveryone<A extends OutAction<'game'>, V extends OutValue<'game', A>>(
	servergame: ServerGame,
	action: A,
	value: Exact<V, OutValue<'game', A>>,
): void {
	broadcastToParticipants(servergame, 'game', action, value);
	broadcastToSpectators(servergame, action, value);
}

// Exports ---------------------------------------------------------------------------------------

export default {
	// Attaching & Detaching
	attachSpectator,
	detachParticipant,
	detachSpectator,
	getRole,
	// Addressed Messages
	sendToColor,
	sendGameState,
	sendRematchState,
	// Broadcasts
	broadcastToParticipants,
	broadcastToSpectators,
	broadcastToEveryone,
};
