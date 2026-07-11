// src/client/scripts/esm/game/gui/guigameactions.ts

/**
 * Manages the `.game-actions` panel on the game page, where exactly one block
 * is visible at a time:
 *
 * - `.actions-over` (rematch / analysis) once the game is concluded;
 * - `.actions-draw-offer` (accept / reject) while an incoming draw offer is open;
 * - `.actions-live` (offer-draw / resign-abort) otherwise during live play.
 *
 * SSR omits both live-only blocks (`.actions-live`, `.actions-draw-offer`) when
 * they can't apply — once a game loads concluded (it can't return to live), or
 * for spectators (never participants) — so they're absent from the DOM here.
 * Spectators also get `#btn-rematch` SSR-hidden, leaving only Analysis once over.
 *
 * It also wires every action button. Within `.actions-live`, resign and abort
 * share one slot: abort shows before the game is resignable (0–1 plies), resign
 * after. Rematch is a placeholder until the server supports it.
 */

import type { GameConclusion } from '../../../../../shared/chess/util/winconutil.js';
import type { RematchOfferInfo } from '../../../../../shared/types.js';

import uuid from '../../../../../shared/util/uuid.js';
import typeutil from '../../../../../shared/chess/util/typeutil.js';
import moveutil from '../../../../../shared/chess/util/moveutil.js';
import gamefileutility from '../../../../../shared/chess/util/gamefileutility.js';

import gameslot from '../chess/gameslot.js';
import drawoffers from '../misc/onlinegame/drawoffers.js';
import { GameBus } from '../GameBus.js';
import gamesession from '../chess/gamesession.js';
import { SocketBus } from '../../websocket/SocketBus.js';
import socketmessages from '../../websocket/socketmessages.js';

// Elements ----------------------------------------------------------------------------------

// Action blocks. The live-only blocks are absent from the DOM when the game loaded concluded, or for spectators.
const element_ActionsLive = document.querySelector('.actions-live');
const element_ActionsDrawOffer = document.querySelector('.actions-draw-offer');
const element_ActionsOver = document.querySelector('.actions-over')!;

// Live actions (present only alongside `.actions-live`).
const element_OfferDraw = document.getElementById('btn-offer-draw') as HTMLButtonElement | null;
const element_Abort = document.getElementById('btn-abort');
const element_Resign = document.getElementById('btn-resign');

// Incoming draw-offer accept/reject (present only alongside `.actions-draw-offer`).
const element_AcceptDraw = document.getElementById('btn-accept-draw') as HTMLButtonElement | null;
const element_RejectDraw = document.getElementById('btn-reject-draw') as HTMLButtonElement | null;

// Post-game actions. Analysis is always present; Rematch is SSR'd only for
// a participant (not spectator) of an unevicted (live, in-memory) game.
const element_Rematch = document.getElementById('btn-rematch') as HTMLButtonElement | null;
const element_Analysis = document.getElementById('btn-analysis') as HTMLButtonElement;

// Events ------------------------------------------------------------------------------------

// Correct the SSR'd guess once the game loads, then swap to actions-over on conclusion.
GameBus.addEventListener('game-loaded', () => {
	updateResignAbortButtons();
	refresh();
});
GameBus.addEventListener('moves-changed', () => {
	updateResignAbortButtons();
	updateOfferDrawButton();
});
GameBus.addEventListener('game-concluded', () => refresh());
// A lost connection disables the rematch button until we resync. A reconnect
// restores its true state via setRematchState() (called after 'subscriberematch').
SocketBus.addEventListener('connection-lost', () => {
	connectionLost = true;
	updateRematchButton();
});

// Block visibility ---------------------------------------------------------------------------

/**
 * Reveals the single action block matching the current game state. Called on
 * load/conclusion, and by {@link drawoffers} whenever an incoming offer opens or closes.
 */
function refresh(): void {
	const gamefile = gameslot.getGamefile();

	if (gamefile && gamefileutility.isGameOver(gamefile)) {
		// Hide Analysis button if zero moves were played (nothing to analyze).
		element_Analysis.classList.toggle('hidden', gamefile.moves.length === 0);
		showOnly(element_ActionsOver);
	}
	// Live game: an incoming draw offer trumps the default live actions.
	else if (drawoffers.areWeAcceptingDraw()) showOnly(element_ActionsDrawOffer);
	else showOnly(element_ActionsLive);
}

