
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

// @ts-ignore
import gameutility from './gameutility.js';
// @ts-ignore
import { getGameByID } from './gamemanager.js';
// @ts-ignore
import { cancelDisconnectTimer } from './afkdisconnect.js';
import { logEventsAndPrint } from '../../middleware/logEvents.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { getGameData } from '../../database/gamesManager.js';
import jsutil from '../../../client/scripts/esm/util/jsutil.js';
import socketUtility, { CustomWebSocket } from '../../socket/socketUtility.js';

// @ts-ignore
import type { Game } from '../TypeDefinitions.js';




/**
 * Resyncs a client's websocket to a game. The client already
 * knows the game id and much other information. We only need to send
 * them the current move list, player timers, and game conclusion.
 * @param ws - Their websocket
 * @param game - The game, if already known. If not specified we will find from the id they gave us.
 * @param gameID - The game id they requested to sync to. They SHOULD have provided this as a number, but they may tamper it.
 * @param replyToMessageID - If specified, the id of the incoming socket message this resync will be the reply to
 */
function resyncToGame(ws: CustomWebSocket, gameID: any, replyToMessageID?: number) {
	if (typeof gameID !== 'number') {
		// Tampered message
		const log = `Socket sent 'resync', but gameID is in the wrong form! Received: (${jsutil.ensureJSONString(gameID)}) of type ${typeof gameID}. The socket: ${socketUtility.stringifySocketMetadata(ws)}`;
		logEventsAndPrint(log, 'errLog.txt');
		return;
	}

	// Make sure their pre-subbed game and game they requested to resync to match.
	const preSubbedGameId = ws.metadata.subscriptions.game?.id;
	if (preSubbedGameId !== undefined && preSubbedGameId !== gameID) {
		logEventsAndPrint(`Client tried to resync to game of id (${gameID}) when they are actually subbed to game of id (${preSubbedGameId})!!`, 'errLog.txt');
		return;
	}

	// 1. Check if the game is still live => Resync them
	const game: Game | undefined = getGameByID(gameID);

	// 2. Not live => Send game results from database
	if (!game) {
		sendClientLoggedGame(ws, gameID);
		return;
	}

	// Verify 
	const colorPlayingAs = ws.metadata.subscriptions.game?.color ?? gameutility.doesSocketBelongToGame_ReturnColor(game, ws);
	if (!colorPlayingAs) {
		sendSocketMessage(ws, 'game', 'login'); // Unable to verify their socket belongs to this game (probably logged out)
		return;
	}

	gameutility.resyncToGame(ws, game, colorPlayingAs, replyToMessageID);

	cancelDisconnectTimer(game, colorPlayingAs);
}

/** Sends a client a game from the database. */
function sendClientLoggedGame(ws: CustomWebSocket, gameID: number): void {
	const logged_game_info = getGameData(gameID, ['game_id', 'rated', 'private', 'termination', 'icn']);
	if (!logged_game_info) {
		logEventsAndPrint(`Unable to send player game results after game of id (${gameID}) was logged, because we weren't able to retrieve it from the games table! (Potential they just requested a non-existent game id)`, 'errLog.txt');
		sendSocketMessage(ws, 'game', 'nogame'); // IN THE FUTURE: The client could show a "Game not found" page
		return;
	}
	
	// They should automatically know to unsub on their end, because of this message.

	// Send them the actual game info.
	sendSocketMessage(ws, 'game', 'logged-game-info', logged_game_info);

	console.log(`Sent client game from the database of id (${gameID})!`);
}

export {
	resyncToGame
};