// src/client/scripts/esm/game/misc/onlinegame/onlinegamerouter.ts

import type { GameFile } from '../../../../../../shared/chess/logic/gamefile.js';
import type { GameMessage } from '../../../websocket/socketschemas.js';
import type {
	ClockValues,
	GameConclusionMessage,
	GameStateMessage,
} from '../../../../../../shared/types.js';

import uuid from '../../../../../../shared/util/uuid.js';
import clock from '../../../../../../shared/chess/logic/clock.js';
import moveutil from '../../../../../../shared/chess/util/moveutil.js';
import { players as p, type Player } from '../../../../../../shared/chess/util/typeutil.js';

import toast from '../../../components/toast.js';
import resyncer from './resyncer.js';
import gameslot from '../../chess/gameslot.js';
import guiclock from '../../gui/guiclock.js';
import selection from '../../chess/selection.js';
import gamesound from '../gamesound.js';
import drawoffers from './drawoffers.js';
import onlinegame from './onlinegame.js';
import socketsubs from '../../../websocket/socketsubs.js';
import flashToast from '../../../util/flashToast.js';
import gameactions from '../../gui/guigameactions.js';
import gamesession from '../../chess/gamesession.js';
import guidisconnect from '../../gui/guidisconnect.js';
import { SocketBus } from '../../../websocket/SocketBus.js';
import movesendreceive from './movesendreceive.js';

// Routers --------------------------------------------------------------------------------------

// Listen for incoming messages for the 'game' subscription
SocketBus.addEventListener('game', (e) => routeMessage(e.detail));

/**
 * Routes a server websocket message with subscription marked `game`.
 * This handles all messages related to the active game we're in.
 * @param contents - The contents of the incoming server websocket message
 */
function routeMessage(contents: GameMessage): void {
	// console.log(`Received ${contents.action} from server! Message contents:`)
	// console.log(contents.value)
	if (contents.action === 'gamestate')
		return loadGameFromState(
			contents.value,
			window.gamePageData.role,
			contents.value.participantState,
		);

	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh();

	// TODO: If the gamefile isn't defined yet (LOGICAL isn't finished loading),
	// queue the message to be processed after the gamefile is loaded.
	// HOWEVER, any message with clock values need to be adjusted for ping immediately.

	switch (contents.action) {
		case 'move':
			movesendreceive.handleMove(gamefile, mesh, contents.value);
			break;
		case 'clock':
			handleUpdatedClock(gamefile, contents.value);
			break;
		case 'gameconclusion':
			handleGameConclusion(gamefile, contents.value);
			break;
		case 'gameratingchange':
			// TODO: surface rating changes in the new game page's side bar.
			console.error(
				`Received 'gameratingchange' message from server, but this is not yet implemented in the new game page. Message: ${JSON.stringify(contents)}`,
			);
			break;
		case 'unsub':
			handleUnsubbing();
			break;
		case 'login':
			handleLogin(gamefile);
			break;
		case 'nogame':
			handleNoGame(gamefile);
			break;
		case 'leavegame':
			handleLeaveGame();
			break;
		case 'opponentdisconnect':
			guidisconnect.onOpponentDisconnect(contents.value);
			break;
		case 'opponentdisconnectreturn':
			guidisconnect.onOpponentReturn();
			break;
		case 'drawoffer':
			drawoffers.onOpponentExtendedOffer();
			break;
		case 'declinedraw':
			drawoffers.onOpponentDeclinedOffer();
			break;
		case 'rematchstate':
			gameactions.setRematchState(contents.value);
			break;
		case 'rematchoffer':
			gameactions.onOpponentRematchOffer();
			break;
		case 'opponentleft':
			gameactions.onOpponentLeft();
			break;
		case 'opponentreturn':
			gameactions.onOpponentReturn();
			break;
		case 'finalized':
			onlinegame.onFinalized();
			break;
		case 'ingame':
			handleInGame(contents.value);
			break;
		default:
			toast.show(
				// @ts-ignore
				`Unknown action "${contents.action}" received from server in 'game' route.`,
				{ error: true },
			);
			break;
	}
}

/**
 * A fresh page load (not a reconnect): Loads a game onto the board from
 * a fresh `gamestate` message and sets up the online-game session.
 * @param ourRole - The viewer's color, if they're a participant; undefined => spectator (white POV).
 */