/** Reveals `target`, hiding the other action blocks. Blocks absent from the DOM are skipped. */
function showOnly(target: Element | null): void {
	for (const block of [element_ActionsLive, element_ActionsDrawOffer, element_ActionsOver]) {
		const wasHidden = block?.classList.contains('hidden');
		block?.classList.toggle('hidden', block !== target);
		// Block just revealed: briefly disable its buttons so a click landing
		// the same split-second it appears can't accidentally fire an action.
		if (block && block === target && wasHidden) armGracePeriod(block);
	}
}

/** Disables the offer-draw button whenever extending a draw offer would be illegal. */
function updateOfferDrawButton(): void {
	if (!element_OfferDraw) return; // Concluded game: live block absent.
	element_OfferDraw.disabled = !drawoffers.isOfferingDrawLegal();
}

/** Shows resign once the game is resignable (2+ plies), abort before then. */
function updateResignAbortButtons(): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile || !element_Abort || !element_Resign) return; // Concluded game: live block absent.

	const resignable = moveutil.isGameResignable(gamefile);
	element_Resign.classList.toggle('hidden', !resignable);
	element_Abort.classList.toggle('hidden', resignable);
}

// Appearance grace period --------------------------------------------------------------------

/**
 * How long a freshly-revealed block's buttons stay disabled, so
 * a click landing the instant it appears can't accidentally fire.
 */
const GRACE_MILLIS = 667;

/** Buttons to briefly disable when their action block first appears. */
const graceButtons = new Map<Element, HTMLButtonElement[]>();
if (element_ActionsDrawOffer && element_AcceptDraw && element_RejectDraw)
	graceButtons.set(element_ActionsDrawOffer, [element_AcceptDraw, element_RejectDraw]);
graceButtons.set(
	element_ActionsOver,
	element_Rematch ? [element_Rematch, element_Analysis] : [element_Analysis],
);

/** Blocks mid-grace, mapped to their pending re-enable timer. */
const graceTimers = new Map<Element, number>();

/** Disables `block`'s {@link graceButtons} for {@link GRACE_MILLIS}, then re-enables them. */
function armGracePeriod(block: Element): void {
	const buttons = graceButtons.get(block);
	if (!buttons) return; // Block has no grace-disabled buttons (e.g. actions-live).
	for (const button of buttons) button.disabled = true;
	clearTimeout(graceTimers.get(block));
	graceTimers.set(
		block,
		window.setTimeout(() => {
			graceTimers.delete(block);
			for (const button of buttons) button.disabled = false;
			// The rematch button's enabled state depends on live rematch state, not just the grace.
			updateRematchButton();
		}, GRACE_MILLIS),
	);
}

// Two-click confirmation ---------------------------------------------------------------------

const CONFIRM_REVERT_MILLIS = 3000;

/** Buttons mid-confirmation, mapped to their pending auto-revert timer. */
const confirmTimers = new Map<HTMLElement, number>();

/**
 * Wraps a one-click action behind a two-click confirmation. The first click
 * adds the `confirming` class (a purely visual cue) and arms a 3s auto-revert;
 * a second click within that window clears the state and runs `action`.
 */
function withConfirmation(button: HTMLElement, action: () => void): () => void {
	return (): void => {
		if (confirmTimers.has(button)) {
			// Second click: confirm.
			clearConfirmation(button);
			action();
			return;
		}
		// First click: arm the confirmation.
		button.classList.add('confirming');
		confirmTimers.set(
			button,
			window.setTimeout(() => clearConfirmation(button), CONFIRM_REVERT_MILLIS),
		);
	};
}

/** Reverts a button out of its confirming state, cancelling any pending auto-revert. */
function clearConfirmation(button: HTMLElement): void {
	const timer = confirmTimers.get(button);
	if (timer !== undefined) clearTimeout(timer);
	confirmTimers.delete(button);
	button.classList.remove('confirming');
}

// Button handlers ----------------------------------------------------------------------------

/** Extends a draw offer, if legal. */
function callback_OfferDraw(): void {
	if (drawoffers.isOfferingDrawLegal()) drawoffers.extendOffer();
	// else unreachable, the button should be disabled.
}

/** Resigns the game. Server only accepts if the game is resignable (2+ plies). */
function callback_Resign(): void {
	if (gamesession.getGameType() === 'engine') {
		// Engine games conclude locally; the sync module reports it to the server.
		const engineColor = typeutil.invertPlayer(gamesession.getRole()!);
		concludeEngineGameLocally({ victor: engineColor, condition: 'resignation' });
		return;
	}
	socketmessages.send('game', 'resign');
}

/**
 * Aborts the game. Server only accepts if the game is not resignable,
 * or borderline resignable (0-2 plies). It allows aborting at 2 plies
 * in case you clicked abort right after your opponent played their move,
 * but the abort button hadn't yet swapped out for resign.
 */
