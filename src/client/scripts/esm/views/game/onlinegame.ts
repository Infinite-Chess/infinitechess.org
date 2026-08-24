// src/client/scripts/esm/views/game/onlinegame.ts

/**
 * This module keeps trap of the data of the onlinegame we are currently in.
 */

import type { Additional, DatedVariant } from '../../../../../shared/chess/logic/gamefile.js';
import type { LongFormatOut, PresetAnnotes } from '../../../../../shared/chess/logic/icn/icnconverter.js'; // prettier-ignore
import type { GameStateMessage, ParticipantState } from '../../../../../shared/clientbound.js';

import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';
import gameformulator from '../../../../../shared/chess/game/gameformulator.js';
import { players as p } from '../../../../../shared/util/typeutil.js';
import { engineDictionary } from '../../../../../shared/chess/engines/engine.js';

import gameslot from '../../game/chess/gameslot.js';
import drawoffers from './drawoffers.js';
import socketsubs from '../../socket/socketsubs.js';
import socketsend from '../../socket/socketsend.js';
import enginegame from '../../game/misc/enginegame.js';
import gameactions from './gui/guigameactions.js';
import gamesession from '../../game/chess/gamesession.js';
import guigamemeta from '../../game/gui/guigamemeta.js';
import { SocketBus } from '../../socket/SocketBus.js';
import guidisconnect from './gui/guidisconnect.js';

import './tabnameflash.js'; // Registers the "YOUR MOVE" tab-flash listeners.

// Types --------------------------------------------------------------------

/** The various lifecycle stages of the server game. See {@link stage}. */
type GameStage = 'active' | 'finalized' | 'evicted';

// Variables ----------------------------------------------------------------

/**
 * Whether we are in sync with the server game, and the game isn't finalized yet (excludes rematch state).
 * If false, we do not submit our moves (instead auto-submitted upon re-subscribing).
 * Set to false whenever we lose connection, or detect a desync.
 * Set to true whenever we receive a fresh full game state, or the game is evicted —
 * there's then nothing left to be out of sync with.
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
	return inSync;
}

function setInSync(value: boolean): void {
	inSync = value;
	// Being back in sync is what ends a disconnection from our perspective.
	if (value) guidisconnect.onSelfReturn();
}

// Functions --------------------------------------------------

/**
 * A fresh page load (not a reconnect, game live OR dead): Loads a game onto the
 * board from a fresh `gamestate` message and sets up the online-game session.
 * @param dead - Whether the server has evicted it from memory. True if fetched over HTTP.
 * @param longformat - The game's parsed ICN. Required of the dead path, where a custom game's
 *   start position lives ONLY here; the live path SSRs that position instead, and passes nothing.
 */
function loadGameFromState(
	state: GameStateMessage,
	dead: boolean,
	longformat?: LongFormatOut,
): void {
	/** The viewer's color, if they're a participant; undefined => spectator (white POV). */
	const ourRole = gamesession.getRole();

	// The static setup (variant/time control/creation time) is SSR'd
	const { variant, timeControl, timeCreated, modifiers, engineGame, viewColor } =
		window.gamePageData;
	const slideLimit = modifiers?.find((m) => m.kind === 'slide-limit')?.value;
	const additional: Additional = {
		moves: state.moves,
		gameConclusion: state.gameConclusion,
		clockValues: state.clockValues,
		...(slideLimit !== undefined && { slideLimit: BigInt(slideLimit) }),
	};

	// A custom game has no variant code to build its position from — its ICN is the source of
	// truth for the position, the gamerules, and which variant revision it's a position of.
	// (Only the position-defining half of it: time control, moves, clocks and conclusion are the
	// typed state's to declare, and the ICN's player/result tags are eyeball-only.)
	let datedVariant: DatedVariant | undefined;
	let presetAnnotes: PresetAnnotes | undefined;
	if (variant.kind === 'preset') {
		datedVariant = { code: variant.code, dateTimestamp: timeCreated };
		// A preset's rules are rebuilt from its module, which knows nothing of the opponent — so
		// the border an engine game is played inside is resolved separately. A finished game's ICN
		// records the board it was actually played on, so it wins over deriving one now.
		additional.worldBorder = longformat?.gameRules.worldBorder;
		additional.engineGame = engineGame !== undefined;
	} else {
		let startFormat = longformat;
		if (startFormat === undefined) {
			if (variant.position === undefined)
				throw new Error('Custom game page carries no start position.');
			startFormat = icnconverter.ShortToLong_Format(variant.position);
		}
		// The sync half suffices: a custom game's ICN always carries an explicit position,
		// so the variant-module fallback the async resolver adds has nothing left to resolve.
		const resolved = gameformulator.constructionOptionsFromLongFormat(startFormat);
		datedVariant = resolved.variant;
		presetAnnotes = resolved.presetAnnotes;
		additional.variantOptions = resolved.additional?.variantOptions;
	}

	gamesession.loadGame(
		{
			timeControl,
			variant: datedVariant,
			// The game's own start time — NOT the variant revision, which a custom
			// position lifted from an older game pins to its own, earlier date.
			dateTimestamp: timeCreated,
			presetAnnotes,
			// Resolved server-side: the URL's color segment, else the side we played on.
			viewWhitePerspective: viewColor === p.WHITE,
			additional,
		},
		{
			onLogicalLoaded: () => {
				const initialStage: GameStage = dead ? 'evicted' : state.finalized ? 'finalized' : 'active'; // prettier-ignore
				initOnlineGame(initialStage, state.participantState);

				// A finalized rated game carries its deltas in the state.
				if (state.ratingChanges) guigamemeta.showRatingChanges(state.ratingChanges);

				if (engineGame && ourRole !== undefined && !state.gameConclusion) {
					const { workerUrl, engineUrl } = engineGame;
					if (!workerUrl || !engineUrl)
						throw new Error('Engine assets are missing from the game page.');
					// The server only ever creates online engine games against apeiron
					// (createenginegame.ts) — no other engine's config can be built from page data.
					if (engineGame.engine !== 'apeiron')
						throw new Error(`Unsupported online engine "${engineGame.engine}".`);
					enginegame.initEngineGame({
						youAreColor: ourRole,
						engine: {
							name: engineGame.engine,
							config: {
								engineTimeLimitPerMoveMillis:
									engineDictionary[engineGame.engine]
										.defaultTimeLimitPerMoveMillis,
								strengthLevel: engineGame.strengthLevel,
							},
						},
						workerUrl,
						engineUrl,
					});
				}
			},
			concludeIfOver: true,
			// The gamestate arrived but never became a game — we don't hold it after all.
			onLoadError: () => (inSync = false),
		},
	);
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
	if (!gameslot.isGameLive()) return;
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
	if (stage === 'finalized' && gameslot.getGamefile()) {
		// The result is locked in — nothing but rematch offers can change, so we can't desync.
		void socketsend.send('game', 'subscriberematch', id);
	} else {
		// No game loaded yet (initial subscribe), a load that failed and left us with none,
		// or it's live but not finalized (may still change) — request the full state.
		void socketsend.send('game', 'subscribe', id);
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
	// An evicted game receives nothing further, so it can never be out of sync. Without this,
	// an eviction landing while we're disconnected (the reconnect's `subscribe` answered with
	// `unsub`) would leave us marked out of sync permanently.
	setInSync(true);
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