function loadGameFromState(state: GameStateMessage, ourRole?: Player): void {
	gamesession.setSessionGame({ type: 'online', role: ourRole });

	// If the clock values are present, adjust the ticking timer for ping.
	if (state.clockValues) onlinegame.adjustClockValuesForPing(state.clockValues);

	// The static setup (variant/time control/creation time) is SSR'd
	const { variant, timeControl, timeCreated } = window.gamePageData;

	gameslot
		.loadGamefile({
			timeControl,
			variant: variant.kind === 'preset' ? variant.code : undefined,
			dateTimestamp: timeCreated,
			// Spectators (no role) view white's side.
			viewWhitePerspective: ourRole === p.WHITE || ourRole === undefined,
			additional: {
				moves: state.moves,
				gameConclusion: state.gameConclusion,
				clockValues: state.clockValues,
			},
		})
		.then(({ graphical }) => {
			// Logical loaded, return graphical promise
			onlinegame.initOnlineGame(
				window.gamePageData.id,
				state.finalized,
				state.participantState,
			);

			gamesession.concludeGameIfOver();

			return graphical;
		})
		.then(() => gamesession.markLoadingDone()) // Graphical loaded
		.catch((err: Error) => gamesession.onCatchLoadingError(err));
}

/**
 * Called when we received the updated clock values from the server after submitting our move.
 */
function handleUpdatedClock(gamefile: GameFile, clockValues: ClockValues): void {
	movesendreceive.applyClockValues(gamefile, clockValues);

	// 'clock' only arrives right after WE move, so the last move is ours, and our now-frozen
	// time (untouched by ping, which only adjusts the opponent's ticking clock) is its stamp.
	// The opponent gets this stamp on their 'move' message; we must derive it since we don't.
	const ourColor = gamesession.getRole()!;
	const ourMove = moveutil.getLastMove(gamefile.moves)!;
	ourMove.clockStamp = clockValues.clocks[ourColor]!;
}

/**
 * Concludes the game from a non-move-triggered conclusion (resignation, timeout, draw
 * agreement, etc.) sent to spectators. They can't desync while subscribed, so the server
 * sends only the conclusion + frozen clocks rather than a full resync.
 * (Move-triggered conclusions reach spectators via the `'move'` message instead.)
 */
function handleGameConclusion(gamefile: GameFile, message: GameConclusionMessage): void {
	gamefile.gameConclusion = message.gameConclusion; // Must be set before editing the clocks.
	movesendreceive.applyClockValues(gamefile, message.clockValues);
	gameslot.concludeGame();
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
	socketsubs.deleteSub('game');
}

/**
 * The server has unsubscribed us from receiving updates from the game
 * and from submitting actions as ourselves,
 * due to the reason we are no longer logged in.
 */
function handleLogin(gamefile: GameFile): void {
	toast.show('You are not logged in. Please login to reconnect to this game.', {
		error: true,
		durationMultiplier: 100,
	});
	socketsubs.deleteSub('game');
	clock.endGame(gamefile);
	guiclock.stopClocks(gamefile);
	selection.unselectPiece();
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
function handleNoGame(gamefile: GameFile): void {
	socketsubs.deleteSub('game');
	gamefile.gameConclusion = { condition: 'aborted' };
	gameslot.concludeGame();
}

/**
 * You have connected to the same game from another window/device.
 * This tab navigates home and displays a toast.
 */
function handleLeaveGame(): void {
	flashToast.queue('Another window connected to the game.');
	window.location.assign('/');
}

/**
 * Called when the server reports both players agreed to a rematch.
 * Play the notify sound and navigate to the new game.
 * TODO: Remove redundancy with this and the lobby.onInGame()'s logic.
 * @param id - The numeric game id (encoded into the base62 URL).
 */
async function handleInGame(id: number): Promise<void> {
	// Plays the notify sound and awaits it so the hard-navigate doesn't cut it off.
	// No reverb added here, it makes us wait too long.
	const sound = await gamesound.playNotify(false);
	if (sound) await sound.whenEnded;
	window.location.assign(`/game/${uuid.base10ToBase62(id)}`);
}

export default {
	routeMessage,
};
