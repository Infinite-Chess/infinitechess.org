// src/client/scripts/esm/game/gui/guimoveslist.ts

/**
 * Manages the `.moves` panel on the game page: the four move-cycle buttons
 * (jump to start, previous, next, jump to latest) — including keyboard arrows
 * and press-and-hold auto-repeat — the scrolling `.moves-table` of played
 * moves (rendering, click-to-navigate, current-ply highlight & auto-scroll),
 * and revealing the `.game-result` banner with the game's conclusion once it ends.
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
import { createRenderQueue } from '../../util/renderqueue.js';
import analysismovetree, { AnalysisMoveNode } from '../../views/analysis/movetree.js';

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
	// On the analysis board the end-of-list result is only meaningful for a game opened by id
	// (/analysis/:id, an already-finished game). Fresh boards, ICN imports, and lines played out
	// to a conclusion don't show it.
	if (gamesession.getGameType() === 'analysis' && window.analysisPageData.gameId === null) return;

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
 * Serializes all moves-table DOM mutations & scrolls into dispatch order. Required because
 * appending a ply awaits an async silhouette fetch, so overlapping updates would race.
 */
const enqueueRender = createRenderQueue('Moves table render error');
let contextMenu: HTMLElement | undefined;

/**
 * Brings the rendered plies in line with `gamefile.moves`: finds the first index that
 * diverges (by reference), drops that tail, then appends what's missing. A normal move appends
 * exactly one ply; a resync trims rewound moves and appends new ones — never a full rebuild.
 */
async function reconcileMovesTable(): Promise<void> {
	if (gamesession.getGameType() === 'analysis') {
		await reconcileAnalysisMovesTable();
		return;
	}

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
	const shortform = icnconverter.getShortFormMoveFromMove(move, {
		compact: false,
		spaces: false,
		comments: false,
		abbrev: false, // The silhouette already conveys the piece.
	});

	const silhouette = await svgcache.getSilhouetteSVG(typeutil.getRawType(move.type));
	silhouette.classList.add('move-piece');

	const ply = document.createElement('button');
	ply.className = 'ply';
	ply.title = shortform;
	const coord = document.createElement('span');
	coord.className = 'move-coord';
	coord.textContent =
		shortform.length > MAX_VISIBLE_MOVE_CHARS
			? shortform.slice(0, MAX_VISIBLE_MOVE_CHARS) + '…'
			: shortform;
	ply.append(silhouette, coord);
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
		const row = document.createElement('div');
		row.className = 'move-row';
		const num = document.createElement('span');
		num.className = 'move-num';
		num.textContent = String(index / 2 + 1);
		row.append(num, ply);
		element_MovesTable.insertBefore(row, element_GameResult);
	} else {
		// Black ply — append to its (already-created) row.
		getRow(Math.floor(index / 2))!.append(ply);
	}
}

async function createVariationPlyButton(
	node: AnalysisMoveNode,
	showIndex: boolean,
): Promise<HTMLButtonElement> {
	const move = node.move!;
	const shortform = icnconverter.getShortFormMoveFromMove(move, {
		compact: false,
		spaces: false,
		comments: false,
		abbrev: false,
	});

	const silhouette = await svgcache.getSilhouetteSVG(typeutil.getRawType(move.type));
	silhouette.classList.add('move-piece');

	const ply = document.createElement('button');
	ply.className = 'ply analysis-ply';
	ply.title = shortform;
	ply.dataset['nodeId'] = String(node.id);

	if (showIndex) {
		const index = document.createElement('span');
		index.className = 'move-index';
		index.textContent = formatMoveIndex(node.ply);
		ply.append(index);
	}

	const coord = document.createElement('span');
	coord.className = 'move-coord';
	coord.textContent =
		shortform.length > MAX_VISIBLE_MOVE_CHARS
			? shortform.slice(0, MAX_VISIBLE_MOVE_CHARS) + '…'
			: shortform;
	ply.append(silhouette, coord);

	ply.addEventListener('click', () => {
		ply.blur();
		if (gamesession.isLoading()) return;

		const gamefile = gameslot.getGamefile()!;
		const wasAlreadySelected = analysismovetree.getCurrentNode(gamefile) === node;
		navigateToAnalysisNode(gamefile, node);
		if (wasAlreadySelected) zoomToPlyDestination(gamefile, node.ply);
	});
	ply.addEventListener('contextmenu', (e) => openAnalysisContextMenu(e, node));

	return ply;
}

