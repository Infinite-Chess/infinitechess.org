// src/client/scripts/esm/game/misc/onlinegame/onlinegame.ts

/**
 * This module keeps trap of the data of the onlinegame we are currently in.
 */

import type { Additional } from '../../../../../../shared/chess/logic/gamefile.js';
import type { GameStateMessage, ParticipantState } from '../../../../../../shared/types.js';

import apeiron_card from '../../../../../../shared/chess/engines/apeiron_card.js';
import gamefileutility from '../../../../../../shared/chess/util/gamefileutility.js';
import { engineDictionary } from '../../../../../../shared/chess/engine.js';
import { players as p, Player } from '../../../../../../shared/chess/util/typeutil.js';

import gameslot from '../../chess/gameslot.js';
import socketsubs from '../../../websocket/socketsubs.js';
import drawoffers from './drawoffers.js';
import enginegame from '../enginegame.js';
import toast from '../../../components/toast.js';
import gameactions from '../../gui/guigameactions.js';
import gamesession from '../../chess/gamesession.js';
import guigamemeta from '../../gui/guigamemeta.js';
import guidisconnect from '../../gui/guidisconnect.js';
import { SocketBus } from '../../../websocket/SocketBus.js';
import socketmessages from '../../../websocket/socketmessages.js';

import './tabnameflash.js'; // Registers the "YOUR MOVE" tab-flash listeners.

// Types --------------------------------------------------------------------

/** The various lifecycle stages of the server game. See {@link stage}. */
type GameStage = 'active' | 'finalized' | 'evicted';

// Variables ----------------------------------------------------------------

/**
 * Whetherwe are in sync with the server game, and the game isn't finalized yet (excludes rematch state).
 * If false, we do not submit our moves (instead auto-submitted upon re-subscribing).
 * Set to false whenever we lose connection, or detect a desync.
 * Set to true whenever we receive a fresh full game state.
 */
let inSync: boolean = false;

/**
 * The lifecycle stage of the server game, dictating what a (re)subscribe requests.
 * Advances monotonically active -> finalized -> evicted:
 * - `undefined`: no game loaded yet — the initial subscribe requests the full state to bootstrap.
 * - `'active'`: game is live — a reconnect does a full `subscribe` to resync.
 * - `'finalized'`: conclusion is locked in permanently; nothing but rematch-offer state can change,
 *   so a reconnect fetches only that via `subscriberematch`. Set from the `finalized` flag on a game
 *   snapshot, or the `finalized` message.
 * - `'evicted'`: server deleted the game from memory (sent the `unsub` action, or the game was
 *   fetched dead over HTTP); it is now dead, so a reconnect doesn't re-subscribe at all.
 */
let stage: GameStage | undefined = undefined;

// Events -------------------------------------------------

SocketBus.addEventListener('closed', () => {
	if (stage !== 'evicted') inSync = false;
});
SocketBus.addEventListener('reconnect', () => {
	if (stage !== 'evicted') subscribeToGame();
});

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
 * @param dead - Whether the server has evicted it from memory. True if fetched over HTTP.
 * @param ourRole - The viewer's color, if they're a participant; undefined => spectator (white POV).
 */
function loadGameFromState(state: GameStateMessage, dead: boolean, ourRole?: Player): void {
	gamesession.setSessionGame({ type: 'online', role: ourRole });

	// The static setup (variant/time control/creation time) is SSR'd
	const { variant, timeControl, timeCreated, engineGame } = window.gamePageData;
	const additional: Additional = {
		moves: state.moves,
		gameConclusion: state.gameConclusion,
		clockValues: state.clockValues,
	};
	if (engineGame) {
		additional.worldBorderDist = engineDictionary[engineGame.engine].worldBorder;
		additional.worldBorderCap = apeiron_card.BORDER_CAP;
	}

	gameslot
		.loadGamefile({
			timeControl,
			variant: variant.kind === 'preset' ? variant.code : undefined,
			dateTimestamp: timeCreated,
			// Black views from their side; white and spectators (no role) view white's side.
			viewWhitePerspective: ourRole !== p.BLACK,
			additional,
		})
		.then(async ({ graphical }) => {
			// Logical loaded, return graphical promise
			const initialStage: GameStage = dead ? 'evicted' : state.finalized ? 'finalized' : 'active'; // prettier-ignore
			initOnlineGame(initialStage, state.participantState);

			gamesession.concludeGameIfOver();
			// A finalized rated game carries its deltas in the state.
			if (state.ratingChanges) guigamemeta.showRatingChanges(state.ratingChanges);

			if (engineGame && ourRole !== undefined && !state.gameConclusion) {
				const { engineWorkerUrl, engineUrl } = window.gamePageData;
				if (!engineWorkerUrl || !engineUrl)
					throw new Error('Engine assets are missing from the game page.');
				void enginegame
					.initEngineGame({
						youAreColor: ourRole,
						currentEngine: engineGame.engine,
						engineConfig: {
							engineTimeLimitPerMoveMillis:
								engineDictionary[engineGame.engine].defaultTimeLimitPerMoveMillis,
							strengthLevel: engineGame.strengthLevel,
						},
						workerUrl: engineWorkerUrl,
						engineUrl,
					})
					.catch((error: Error) => {
						console.error('Failed to initialize engine game:', error);
						toast.show('The engine failed to load and resigned the game.', { error: true });
					});
			}

			return graphical;
		})
		.then(() => gamesession.markLoadingDone()) // Graphical loaded
		.catch((err: Error) => gamesession.onCatchLoadingError(err));
}

/**
 * Initializes the online game session.
 * @param initialStage - The game's starting lifecycle {@link stage}.
 * @param participantState - Only provide if we're a participant of an ongoing game,
 *   not a spectator or when the game is memory-evicted.
 */
function initOnlineGame(initialStage: GameStage, participantState?: ParticipantState): void {
	stage = initialStage;

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
	if (stage === 'finalized') {
		// The result is locked in — nothing but rematch offers can change, so we can't desync.
		socketmessages.send('game', 'subscriberematch', id);
	} else {
		// No game loaded yet (initial subscribe), or it's live but
		// not finalized (may still change) — request the full state.
		socketmessages.send('game', 'subscribe', id);
	}
}

/** Records the game's stage as finalized. See {@link stage}. */
function onFinalized(): void {
	if (stage === 'active') stage = 'finalized'; // Never regress a later 'evicted'
}

/**
 * Records that the server has evicted the participants from the game.
 * No further state updates are received, not even rematch state. See {@link stage}.
 */
function onEvicted(): void {
	stage = 'evicted';
}

// Exports -------------------------------------------------------------------------

export default {
	areInSync,
	setInSync,
	loadGameFromState,
	setParticipantState,
	subscribeToGame,
	onFinalized,
	onEvicted,
};
