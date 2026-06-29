// src/client/scripts/esm/game/gui/guigameactions.ts

/**
 * Manages the `.game-actions` panel on the game page, where exactly one block
 * is visible at a time:
 *
 * - `.actions-over` (rematch / analysis) once the game is concluded;
 * - `.actions-draw-offer` (accept / reject) while an incoming draw offer is open;
 * - `.actions-live` (offer-draw / resign-abort) otherwise during live play.
 *
 * A concluded game can never return to live, so SSR omits the two live-only
 * blocks once it loads concluded — they're absent from the DOM here.
 *
 * It also wires every action button. Within `.actions-live`, resign and abort
 * share one slot: abort shows before the game is resignable (0–1 plies), resign
 * after. Rematch is a placeholder until the server supports it.
 */

import uuid from '../../../../../shared/util/uuid.js';
import moveutil from '../../../../../shared/chess/util/moveutil.js';
import gamefileutility from '../../../../../shared/chess/util/gamefileutility.js';

import toast from '../../components/toast.js';
import gameslot from '../chess/gameslot.js';
import drawoffers from '../misc/onlinegame/drawoffers.js';
import { GameBus } from '../GameBus.js';
import socketmessages from '../../websocket/socketmessages.js';

// Elements ----------------------------------------------------------------------------------

// Action blocks. The live-only blocks are absent from the DOM when the game loaded concluded.
const element_ActionsLive = document.querySelector('.actions-live');
const element_ActionsDrawOffer = document.querySelector('.actions-draw-offer');
const element_ActionsOver = document.querySelector('.actions-over')!;

// Live actions (present only alongside `.actions-live`).
const element_OfferDraw = document.getElementById('btn-offer-draw') as HTMLButtonElement | null;
const element_Abort = document.getElementById('btn-abort');
const element_Resign = document.getElementById('btn-resign');

// Incoming draw-offer accept/reject (present only alongside `.actions-draw-offer`).
const element_AcceptDraw = document.getElementById('btn-accept-draw');
const element_RejectDraw = document.getElementById('btn-reject-draw');

// Post-game actions (always present).
const element_Rematch = document.getElementById('btn-rematch')!;
const element_Analysis = document.getElementById('btn-analysis')!;

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

// Block visibility ---------------------------------------------------------------------------

/**
 * Reveals the single action block matching the current game state. Called on
 * load/conclusion, and by {@link drawoffers} whenever an incoming offer opens or closes.
 */
function refresh(): void {
	const gamefile = gameslot.getGamefile();

	if (gamefile && gamefileutility.isGameOver(gamefile)) showOnly(element_ActionsOver);
	// Live game: an incoming draw offer trumps the default live actions.
	else if (drawoffers.areWeAcceptingDraw()) showOnly(element_ActionsDrawOffer);
	else showOnly(element_ActionsLive);
}

/** Reveals `target`, hiding the other action blocks. Blocks absent from the DOM are skipped. */
function showOnly(target: Element | null): void {
	for (const block of [element_ActionsLive, element_ActionsDrawOffer, element_ActionsOver]) {
		block?.classList.toggle('hidden', block !== target);
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

// Button handlers ----------------------------------------------------------------------------

/** Extends a draw offer, if legal. */
function callback_OfferDraw(): void {
	if (drawoffers.isOfferingDrawLegal()) drawoffers.extendOffer();
	// else unreachable, the button should be disabled.
}

/** Resigns the game. Server only accepts if the game is resignable (2+ plies). */
function callback_Resign(): void {
	socketmessages.send('game', 'resign');
}

/**
 * Aborts the game. Server only accepts if the game is not resignable,
 * or borderline resignable (0-2 plies). It allows aborting at 2 plies
 * in case you clicked abort right after your opponent played their move,
 * but the abort button hadn't yet swapped out for resign.
 */
function callback_Abort(): void {
	socketmessages.send('game', 'abort');
}

/** Navigates to the post-game analysis board. */
function callback_Analysis(): void {
	window.location.href = `/analysis/${uuid.base10ToBase62(window.gamePageData.id)}`;
}

/** Placeholder until the server supports rematches. */
function callback_Rematch(): void {
	toast.show('Rematch is not yet supported by the server.', { error: true });
}

// =================================================================================

/** Wires the click listeners for every `.game-actions` button present in the DOM. */
function initListeners(): void {
	element_OfferDraw?.addEventListener('click', callback_OfferDraw);
	element_Abort?.addEventListener('click', callback_Abort);
	element_Resign?.addEventListener('click', callback_Resign);

	element_AcceptDraw?.addEventListener('click', drawoffers.callback_AcceptDraw);
	element_RejectDraw?.addEventListener('click', drawoffers.callback_declineDraw);

	element_Rematch.addEventListener('click', callback_Rematch);
	element_Analysis.addEventListener('click', callback_Analysis);
}

initListeners();

export default {
	refresh,
	updateOfferDrawButton,
};
