// src/client/scripts/esm/views/analysis/gui/guimovetree.ts

/**
 * Analysis-page extension of the moves panel: renders the move TREE (mainline plus
 * nested variations) into the shared `.moves-table`, with click-to-navigate, a
 * current-node highlight, and a right-click context menu for promoting / demoting /
 * deleting branches. Registers itself with `guimoveslist` on import, which then
 * delegates all rendering here in place of its flat move list. Imported only by the
 * analysis page, so no move-tree code reaches the game page.
 */

import type { GameFile } from '../../../../../../shared/chess/logic/gamefile.js';
import type { MoveReview } from '../gamereview.js';
import type { AnalysisMoveNode } from '../movetree.js';

import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter.js';
import movevalidation from '../../../../../../shared/chess/logic/movevalidation.js';

import movetree from '../movetree.js';
import gameslot from '../../../game/chess/gameslot.js';
import premoves from '../../../game/chess/premoves.js';
import moveevals from '../moveevals.js';
import selection from '../../../game/chess/selection.js';
import animation from '../../../game/rendering/animation.js';
import gamereview from '../gamereview.js';
import gamesession from '../../../game/chess/gamesession.js';
import { GameBus } from '../../../game/GameBus.js';
import frametracker from '../../../game/rendering/frametracker.js';
import movesequence from '../../../game/chess/movesequence.js';
import guimoveslist from '../../../game/gui/guimoveslist.js';

// State ---------------------------------------------------------------------------------------

/** Plies of the engine's best line shown as a variation beneath a reviewed blunder. */
const BLUNDER_VARIATION_MAX_PLIES = 6;

/** The open right-click context menu, if any. */
let contextMenu: HTMLElement | undefined;

// Rendering ----------------------------------------------------------------------------------

/** Rebuilds the whole tree from the move tree's current state. */
async function reconcileMoveTree(): Promise<void> {
	const gamefile = gameslot.getGamefile()!;
	if (!movetree.isReady()) movetree.initFromGame(gamefile);
	movetree.syncAfterMovesChanged(gamefile);

	guimoveslist.clearRenderedMoves();

	const tree = document.createElement('div');
	const root = movetree.getRoot()!;

	await appendAnalysisMainline(tree, root);

	guimoveslist.element_MovesTable.insertBefore(tree, guimoveslist.element_GameResult);
	highlightCurrentNode();
}

/** Highlights the ply for the currently-viewed node and scrolls it into view. */
function highlightCurrentNode(): void {
	const gamefile = gameslot.getGamefile()!;
	const node = movetree.getCurrentNode(gamefile);
	const current = node
		? guimoveslist.element_MovesTable.querySelector<HTMLElement>(`.ply[data-node-id="${node.id}"]`) : undefined; // prettier-ignore
	if (!current) return;
	current.classList.add('current');
	guimoveslist.centerPly(current);
}

/**
 * Builds a tree `.ply` button for `node`: its node id, an
 * optional move-index label, and click/right-click handlers.
 */
async function createVariationPlyButton(
	node: AnalysisMoveNode,
	showIndex: boolean,
): Promise<HTMLButtonElement> {
	const ply = await guimoveslist.buildPlyButton(node.move!, ['analysis-ply']);
	ply.dataset['nodeId'] = String(node.id);
	// The inline eval label is only shown on the mainline (see decoratePlyWithReview) —
	// stash this at build time since decoration later only has the node id, not the node.
	if (movetree.isMainLine(node)) ply.dataset['mainline'] = '1';

	if (showIndex) {
		const index = document.createElement('span');
		index.classList.add('move-index');
		index.textContent = formatMoveIndex(node.ply);
		ply.insertBefore(index, ply.firstChild); // Before the silhouette.
	}

	ply.addEventListener('click', () => {
		ply.blur();
		if (gamesession.isLoading()) return;

		const gamefile = gameslot.getGamefile()!;
		const wasAlreadySelected = movetree.getCurrentNode(gamefile) === node;
		navigateToAnalysisNode(gamefile, node);
		if (wasAlreadySelected) guimoveslist.zoomToPlyDestination(gamefile, node.ply);
	});
	ply.addEventListener('contextmenu', (e) => {
		ply.blur(); // Drop the focus right-click gave it, else Escape later draws a focus-visible ring.
		openAnalysisContextMenu(e, node);
	});

	decoratePlyWithReview(ply, node.id);

	return ply;
}

/** Formats a ply index as a move label — `3.` for a white move, `3...` for a black one. */
function formatMoveIndex(index: number): string {
	const fullMove = Math.floor(index / 2) + 1;
	return index % 2 === 0 ? `${fullMove}.` : `${fullMove}...`;
}

