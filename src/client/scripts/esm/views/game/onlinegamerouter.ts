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

import type { Mesh } from '../../board/rendering/piecemodels.js';
import type { Player } from '../../../../../shared/chess/util/typeutil.js';
import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { ClockValues } from '../../../../../shared/chess/util/clockutil.js';
import type {
	GameConclusionMessage,
	ClientboundGameMessage,
	GameNavigation,
	GameStateMessage,
} from '../../../../../shared/transport/clientbound.js';

import gameurl from '../../../../../shared/chess/util/gameurl.js';
import typeutil from '../../../../../shared/chess/util/typeutil.js';

import docutil from '../../util/docutil.js';
import guichat from './gui/guichat.js';
import resyncer from './resyncer.js';
import gameslot from '../../game/chess/gameslot.js';
import gamesound from '../../board/gamesound.js';
import drawoffers from './drawoffers.js';
import onlinegame from './onlinegame.js';
import flashtoast from '../../components/flashtoast.js';
import socketsubs from '../../socket/socketsubs.js';
import pingmanager from './pingmanager.js';
import gameactions from './gui/guigameactions.js';
import gamesession from '../../game/chess/gamesession.js';
import guigamemeta from '../../game/gui/guigamemeta.js';
import { GameBus } from '../../board/GameBus.js';
import { SocketBus } from '../../socket/SocketBus.js';
import socketintents from '../../socket/socketintents.js';
import guidisconnect from './gui/guidisconnect.js';
import guispectators from './gui/guispectators.js';
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
 * Entry point for every `game`-route message: stamps everything that must be
 * measured at RECEIPT, then buffers it during load, bootstraps the game on
 * the first `gamestate`, or hands it off to be routed.
 * @param contents - The contents of the incoming server websocket message
 */