function formatMoveIndex(index: number): string {
	const fullMove = Math.floor(index / 2) + 1;
	return index % 2 === 0 ? `${fullMove}.` : `${fullMove}...`;
}

async function reconcileAnalysisMovesTable(): Promise<void> {
	const gamefile = gameslot.getGamefile()!;
	if (!analysismovetree.isReady()) analysismovetree.initFromGame(gamefile);
	analysismovetree.syncAfterMovesChanged(gamefile);

	clearRenderedMoves();

	const tree = document.createElement('div');
	tree.className = 'analysis-move-tree';
	const root = analysismovetree.getRoot()!;

	// The mainline walk renders every mainline move's alternatives below it — including the
	// first move's, which branch from the root — so no separate root-variation pass is needed.
	await appendAnalysisMainline(tree, root);

	element_MovesTable.insertBefore(tree, element_GameResult);
	updateCurrentPly();
}

function clearRenderedMoves(): void {
	renderedMoves.length = 0;
	for (const child of [...element_MovesTable.children]) {
		if (child !== element_GameResult) child.remove();
	}
}

async function appendAnalysisMainline(
	container: HTMLElement,
	from: AnalysisMoveNode,
): Promise<void> {
	let node = getMainlineChild(from);
	// Whether the white move just placed has variations rendered beneath it — its black
	// reply must then start a fresh row so the variations stay ordered below their branch move.
	let whiteHadVariations = false;
	let last = from;
	while (node) {
		// The variations that branch off as alternatives to THIS move; they render
		// directly below the move so a variation never appears above the move it replaces.
		const variations = getVariationChildren(node.parent!);
		await appendAnalysisMainlinePly(container, node, node.ply % 2 === 1 && whiteHadVariations);
		whiteHadVariations = node.ply % 2 === 0 && variations.length > 0;
		await appendVariationGroup(container, variations, 1);
		last = node;
		node = getMainlineChild(node);
	}

	// The last node's own variation children — including any forced move that truncated the
	// walk — branch from it with no move row above, so render them beneath it. (When the whole
	// mainline is forced away, last is the root.)
	await appendVariationGroup(container, getVariationChildren(last), 1);
}

async function appendAnalysisMainlinePly(
	container: HTMLElement,
	node: AnalysisMoveNode,
	blackStartsNewRow: boolean,
): Promise<void> {
	const ply = await createVariationPlyButton(node, false);

	if (node.ply % 2 === 1 && !blackStartsNewRow) {
		// Black reply — join the current white move's row.
		const rows = container.querySelectorAll('.analysis-mainline-row');
		rows[rows.length - 1]?.append(ply);
		return;
	}

	// Begin a new mainline row. White always does; a black reply does too when its white
	// move carries variations, splitting the pair so the reply sits below them.
	const row = document.createElement('div');
	row.className = 'move-row analysis-mainline-row';
	const num = document.createElement('span');
	num.className = 'move-num';
	num.textContent = node.ply % 2 === 0 ? String(node.ply / 2 + 1) : formatMoveIndex(node.ply);
	row.append(num);
	if (node.ply % 2 === 1) row.append(document.createElement('span')); // Empty white cell.
	row.append(ply);
	container.append(row);
}

async function appendVariationGroup(
	container: HTMLElement,
	children: AnalysisMoveNode[],
	depth: number,
): Promise<void> {
	for (const child of children) await appendVariationLine(container, child, depth);
}

/**
 * Renders one variation branch as one or more `.variation-line` segments. Wherever a move
 * along the branch has its own alternatives, the line is split: the segment so far is
 * flushed, those alternatives nest below it at depth+1, then the branch resumes in a fresh
 * continuation segment — so a sub-variation appears directly below the move it replaces,
 * in reading order, instead of dumped after the whole line.
 */
