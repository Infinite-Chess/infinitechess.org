// src/client/scripts/esm/game/gui/guimoveslist.ts

/**
 * Manages the `.moves` panel on the game page: the four move-cycle buttons
 * (jump to start, previous, next, jump to latest) — including keyboard arrows
 * and press-and-hold auto-repeat — and revealing the `.game-result` banner
 * with the game's conclusion once it ends.
 */

import moveutil from '../../../../../shared/chess/util/moveutil.js';
import gameresultutil from '../../../../../shared/chess/util/gameresultutil.js';

import gameslot from '../chess/gameslot.js';
import premoves from '../chess/premoves.js';
import selection from '../chess/selection.js';
import holdrepeat from '../../util/holdrepeat.js';
import { GameBus } from '../GameBus.js';
import frametracker from '../rendering/frametracker.js';
import movesequence from '../chess/movesequence.js';
import { listener_document } from '../chess/gamecore.js';

// Elements ----------------------------------------------------------------------------------

const element_First = document.getElementById('btn-move-first') as HTMLButtonElement;
const element_Prev = document.getElementById('btn-move-prev') as HTMLButtonElement;
const element_Next = document.getElementById('btn-move-next') as HTMLButtonElement;
const element_Last = document.getElementById('btn-move-last') as HTMLButtonElement;

const element_GameResult = document.querySelector('.game-result')!;
const element_ResultScore = element_GameResult.querySelector('.result-score')!;
const element_ResultText = element_GameResult.querySelector('.result-text')!;

// Variables ---------------------------------------------------------------------------------

/** Navigation can never be spammed faster than this, capping the hold-to-repeat rate. */
const minimumNavIntervalMillis = 20;
let lastNav = 0;

// Events ------------------------------------------------------------------------------------

GameBus.addEventListener('game-concluded', () => showGameResult());

// =============================== Move Navigation ===============================

function isOkayToNavigate(): boolean {
	return Date.now() - lastNav >= minimumNavIntervalMillis; // True if enough time has passed!
}

/** Rewinds the game by 1 move, unselecting any piece. Cancels premoves first, instead of rewinding. */
function rewind(): void {
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh();

	const hadAtleastOnePremove = premoves.hasAtleastOnePremove();
	premoves.cancelPremoves(gamefile, mesh);
	// If we had premoves to cancel, just cancel them, don't rewind a move this time.
	if (hadAtleastOnePremove) return;

	if (!moveutil.isDecrementingLegal(gamefile)) return;

	frametracker.onVisualChange();
	movesequence.navigateMove(gamefile, mesh, false);
	selection.unselectPiece();
}

/** Forwards the game by 1 move. Cancels any premoves first. */
function forward(): void {
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh();

	premoves.cancelPremoves(gamefile, mesh);

	if (!moveutil.isIncrementingLegal(gamefile)) return;
	movesequence.navigateMove(gamefile, mesh, true);
}

/** Jumps to the start of the game (before the first move), unselecting any piece. */
function jumpToStart(): void {
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh();

	premoves.cancelPremoves(gamefile, mesh);

	if (!moveutil.isDecrementingLegal(gamefile)) return;

	frametracker.onVisualChange();
	movesequence.viewStart(gamefile, mesh);
	selection.unselectPiece();
}

/** Jumps to the latest move, unselecting any piece. */
function jumpToEnd(): void {
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh();

	premoves.cancelPremoves(gamefile, mesh);

	if (!moveutil.isIncrementingLegal(gamefile)) return;

	frametracker.onVisualChange();
	movesequence.viewFront(gamefile, mesh);
	selection.unselectPiece();
}

/** Throttled rewind, for the hold-to-repeat previous button. */
function callback_Prev(): void {
	if (!isOkayToNavigate()) return;
	lastNav = Date.now();
	rewind();
}

/** Throttled forward, for the hold-to-repeat next button. */
function callback_Next(): void {
	if (!isOkayToNavigate()) return;
	lastNav = Date.now();
	forward();
}

/** Tests for the left/right arrow keys, signaling to rewind/forward the game. */
function update(): void {
	if (listener_document.isKeyDown('ArrowLeft')) rewind();
	if (listener_document.isKeyDown('ArrowRight')) forward();
}

/**
 * Makes sure the move navigation buttons that need to be disabled
 * are so, depending on whether there are any moves to forward/rewind.
 */
function updateNavButtons(): void {
	const gamefile = gameslot.getGamefile()!;
	const decrementingLegal = moveutil.isDecrementingLegal(gamefile);
	const incrementingLegal = moveutil.isIncrementingLegal(gamefile);

	element_First.disabled = !decrementingLegal;
	element_Prev.disabled = !decrementingLegal;
	element_Next.disabled = !incrementingLegal;
	element_Last.disabled = !incrementingLegal;
}

// =============================== Game Result ===============================

/** Populates and reveals the `.game-result` banner with the game's conclusion. */
function showGameResult(): void {
	const gamefile = gameslot.getGamefile()!;

	const { score, text } = gameresultutil.getResultDisplay(gamefile.gameConclusion!, t.shared);
	element_ResultScore.textContent = score;
	element_ResultText.textContent = text;
	element_GameResult.classList.remove('hidden');
}

// ===========================================================================

holdrepeat.makeHoldRepeatable(element_Prev, callback_Prev);
holdrepeat.makeHoldRepeatable(element_Next, callback_Next);
element_First.addEventListener('click', jumpToStart);
element_Last.addEventListener('click', jumpToEnd);

export default {
	update,
	updateNavButtons,
};
