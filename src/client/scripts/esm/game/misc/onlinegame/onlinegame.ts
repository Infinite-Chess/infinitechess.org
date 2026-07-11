// src/client/scripts/esm/game/misc/onlinegame/onlinegame.ts

/**
 * This module keeps trap of the data of the onlinegame we are currently in.
 */

import type { GameStateMessage, ParticipantState } from '../../../../../../shared/types.js';

import gamefileutility from '../../../../../../shared/chess/util/gamefileutility.js';
import { players as p, Player } from '../../../../../../shared/chess/util/typeutil.js';

import gameslot from '../../chess/gameslot.js';
import socketsubs from '../../../websocket/socketsubs.js';
import drawoffers from './drawoffers.js';
import gameactions from '../../gui/guigameactions.js';
import gamesession from '../../chess/gamesession.js';
import guigamemeta from '../../gui/guigamemeta.js';
import guidisconnect from '../../gui/guidisconnect.js';
import { SocketBus } from '../../../websocket/SocketBus.js';
import socketmessages from '../../../websocket/socketmessages.js';

import './tabnameflash.js'; // Registers the "YOUR MOVE" tab-flash listeners.

// Variables ------------------------------------------------------------------------------------------------------

/**
 * Whetherwe are in sync with the server game, and the game isn't finalized yet (excludes rematch state).
 * If false, we do not submit our moves (instead auto-submitted upon re-subscribing).
 * Set to false whenever we lose connection, or detect a desync.
 * Set to true whenever we receive a fresh full game state.
 */
let inSync: boolean = false;

/**
 * Whether the game's result is finalized (locked in permanently on the server). Once true, nothing
 * but rematch-offer state can change, so a reconnect fetches only that (`subscriberematch`) rather than
 * re-subscribing. Set from the `finalized` flag on any game snapshot, or the `finalized` message.
 * Concluded non-server-validated games have a short window where the conclusion can be contested.
 */
let finalized: boolean = false;

// Events -------------------------------------------------

SocketBus.addEventListener('closed', () => {
	if (!finalized) inSync = false;
});
SocketBus.addEventListener('reconnected', () => subscribeToGame());

// Getters ------------------------------------------------------------

function areInSync(): boolean {
	return inSync!;
}

function setInSync(value: boolean): void {
	inSync = value;
}

// Functions --------------------------------------------------

/**
 * A fresh page load (not a reconnect, game live OR dead): Loads a game onto the
 * board from a fresh `gamestate` message and sets up the online-game session.
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
			// Black views from their side; white and spectators (no role) view white's side.
			viewWhitePerspective: ourRole !== p.BLACK,
			additional: {
				moves: state.moves,
				gameConclusion: state.gameConclusion,
				clockValues: state.clockValues,
			},
		})
		.then(({ graphical }) => {
			// Logical loaded, return graphical promise
			initOnlineGame(state.finalized, state.participantState);

			gamesession.concludeGameIfOver();
			// A finalized rated game carries its deltas in the state.
			if (state.ratingChanges) guigamemeta.showRatingChanges(state.ratingChanges);

			return graphical;
		})
		.then(() => gamesession.markLoadingDone()) // Graphical loaded
		.catch((err: Error) => gamesession.onCatchLoadingError(err));
}

/**
 * Initializes the online game session.
 * @param isFinalized - Whether the game's result is already finalized (locked in, db logged) on the server.
 * @param participantState - Only provide if we're a participant of an ongoing game,
 *   not a spectator or when the game is memory-evicted.
 */
function initOnlineGame(isFinalized: boolean, participantState?: ParticipantState): void {
	inSync = true;
	finalized = isFinalized;

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
	if (gamesession.getRole() === undefined) return; // Spectator

	const userConfirmed = confirm('Are you sure you want to leave the game?');
	if (userConfirmed) return; // Follow link like normal. Server then starts a 10-second disconnect claim timer for disconnecting on purpose.
	// Cancel the following of the link.
	event.preventDefault();

	/*
	 * KEEP IN MIND that if we leave the pop-up open for 10 seconds,
	 * JavaScript is frozen in that timeframe, which means as
	 * far as the server can tell we're not communicating anymore,
	 * so it automatically closes our websocket connection,
	 * thinking we've disconnected, and starts a 60-second disconnect claim timer.
	 *
	 * As soon as we hit cancel, we are communicating again.
	 */
}

/**
 * Requests to subscribe to the server game, and expects to receive a full game state.
 * A finalized game (`subscriberematch`) instead expects to receive only rematch-offer state.
 */
function subscribeToGame(): void {
	const id = window.gamePageData.id;

	socketsubs.addSub('game'); // subs were cleared when the socket closed.
	if (!finalized) {
		// Game either hasn't concluded yet, or the conclusion may still change (non-server-validated game)
		socketmessages.send('game', 'subscribe', id);
	} else {
		// The result is locked in — nothing but rematch offers can change, so we can't desync.
		socketmessages.send('game', 'subscriberematch', id);
	}
}

/** Records the game's result as finalized. See {@link finalized}. */
function onFinalized(): void {
	finalized = true;
}

// Exports -------------------------------------------------------------------------

export default {
	areInSync,
	setInSync,
	loadGameFromState,
	initOnlineGame,
	setParticipantState,
	subscribeToGame,
	onFinalized,
};