async function appendVariationLine(
	container: HTMLElement,
	head: AnalysisMoveNode,
	depth: number,
): Promise<void> {
	let node: AnalysisMoveNode | undefined = head;
	let segment = createVariationSegment(depth, false);
	let showIndex = true;

	while (node) {
		segment.line.append(await createVariationPlyButton(node, showIndex || node.ply % 2 === 0));
		showIndex = false;

		// Alternatives to THIS move (its variation siblings). The head's are its fork-siblings,
		// already rendered by the enclosing group, so they're skipped here.
		const siblingAlts = node === head ? [] : getVariationChildren(node.parent!);
		const next = getMainlineChild(node);
		// When this move's continuation was forced into a variation it has no mainline child;
		// its own variation children then branch from it with no row of their own above.
		const forcedContinuation = next ? [] : getVariationChildren(node);
		const alternatives = [...siblingAlts, ...forcedContinuation];

		if (alternatives.length > 0) {
			container.append(segment.variation); // Flush the segment ending at this move.
			await appendVariationGroup(container, alternatives, depth + 1);
			if (!next) return; // Nothing left to continue.
			segment = createVariationSegment(depth, true);
			showIndex = true;
		}
		node = next;
	}
	container.append(segment.variation);
}

/** Builds an empty `.analysis-variation` block (rail + line) at the given depth. */
function createVariationSegment(
	depth: number,
	isContinuation: boolean,
): { variation: HTMLElement; line: HTMLElement } {
	const variation = document.createElement('div');
	variation.className = 'analysis-variation';
	if (isContinuation) variation.classList.add('variation-continuation');
	variation.style.setProperty('--variation-depth', String(depth));

	const rail = document.createElement('span');
	rail.className = 'variation-rail';
	const line = document.createElement('div');
	line.className = 'variation-line';
	variation.append(rail, line);

	return { variation, line };
}

function getMainlineChild(node: AnalysisMoveNode): AnalysisMoveNode | undefined {
	const child = node.children[0];
	return child?.forceVariation ? undefined : child;
}

function getVariationChildren(node: AnalysisMoveNode): AnalysisMoveNode[] {
	const first = node.children[0];
	return first?.forceVariation ? node.children : node.children.slice(1);
}

function openAnalysisContextMenu(e: MouseEvent, node: AnalysisMoveNode): void {
	e.preventDefault();
	e.stopPropagation();
	closeAnalysisContextMenu();

	const menu = document.createElement('div');
	menu.className = 'analysis-context-menu';
	const title = document.createElement('div');
	title.className = 'analysis-context-title';
	const moveIndex = formatMoveIndex(node.ply);
	const moveText = icnconverter.getShortFormMoveFromMove(node.move!, {
		compact: false,
		spaces: false,
		comments: false,
		abbrev: false,
	});
	title.textContent = `${moveIndex} ${moveText}`;
	menu.append(title);

	const parent = node.parent;
	const isMainline = analysismovetree.isMainLine(node);
	if (parent && parent.children[0] !== node)
		menu.append(
			createContextAction('Promote variation', () => {
				analysismovetree.promoteAtFork(node);
				syncAnalysisTreeAfterAction(node);
			}),
		);
	if (!isMainline)
		menu.append(
			createContextAction('Make main line', () => {
				analysismovetree.makeMainLine(node);
				syncAnalysisTreeAfterAction(node);
			}),
		);
	if (parent && parent.children[0] === node && !node.forceVariation)
		menu.append(
			createContextAction('Force variation', () => {
				analysismovetree.forceVariation(node);
				syncAnalysisTreeAfterAction(node);
			}),
		);
	if (parent)
		menu.append(createContextAction('Delete from here', () => deleteAnalysisNode(node)));

	document.body.append(menu);
	contextMenu = menu;
	positionContextMenu(menu, e);

	setTimeout(() => {
		document.addEventListener('click', closeAnalysisContextMenu, { once: true });
		document.addEventListener('keydown', closeContextMenuOnEscape);
	}, 0);
}

function createContextAction(label: string, onClick: () => void): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.textContent = label;
	button.addEventListener('click', (e) => {
		e.stopPropagation();
		closeAnalysisContextMenu();
		onClick();
	});
	return button;
}

function syncAnalysisTreeAfterAction(target: AnalysisMoveNode): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return;
	navigateToAnalysisNode(gamefile, target);
	enqueueRender(reconcileAnalysisMovesTable);
}

/**
 * Deletes `node` (and its subtree). If the currently-viewed position was inside that
 * subtree, we navigate back to the deletion point's parent — the latest still-valid
 * position — which rebuilds the board, legal moves, and engine analysis (arrows clear
 * and recompute) for it. If we were before/elsewhere, we stay put; only the flat move
 * list (its now-rerouted continuation) and the move tree are resynced.
 */
