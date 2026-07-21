// src/client/scripts/esm/game/gui/guimoveslist.ts

/**
 * Manages the `.moves` panel on the game page: the four move-cycle buttons
 * (jump to start, previous, next, jump to latest) — including keyboard arrows
 * and press-and-hold auto-repeat — the scrolling `.moves-table` of played
 * moves (rendering, click-to-navigate, current-ply highlight & auto-scroll),
 * and revealing the `.game-result` banner with the game's conclusion once it ends.
 *
 * This module knows only the flat list. The analysis page layers a move TREE on top by
 * registering a {@link MovesListRenderer} (`views/analysis/gui/guimovetree.ts`); when one
 * is present, rendering is delegated to it, reusing the primitives exported here.
 */

import type { MoveFull } from '../../../../../shared/chess/logic/movepiece.js';
import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';

import bounds from '../../../../../shared/util/math/bounds.js';
import moveutil from '../../../../../shared/chess/util/moveutil.js';
import typeutil from '../../../../../shared/chess/util/typeutil.js';
import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';
import gameresultutil from '../../../../../shared/chess/util/gameresultutil.js';

import gameslot from '../chess/gameslot.js';
import premoves from '../chess/premoves.js';
import svgcache from '../../chess/rendering/svgcache.js';
import selection from '../chess/selection.js';
import animation from '../rendering/animation.js';
import holdrepeat from '../../util/holdrepeat.js';
import Transition from '../rendering/transitions/Transition.js';
import gamesession from '../chess/gamesession.js';
import { GameBus } from '../GameBus.js';
import frametracker from '../rendering/frametracker.js';
import movesequence from '../chess/movesequence.js';
import { listener_document } from '../chess/gamecore.js';

// Renderer extension ------------------------------------------------------------------------

/**
 * An optional alternative renderer for the moves panel. The analysis page registers one to
 * draw a move TREE (with variations) in place of the flat list. When present, this module
 * delegates all rendering to it.
 */
interface MovesListRenderer {
	/** Rebuilds the panel for the current position — replaces the flat reconcile. */
	reconcile(): Promise<void>;
	/** Highlights & scrolls to the current position. The current-ply class is already cleared. */
	updateCurrentPly(): void;
	/** A fresh game loaded — seed derived state, before the following reconcile runs. */
	onGameLoaded(): void;
	/** The flat move list changed — sync derived state, before the following reconcile runs. */
	onMovesChanged(): void;
	/** The game unloaded — drop derived state. */
	onGameUnloaded(): void;
}

/** The registered tree renderer, if any; when set, it takes over all moves-panel rendering. */
let renderer: MovesListRenderer | undefined;

/** Registers the alternative moves renderer (the analysis move tree). */
function registerRenderer(r: MovesListRenderer): void {
	renderer = r;
}

// Elements ----------------------------------------------------------------------------------

const element_First = document.getElementById('btn-move-first') as HTMLButtonElement;
const element_Prev = document.getElementById('btn-move-prev') as HTMLButtonElement;
const element_Next = document.getElementById('btn-move-next') as HTMLButtonElement;
const element_Last = document.getElementById('btn-move-last') as HTMLButtonElement;

const element_MovesTable = document.querySelector('.moves-table')!;
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
	animation.clearAnimations();
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
	animation.clearAnimations();
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

holdrepeat.makeHoldRepeatable(element_Prev, callback_Prev);
holdrepeat.makeHoldRepeatable(element_Next, callback_Next);
element_First.addEventListener('click', jumpToStart);
element_Last.addEventListener('click', jumpToEnd);

// =============================== Game Result ===============================

/** Populates and reveals the `.game-result` banner with the game's conclusion. */
function showGameResult(): void {
	const gamefile = gameslot.getGamefile()!;

	const { score, text } = gameresultutil.getResultDisplay(gamefile.gameConclusion!, t.shared);
	element_ResultScore.textContent = score;
	element_ResultText.textContent = text;
	element_GameResult.classList.remove('hidden');
}

// =============================== Moves Table ===============================

/**
 * Visible move text is capped to this many characters (CSS ellipsis truncates further);
 * the full move always lives in the ply's `title`. Guards against the rare multi-thousand
 * character move blowing up layout/append cost.
 */
const MAX_VISIBLE_MOVE_CHARS = 50;

/**
 * The moves (by reference) currently rendered as plies, parallel to `gamefile.moves`. The source
 * of truth for diffing — premoves never enter `gamefile.moves`, so they're naturally excluded.
 */
const renderedMoves: MoveFull[] = [];

