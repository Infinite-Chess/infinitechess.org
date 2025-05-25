

import type { ClockValues } from "../../../chess/logic/clock.js";
import type { MetaData } from "../../../chess/util/metadata.js";
import type { LongFormatOut } from "../../../chess/logic/icn/icnconverter.js";
// @ts-ignore
import type { WebsocketMessage } from "../websocket.js";
// @ts-ignore
import type gamefile from "../../chess/logic/gamefile.js";

// @ts-ignore
import guiplay from "../../gui/guiplay.js";
// @ts-ignore
import websocket from "../../websocket.js";
// @ts-ignore
import statustext from "../../gui/statustext.js";
// @ts-ignore
import board from "../../rendering/board.js";
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
import guiclock from "../../gui/guiclock.js";
import icnconverter from "../../../chess/logic/icn/icnconverter.js";
import validatorama from "../../../util/validatorama.js";
import uuid from "../../../util/uuid.js";
import metadata from "../../../chess/util/metadata.js";
import { players, Player } from "../../../chess/util/typeutil.js";


// Type Definitions --------------------------------------------------------------------------------------


type ServerGameMovesMessage = ServerGameMoveMessage[];
type ServerGameMoveMessage = { compact: string, clockStamp?: number };

/**
 * Static information about an online game that is unchanging.
 * Only need this once, when we originally load the game,
 * not on subsequent updates/resyncs.
 */
type ServerGameInfo = {
	/** The id of the online game */
	id: number,
	rated: boolean,
	publicity: 'public' | 'private',
}

/**
 * The message contents expected when we receive a server websocket 'joingame' message. 
 * This contains everything a {@link GameUpdateMessage} message would have, and more!!
 * 
 * The stuff included here does not need to be specified when we're resyncing to
 * a game, or receiving a game update, as we already know this stuff.
 */
interface JoinGameMessage extends GameUpdateMessage {
	gameInfo: ServerGameInfo,
	/** The metadata of the game, including the TimeControl, player names, date, etc.. */
	metadata: MetaData,
	youAreColor: Player,
};

/** The message contents expected when we receive a server websocket 'gameupdate' message.  */
interface GameUpdateMessage {
	gameConclusion: string | false,
	/** Existing moves, if any, to forward to the front of the game. Should be specified if reconnecting to an online. Each move should be in the most compact notation, e.g., `['1,2>3,4','10,7>10,8Q']`. */
	moves: ServerGameMovesMessage,
	participantState: ParticipantState
	clockValues?: ClockValues,
	/** If the server us restarting soon for maintenance, this is the time (on the server's machine) that it will be restarting. */
	serverRestartingAt?: number,
}

/** The message contents expected when we receive a server websocket 'move' message.  */
interface OpponentsMoveMessage {
	/** The move our opponent played. In the most compact notation: `"5,2>5,4"` */
	move: ServerGameMoveMessage,
	gameConclusion: string | false,
	/** Our opponent's move number, 1-based. */
	moveNumber: number,
	/** If the game is timed, this will be the current clock values. */
	clockValues?: ClockValues,
}

