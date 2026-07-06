// src/client/scripts/esm/game/misc/onlinegame/onlinegamerouter.ts

import type { GameFile } from '../../../../../../shared/chess/logic/gamefile.js';
import type { GameMessage } from '../../../websocket/socketschemas.js';
import type {
	ClockValues,
	GameConclusionMessage,
	GameStateMessage,
} from '../../../../../../shared/types.js';

import uuid from '../../../../../../shared/util/uuid.js';
import moveutil from '../../../../../../shared/chess/util/moveutil.js';
import { players as p, type Player } from '../../../../../../shared/chess/util/typeutil.js';

import toast from '../../../components/toast.js';
import resyncer from './resyncer.js';
import gameslot from '../../chess/gameslot.js';
import gamesound from '../gamesound.js';
import drawoffers from './drawoffers.js';
import onlinegame from './onlinegame.js';
import socketsubs from '../../../websocket/socketsubs.js';
import flashToast from '../../../util/flashToast.js';
import gameactions from '../../gui/guigameactions.js';
import gamesession from '../../chess/gamesession.js';
import { GameBus } from '../../GameBus.js';
import pingManager from '../../../util/pingManager.js';
import guidisconnect from '../../gui/guidisconnect.js';
import { SocketBus } from '../../../websocket/SocketBus.js';
import guigameactions from '../../gui/guigameactions.js';
import movesendreceive from './movesendreceive.js';

// State ------------------------------------------------------------

/** Messages received while the game's logical part is still loading, replayed once it's ready. */
const messageQueue: GameMessage[] = [];

// Routing ----------------------------------------------------------

// Listen for incoming messages for the 'game' subscription
SocketBus.addEventListener('game', (e) => receiveMessage(e.detail));
// Replay any messages buffered during logical loading.
GameBus.addEventListener('game-loaded', () => flushQueue());

/**
 * Entry point for every `game`-route message: stamps clock timing at receipt, then buffers it
 * during load, bootstraps the game on the first `gamestate`, or hands it off to be routed.
 * @param contents - The contents of the incoming server websocket message
 */
function receiveMessage(contents: GameMessage): void {
	// Adjust the received clock values for ping up front, so the ticking clock's loss
	// deadline is stamped at receipt time — accurate even if the message's handling is deferred.
	const clockValues = getClockValues(contents);
	if (clockValues) adjustClockValuesForPing(clockValues);

	// The gamefile's logical part must be loaded before we can act on any message.
	if (gameslot.getGamefile() === undefined) {
		if (gamesession.isLoading()) {
			// A (logical) load is currently underway: buffer the message and replay it the
			// instant logical loading finishes, so no delta is lost or applied too early.
			messageQueue.push(contents);
		} else if (contents.action === 'gamestate') {
			// Nothing loaded/loading yet: the first `gamestate` bootstraps the game.
			loadGameFromState(contents.value, window.gamePageData.role);
		} else {
			console.error(`Received game message before receiving gamestate: ${JSON.stringify(contents)}`); // prettier-ignore
		}
	} else {
		// gamefile is loaded: route the message to its handler immediately.
		routeMessage(contents);
	}
}

/**
 * Routes a game message to its handler. The gamefile's logical part MUST be loaded.
 * @param contents - The contents of the incoming server websocket message
 */
function routeMessage(contents: GameMessage): void {
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh();

	switch (contents.action) {
		case 'gamestate':
			resyncer.handleGameState(gamefile, mesh, contents.value);
			break;
		case 'nogame':
			// The server reported the game isn't live, nor exists in the DB (aborted at 0 moves played).
			// Only cause: It was live when SSR'd but was memory-evicted before we sent 'subscribe'.
			// Reload to get the correct SSR'd 404 page.
			window.location.reload();
			break;
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

/** Returns the clock values embedded in a game message, if it carries any. */
function getClockValues(contents: GameMessage): ClockValues | undefined {
	switch (contents.action) {
		case 'gamestate':
		case 'move':
		case 'gameconclusion':
			return contents.value.clockValues;
		case 'clock':
			return contents.value;
		default:
			return undefined;
	}
}

/** Modifies the clock values to account for ping. */
function adjustClockValuesForPing(clockValues: ClockValues): void {
	if (!clockValues.colorTicking) return; // No clock is ticking (< 2 moves, or game is over), don't adjust for ping

	// console.log(`Adjusting clock values for ping. Ping is ${pingManager.getPing()}.`);

	// Ping is round-trip time (RTT), So divided by two to get the approximate
	// time that has elapsed since the server sent us the correct clock values
	const halfPing = pingManager.getHalfPing();
	if (halfPing > 2500)
		console.error(
			'Ping is above 5000 milliseconds!!! This is a lot to adjust the clock values!',
		);
	// console.log(`Ping is ${halfPing * 2}. Subtracted ${halfPing} millis from ${clockValues.colorTicking}'s clock.`);

	if (clockValues.clocks[clockValues.colorTicking] === undefined)
		throw Error(
			`Invalid color "${clockValues.colorTicking}" to modify clock value to account for ping.`,
		);
	clockValues.clocks[clockValues.colorTicking]! -= halfPing;

	// Flag what time the player who's clock is ticking will lose on time.
	// Do this because while while the gamefile is being constructed, the time left may become innacurate.
	clockValues.timeColorTickingLosesAt =
		Date.now() + clockValues.clocks[clockValues.colorTicking]!;

	return;
}

/**
 * A fresh page load (not a reconnect): Loads a game onto the board from
 * a fresh `gamestate` message and sets up the online-game session.
 * @param ourRole - The viewer's color, if they're a participant; undefined => spectator (white POV).
 */
function loadGameFromState(state: GameStateMessage, ourRole?: Player): void {
	gamesession.setSessionGame({ type: 'online', role: ourRole });

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
			onlinegame.initOnlineGame(state.finalized, state.participantState);

			gamesession.concludeGameIfOver();

			return graphical;
		})
		.then(() => gamesession.markLoadingDone()) // Graphical loaded
		.catch((err: Error) => gamesession.onCatchLoadingError(err));
}

/** Replays the messages buffered during loading, in arrival order. */
function flushQueue(): void {
	messageQueue.forEach(routeMessage);
	messageQueue.length = 0;
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
	guigameactions.onUnsub();
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
 * Agnostic of whether we are a participant or spectator.
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
	receiveMessage,
};
