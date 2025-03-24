

import type { ClockValues } from "../../../chess/logic/clock.js";
import type { MetaData } from "../../../chess/util/metadata.js";
// @ts-ignore
import type { WebsocketMessage } from "../websocket.js";
// @ts-ignore
import type gamefile from "../../chess/logic/gamefile.js";


import disconnect from "./disconnect.js";
import afk from "./afk.js";
import serverrestart from "./serverrestart.js";
import movesendreceive from "./movesendreceive.js";
import resyncer from "./resyncer.js";
import drawoffers from "./drawoffers.js";
import gameloader from "../../chess/gameloader.js";
import gameslot from "../../chess/gameslot.js";
import guititle from "../../gui/guititle.js";
import clock from "../../../chess/logic/clock.js";
import selection from "../../chess/selection.js";
import onlinegame from "./onlinegame.js";
// @ts-ignore
import guiplay from "../../gui/guiplay.js";
// @ts-ignore
import websocket from "../../websocket.js";
// @ts-ignore
import statustext from "../../gui/statustext.js";
// @ts-ignore
import guiclock from "../../gui/guiclock.js";
// @ts-ignore
import board from "../../rendering/board.js";


// Type Definitions --------------------------------------------------------------------------------------


/**
 * The message contents expected when we receive a server websocket 'joingame' message. 
 * This contains everything a {@link GameUpdateMessage} message would have, and more!!
 * 
 * The stuff included here does not need to be specified when we're resyncing to
 * a game, or receiving a game update, as we already know this stuff.
 */
interface JoinGameMessage extends GameUpdateMessage {
	/** The id of the online game */
	id: string,
	/** The metadata of the game, including the TimeControl, player names, date, etc.. */
	metadata: MetaData,
	publicity: 'public' | 'private',
	youAreColor: 'white' | 'black',
};

/** The message contents expected when we receive a server websocket 'gameupdate' message.  */
interface GameUpdateMessage {
	gameConclusion: string | false,
	/** Existing moves, if any, to forward to the front of the game. Should be specified if reconnecting to an online. Each move should be in the most compact notation, e.g., `['1,2>3,4','10,7>10,8Q']`. */
	moves: string[],
	drawOffer: DrawOfferInfo,
	clockValues?: ClockValues,
	/** If our opponent has disconnected, this will be present. */
	disconnect?: DisconnectInfo,
	/**
	 * If our opponent is afk, this is how many millseconds left until they will be auto-resigned,
	 * at the time the server sent the message. Subtract half our ping to get the correct estimated value!
	 */
	millisUntilAutoAFKResign?: number,
	/** If the server us restarting soon for maintenance, this is the time (on the server's machine) that it will be restarting. */
	serverRestartingAt?: number,
}

/** The message contents expected when we receive a server websocket 'move' message.  */
interface OpponentsMoveMessage {
	/** The move our opponent played. In the most compact notation: `"5,2>5,4"` */
	move: string,
	gameConclusion: string | false,
	/** Our opponent's move number, 1-based. */
	moveNumber: number,
	/** If the game is timed, this will be the current clock values. */
	clockValues?: ClockValues,
}





interface DisconnectInfo {
	/**
	 * How many milliseconds left until our opponent will be auto-resigned from disconnection,
	 * at the time the server sent the message. Subtract half our ping to get the correct estimated value!
	 */
	millisUntilAutoDisconnectResign: number,
	/** Whether the opponent disconnected by choice, or if it was non-intentional (lost network). */
	wasByChoice: boolean
}

interface DrawOfferInfo {
	/** True if our opponent has extended a draw offer we haven't yet confirmed/denied */
	unconfirmed: boolean,
	/** The move ply WE HAVE last offered a draw, if we have, otherwise undefined. */
	lastOfferPly?: number,
}


// Routers --------------------------------------------------------------------------------------


/**
 * Routes a server websocket message with subscription marked `game`.
 * This handles all messages related to the active game we're in.
 * @param {WebsocketMessage} data - The incoming server websocket message
 */