function callback_Abort(): void {
	if (gamesession.getGameType() === 'engine') {
		concludeEngineGameLocally({ condition: 'aborted' });
		return;
	}
	socketmessages.send('game', 'abort');
}

/** Concludes the loaded engine game in place (there's no server game to message). */
function concludeEngineGameLocally(conclusion: GameConclusion): void {
	const gamefile = gameslot.getGamefile()!;
	if (gamefile.gameConclusion) return; // Already over (e.g. the engine's move just concluded it).
	gamefile.gameConclusion = conclusion;
	gameslot.concludeGame();
}

/** Navigates to the post-game analysis board. */
function callback_Analysis(): void {
	window.location.assign(`/analysis/${uuid.base10ToBase62(window.gamePageData.id)}`);
}

// Rematch ------------------------------------------------------------------------------------

/** Whether WE have extended a rematch offer this game (button disabled, waiting on opponent). */
let weOfferedRematch = false;
/** Whether our OPPONENT has an outstanding rematch offer (button glows). */
let opponentOfferedRematch = false;

/** Whether our opponent is currently connected (button disabled while they're gone). */
let opponentPresentPostGame = true;

/** Whether our connection to the server has dropped (button disabled until we resync). */
let connectionLost = false;

/**
 * Repaints the rematch button: glows while the opponent has an offer out (and we haven't
 * yet responded), and is disabled once we've offered or while the opponent is away.
 * Leaves the button alone during its appearance grace period (see {@link armGracePeriod}).
 */
function updateRematchButton(): void {
	if (!element_Rematch) return; // Absent (spectator, or game loaded dead).
	element_Rematch.classList.toggle(
		'rematch-offered',
		opponentOfferedRematch && !weOfferedRematch,
	);
	if (graceTimers.has(element_ActionsOver)) return; // Mid-appearance grace — leave disabled state to it.
	element_Rematch.disabled = weOfferedRematch || !opponentPresentPostGame || connectionLost;
}

/**
 * Receives the full rematch state from the server, after a
 * page load or 'subscriberematch'. Updates the rematch button.
 */
function setRematchState(rematch: RematchOfferInfo): void {
	// A page load/resync resets our own pending offer (not restored — see the server protocol).
	weOfferedRematch = false;
	opponentOfferedRematch = rematch.offered;
	opponentPresentPostGame = rematch.present;
	connectionLost = false; // We just heard from the server — connection is alive.
	updateRematchButton();
}

/** Extends a rematch offer to our opponent. Clicking while they're offering accepts theirs. */
function callback_Rematch(): void {
	if (weOfferedRematch) return; // Already offered.
	socketmessages.send('game', 'offerrematch');
	weOfferedRematch = true;
	updateRematchButton();
}

/** Our opponent extended a rematch offer — glow the button to invite us to accept. */
function onOpponentRematchOffer(): void {
	opponentOfferedRematch = true;
	updateRematchButton();
}

/** Our opponent left the post-game — disable the rematch button (and stop any glow). */
function onOpponentLeft(): void {
	opponentPresentPostGame = false;
	opponentOfferedRematch = false;
	updateRematchButton();
}

/** Our opponent returned to the post-game — re-enable the rematch button. */
function onOpponentReturn(): void {
	opponentPresentPostGame = true;
	updateRematchButton();
}

/** Unsubscribed from the game — clear all rematch offer state and disable the button. */
function onUnsub(): void {
	weOfferedRematch = false;
	opponentOfferedRematch = false;
	opponentPresentPostGame = false;
	updateRematchButton();
}

// =================================================================================

/** Wires the click listeners for every `.game-actions` button present in the DOM. */
function initListeners(): void {
	if (element_OfferDraw)
		element_OfferDraw.addEventListener('click', withConfirmation(element_OfferDraw, callback_OfferDraw)); // prettier-ignore
	element_Abort?.addEventListener('click', callback_Abort);
	if (element_Resign)
		element_Resign.addEventListener('click', withConfirmation(element_Resign, callback_Resign)); // prettier-ignore

	element_AcceptDraw?.addEventListener('click', () => drawoffers.callback_AcceptDraw());
	element_RejectDraw?.addEventListener('click', () => drawoffers.callback_declineDraw());

	element_Rematch?.addEventListener('click', callback_Rematch);
	element_Analysis.addEventListener('click', callback_Analysis);
}

initListeners();

export default {
	refresh,
	updateOfferDrawButton,
	setRematchState,
	onOpponentRematchOffer,
	onOpponentLeft,
	onOpponentReturn,
	onUnsub,
};
