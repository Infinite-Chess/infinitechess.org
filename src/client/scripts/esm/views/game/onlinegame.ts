// src/client/scripts/esm/views/game/onlinegame.ts

/**
 * This module keeps trap of the data of the onlinegame we are currently in.
 */

import type { Player } from '../../../../../shared/chess/util/typeutil.js';
import type { EngineGamePageInfo } from '../../../../../shared/transport/domain.js';
import type { Additional, DatedVariant } from '../../../../../shared/chess/logic/gamefile.js';
import type { LongFormatOut, PresetAnnotes } from '../../../../../shared/chess/logic/icn/icnconverter.js'; // prettier-ignore
import type {
	GameStateFull,
	LeanParticipantState,
	ParticipantState,
} from '../../../../../shared/transport/clientbound.js';

import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';
import gameformulator from '../../../../../shared/chess/game/gameformulator.js';
import engineregistry from '../../../../../shared/chess/util/engineregistry.js';
import { players as p } from '../../../../../shared/chess/util/typeutil.js';

import guichat from './gui/guichat.js';
import gameslot from '../../game/chess/gameslot.js';
import drawoffers from './drawoffers.js';
import socketsubs from '../../socket/socketsubs.js';
import socketsend from '../../socket/socketsend.js';
import enginegame from '../../game/chess/enginegame.js';
import gameactions from './gui/guigameactions.js';
import gamesession from '../../game/chess/gamesession.js';
import guigamemeta from '../../game/gui/guigamemeta.js';
import { SocketBus } from '../../socket/SocketBus.js';
import guidisconnect from './gui/guidisconnect.js';
import guispectators from './gui/guispectators.js';

import './tabnameflash.js'; // Registers the "YOUR MOVE" tab-flash listeners.

// Types -----------------------------------------------------------------------

/** The various stages of our standing with the server game. See {@link stage}. */
type GameStage = 'active' | 'finalized' | 'detached';

// Variables -------------------------------------------------------------------

/**
 * Whether we are in sync with the server game, and the game isn't finalized yet (excludes rematch state).
 * If false, we do not submit our moves (instead auto-submitted upon re-subscribing).
 * Set to false whenever we lose connection, or detect a desync.
 * Set to true whenever we receive a fresh full game state, or the game
 * is detached — there's then nothing left to be out of sync with.
 */
let inSync: boolean = false;

/**
 * Our standing with the server game, dictating what a (re)subscribe requests.
 * Advances monotonically active -> finalized -> detached:
 * - `undefined`: no game loaded yet — the initial subscribe requests the full state to bootstrap.
 * - `'active'`: game is live — a reconnect does a full `subscribe` to resync.
 * - `'finalized'`: conclusion is locked in permanently; nothing but rematch-offer state can change,
 *   so a reconnect fetches only that via `subscriberematch`. Set from the `finalized` flag on a game
 *   snapshot, or the `finalized` message.
 * - `'detached'`: nothing more is coming for us — the server evicted the game, or we loaded it dead
 *   over HTTP. A reconnect doesn't re-subscribe at all.
 */
let stage: GameStage | undefined = undefined;

// Events ----------------------------------------------------------------------

SocketBus.addEventListener('closed', () => {
	if (stage !== 'detached') inSync = false;
});
SocketBus.addEventListener('reconnect', () => {
	if (stage !== 'detached') subscribeToGame();
});

// Sync ------------------------------------------------------------------------

function areInSync(): boolean {
	return inSync;
}

function setInSync(value: boolean): void {
	inSync = value;
	// Being back in sync is what ends a disconnection from our perspective.
	if (value) guidisconnect.onSelfReturn();
}

// Life Cycle -----------------------------------------------------------

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
	if (stage === 'active') stage = 'finalized'; // Never regress a later 'detached'
}

/**
 * Records that the server has detached us from the game.
 * No further state updates are received, not even rematch state. See {@link stage}.
 */
