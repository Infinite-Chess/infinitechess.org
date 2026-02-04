// src/client/scripts/esm/game/misc/onlinegame/onlinegamerouter.ts

import type { PlayerGroup } from '../../../../../../shared/chess/util/typeutil.js';
import type { Rating } from '../../../../../../server/database/leaderboardsManager.js';
import type { ClockValues } from '../../../../../../shared/chess/logic/clock.js';
import type { MetaData } from '../../../../../../shared/chess/util/metadata.js';
import type { LongFormatOut } from '../../../../../../shared/chess/logic/icn/icnconverter.js';
import type { Game } from '../../../../../../shared/chess/logic/gamefile.js';
import type {
	GameUpdateMessage,
	ServerGameMoveMessage,
} from '../../../../../../server/game/gamemanager/gameutility.js';

import guiplay from '../../gui/guiplay.js';
import toast from '../../gui/toast.js';
import websocket, { WebsocketMessage } from '../../websocket.js';
import board from '../../rendering/boardtiles.js';
import disconnect from './disconnect.js';
import afk from './afk.js';
import serverrestart from './serverrestart.js';
import movesendreceive from './movesendreceive.js';
import resyncer from './resyncer.js';
import drawoffers from './drawoffers.js';
import gameloader from '../../chess/gameloader.js';
import gameslot from '../../chess/gameslot.js';
import guititle from '../../gui/guititle.js';
import clock from '../../../../../../shared/chess/logic/clock.js';
import selection from '../../chess/selection.js';
import onlinegame from './onlinegame.js';
import guiclock from '../../gui/guiclock.js';
import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter.js';
import validatorama from '../../../util/validatorama.js';
import uuid from '../../../../../../shared/util/uuid.js';
import metadata from '../../../../../../shared/chess/util/metadata.js';
import { players, Player } from '../../../../../../shared/chess/util/typeutil.js';
import guigameinfo from '../../gui/guigameinfo.js';

// Type Definitions --------------------------------------------------------------------------------------

/**
 * Static information about an online game that is unchanging.
 * Only need this once, when we originally load the game,
 * not on subsequent updates/resyncs.
 */
type ServerGameInfo = {
	/** The id of the online game */
	id: number;
	rated: boolean;
	publicity: 'public' | 'private';
	playerRatings: PlayerGroup<Rating>;
};

/**
 * The message contents expected when we receive a server websocket 'joingame' message.
 * This contains everything a {@link GameUpdateMessage} message would have, and more!!
 *
 * The stuff included here does not need to be specified when we're resyncing to
 * a game, or receiving a game update, as we already know this stuff.
 */
interface JoinGameMessage extends GameUpdateMessage {
	gameInfo: ServerGameInfo;
	/** The metadata of the game, including the TimeControl, player names, date, etc.. */
	metadata: MetaData;
	youAreColor: Player;
}

// Routers --------------------------------------------------------------------------------------

/**
 * Routes a server websocket message with subscription marked `game`.
 * This handles all messages related to the active game we're in.
 * @param data - The incoming server websocket message
 */