/**
 * Walks the mainline from `from`, rendering each
 * move's row and the variations branching beneath it.
 */
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

/** Renders one mainline ply, either joining the current white move's row or starting a new one. */
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
	const numText = node.ply % 2 === 0 ? String(node.ply / 2 + 1) : formatMoveIndex(node.ply);
	const row = guimoveslist.createMoveRow(numText, ['analysis-mainline-row']);
	if (node.ply % 2 === 1) row.append(document.createElement('span')); // Empty white cell.
	row.append(ply);
	container.append(row);
}

/** Renders each of `children` as its own variation branch at the given depth. */
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
	variation.classList.add('analysis-variation');
	if (isContinuation) variation.classList.add('variation-continuation');
	variation.style.setProperty('--variation-depth', String(depth));

	const rail = document.createElement('span');
	rail.classList.add('variation-rail');
	const line = document.createElement('div');
	line.classList.add('variation-line');
	variation.append(rail, line);

	return { variation, line };
}

/** The node's mainline continuation, or undefined when its first child is forced into a variation. */
function getMainlineChild(node: AnalysisMoveNode): AnalysisMoveNode | undefined {
	const child = node.children[0];
	return child?.forceVariation ? undefined : child;
}

/** The node's variation children — every alternative to its mainline continuation. */
function getVariationChildren(node: AnalysisMoveNode): AnalysisMoveNode[] {
	const first = node.children[0];
	return first?.forceVariation ? node.children : node.children.slice(1);
}

// Game review decoration -----------------------------------------------------------------------

// Annotate a ply's element in place the moment its move classifies, so the list
// colors gradually while the review runs (re-renders re-decorate via build).
gamereview.onClassified((review) => decorateNodeById(review.nodeId));
moveevals.onLabel(decorateNodeById);

/** Re-decorates the rendered ply for `nodeId`, if it's currently in the tree. */
function decorateNodeById(nodeId: number): void {
	const ply = guimoveslist.element_MovesTable.querySelector<HTMLElement>(
		`.ply[data-node-id="${nodeId}"]`,
	);
	if (ply) decoratePlyWithReview(ply, nodeId);
}

/**
 * Applies the move's review classification to its ply button: a `review-<key>` color
 * class, a tooltip, and — for lapses (inaccuracy/mistake/blunder) — a visible glyph.
 */
function decoratePlyWithReview(ply: HTMLElement, nodeId: number): void {
	const review = gamereview.getReviewForNode(nodeId);
	if (review?.classification && !ply.classList.contains(`review-${review.classification}`)) {
		const display = gamereview.CLASSIFICATION_DISPLAY[review.classification];
		ply.classList.add(`review-${review.classification}`);

		let label = display.label;
		if (!review.isBestMove && review.bestMove) label += ` — best was ${review.bestMove}`;
		ply.title = `${ply.title} · ${label}`;

		if (
			display.symbol &&
			(review.classification === 'inaccuracy' ||
				review.classification === 'mistake' ||
				review.classification === 'blunder')
		) {
			const glyph = document.createElement('span');
			glyph.classList.add('review-glyph');
			glyph.textContent = display.symbol;
			ply.append(glyph);
		}
	}

	// Inline eval labels are mainline-only — a variation's evaluated position isn't part of
	// the game's actual eval graph, and coordinate-notation lines are cramped enough already.
	const evalLabel = ply.dataset['mainline'] ? moveevals.get(nodeId) : undefined;
	if (evalLabel) {
		let evalElement = ply.querySelector<HTMLElement>('.review-eval');
		if (!evalElement) {
			evalElement = document.createElement('span');
			evalElement.classList.add('review-eval');
			ply.append(evalElement);
		}
		evalElement.textContent = formatEvalLabel(evalLabel);
		evalElement.title = `Evaluation at depth ${evalLabel.depth}`;
	} else {
		ply.querySelector('.review-eval')?.remove();
	}
}

