// src/client/scripts/esm/views/game/onlinegamerouter.ts

/**
 * Routes every incoming `game`-route message to its handler.
 *
 * Nothing can be acted on until the gamefile's logical part is loaded, so messages
 * arriving during a load are buffered and replayed the instant it finishes, and the
 * first `gamestate` is what bootstraps the game when nothing is loaded at all.
 *
 * Counterpart of the server's gameRouter.
 */

import type { Player } from '../../../../../shared/util/typeutil.js';
import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { ClockValues } from '../../../../../shared/chess/util/clockutil.js';
import type {
	GameConclusionMessage,
	ClientboundGameMessage,
	GameNavigation,
} from '../../../../../shared/transport/clientbound.js';

import gameurl from '../../../../../shared/util/gameurl.js';
import typeutil from '../../../../../shared/util/typeutil.js';

import docutil from '../../util/docutil.js';
import resyncer from './resyncer.js';
import gameslot from '../../game/chess/gameslot.js';
import gamesound from '../../board/gamesound.js';
import drawoffers from './drawoffers.js';
import onlinegame from './onlinegame.js';
import flashtoast from '../../util/flashtoast.js';
import socketsubs from '../../socket/socketsubs.js';
import pingmanager from './pingmanager.js';
import gameactions from './gui/guigameactions.js';
import gamesession from '../../game/chess/gamesession.js';
import guigamemeta from '../../game/gui/guigamemeta.js';
import { GameBus } from '../../board/GameBus.js';
import { SocketBus } from '../../socket/SocketBus.js';
import socketintents from '../../socket/socketintents.js';
import guidisconnect from './gui/guidisconnect.js';
import movesendreceive from './movesendreceive.js';

// Types -----------------------------------------------------------------------

/**
 * Every game message that reaches the router. `notlive` is consumed by receiveMessage first.
 * This use of Exclude is approved.
 */
type RoutedGameMessage = Exclude<ClientboundGameMessage, { action: 'notlive' }>;

// State -----------------------------------------------------------------------

/** Messages received while the game's logical part is still loading, replayed once it's ready. */
const messageQueue: RoutedGameMessage[] = [];

// Routing ---------------------------------------------------------------------

// Listen for incoming messages for the 'game' subscription
SocketBus.addEventListener('game', (e) => receiveMessage(e.detail));
// Replay any messages buffered during logical loading.
GameBus.addEventListener('game-loaded', () => flushQueue());

/**
 * Entry point for every `game`-route message: stamps clock timing at receipt, then buffers it
 * during load, bootstraps the game on the first `gamestate`, or hands it off to be routed.
 * @param contents - The contents of the incoming server websocket message
 */
function receiveMessage(contents: ClientboundGameMessage): void {
	// The subscribed game isn't live in server memory (concluded + evicted, or never existed).
	// Reload regardless of our load state; fresh SSR then serves the correct page — the dead
	// review page (which fetches the state over HTTP) or the 404 page.
	if (contents.action === 'notlive') {
		window.location.reload();
		return;
	}

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
			onlinegame.setInSync(true); // We're in sync whenever we receive a gamestate/rematchstate message.
			// Nothing loaded/loading yet: the first `gamestate` bootstraps the game.
			onlinegame.loadGameFromState(contents.value, false);
			socketintents.onRouteSynced('game');
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
function routeMessage(contents: RoutedGameMessage): void {
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh();

	switch (contents.action) {
		case 'gamestate':
			// BEFORE the resync: resyncer submits moves as it reconciles, which movesendreceive gates on areInSync().
			onlinegame.setInSync(true);
			if (!resyncer.handleGameState(gamefile, mesh, contents.value)) {
				onlinegame.setInSync(false); // It refused the server's state, so we hold none of it.
				break;
			}
			// AFTER the resync, not alongside setInSync() above: the intents held through the
			// outage check the reconciled board to decide whether they still make sense.
			socketintents.onRouteSynced('game');
			break;
		case 'move':
			movesendreceive.handleMove(gamefile, mesh, contents.value);
			break;
		case 'clock':
			movesendreceive.applyClockValues(gamefile, contents.value);
			break;
		case 'gameconclusion':
			handleGameConclusion(gamefile, contents.value);
			break;
		case 'gameratingchange':
			guigamemeta.showRatingChanges(contents.value);
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
			onlinegame.setInSync(true); // We're in sync whenever we receive a gamestate/rematchstate message.
			gameactions.setRematchState(contents.value);
			socketintents.onRouteSynced('game');
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
			console.error("Unknown action received from server in 'game' route.", contents satisfies never); // prettier-ignore
	}
}

/** Returns the clock values embedded in a game message, if it carries any. */
function getClockValues(contents: ClientboundGameMessage): ClockValues | undefined {
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

	// console.log(`Adjusting clock values for ping. Ping is ${pingmanager.getPing()}.`);

	// Ping is round-trip time (RTT), So divided by two to get the approximate
	// time that has elapsed since the server sent us the correct clock values
	const halfPing = pingmanager.getHalfPing();
	if (halfPing > 2500)
		console.error('Ping is above 5000 milliseconds!!! This is a lot to adjust the clock values!'); // prettier-ignore
	// console.log(`Ping is ${halfPing * 2}. Subtracted ${halfPing} millis from ${clockValues.colorTicking}'s clock.`);

	if (clockValues.clocks[clockValues.colorTicking] === undefined)
		throw Error(`Invalid color "${clockValues.colorTicking}" to modify clock value to account for ping.`); // prettier-ignore
	clockValues.clocks[clockValues.colorTicking] = Math.max(
		0,
		clockValues.clocks[clockValues.colorTicking]! - halfPing,
	);

	// Flag what time the player who's clock is ticking will lose on time.
	// Do this because while while the gamefile is being constructed, the time left may become innacurate.
	clockValues.timeColorTickingLosesAt =
		Date.now() + clockValues.clocks[clockValues.colorTicking]!;

	return;
}

/** Replays the messages buffered during loading, in arrival order. */
function flushQueue(): void {
	messageQueue.forEach((m) => routeMessage(m));
	messageQueue.length = 0;
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
	onlinegame.onEvicted(); // Prevents a reconnect from trying to re-subscribe to the now-deleted game.
	gameactions.onUnsub();
}

/**
 * You have connected to the same game from another window/device.
 * This tab navigates home and displays a toast.
 */
function handleLeaveGame(): void {
	flashtoast.queue('Another window connected to the game.');
	window.location.assign('/');
}

/**
 * Called when the server reports both players agreed to a rematch.
 * Play the notify sound and navigate to the new game.
 * Agnostic of whether we are a participant or spectator.
 */
async function handleInGame(rematch: GameNavigation): Promise<void> {
	await gamesound.playNotifyToCompletion();
	const viewColor = resolveRematchViewColor(rematch.role);
	window.location.assign(gameurl.getGameUrl(rematch.id, viewColor));
}

/**
 * The side to view a rematch from: the color we play it as, or — for spectators — the inverse
 * of the side this game's URL pinned, so they keep watching the same player once colors swap.
 * Spectators who never pinned a side stay unpinned.
 * @param role - Our color in the rematch, absent if we're spectating.
 */
function resolveRematchViewColor(role: Player | undefined): Player | undefined {
	if (role !== undefined) return role;
	const pinned = gameurl.parseViewColorCode(docutil.getLastSegmentOfURL());
	return pinned !== undefined ? typeutil.invertPlayer(pinned) : undefined;
}

export default {
	receiveMessage,
};
