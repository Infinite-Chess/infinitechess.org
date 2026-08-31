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

import type { RawType } from '../../../../../shared/chess/util/typeutil.js';
import type { MoveFull } from '../../../../../shared/chess/logic/movepiece.js';
import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';

import bounds from '../../../../../shared/util/math/bounds.js';
import moveutil from '../../../../../shared/chess/logic/moveutil.js';
import typeutil from '../../../../../shared/chess/util/typeutil.js';
import icnmoves from '../../../../../shared/chess/logic/icn/icnmoves.js';
import gameresultutil from '../../../../../shared/chess/util/gameresultutil.js';

import gameslot from '../chess/gameslot.js';
import premoves from '../chess/premoves.js';
import svgcache from '../../chess/rendering/svgcache.js';
import selection from '../chess/selection.js';
import animation from '../rendering/animation.js';
import holdrepeat from '../../components/holdrepeat.js';
import Transition from '../rendering/transitions/Transition.js';
import gamesession from '../chess/gamesession.js';
import { GameBus } from '../../board/GameBus.js';
import frametracker from '../../board/rendering/frametracker.js';
import movesequence from '../chess/movesequence.js';
import { listener_document } from '../listeners.js';

// Renderer extension ----------------------------------------------------------

/**
 * An optional alternative renderer for the moves panel. The analysis page registers one to
 * draw a move TREE (with variations) in place of the flat list. When present, this module
 * delegates all rendering to it.
 */