/** Formats a white-POV score like lichess's inline move eval. */
function formatEvalLabel(label: { cp?: number; mate?: number }): string {
	if (label.mate !== undefined)
		return label.mate > 0 ? `#${label.mate}` : `#−${Math.abs(label.mate)}`;
	const pawns = (label.cp ?? 0) / 100;
	return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`.replace('-', '−');
}

// Context menu -------------------------------------------------------------------------------

/**
 * Opens the right-click menu for `node` with the applicable
 * promote / make-main / force-variation / delete actions.
 */
function openAnalysisContextMenu(e: MouseEvent, node: AnalysisMoveNode): void {
	e.preventDefault();
	e.stopPropagation();
	closeAnalysisContextMenu();

	const menu = document.createElement('div');
	menu.classList.add('analysis-context-menu');
	const title = document.createElement('div');
	title.classList.add('analysis-context-title');
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
	const isMainline = movetree.isMainLine(node);
	if (parent && parent.children[0] !== node)
		menu.append(
			createContextAction('Promote variation', () => {
				movetree.promoteAtFork(node);
				syncAnalysisTreeAfterAction(node);
			}),
		);
	if (!isMainline)
		menu.append(
			createContextAction('Make main line', () => {
				movetree.makeMainLine(node);
				syncAnalysisTreeAfterAction(node);
			}),
		);
	if (parent && parent.children[0] === node && !node.forceVariation)
		menu.append(
			createContextAction('Force variation', () => {
				movetree.forceVariation(node);
				syncAnalysisTreeAfterAction(node);
			}),
		);
	if (parent)
		menu.append(createContextAction('Delete from here', () => deleteAnalysisNode(node)));

	document.body.append(menu);
	contextMenu = menu;
	positionContextMenu(menu, e);

	// Dismiss on any pointerdown outside the menu (same as the actions menu / settings drawer)
	// or on Escape. A pointerdown inside is left for the button's own click to handle.
	document.addEventListener('pointerdown', closeContextMenuOnOutsidePointer);
	document.addEventListener('keydown', closeContextMenuOnEscape);
}

/** Builds one context-menu button that runs `onClick` then closes the menu. */
function createContextAction(label: string, onClick: () => void): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.textContent = label;
	button.addEventListener('click', () => {
		closeAnalysisContextMenu();
		onClick();
	});
	return button;
}

/** After a tree edit, navigates to `target` and re-renders the tree. */
function syncAnalysisTreeAfterAction(target: AnalysisMoveNode): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return;
	navigateToAnalysisNode(gamefile, target);
	guimoveslist.enqueueRender(reconcileMoveTree);
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

	const current = movetree.getCurrentNode(gamefile);
	const viewingDeleted = current !== undefined && movetree.isInSubtree(node, current);

	const parent = movetree.deleteNode(node);
	if (!parent) return; // Can't delete the root.

	if (viewingDeleted) {
		syncAnalysisTreeAfterAction(parent); // Fall back to the latest valid position.
	} else {
		// Stay on the current move; just resync the flat list to the (possibly rerouted)
		// active line and re-render the tree. The viewed position — and its analysis — is
		// unchanged, so we leave the engine and board where they are. The front may have
		// changed though (e.g. the old front was deleted), so realign the global conclusion.
		gamefile.moves = movetree.getMovesFromLine(movetree.getActiveLine());
		gamefile.gameConclusion = movetree.getActiveLineConclusion();
		guimoveslist.updateNavButtons();
		guimoveslist.enqueueRender(reconcileMoveTree);
	}
}

/** Places the menu at the cursor, clamped to stay within the viewport. */
function positionContextMenu(menu: HTMLElement, e: MouseEvent): void {
	const margin = 4;
	const width = menu.offsetWidth + margin;
	const height = menu.offsetHeight + margin;
	menu.style.left = `${Math.min(e.pageX, window.scrollX + window.innerWidth - width)}px`;
	menu.style.top = `${Math.min(e.pageY, window.scrollY + window.innerHeight - height)}px`;
}

/** Removes the open context menu and its dismissal listeners. */
function closeAnalysisContextMenu(): void {
	contextMenu?.remove();
	contextMenu = undefined;
	document.removeEventListener('pointerdown', closeContextMenuOnOutsidePointer);
	document.removeEventListener('keydown', closeContextMenuOnEscape);
}

/** Closes the menu on a pointerdown anywhere outside it (a press inside is left for the button's click). */
function closeContextMenuOnOutsidePointer(e: PointerEvent): void {
	if (e.target instanceof Node && contextMenu?.contains(e.target)) return;
	closeAnalysisContextMenu();
}

function closeContextMenuOnEscape(e: KeyboardEvent): void {
	if (e.key === 'Escape') closeAnalysisContextMenu();
}

// Navigation ---------------------------------------------------------------------------------

/**
 * Switches the active line to `node`'s branch and views
 * its position, restoring that branch's own conclusion.
 */
function navigateToAnalysisNode(gamefile: GameFile, node: AnalysisMoveNode): void {
	const mesh = gameslot.getMesh();
	premoves.cancelPremoves(gamefile, mesh);

	// gameConclusion is a global state that belongs to the active line's front. Snapshot the
	// branch we're leaving before swapping lines, then restore the target branch's own conclusion
	// once its line is active — otherwise a decisive line's conclusion would bleed onto branches
	// that don't end the game.
	movetree.storeActiveLineConclusion(gamefile.gameConclusion);

	const newLine = movetree.getLineForNode(node);
	const newMoves = movetree.getMovesFromLine(newLine);
	const targetIndex = node.ply;

	frametracker.onVisualChange();

	// Rewind the board fully to the start along the CURRENT line first, so its state is
	// a clean slate before we swap in the (possibly divergent) new line. This is all
	// synchronous, so the intermediate positions never actually render — avoiding the
	// fragile shared-prefix index math that could point outside the current move list.
	if (gamefile.state.local.moveIndex >= 0) movesequence.viewStart(gamefile, mesh);

	// Swap the flat move list to the chosen branch, then replay forward to the node.
	movetree.setActiveLineToNode(node);
	gamefile.moves = newMoves;
	gamefile.gameConclusion = movetree.getActiveLineConclusion();

	if (targetIndex >= 0) movesequence.viewIndex(gamefile, mesh, targetIndex);
	else GameBus.dispatch('view-move'); // Root node — already at the start.

	guimoveslist.updateNavButtons();
	selection.unselectPiece();
	animation.clearAnimations();
}

// Registration ------------------------------------------------------------------

guimoveslist.registerRenderer({
	reconcile: reconcileMoveTree,
	updateCurrentPly: highlightCurrentNode,
	onGameLoaded: () => movetree.initFromGame(gameslot.getGamefile()!),
	onMovesChanged: () => movetree.syncAfterMovesChanged(gameslot.getGamefile()!),
	onGameUnloaded: () => movetree.clear(),
});

// Game Review API -----------------------------------------------------------------------

/** Navigates the board to the given move-tree node (the review graph's click-to-jump). */
function navigateToNode(node: AnalysisMoveNode): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile || gamesession.isLoading()) return;
	navigateToAnalysisNode(gamefile, node);
}

/**
 * Adds the engine's best continuation as a variation before every reviewed blunder.
 * Capped at 6 plies (3 full moves) — enough to show why the move was better without
 * spelling out a whole alternate game — and also stopped at the first illegal or
 * terminal move. The viewer's current node is restored synchronously.
 */
function addBlunderVariations(): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile || gamesession.isLoading()) return;
	const restoreNode = movetree.getCurrentNode(gamefile) ?? movetree.getRoot();

	for (const review of gamereview.getReviews()) addBlunderVariationAtTree(review);

	if (restoreNode) navigateToAnalysisNode(gamefile, restoreNode);
	refresh();
}

/** Adds one newly-discovered blunder PV immediately while review is still running. */
function addBlunderVariation(review: MoveReview): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile || gamesession.isLoading()) return;
	const restoreNode = movetree.getCurrentNode(gamefile) ?? movetree.getRoot();
	if (!addBlunderVariationAtTree(review)) return;
	if (restoreNode) navigateToAnalysisNode(gamefile, restoreNode);
	refresh();
}

function addBlunderVariationAtTree(review: MoveReview): boolean {
	if (review.classification !== 'blunder' || !review.pv?.length) return false;
	const parent = gamereview.getMainlineNodes()[review.ply]?.parent;
	if (!parent) return false;
	// 6 plies (3 full moves): our coordinate notation is wider than lila's SAN, so a
	// 12-ply line would span ~4 rows instead of two. Enough to convey the better idea.
	const pv = review.pv.slice(0, BLUNDER_VARIATION_MAX_PLIES);
	if (parent.children.some((child) => child.move?.token === pv[0])) return false;
	addVariationAt(parent, pv);
	return true;
}

/** Appends one legal PV line below `parent`, retaining the existing mainline. */
function addVariationAt(parent: AnalysisMoveNode, tokens: string[]): void {
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh();
	navigateToAnalysisNode(gamefile, parent);

	// Pop gamefile.moves down to the parent so the PV appends as a fresh branch (the tree
	// keeps its old children). rewindMove only deletes from the front, so view front first.
	movetree.beginBranchFromViewedPosition(gamefile);
	const target = gamefile.state.local.moveIndex;
	movesequence.viewFront(gamefile, mesh);
	while (gamefile.state.local.moveIndex > target) movesequence.rewindMove(gamefile, mesh);

	for (const token of tokens) {
		const result = movevalidation.isTokenMoveLegal(gamefile, token);
		if (!result.valid) break;
		movesequence.makeMove(gamefile, mesh, result.tagged);
		if (gamefile.gameConclusion) break;
	}
}

/** Re-renders the whole move tree (e.g. to drop stale review decorations on a re-review). */
function refresh(): void {
	guimoveslist.enqueueRender(reconcileMoveTree);
}

export default {
	navigateToNode,
	addBlunderVariations,
	addBlunderVariation,
};