function receiveMessage(contents: ClientboundGameMessage): void {
	if (contents.action === 'notlive') {
		// The game isn't live in server memory (concluded + evicted, or never existed). Reload
		// whatever our load state — no gamestate is coming, so the queue would never flush.
		// Fresh SSR then serves the correct page: the dead review page, or the 404 page.
		window.location.reload();
		return;
	}

	// Adjust the received clock values for ping up front, so the ticking clock's loss
	// deadline is stamped at receipt time — accurate even if the message's handling is deferred.
	const clockValues = getClockValues(contents);
	if (clockValues) adjustClockValuesForPing(clockValues);
	// Same hazard, same fix: a chat entry queued through the board
	// load would be stamped at flush, reading as newer than it is.
	stampChatHistory(contents);

	// The gamefile's logical part must be loaded before we can act on any remaining message.
	if (gameslot.getGamefile() === undefined) {
		if (gamesession.isLoading()) {
			// A (logical) load is currently underway: buffer the message and replay it the
			// instant logical loading finishes, so no delta is lost or applied too early.
			messageQueue.push(contents);
		} else if (contents.action === 'gamestate' && contents.value.kind === 'full') {
			onlinegame.setInSync(true); // We're in sync whenever we receive a gamestate message.
			// Nothing loaded/loading yet: the first full `gamestate` bootstraps the game.
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
			handleGameState(gamefile, mesh, contents.value);
			break;
		case 'move':
			movesendreceive.handleMove(gamefile, mesh, contents.value);
			break;
		case 'clock':
			movesendreceive.applyClockValues(gamefile, contents.value);
			break;
		case 'spectatorcount':
			guispectators.updateSpectatorCount(contents.value);
			break;
		case 'gameconclusion':
			handleGameConclusion(gamefile, contents.value);
			break;
		case 'gameratingchange':
			guigamemeta.showRatingChanges(contents.value);
			break;
		case 'detached':
			handleDetached();
			break;
		case 'supersededbytab':
			handleSupersededByTab();
			break;
		case 'opponentdisconnect':
			guidisconnect.onOpponentDisconnect(contents.value);
			break;
		case 'opponentreconnect':
			guidisconnect.onOpponentReturn();
			break;
		case 'drawoffer':
			drawoffers.onOpponentExtendedOffer();
			break;
		case 'chatentry':
			guichat.append(contents.value);
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
		case 'rematchstarted':
			handleRematchStarted(contents.value);
			break;
		default:
			console.error("Unknown action received from server in 'game' route.", contents satisfies never); // prettier-ignore
	}
}

/** Replays the messages buffered during loading, in arrival order. */
function flushQueue(): void {
	messageQueue.forEach((m) => routeMessage(m));
	messageQueue.length = 0;
}

// Receipt Stamping ------------------------------------------------------------

/** Returns the clock values embedded in a game message, if it carries any. */
function getClockValues(contents: ClientboundGameMessage): ClockValues | undefined {
	switch (contents.action) {
		case 'gamestate':
			// A lean reply carries no board or clocks.
			return contents.value.kind === 'full' ? contents.value.clockValues : undefined;
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
	const ticking = clockValues.ticking;
	if (!ticking) return; // No clock is ticking (< 2 moves, or game is over), don't adjust for ping

	// console.log(`Adjusting clock values for ping. Ping is ${pingmanager.getPing()}.`);

	// Ping is round-trip time (RTT), So divided by two to get the approximate
	// time that has elapsed since the server sent us the correct clock values
	const halfPing = pingmanager.getHalfPing();
	if (halfPing > 2500)
		console.error('Ping is above 5000 milliseconds!!! This is a lot to adjust the clock values!'); // prettier-ignore
	// console.log(`Ping is ${halfPing * 2}. Subtracted ${halfPing} millis from ${ticking.color}'s clock.`);

	const remaining = clockValues.clocks[ticking.color];
	if (remaining === undefined)
		throw Error(`Invalid color "${ticking.color}" to modify clock value to account for ping.`); // prettier-ignore

	const adjusted = Math.max(0, remaining - halfPing);
	clockValues.clocks[ticking.color] = adjusted;
	// Flag what time the player who's clock is ticking will lose on time.
	// Do this because while while the gamefile is being constructed, the time left may become innacurate.
	ticking.losesAt = Date.now() + adjusted;
}

/** Keeps the chat's send history up to date, at receipt. See {@link receiveMessage}. */
function stampChatHistory(contents: ClientboundGameMessage): void {
	// A delta carries no age — it was recorded the moment it was sent.
	if (contents.action === 'chatentry')
		guichat.recordEntry(contents.value, guichat.receiptInstant()); // prettier-ignore
	else if (contents.action === 'gamestate' && contents.value.participantState?.chat)
		guichat.rebuildHistory(contents.value.participantState.chat);
}

// Message Handlers ------------------------------------------------------------

/**
 * Applies a `gamestate`: a full one reconciles the whole board, a lean one only the overlay,
 * its board being finalized. Either way we are back in sync, so held intents are released.
 */
function handleGameState(
	gamefile: GameFile,
	mesh: Mesh | undefined,
	state: GameStateMessage,
): void {
	// BEFORE the resync: resyncer submits moves as it reconciles, which movesendreceive gates on areInSync().
	onlinegame.setInSync(true);

	if (state.kind === 'full') {
		if (!resyncer.handleGameState(gamefile, mesh, state)) {
			onlinegame.setInSync(false); // It refused the server's state, so we hold none of it.
			return;
		}
	} else {
		// A finalized game's board can no longer change, so there is nothing to reconcile.
		onlinegame.setLeanParticipantState(state.participantState);
		guispectators.updateSpectatorCount(state.spectators);
	}

	// AFTER the resync, not alongside setInSync() above: the intents held through the
	// outage check the reconciled board to decide whether they still make sense.
	socketintents.onRouteSynced('game');
}

/**
 * Concludes the game from a non-move-triggered conclusion. Its recipients can't desync,
 * so it carries no board — only the conclusion, the frozen clocks, and a participant's
 * rematch overlay. Move-triggered ones ride `move`.
 */
function handleGameConclusion(gamefile: GameFile, message: GameConclusionMessage): void {
	gamefile.gameConclusion = message.gameConclusion; // Must be set before editing the clocks.
	movesendreceive.applyClockValues(gamefile, message.clockValues);
	// Set rematch state now before concluding reveals the button.
	if (message.rematch) gameactions.setRematchState(message.rematch);
	gameslot.concludeGame();
}

/**
 * The server has detached us from the game — it was evicted from memory. No further
 * updates are coming, so we tear down our subscription and clear the rematch state.
 */
function handleDetached(): void {
	guispectators.updateSpectatorCount(0);
	socketsubs.deleteSub('game');
	onlinegame.onDetached(); // Prevents a reconnect from trying to re-subscribe.
	gameactions.onDetached();
	guichat.onDetached();
}

/**
 * You have connected to the same game from another window/device.
 * This tab navigates home and displays a toast.
 */
function handleSupersededByTab(): void {
	flashtoast.queue('Another window connected to the game.');
	window.location.assign('/');
}

/**
 * Called when the server reports both players agreed to a rematch.
 * Play the notify sound and navigate to the new game.
 * Agnostic of whether we are a participant or spectator.
 */
async function handleRematchStarted(rematch: GameNavigation): Promise<void> {
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

// Exports ---------------------------------------------------------------------

export default { receiveMessage };