interface MovesListRenderer {
	/** Rebuilds the panel for the current position — replaces the flat reconcile. */
	reconcile(): void;
	/** Highlights the current position (the current-ply class is already cleared). */
	updateCurrentPly(): void;
	/** Scrolls the current position into view. */
	scrollToCurrentPly(): void;
	/** A fresh game finished loading — seed derived state, before the following reconcile runs. */
	onGraphicalLoaded(): void;
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

// Elements --------------------------------------------------------------------

const element_First = document.getElementById('btn-move-first') as HTMLButtonElement;
const element_Prev = document.getElementById('btn-move-prev') as HTMLButtonElement;
const element_Next = document.getElementById('btn-move-next') as HTMLButtonElement;
const element_Last = document.getElementById('btn-move-last') as HTMLButtonElement;

const element_MovesTable = document.querySelector('.moves-table')!;
const element_GameResult = document.querySelector('.game-result')!;
const element_ResultScore = element_GameResult.querySelector('.result-score')!;
const element_ResultText = element_GameResult.querySelector('.result-text')!;

// Variables -------------------------------------------------------------------

/** Navigation can never be spammed faster than this, capping the hold-to-repeat rate. */
const minimumNavIntervalMs = 20;
let lastNav = 0;

// Events ----------------------------------------------------------------------

// Keep the table in sync: fill it from the freshly-loaded game (moves baked into the gamefile
// bypass 'moves-changed'), reconcile the plies on move-list changes, follow the viewed ply's
// highlight on navigation, scroll to the banner on conclusion. Must be 'graphical-loaded' —
// see the SVG cache note in reconcileMovesTable().
GameBus.addEventListener('graphical-loaded', () => {
	renderer?.onGraphicalLoaded();
	reconcileMovesTable();
	// A fresh load dispatches no 'view-move', so seed everything it would have maintained.
	updateCurrentPly();
	updateNavButtons();
	scrollToCurrentPly();
});
GameBus.addEventListener('moves-changed', () => {
	renderer?.onMovesChanged();
	reconcileMovesTable();
	updateNavButtons();
});
// 'view-move' only moves the HIGHLIGHT; scrolling to follow is each navigation source's own call.
GameBus.addEventListener('view-move', () => {
	updateCurrentPly();
	updateNavButtons();
});
GameBus.addEventListener('view-front', () => scrollToCurrentPly());
GameBus.addEventListener('game-concluded', () => {
	showGameResult();
	scrollMovesTableToBottom();
});
GameBus.addEventListener('game-unloaded', () => clearMovesTable());

// Move Navigation -------------------------------------------------------------

function isOkayToNavigate(): boolean {
	return Date.now() - lastNav >= minimumNavIntervalMs; // True if enough time has passed!
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
	scrollToCurrentPly();
}

/** Forwards the game by 1 move. Cancels any premoves first. */
function forward(): void {
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh();

	premoves.cancelPremoves(gamefile, mesh);

	if (!moveutil.isIncrementingLegal(gamefile)) return;
	movesequence.navigateMove(gamefile, mesh, true);
	scrollToCurrentPly();
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
	scrollToCurrentPly();
	animation.clearAnimations();
}

/** Jumps to the latest move, unselecting any piece. */
function jumpToEnd(): void {
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh();

	premoves.cancelPremoves(gamefile, mesh);

	if (!moveutil.isIncrementingLegal(gamefile)) return;

	frametracker.onVisualChange();
	movesequence.viewFront(gamefile, mesh, false); // Dispatches 'view-front' → scrolls to the front.
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

holdrepeat.make(element_Prev, callback_Prev);
holdrepeat.make(element_Next, callback_Next);
element_First.addEventListener('click', jumpToStart);
element_Last.addEventListener('click', jumpToEnd);

// Game Result -----------------------------------------------------------------

/** Populates and reveals the `.game-result` banner with the game's conclusion. */
function showGameResult(): void {
	const gamefile = gameslot.getGamefile()!;

	const { score, text } = gameresultutil.getResultDisplay(gamefile.gameConclusion!, t.shared);
	element_ResultScore.textContent = score;
	element_ResultText.textContent = text;
	element_GameResult.classList.remove('hidden');
}

// Moves Table -----------------------------------------------------------------

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
function reconcileMovesTable(): void {
	// A ply's silhouette is cloned straight from the SVG cache, which only the graphical load
	// populates for non-classical pieces. The 'graphical-loaded' rebuild below repaints from
	// scratch, so anything skipped here (a move arriving mid-load) lands then.
	if (gamesession.isLoading()) return;

	if (renderer) return renderer.reconcile();

	const moves = gameslot.getGamefile()!.moves;

	let i = 0;
	while (i < renderedMoves.length && i < moves.length && renderedMoves[i] === moves[i]) i++;

	if (i < renderedMoves.length) {
		truncatePliesFrom(i);
		renderedMoves.length = i;
	}

	for (; i < moves.length; i++) {
		appendPly(moves[i]!, i);
		renderedMoves.push(moves[i]!);
	}
}

/** Empties the panel on unload: the result banner, and the rendered plies. */
function clearMovesTable(): void {
	// The tree renderer (analysis page) shares the banner element but deliberately keeps it:
	// /analysis never concludes a game, and /analysis/:id paints the reviewed result once, for good.
	if (renderer) return renderer.onGameUnloaded();

	element_GameResult.classList.add('hidden');
	removeRowsFrom(0);
	renderedMoves.length = 0;
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
function appendPly(move: MoveFull, index: number): void {
	const ply = buildPlyButton(move);
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
 * The display bits of a ply shared by the flat list and the analysis tree: the full move as its
 * `title`, the raw piece type for the silhouette, the truncated coordinate text. Centralizes
 * the shortform + truncation so both the real-DOM and vnode ply builders stay in sync.
 */
function getPlyDisplay(move: MoveFull): { title: string; coord: string; rawType: RawType } {
	const shortform = icnmoves.getShortFormMoveFromMove(move, {
		compact: false,
		spaces: false,
		comments: false,
		abbrev: false, // The silhouette already conveys the piece.
	});
	const coord =
		shortform.length > MAX_VISIBLE_MOVE_CHARS
			? shortform.slice(0, MAX_VISIBLE_MOVE_CHARS) + '…'
			: shortform;
	return { title: shortform, coord, rawType: typeutil.getRawType(move.type) };
}

/**
 * Builds a `.ply` button — the piece silhouette plus the truncated coordinate text, with the
 * full move always in the `title`. The `.ply` class is always set, `classes` are added on top,
 * and callers add any datasets and listeners themselves.
 */
function buildPlyButton(move: MoveFull, classes: string[] = []): HTMLButtonElement {
	const { title, coord, rawType } = getPlyDisplay(move);

	const silhouette = svgcache.getCachedSilhouetteSVG(rawType);
	silhouette.classList.add('move-piece');

	const ply = document.createElement('button');
	ply.classList.add('ply', ...classes);
	ply.title = title;

	const coordEl = document.createElement('span');
	coordEl.classList.add('move-coord');
	coordEl.textContent = coord;

	ply.append(silhouette, coordEl);
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

/** Highlights the ply for the currently-viewed move. */
function updateCurrentPly(): void {
	element_MovesTable.querySelector('.ply.current')?.classList.remove('current');

	if (renderer) return renderer.updateCurrentPly();

	// The start-of-game position (moveIndex -1) has no associated ply.
	const moveIndex = gameslot.getGamefile()!.state.local.moveIndex;
	getPlyElement(moveIndex)?.classList.add('current');
}

/** Scrolls the table to follow the currently-viewed ply. */
function scrollToCurrentPly(): void {
	if (renderer) return renderer.scrollToCurrentPly();

	const gamefile = gameslot.getGamefile()!;
	const moveIndex = gamefile.state.local.moveIndex;

	const current = getPlyElement(moveIndex);
	if (!current) {
		// The start-of-game position (moveIndex -1) has no associated ply; scroll to the top.
		if (moveIndex === -1) scrollMovesTableToTop();
		return;
	}

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
	movesequence.viewIndex(gamefile, mesh, index, true); // Dispatches 'view-move' → re-highlights the current ply.
	selection.unselectPiece();
	scrollToCurrentPly(); // Clicking a ply in the flat list centers it, matching the nav controls.
}

// Exports ---------------------------------------------------------------------

export default {
	registerRenderer,
	element_MovesTable,
	element_GameResult,
	update,
	getPlyDisplay,
	centerPly,
	scrollMovesTableToTop,
	zoomToPlyDestination,
};