function onDetached(): void {
	stage = 'detached';
	// We receive nothing further, so we can never be out of sync.
	// Without this, a `detached` landing on a freshly reconnected socket — before
	// its subscribe has been answered — would leave us marked out of sync permanently.
	setInSync(true);
}

// Loading --------------------------------------------------------------

/**
 * A fresh page load (not a reconnect, game live OR dead): Loads a game onto the
 * board from a fresh `gamestate` message and sets up the online-game session.
 * @param dead - Whether the server has evicted it from memory. True if fetched over HTTP.
 * @param longformat - The game's parsed ICN. Required of the dead path, where a custom game's
 *   start position lives ONLY here; the live path SSRs that position instead, and passes nothing.
 */
function loadGameFromState(state: GameStateFull, dead: boolean, longformat?: LongFormatOut): void {
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
				const initialStage: GameStage = dead ? 'detached' : state.finalized ? 'finalized' : 'active'; // prettier-ignore
				initOnlineGame(initialStage, state);

				if (engineGame && ourRole !== undefined && !state.gameConclusion)
					startEngineGame(engineGame, ourRole);
			},
			concludeIfOver: true,
			// The gamestate arrived but never became a game — we don't hold it after all.
			onLoadError: () => (inSync = false),
		},
	);

	guispectators.updateSpectatorCount(state.spectators);
}

/**
 * Initializes the online game session.
 * @param initialStage - Our starting {@link stage} with the game.
 * @param state - The initial full game state message.
 */
function initOnlineGame(initialStage: GameStage, state: GameStateFull): void {
	stage = initialStage;

	// If we are a participator, set the draw offers, disconnect timer, rematch state.
	setParticipantState(state.participantState);

	// A finalized rated game carries its deltas in the state.
	if (state.ratingChanges) guigamemeta.showRatingChanges(state.ratingChanges);

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

/** Applies the overlay a FULL gamestate carries, absent when we're a spectator. */
function setParticipantState(participantState?: ParticipantState): void {
	if (!participantState) return;

	drawoffers.set(participantState.drawOffer);

	// If opponent is currently disconnected, display that status
	if (participantState.disconnect)
		guidisconnect.onOpponentDisconnect(participantState.disconnect);
	else guidisconnect.onOpponentReturn();

	// Restore the rematch button's state (present only once the game is over).
	if (participantState.rematch) gameactions.setRematchState(participantState.rematch);

	if (participantState.chat) guichat.reconcile(participantState.chat);
}

/** Applies the overlay a LEAN gamestate carries: the rematch handshake and the chat. */
function setLeanParticipantState(participantState: LeanParticipantState): void {
	gameactions.setRematchState(participantState.rematch);
	if (participantState.chat) guichat.reconcile(participantState.chat);
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

/** Boots the engine worker for an online engine game. */
function startEngineGame(engineGame: EngineGamePageInfo, ourRole: Player): void {
	const { workerUrl, engineUrl } = engineGame;
	if (!workerUrl || !engineUrl) throw new Error('Engine assets are missing from the game page.');
	// The server only ever creates online engine games against apeiron
	// (createEngineGame.ts) — no other engine's config can be built from page data.
	if (engineGame.engine !== 'apeiron')
		throw new Error(`Unsupported online engine "${engineGame.engine}".`);
	enginegame.initEngineGame({
		youAreColor: ourRole,
		engine: {
			name: engineGame.engine,
			config: {
				engineTimeLimitPerMoveMillis:
					engineregistry.REGISTRY[engineGame.engine].defaultTimeLimitPerMoveMillis,
				strengthLevel: engineGame.strengthLevel,
			},
		},
		workerUrl,
		engineUrl,
	});
}

// Exports ---------------------------------------------------------------------

export default {
	// Sync
	areInSync,
	setInSync,
	// Life Cycle
	subscribeToGame,
	onFinalized,
	onDetached,
	// Loading
	loadGameFromState,
	setParticipantState,
	setLeanParticipantState,
};