function routeMessage(data: WebsocketMessage): void { // { sub, action, value, id }
	// console.log(`Received ${data.action} from server! Message contents:`)
	// console.log(data.value)
	
	// This action is listened to, even when we're not in a game.

	if (data.action === 'joingame') return handleJoinGame(data.value);

	// All other actions should be ignored if we're not in a game...

	if (!onlinegame.areInOnlineGame()) {
		console.log(`Received server 'game' message when we're not in an online game. Ignoring. Message: ${JSON.stringify(data)}`);
		return;
	}

	const gamefile = gameslot.getGamefile()!;

	switch (data.action) {
		case "move":
			movesendreceive.handleOpponentsMove(gamefile, data.value);
			break;
		case "clock": 
			handleUpdatedClock(gamefile, data.value);
			break;
		case "gameupdate":
			resyncer.handleServerGameUpdate(gamefile, data.value);
			break;
		case "unsub":
			handleUnsubbing();
			break;
		case "login":
			handleLogin(gamefile);
			break;
		case "nogame": // Game is deleted / no longer exists
			handleNoGame(gamefile);
			break;
		case "leavegame":
			handleLeaveGame();
			break;
		case "opponentafk":
			afk.startOpponentAFKCountdown(data.value.millisUntilAutoAFKResign);
			break;
		case "opponentafkreturn":
			afk.stopOpponentAFKCountdown();
			break;
		case "opponentdisconnect":
			disconnect.startOpponentDisconnectCountdown(data.value);
			break;
		case "opponentdisconnectreturn":
			disconnect.stopOpponentDisconnectCountdown();
			break;
		case "serverrestart":
			serverrestart.initServerRestart(data.value);
			break;
		case "drawoffer":
			drawoffers.onOpponentExtendedOffer();
			break;
		case "declinedraw":
			drawoffers.onOpponentDeclinedOffer();
			break;
		default:
			statustext.showStatus(`Unknown action "${data.action}" received from server in 'game' route.`, true);
			break;
	}
}



/**
 * Joins a game when the server tells us we are now in one.
 * 
 * This happens when we click an invite, or our invite is accepted.
 * 
 * This type of message contains the MOST information about the game.
 * Less then "gameupdate"s, or resyncing.
 */
function handleJoinGame(message: JoinGameMessage) {
	// We were auto-unsubbed from the invites list, BUT we want to keep open the socket!!
	websocket.deleteSub('invites');
	websocket.addSub('game');
	guititle.close();
	guiplay.close();
	gameloader.startOnlineGame(message);
}

/** 
 * Called when we received the updated clock values from the server after submitting our move.
 */
function handleUpdatedClock(gamefile: gamefile, clockValues: ClockValues) {
	// Adjust the timer whos turn it is depending on ping.
	if (clockValues) clockValues = clock.adjustClockValuesForPing(clockValues);
	clock.edit(gamefile, clockValues); // Edit the clocks
	guiclock.edit(gamefile);
}

/**
 * Called after the server deletes the game after it has ended.
 * It basically tells us the server will no longer be sending updates related to the game,
 * so we should just unsub.
 * 
 * Called when the server informs us they have unsubbed us from receiving updates from the game.
 * At this point we should leave the game.
 */
function handleUnsubbing() {
	websocket.deleteSub('game');
}

/**
 * The server has unsubscribed us from receiving updates from the game
 * and from submitting actions as ourselves,
 * due to the reason we are no longer logged in.
 */
function handleLogin(gamefile: gamefile) {
	statustext.showStatus(translations['onlinegame'].not_logged_in, true, 100);
	websocket.deleteSub('game');
	clock.endGame(gamefile);
	guiclock.stopClocks(gamefile);
	selection.unselectPiece();
	board.darkenColor();
}

/**
 * The server has reported the game no longer exists,
 * there will be nore more updates for it.
 * 
 * Visually, abort the game.
 * 
 * This can happen when either:
 * * Your page tries to resync to the game after it's long over.
 * * The server restarts mid-game.
 */
function handleNoGame(gamefile: gamefile) {
	statustext.showStatus(translations['onlinegame'].game_no_longer_exists, false, 1.5);
	websocket.deleteSub('game');
	gamefile.gameConclusion = 'aborted';
	gameslot.concludeGame();
}

/**
 * You have connected to the same game from another window/device.
 * Leave the game on this page.
 * 
 * This allows you to return to the invite creation screen,
 * but you won't be allowed to create an invite if you're still in a game.
 * However you can start a local game.
 */
function handleLeaveGame() {
	statustext.showStatus(translations['onlinegame'].another_window_connected);
	websocket.deleteSub('game');
	gameloader.unloadGame();
	guititle.open();
}



export default {
	routeMessage,
};

export type {
	JoinGameMessage,
	DisconnectInfo,
	DrawOfferInfo,
	GameUpdateMessage,
	OpponentsMoveMessage,
};