function routeMessage(data: WebsocketMessage): void {
	// { sub, action, value, id }
	// console.log(`Received ${data.action} from server! Message contents:`)
	// console.log(data.value)

	// These actions are listened to, even when we're not in a game.

	if (data.action === 'joingame') return handleJoinGame(data.value);
	else if (data.action === 'logged-game-info') return handleLoggedGameInfo(data.value);

	// All other actions should be ignored if we're not in a game...

	if (!onlinegame.areInOnlineGame()) {
		console.log(
			`Received server 'game' message when we're not in an online game. Ignoring. Message: ${JSON.stringify(data)}`,
		);
		return;
	}

	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh();

	switch (data.action) {
		case 'move':
			movesendreceive.handleOpponentsMove(gamefile, mesh, data.value);
			break;
		case 'clock':
			handleUpdatedClock(gamefile.basegame, data.value);
			break;
		case 'gameupdate':
			resyncer.handleServerGameUpdate(gamefile, mesh, data.value);
			break;
		case 'gameratingchange':
			guigameinfo.addRatingChangeToExistingUsernameContainers(data.value);
			break;
		case 'unsub':
			handleUnsubbing();
			break;
		case 'login':
			handleLogin(gamefile.basegame);
			break;
		case 'nogame': // Game doesn't exist - SHOULD NEVER HAPPEN
			handleNoGame(gamefile.basegame);
			break;
		case 'leavegame':
			handleLeaveGame();
			break;
		case 'opponentafk':
			afk.startOpponentAFKCountdown(data.value.millisUntilAutoAFKResign);
			break;
		case 'opponentafkreturn':
			afk.stopOpponentAFKCountdown();
			break;
		case 'opponentdisconnect':
			disconnect.startOpponentDisconnectCountdown(data.value);
			break;
		case 'opponentdisconnectreturn':
			disconnect.stopOpponentDisconnectCountdown();
			break;
		case 'serverrestart':
			serverrestart.initServerRestart(data.value);
			break;
		case 'drawoffer':
			drawoffers.onOpponentExtendedOffer();
			break;
		case 'declinedraw':
			drawoffers.onOpponentDeclinedOffer();
			break;
		default:
			toast.show(`Unknown action "${data.action}" received from server in 'game' route.`, {
				error: true,
			});
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
function handleJoinGame(message: JoinGameMessage): void {
	// We were auto-unsubbed from the invites list, BUT we want to keep open the socket!!
	websocket.deleteSub('invites');
	websocket.addSub('game');
	guititle.close();
	guiplay.close();
	// If the clock values are present, adjust them for ping.
	if (message.clockValues)
		message.clockValues = onlinegame.adjustClockValuesForPing(message.clockValues);
	gameloader.startOnlineGame(message);
}

/**
 * Called when the server sends us the game info of an ENDED game inside the database.
 * This loads it, even if we didn't participate in the game, and immediately concludes it.
 * @param message - The message from the server containing the game info.
 */
function handleLoggedGameInfo(message: {
	game_id: number;
	rated: 0 | 1;
	private: 0 | 1;
	termination: string;
	icn: string;
}): void {
	let parsedGame: LongFormatOut;
	try {
		parsedGame = icnconverter.ShortToLong_Format(message.icn);
	} catch (e) {
		// Hmm, this isn't good. Why is a server-sent ICN crashing?
		console.error(e);
		toast.show(
			'There was an error processing the game ICN sent from the server. This is a bug, please report!',
			{ error: true },
		);
		return;
	}

	// Unload the currently loaded game, if we are in one
	if (gameloader.areInAGame()) {
		gameloader.unloadGame();
		websocket.deleteSub('game'); // The server will have already unsubscribed us from the previous game.
	} // Else perhaps we need to close the title screen?? Or the loading screen??

	// Are we one of the players (automatically no, if there's only guests)
	const ourUserId: number | undefined = validatorama.getOurUserId();
	const whiteId: number | undefined = parsedGame.metadata.WhiteID
		? uuid.base62ToBase10(parsedGame.metadata.WhiteID)
		: undefined;
	const blackId: number | undefined = parsedGame.metadata.BlackID
		? uuid.base62ToBase10(parsedGame.metadata.BlackID)
		: undefined;
	// prettier-ignore
	const ourRole: Player | undefined = ourUserId !== undefined ? (ourUserId === whiteId ? players.WHITE : ourUserId === blackId ? players.BLACK : undefined) : undefined;

	// The clock values are already ingrained into the moves!
	// prettier-ignore
	const moves: ServerGameMoveMessage[] = parsedGame.moves ? parsedGame.moves.map(m => {
		const move: { compact: string, clockStamp?: number } = { compact: m.compact };
				if (m.clockStamp !== undefined) move.clockStamp = m.clockStamp;
				return move;
	}) : [];

	// Display elo ratings, if any.
	const playerRatings: PlayerGroup<Rating> = {};
	if (parsedGame.metadata.WhiteElo)
		playerRatings[players.WHITE] = metadata.getRatingFromWhiteBlackElo(
			parsedGame.metadata.WhiteElo,
		);
	if (parsedGame.metadata.BlackElo)
		playerRatings[players.BLACK] = metadata.getRatingFromWhiteBlackElo(
			parsedGame.metadata.BlackElo,
		);

	// Load the game.
	gameloader.startOnlineGame({
		gameInfo: {
			id: message.game_id,
			rated: Boolean(message.rated),
			publicity: message.private ? ('private' as const) : ('public' as const),
			playerRatings,
		},
		metadata: parsedGame.metadata,
		gameConclusion: metadata.getGameConclusionFromResultAndTermination(
			parsedGame.metadata.Result!,
			message.termination,
		),
		moves,
		youAreColor: ourRole,
	});
}

/**
 * Called when we received the updated clock values from the server after submitting our move.
 */
function handleUpdatedClock(basegame: Game, clockValues: ClockValues): void {
	if (basegame.untimed) throw Error('Received clock values for untimed game??');

	// Adjust the timer whos turn it is depending on ping.
	clockValues = onlinegame.adjustClockValuesForPing(clockValues);
	clock.edit(basegame.clocks, clockValues); // Edit the clocks
	guiclock.edit(basegame);
}

/**
 * Called after the server deletes the game after it has ended.
 * It basically tells us the server will no longer be sending updates related to the game,
 * so we should just unsub.
 *
 * Called when the server informs us they have unsubbed us from receiving updates from the game.
 * At this point we should leave the game.
 */
function handleUnsubbing(): void {
	websocket.deleteSub('game');
}

/**
 * The server has unsubscribed us from receiving updates from the game
 * and from submitting actions as ourselves,
 * due to the reason we are no longer logged in.
 */
function handleLogin(basegame: Game): void {
	toast.show(translations['onlinegame'].not_logged_in, { error: true, durationMultiplier: 100 });
	websocket.deleteSub('game');
	clock.endGame(basegame);
	guiclock.stopClocks(basegame);
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
function handleNoGame(basegame: Game): void {
	toast.show(translations['onlinegame'].game_no_longer_exists, { durationMultiplier: 1.5 });
	websocket.deleteSub('game');
	basegame.gameConclusion = 'aborted';
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
function handleLeaveGame(): void {
	toast.show(translations['onlinegame'].another_window_connected);
	websocket.deleteSub('game');
	gameloader.unloadGame();
	guititle.open();
}

export default {
	routeMessage,
};

export type { ServerGameInfo };