/** The state of the game unique to participants, while the game is ongoing, NOT for spectators, and not when the game is over. */
type ParticipantState = {
	drawOffer: DrawOfferInfo,
	/** If our opponent has disconnected, this will be present. */
	disconnect?: DisconnectInfo,
	/**
	 * If our opponent is afk, this is how many millseconds left until they will be auto-resigned,
	 * at the time the server sent the message. Subtract half our ping to get the correct estimated value!
	 */
	millisUntilAutoAFKResign?: number,
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

/** Info storing draw offers of the game. */
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
	
	// These actions are listened to, even when we're not in a game.

	if (data.action === 'joingame') return handleJoinGame(data.value);
	else if (data.action === 'logged-game-info') return handleLoggedGameInfo(data.value);

	// All other actions should be ignored if we're not in a game...

	if (!onlinegame.areInOnlineGame()) {
		console.log(`Received server 'game' message when we're not in an online game. Ignoring. Message: ${JSON.stringify(data)}`);
		return;
	}

	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh();

	switch (data.action) {
		case "move":
			movesendreceive.handleOpponentsMove(gamefile, mesh, data.value);
			break;
		case "clock": 
			handleUpdatedClock(gamefile, data.value);
			break;
		case "gameupdate":
			resyncer.handleServerGameUpdate(gamefile, mesh, data.value);
			break;
		case "unsub":
			handleUnsubbing();
			break;
		case "login":
			handleLogin(gamefile);
			break;
		case "nogame": // Game doesn't exist - SHOULD NEVER HAPPEN
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
	// If the clock values are present, adjust them for ping.
	if (message.clockValues) message.clockValues = onlinegame.adjustClockValuesForPing(message.clockValues);
	gameloader.startOnlineGame(message);
}

/**
 * Called when the server sends us the game info of an ENDED game inside the database.
 * This loads it, even if we didn't participate in the game, and immediately concludes it.
 * @param message - The message from the server containing the game info.
 */
function handleLoggedGameInfo(message: {
	game_id: number,
	rated: 0 | 1,
	private: 0 | 1,
	termination: string,
	icn: string,
}) {
	let parsedGame: LongFormatOut;
	try {
		parsedGame = icnconverter.ShortToLong_Format(message.icn);
	} catch (e) {
		// Hmm, this isn't good. Why is a server-sent ICN crashing?
		console.error(e);
		statustext.showStatus("There was an error processing the game ICN sent from the server. This is a bug, please report!", true);
		return;
	}

	// Unload the currently loaded game, if we are in one
	if (gameloader.areInAGame()) {
		gameslot.unloadGame();
		websocket.deleteSub('game'); // The server will have already unsubscribed us from the previous game.
	} // Else perhaps we need to close the title screen?? Or the loading screen??
	
	// Are we one of the players (automatically no, if there's only guests)
	const ourUserId: number | undefined = validatorama.getOurUserId();
	const whiteId: number | undefined = parsedGame.metadata.WhiteID ? uuid.base62ToBase10(parsedGame.metadata.WhiteID) : undefined;
	const blackId: number | undefined = parsedGame.metadata.BlackID ? uuid.base62ToBase10(parsedGame.metadata.BlackID) : undefined;
	const ourRole: Player | undefined = ourUserId !== undefined ? (ourUserId === whiteId ? players.WHITE : ourUserId === blackId ? players.BLACK : undefined) : undefined;

	// The clock values are already ingrained into the moves!
	const moves: ServerGameMovesMessage = parsedGame.moves ? parsedGame.moves.map(m => {
		const move: { compact: string, clockStamp?: number } = { compact: m.compact };
		if (m.clockStamp !== undefined) move.clockStamp = m.clockStamp;
		return move;
	}) : [];

	// Load the game.
	gameloader.startOnlineGame({
		gameInfo: {
			id: message.game_id,
			rated: Boolean(message.rated),
			publicity: message.private ? 'private' as const : 'public' as const,
		},
		metadata: parsedGame.metadata,
		gameConclusion: metadata.getGameConclusionFromResultAndTermination(parsedGame.metadata.Result!, message.termination),
		moves,
		youAreColor: ourRole,
	});
}

/** 
 * Called when we received the updated clock values from the server after submitting our move.
 */
function handleUpdatedClock(gamefile: gamefile, clockValues: ClockValues) {
	// Adjust the timer whos turn it is depending on ping.
	if (clockValues) clockValues = onlinegame.adjustClockValuesForPing(clockValues);
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
	DisconnectInfo,
	DrawOfferInfo,
	GameUpdateMessage,
	OpponentsMoveMessage,
	ServerGameMovesMessage,
	ServerGameMoveMessage,
	ServerGameInfo,
	ParticipantState,
};