/**
 * Brings the rendered plies in line with `gamefile.moves`: finds the first index that
 * diverges (by reference), drops that tail, then appends what's missing. A normal move appends
 * exactly one ply; a resync trims rewound moves and appends new ones — never a full rebuild.
 */
async function reconcileMovesTable(): Promise<void> {
	if (renderer) return renderer.reconcile();

	const moves = gameslot.getGamefile()!.moves;

	let i = 0;
	while (i < renderedMoves.length && i < moves.length && renderedMoves[i] === moves[i]) i++;

	if (i < renderedMoves.length) {
		truncatePliesFrom(i);
		renderedMoves.length = i;
	}

	for (; i < moves.length; i++) {
		await appendPly(moves[i]!, i);
		renderedMoves.push(moves[i]!);
	}

	updateCurrentPly();
}

/**
 * Builds and inserts the ply for the move at `index` (white = new row, black = appended to the row).
 *
 * A full move-row ends up looking like (the second ply absent until black replies):
 * ```
 * <div class="move-row">
 *   <span class="move-num">1</span>
 *   <button class="ply current" title="1,2x1,4=Q+"><svg class="move-piece">…</svg><span class="move-coord">1,2x1,4=Q+</span></button>
 *   <button class="ply" title="5,7>5,5"><svg class="move-piece">…</svg><span class="move-coord">5,7>5,5</span></button>
 * </div>
 * ```
 */
async function appendPly(move: MoveFull, index: number): Promise<void> {
	const ply = await buildPlyButton(move);
	ply.addEventListener('click', () => {
		// Drop focus so the next keypress (which controls the board) doesn't reveal the
		// button's :focus-visible outline — the .current highlight already marks it.
		ply.blur();

		if (gamesession.isLoading()) return;

		const gamefile = gameslot.getGamefile()!;
		const wasAlreadySelected = gamefile.state.local.moveIndex === index;

		navigateToPly(gamefile, index);
		if (wasAlreadySelected) zoomToPlyDestination(gamefile, index);
	});

	if (index % 2 === 0) {
		// White ply — start a new row: number + this ply. Insert before the result
		// banner so it always stays at the bottom of the table.
		const row = createMoveRow(String(index / 2 + 1));
		row.append(ply);
		element_MovesTable.insertBefore(row, element_GameResult);
	} else {
		// Black ply — append to its (already-created) row.
		getRow(Math.floor(index / 2))!.append(ply);
	}
}

/**
 * Builds a `.ply` button — the piece silhouette plus the truncated coordinate text, with the
 * full move always in the `title`. Shared by the flat list and the analysis tree: the `.ply`
 * class is always set, `extraClasses` are added on top, and callers add any datasets and
 * listeners themselves.
 */
async function buildPlyButton(move: MoveFull, classes: string[] = []): Promise<HTMLButtonElement> {
	const shortform = icnconverter.getShortFormMoveFromMove(move, {
		compact: false,
		spaces: false,
		comments: false,
		abbrev: false, // The silhouette already conveys the piece.
	});

	const silhouette = await svgcache.getSilhouetteSVG(typeutil.getRawType(move.type));
	silhouette.classList.add('move-piece');

	const ply = document.createElement('button');
	ply.classList.add('ply', ...classes);
	ply.title = shortform;

	const coord = document.createElement('span');
	coord.classList.add('move-coord');
	coord.textContent =
		shortform.length > MAX_VISIBLE_MOVE_CHARS
			? shortform.slice(0, MAX_VISIBLE_MOVE_CHARS) + '…'
			: shortform;

	ply.append(silhouette, coord);
	return ply;
}

/** Creates a `.move-row` whose leading cell is a `.move-num` showing `numText`. */
function createMoveRow(numText: string, classes: string[] = []): HTMLElement {
	const row = document.createElement('div');
	row.classList.add('move-row', ...classes);
	const num = document.createElement('span');
	num.classList.add('move-num');
	num.textContent = numText;
	row.append(num);
	return row;
}

/** Removes every rendered ply from the table (leaving the result banner), resetting the diff state. */
function clearRenderedMoves(): void {
	renderedMoves.length = 0;
	for (const child of [...element_MovesTable.children]) {
		if (child !== element_GameResult) child.remove();
	}
}

/** Removes all rendered plies from `index` onward, resetting a dangling black slot to empty. */
function truncatePliesFrom(index: number): void {
	const startRow = Math.floor(index / 2);
	if (index % 2 === 1) {
		// Keep the white ply in this row but drop its black ply, then drop later rows.
		getRow(startRow)!.lastElementChild!.remove();
		removeRowsFrom(startRow + 1);
	} else {
		removeRowsFrom(startRow);
	}
}