function deleteAnalysisNode(node: AnalysisMoveNode): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return;

	const current = analysismovetree.getCurrentNode(gamefile);
	const viewingDeleted = current !== undefined && analysismovetree.isInSubtree(node, current);

	const parent = analysismovetree.deleteNode(node);
	if (!parent) return; // Can't delete the root.

	if (viewingDeleted) {
		syncAnalysisTreeAfterAction(parent); // Fall back to the latest valid position.
	} else {
		// Stay on the current move; just resync the flat list to the (possibly rerouted)
		// active line and re-render the tree. The viewed position — and its analysis — is
		// unchanged, so we leave the engine and board where they are.
		gamefile.moves = analysismovetree.getMovesFromLine(analysismovetree.getActiveLine());
		updateNavButtons();
		enqueueRender(reconcileAnalysisMovesTable);
	}
}

function positionContextMenu(menu: HTMLElement, e: MouseEvent): void {
	const margin = 4;
	const width = menu.offsetWidth + margin;
	const height = menu.offsetHeight + margin;
	menu.style.left = `${Math.min(e.pageX, window.scrollX + window.innerWidth - width)}px`;
	menu.style.top = `${Math.min(e.pageY, window.scrollY + window.innerHeight - height)}px`;
}

function closeAnalysisContextMenu(): void {
	contextMenu?.remove();
	contextMenu = undefined;
	document.removeEventListener('click', closeAnalysisContextMenu);
	document.removeEventListener('keydown', closeContextMenuOnEscape);
}

function closeContextMenuOnEscape(e: KeyboardEvent): void {
	if (e.key === 'Escape') closeAnalysisContextMenu();
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

	const gamefile = gameslot.getGamefile()!;
	if (gamesession.getGameType() === 'analysis') {
		const node = analysismovetree.getCurrentNode(gamefile);
		const current = node
			? element_MovesTable.querySelector<HTMLElement>(`.ply[data-node-id="${node.id}"]`)
			: undefined;
		if (current) {
			current.classList.add('current');
			centerPly(current);
		}
		return;
	}

	const moveIndex = gamefile.state.local.moveIndex;

	const current = getPlyElement(moveIndex);
	if (!current) return;
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

function navigateToAnalysisNode(gamefile: GameFile, node: AnalysisMoveNode): void {
	const mesh = gameslot.getMesh();
	premoves.cancelPremoves(gamefile, mesh);

	const newLine = analysismovetree.getLineForNode(node);
	const newMoves = analysismovetree.getMovesFromLine(newLine);
	const targetIndex = analysismovetree.getNodeMoveIndex(node);

	frametracker.onVisualChange();

	// Rewind the board fully to the start along the CURRENT line first, so its state is
	// a clean slate before we swap in the (possibly divergent) new line. This is all
	// synchronous, so the intermediate positions never actually render — avoiding the
	// fragile shared-prefix index math that could point outside the current move list.
	if (gamefile.state.local.moveIndex >= 0) movesequence.viewStart(gamefile, mesh);

	// Swap the flat move list to the chosen branch, then replay forward to the node.
	analysismovetree.setActiveLineToNode(node);
	gamefile.moves = newMoves;

	if (targetIndex >= 0) movesequence.viewIndex(gamefile, mesh, targetIndex);
	else GameBus.dispatch('view-move'); // Root node — already at the start.

	updateNavButtons();
	selection.unselectPiece();
	animation.clearAnimations();
}

// Keep the table in sync: fill it from the freshly-loaded game (moves baked into the
// gamefile bypass 'moves-changed'), reconcile on move-list changes & navigation, scroll
// to the banner on conclusion. All queued so they apply in order despite async silhouette fetches.
GameBus.addEventListener('game-loaded', () => {
	if (gamesession.getGameType() === 'analysis')
		analysismovetree.initFromGame(gameslot.getGamefile()!);
	enqueueRender(reconcileMovesTable);
});
GameBus.addEventListener('moves-changed', () => {
	if (gamesession.getGameType() === 'analysis') {
		analysismovetree.syncAfterMovesChanged(gameslot.getGamefile()!);
	}
	enqueueRender(reconcileMovesTable);
});
GameBus.addEventListener('view-move', () => enqueueRender(updateCurrentPly));
GameBus.addEventListener('game-unloaded', () => analysismovetree.clear());
GameBus.addEventListener('game-concluded', () => enqueueRender(scrollMovesTableToBottom));

// ===========================================================================

export default {
	update,
	updateNavButtons,
};
