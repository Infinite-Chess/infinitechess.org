// src/server/game/gamemanager/resync.ts

/**
 * This script handles resyncing a client to a game when their
 * websocket closes unexpectedly, but they haven't left the page.
 *
 * This is SEPARATE from the re-joining game that happens when you
 * refresh the page. THAT needs more info sent to the client than this resync does,
 * which is only a websocket reopening.
 *
 * This needs to be its own script instead of in gamemanager because
 * both gamemanager and movesubmission depend on this, so we avoid circular dependancy.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { ServerGame } from './gameutility.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';

import typeutil from '../../../shared/chess/util/typeutil.js';

import gameutility from './gameutility.js';
import liveGameValues from './liveGameValues.js';
import { getGameByID } from './gamemanager.js';
import { getGameData } from '../../database/gamesManager.js';
import { logEventsAndPrint } from '../../middleware/logEvents.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { cancelDisconnectTimer } from './disconnect.js';

/**
 * Resyncs a client's websocket to a game. The client already
 * knows the game id and much other information. We only need to send
 * them the current move list, player timers, and game conclusion.
 * @param ws - Their websocket
 * @param gameID - The game id they requested to sync to
 * @param replyToMessageID - If specified, the id of the incoming socket message this resync will be the reply to
 */
function resyncToGame(ws: CustomWebSocket, gameID: number, replyToMessageID?: number): void {
	// Make sure their pre-subbed game and game they requested to resync to match.
	const preSubbedGameId = ws.metadata.subscriptions.game?.id;
	if (preSubbedGameId !== undefined && preSubbedGameId !== gameID) {
		logEventsAndPrint(
			`Client tried to resync to game of id (${gameID}) when they are actually subbed to game of id (${preSubbedGameId})!!`,
			'errLog',
		);
		return;
	}

	// 1. Check if the game is still live => Resync them
	const game: ServerGame | undefined = getGameByID(gameID);

	// 2. Not live (evicted from memory) => tell the client how to move on
	if (!game) {
		handleResyncToDeadGame(ws, gameID);
		return;
	}

	// Verify
	const ourRole = gameutility.getSocketRoleInGame(game, ws);
	if (!ourRole) {
		sendSocketMessage(ws, 'game', 'login'); // Unable to verify their socket belongs to this game (probably logged out)
		return;
	}

	try {
		gameutility.resyncToGame(ws, game, ourRole, replyToMessageID);
	} catch {
		// DB error (already logged)
		sendSocketMessage(
			ws,
			'game',
			'notifyerror',
			"Couldn't resync to the game. A server error occurred. Please refresh.",
			replyToMessageID,
		);
		return;
	}

	runReconnectSideEffects(game, ourRole);
}

/**
 * A lean reconnect for a game the client already knows is finalized: its result is locked in, so
 * only rematch-offer state can still change. We send just that (`rematchstate`) instead of a full
 * resync, then run the standard reconnect side-effects (clear the cushion, tell the opponent we're
 * back). Games no longer in memory (evicted) have no rematch — reply with an empty overlay so the
 * client's button disables while it keeps the finished result it's already showing.
 * @param ws - Their websocket
 * @param gameID - The game id they requested
 * @param replyToMessageID - The id of the incoming socket message this is a reply to
 */
function resyncRematch(ws: CustomWebSocket, gameID: number, replyToMessageID?: number): void {
	const game = getGameByID(gameID);
	if (!game) {
		sendSocketMessage(ws, 'game', 'rematchstate', { offered: false, present: false }, replyToMessageID); // prettier-ignore
		return;
	}

	const ourRole = gameutility.getSocketRoleInGame(game, ws);
	if (!ourRole) {
		sendSocketMessage(ws, 'game', 'login'); // Couldn't verify their socket belongs (probably logged out)
		return;
	}

	const rematch = gameutility.getRematchOfferInfo(game, ourRole) ?? { offered: false, present: false }; // prettier-ignore
	sendSocketMessage(ws, 'game', 'rematchstate', rematch, replyToMessageID);

	runReconnectSideEffects(game, ourRole);
}

/**
 * Runs the side-effects of a player (re)attaching their socket to a game. While live: clears
 * any disconnect/claim timer and notifies live-game tracking they reconnected. Post-conclusion
 * (game lingering for a rematch): clears the reconnection cushion and tells the opponent we're
 * back so their rematch button re-enables.
 */
function runReconnectSideEffects(servergame: ServerGame, color: Player): void {
	cancelDisconnectTimer(servergame.match, color);
	if (gameutility.isGameOver(servergame)) {
		const opponentColor = typeutil.invertPlayer(color);
		gameutility.sendMessageToSocketOfColor(servergame.match, opponentColor, 'game', 'opponentreturn'); // prettier-ignore
	} else {
		liveGameValues.onPlayerReconnected(servergame, color);
	}
}

/**
 * Handles a resync to a game no longer in server memory. Dead-game state is now served over HTTP
 * (`GET /api/game/:id`), so the socket no longer ships it: a logged game (in the DB) concluded, so
 * we tell the client to unsub — it keeps the finished result it's already showing. A game absent
 * from the DB was aborted before any move (never logged), so we tell the client there's no game.
 *
 * TODO (T10): a client resyncing a game it believed *live* but that has since concluded may not
 * have seen the conclusion; that case needs the dead state (or a redirect to the HTTP dead-game
 * route) rather than a bare `unsub`.
 */
function handleResyncToDeadGame(ws: CustomWebSocket, gameID: number): void {
	let loggedInDb: boolean;
	try {
		loggedInDb = !!getGameData(gameID, ['game_id']);
	} catch {
		// DB error (already logged)
		sendSocketMessage(
			ws,
			'game',
			'notifyerror',
			'A server error occurred while fetching game data. Please refresh.',
		);
		return;
	}

	sendSocketMessage(ws, 'game', loggedInDb ? 'unsub' : 'nogame');
}

export { resyncToGame, resyncRematch, runReconnectSideEffects };