/** Removes every `.move-row` from row position `from` onward. */
function removeRowsFrom(from: number): void {
	const rows = element_MovesTable.querySelectorAll('.move-row');
	for (let r = from; r < rows.length; r++) rows[r]!.remove();
}

/** The `.move-row` at the given pair position, or undefined. */
function getRow(pair: number): HTMLElement | undefined {
	return element_MovesTable.querySelectorAll('.move-row')[pair] as HTMLElement | undefined;
}

/** The ply element for the given move index, or undefined if not rendered. */
function getPlyElement(index: number): HTMLElement | undefined {
	const row = getRow(Math.floor(index / 2));
	// Children: [move-num, white ply, black ply].
	return row?.children[index % 2 === 0 ? 1 : 2] as HTMLElement | undefined;
}

/** Highlights the ply for the currently-viewed move and scrolls it into view. */
function updateCurrentPly(): void {
	element_MovesTable.querySelector('.ply.current')?.classList.remove('current');

	if (renderer) return renderer.updateCurrentPly();

	const gamefile = gameslot.getGamefile()!;
	const moveIndex = gamefile.state.local.moveIndex;

	const current = getPlyElement(moveIndex);
	if (!current) {
		// The start-of-game position (moveIndex -1) has no associated ply; scroll to the top.
		if (moveIndex === -1) scrollMovesTableToTop();
		return;
	}
	current.classList.add('current');

	// On the final move with the result banner shown, scroll all the way down so the
	// banner (which sits just below it) stays visible; otherwise center the ply.
	const onFinalMove = moveIndex === gamefile.moves.length - 1;
	const bannerVisible = !element_GameResult.classList.contains('hidden');
	if (onFinalMove && bannerVisible) scrollMovesTableToBottom();
	else centerPly(current);
}

/** Scrolls the table so the given ply is vertically centered in the visible region. */
function centerPly(ply: HTMLElement): void {
	const containerRect = element_MovesTable.getBoundingClientRect();
	const plyRect = ply.getBoundingClientRect();
	const delta = plyRect.top - containerRect.top - (element_MovesTable.clientHeight - plyRect.height) / 2; // prettier-ignore
	element_MovesTable.scrollTop += delta;
}

/** Scrolls the table as far down as possible (used when the result banner appears). */
function scrollMovesTableToBottom(): void {
	element_MovesTable.scrollTop = element_MovesTable.scrollHeight;
}

/** Scrolls the table to the top (used at the start-of-game position, which has no ply). */
function scrollMovesTableToTop(): void {
	element_MovesTable.scrollTop = 0;
}

/** Starts a zoom transition to the move's destination square. */
function zoomToPlyDestination(gamefile: GameFile, index: number): void {
	const move = gamefile.moves[index]!;
	const coordsBox = bounds.getBoxFromCoordsList([move.endCoords]);
	Transition.zoomToCoordsBox(coordsBox);
}

/** Navigates the game to view the move at `index`, mirroring the nav buttons' behavior. */
function navigateToPly(gamefile: GameFile, index: number): void {
	const mesh = gameslot.getMesh();

	premoves.cancelPremoves(gamefile, mesh);

	frametracker.onVisualChange();
	movesequence.viewIndex(gamefile, mesh, index); // Dispatches 'view-move' → re-highlights the current ply.
	selection.unselectPiece();
	animation.clearAnimations();
}

// Keep the table in sync: fill it from the freshly-loaded game (moves baked into the
// gamefile bypass 'moves-changed'), reconcile on move-list changes & navigation, scroll
// to the banner on conclusion.
GameBus.addEventListener('game-loaded', () => {
	renderer?.onGameLoaded();
	reconcileMovesTable();
});
GameBus.addEventListener('moves-changed', () => {
	renderer?.onMovesChanged();
	reconcileMovesTable();
	updateNavButtons();
});
GameBus.addEventListener('view-move', () => {
	updateCurrentPly();
	updateNavButtons();
});
GameBus.addEventListener('game-concluded', () => scrollMovesTableToBottom());
GameBus.addEventListener('game-unloaded', () => renderer?.onGameUnloaded());

// ===========================================================================

export default {
	registerRenderer,
	element_MovesTable,
	element_GameResult,
	update,
	buildPlyButton,
	createMoveRow,
	clearRenderedMoves,
	centerPly,
	scrollMovesTableToTop,
	zoomToPlyDestination,
};
