// src/client/scripts/esm/game/misc/onlinegame/onlinegame.ts

/**
 * This module keeps trap of the data of the onlinegame we are currently in.
 */

import type { ClockValues, ParticipantState } from '../../../../../../shared/types.js';

import gamefileutility from '../../../../../../shared/chess/util/gamefileutility.js';

import gameslot from '../../chess/gameslot.js';
import socketsubs from '../../../websocket/socketsubs.js';
import drawoffers from './drawoffers.js';
import pingManager from '../../../util/pingManager.js';
import gameactions from '../../gui/guigameactions.js';
import guidisconnect from '../../gui/guidisconnect.js';
import { SocketBus } from '../../../websocket/SocketBus.js';
import socketmessages from '../../../websocket/socketmessages.js';

import './tabnameflash.js'; // Registers the "YOUR MOVE" tab-flash listeners.

// Variables ------------------------------------------------------------------------------------------------------

/** The id of the online game we are in. */
let id: number | undefined;

/**
 * Whether we are in sync with the game on the server.
 * If false, we do not submit our move. (move will be auto-submitted upon resyncing)
 * Set to false whenever we lose connection, or the socket closes.
 * Set to true whenever we join game, or successfully resync.
 *
 * If we aren't subbed to a game, then it's automatically assumed we are out of sync.
 */
let inSync: boolean | undefined;

/**
 * Whether the game's result is finalized (locked in permanently on the server). Once true, nothing
 * but rematch-offer state can change, so a reconnect fetches only that (`resyncrematch`) rather than
 * a full resync. Set from the `finalized` flag on any game snapshot, or the `finalized` message.
 * Concluded non-server-validated games have a short window where the conclusion can be contested.
 */
let finalized: boolean = false;

// Events -------------------------------------------------

SocketBus.addEventListener('closed', () => setInSyncFalse());
SocketBus.addEventListener('reconnected', () => resyncToGame());

// Getters ------------------------------------------------------------

function areInSync(): boolean {
	return inSync!;
}

function setInSyncTrue(): void {
	inSync = true;
}

function setInSyncFalse(): void {
	inSync = false;
}

// Functions --------------------------------------------------

/**
 * Initializes the online game session.
 * @param id - The numeric id of the online game.
 * @param participantState - Only provide if we're a participant of an ongoing game, not a spectator, or when the game is over!
 */
function initOnlineGame(game_id: number, participantState?: ParticipantState): void {
	inSync = true;

	id = game_id;

	// If we are a participator, set the draw offers, disconnect timer, rematch state.
	setParticipantState(participantState);

	/**
	 * Leave-game warning popups on every hyperlink.
	 *
	 * Add an listener for every single hyperlink on the page that will
	 * confirm to us if we actually want to leave if we are in an online game.
	 */
	document.querySelectorAll('a').forEach((link) => {
		link.addEventListener('click', confirmNavigationAwayFromGame);
	});
}

function setParticipantState(participantState?: ParticipantState): void {
	if (!participantState) return;

	drawoffers.set(participantState.drawOffer);

	// If opponent is currently disconnected, display that status
	if (participantState.disconnect)
		guidisconnect.onOpponentDisconnect(participantState.disconnect);
	else guidisconnect.onOpponentReturn();

	// Restore the rematch button's state (present only once the game is over).
	if (participantState.rematch) gameactions.setRematchState(participantState.rematch);
}

/**
 * Confirm that the user DOES actually want to leave the page if they are in an online game.
 *
 * Sometimes they could leave by accident, or even hit the "Logout" button by accident,
 * which just ejects them out of the game
 * @param event
 */
function confirmNavigationAwayFromGame(event: MouseEvent): void {
	// Check if Command (Meta) or Ctrl key is held down
	if (event.metaKey || event.ctrlKey) return; // Allow opening in a new tab without confirmation
	if (gamefileutility.isGameOver(gameslot.getGamefile()!)) return;

	const userConfirmed = confirm('Are you sure you want to leave the game?');
	if (userConfirmed) return; // Follow link like normal. Server then starts a 20-second auto-resign timer for disconnecting on purpose.
	// Cancel the following of the link.
	event.preventDefault();

	/*
	 * KEEP IN MIND that if we leave the pop-up open for 10 seconds,
	 * JavaScript is frozen in that timeframe, which means as
	 * far as the server can tell we're not communicating anymore,
	 * so it automatically closes our websocket connection,
	 * thinking we've disconnected, and starts a 60-second auto-resign timer.
	 *
	 * As soon as we hit cancel, we are communicating again.
	 */
}

/**
 * Requests a game update from the server, since we are out of sync.
 */
function resyncToGame(): void {
	if (id === undefined) return console.error('Cannot resync to game, game id is undefined.');

	socketsubs.addSub('game'); // subs were cleared when the socket closed.
	if (!finalized) {
		// Game either hasn't concluded yet, or the conclusion
		// may still change (non-server-validated game)
		inSync = false;
		socketmessages.send('game', 'resync', id);
	} else {
		// The result is locked in — nothing but rematch offers can change, so we can't desync.
		inSync = true;
		socketmessages.send('game', 'resyncrematch', id);
	}
}

/** Records the game's result as finalized. See {@link finalized}. */
function onFinalized(): void {
	finalized = true;
}

function reportOpponentsMove(reason: string): void {
	// Send the move number of the opponents move so that there's no mixup of which move we claim is illegal.
	const opponentsMoveNumber = gameslot.getGamefile()!.moves.length + 1;

	const message = {
		reason,
		opponentsMoveNumber,
	};

	socketmessages.send('game', 'report', message);
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

// Exports -------------------------------------------------------------------------

export default {
	setInSyncTrue,
	onFinalized,
	initOnlineGame,
	setParticipantState,
	areInSync,
	resyncToGame,
	reportOpponentsMove,
	adjustClockValuesForPing,
};
