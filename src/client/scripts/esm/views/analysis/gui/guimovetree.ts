// src/client/scripts/esm/views/analysis/gui/guimovetree.ts

/**
 * Analysis-page extension of the moves panel: renders the move TREE (mainline plus
 * nested variations) into the shared `.moves-table`, with click-to-navigate, a
 * current-node highlight, and a right-click context menu for promoting / demoting /
 * deleting branches. Registers itself with `guimoveslist` on import, which then
 * delegates all rendering here in place of its flat move list. Imported only by the
 * analysis page, so no move-tree code reaches the game page.
 */

import type { VNode } from 'snabbdom';
import type { GameFile } from '../../../../../../shared/chess/logic/gamefile.js';
import type { MoveFull } from '../../../../../../shared/chess/logic/movepiece.js';
import type { GameConclusion } from '../../../../../../shared/chess/util/winconutil.js';
import type { AnalysisMoveNode } from '../movetree.js';

import { attributesModule, h, init } from 'snabbdom';

import movepiece from '../../../../../../shared/chess/logic/movepiece.js';
import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter.js';
import wincondition from '../../../../../../shared/chess/logic/wincondition.js';
import movevalidation from '../../../../../../shared/chess/logic/movevalidation.js';

import movetree from '../movetree.js';
import gameslot from '../../../game/chess/gameslot.js';
import gamecore from '../../../game/chess/gamecore.js';
import guiclock from '../../../game/gui/guiclock.js';
import premoves from '../../../game/chess/premoves.js';
import svgcache from '../../../chess/rendering/svgcache.js';
import moveevals from '../moveevals.js';
import selection from '../../../game/chess/selection.js';
import gamereview from '../gamereview.js';
import gamesession from '../../../game/chess/gamesession.js';
import piecemodels from '../../../game/rendering/piecemodels.js';
import { GameBus } from '../../../game/GameBus.js';
import frametracker from '../../../game/rendering/frametracker.js';
import movesequence from '../../../game/chess/movesequence.js';
import guimoveslist from '../../../game/gui/guimoveslist.js';

// State ---------------------------------------------------------------------------------------

/** The open right-click context menu, if any. */
let contextMenu: HTMLElement | undefined;

/** Maps each rendered ply's node id back to its node, for the delegated click/right-click handlers. */
const idToNode = new Map<number, AnalysisMoveNode>();

// Rendering ----------------------------------------------------------------------------------

const patch = init([attributesModule]);

/**
 * The persistent host snabbdom patches into, sitting just above the result banner so the banner
 * stays at the bottom of the table. Its id lets the first patch adopt it in place (keeping our
 * delegated listeners) instead of replacing it.
 */
const element_tree = document.createElement('div');
element_tree.id = 'analysis-move-tree';
guimoveslist.element_MovesTable.insertBefore(element_tree, guimoveslist.element_GameResult);
let treeVNode: VNode | Element = element_tree;

// Delegated once on the host: every ply carries its node id, so clicks/right-clicks resolve the
// node from `idToNode` rather than each ply binding its own listeners (rebuilt on every patch).
element_tree.addEventListener('click', (e) =>
	withPlyNode(e, (node, ply) => {
		ply.blur();
		navigateToNode(node);
	}),
);
element_tree.addEventListener('contextmenu', (e) =>
	withPlyNode(e, (node, ply) => {
		ply.blur(); // Drop the focus right-click gave it, else Escape later draws a focus-visible ring.
		openAnalysisContextMenu(e, node);
	}),
);

/** Resolves the ply (and its node) an event landed on, running `fn` when one is found. */
function withPlyNode(e: Event, fn: (node: AnalysisMoveNode, ply: HTMLElement) => void): void {
	const ply = (e.target as HTMLElement).closest<HTMLElement>('.ply[data-node-id]');
	if (!ply) return;
	const node = idToNode.get(Number(ply.dataset['nodeId']));
	if (node) fn(node, ply);
}

/** Rebuilds the tree vtree from the move tree's current state and patches in only what changed. */
function reconcileMoveTree(): void {
	const gamefile = gameslot.getGamefile()!;
	if (!movetree.isReady()) movetree.initFromGame(gamefile);
	movetree.syncAfterMovesChanged(gamefile);

	idToNode.clear();
	const root = movetree.getRoot()!;
	treeVNode = patch(treeVNode, h('div#analysis-move-tree', buildMainline(root)));
	highlightCurrentNode();
	scrollToCurrentNode();
}

/**
 * Empties the rendered tree on unload. Node ids restart per game, so surviving plies would be
 * reused by the next game's patch — keeping decoration snabbdom never applied and can't remove.
 */
function clearMoveTree(): void {
	movetree.clear();
	idToNode.clear();
	treeVNode = patch(treeVNode, h('div#analysis-move-tree', []));
}

/** The ply element for the currently-viewed node, or undefined (the root has none). */
function getCurrentNodePly(): HTMLElement | undefined {
	const node = movetree.getCurrentNode(gameslot.getGamefile()!);
	if (!node) return undefined;
	return guimoveslist.element_MovesTable.querySelector<HTMLElement>(`.ply[data-node-id="${node.id}"]`) ?? undefined; // prettier-ignore
}

/** Highlights the ply for the currently-viewed node. Does NOT scroll — see {@link scrollToCurrentNode}. */
function highlightCurrentNode(): void {
	// Clear any stale highlight: a snabbdom patch reuses unchanged plies, so the previous
	// current-ply class survives the rebuild and must be dropped before re-marking.
	guimoveslist.element_MovesTable.querySelector('.ply.current')?.classList.remove('current');
	getCurrentNodePly()?.classList.add('current');
}

/** Scrolls the currently-viewed node's ply into view — for navigation that should follow it. */
function scrollToCurrentNode(): void {
	const current = getCurrentNodePly();
	if (!current) {
		// The root (start-of-game position) has no rendered ply button; scroll to the top.
		if (gameslot.getGamefile()!.state.local.moveIndex === -1)
			guimoveslist.scrollMovesTableToTop();
		return;
	}
	guimoveslist.centerPly(current);
}

/**
 * Builds a tree `.ply` vnode for `node`, keyed by its node id so promote/demote/delete reorder
 * the existing button instead of rebuilding it. The silhouette (cloned from cache) is added once
 * in the `insert` hook — never on reuse — while review decoration re-derives on `update` too,
 * so a ply that changes mainline status (its `data-mainline`) refreshes its inline eval label.
 */
function buildPlyVNode(node: AnalysisMoveNode, showIndex: boolean): VNode {
	idToNode.set(node.id, node);
	const { title, coord, rawType } = guimoveslist.getPlyDisplay(node.move!);

	const children: VNode[] = [];
	if (showIndex) children.push(h('span.move-index', formatMoveIndex(node.ply)));
	children.push(h('span.move-coord', coord));

	const attrs: Record<string, string> = { title, 'data-node-id': String(node.id) };
	// The inline eval label is only shown on the mainline (see decoratePlyWithReview) —
	// stash this so decoration, which later only has the node id, can tell them apart.
	if (movetree.isMainLine(node)) attrs['data-mainline'] = '1';

	return h(
		'button.ply.analysis-ply',
		{
			key: node.id,
			attrs,
			hook: {
				insert: (vnode) => {
					const ply = vnode.elm as HTMLElement;
					const silhouette = svgcache.getCachedSilhouetteSVG(rawType);
					silhouette.classList.add('move-piece');
					ply.insertBefore(silhouette, ply.querySelector('.move-coord')); // Before the coord text.
					decoratePlyWithReview(ply, node.id);
				},
				update: (_oldVnode, vnode) =>
					decoratePlyWithReview(vnode.elm as HTMLElement, node.id),
			},
		},
		children,
	);
}

/** Formats a ply index as a move label — `3.` for a white move, `3...` for a black one. */
function formatMoveIndex(index: number): string {
	const fullMove = Math.floor(index / 2) + 1;
	return index % 2 === 0 ? `${fullMove}.` : `${fullMove}...`;
}

/**
 * Walks the mainline from `from`, building each move's row vnode and the
 * variation branches beneath it, in top-to-bottom reading order.
 */
function buildMainline(from: AnalysisMoveNode): VNode[] {
	const out: VNode[] = [];
	// The open mainline row's children, or null between rows. A white ply's black reply joins
	// this same row unless variations split the pair, so the row stays open across iterations.
	let rowChildren: VNode[] | null = null;
	const flushRow = (): void => {
		if (rowChildren) out.push(h('div.move-row.analysis-mainline-row', rowChildren));
		rowChildren = null;
	};

	let node = getMainlineChild(from);
	// Whether the white move just placed has variations rendered beneath it — its black
	// reply must then start a fresh row so the variations stay ordered below their branch move.
	let whiteHadVariations = false;
	let last = from;
	while (node) {
		// The variations that branch off as alternatives to THIS move; they render
		// directly below the move so a variation never appears above the move it replaces.
		const variations = getVariationChildren(node.parent!);
		const ply = buildPlyVNode(node, false);

		if (node.ply % 2 === 1 && !whiteHadVariations) {
			// Black reply — join the open white move's row.
			rowChildren!.push(ply);
		} else {
			// Begin a new mainline row. White always does; a black reply does too when its white
			// move carried variations, splitting the pair so the reply sits below them.
			flushRow();
			const numText =
				node.ply % 2 === 0 ? String(node.ply / 2 + 1) : formatMoveIndex(node.ply);
			rowChildren = [h('span.move-num', numText)];
			if (node.ply % 2 === 1) rowChildren.push(h('span')); // Empty white cell.
			rowChildren.push(ply);
		}

		// Variations render directly below this move, so close its row before them.
		if (variations.length > 0) {
			flushRow();
			out.push(...buildVariationGroup(variations, 1));
		}
		whiteHadVariations = node.ply % 2 === 0 && variations.length > 0;
		last = node;
		node = getMainlineChild(node);
	}
	flushRow();

	// The last node's own variation children — including any forced move that truncated the
	// walk — branch from it with no move row above, so render them beneath it. (When the whole
	// mainline is forced away, last is the root.)
	out.push(...buildVariationGroup(getVariationChildren(last), 1));
	return out;
}

/** Builds each of `children` as its own variation branch at the given depth. */
function buildVariationGroup(children: AnalysisMoveNode[], depth: number): VNode[] {
	return children.flatMap((child) => buildVariationLine(child, depth));
}

/**
 * Builds one variation branch as one or more `.variation-line` segments. Wherever a move
 * along the branch has its own alternatives, the line is split: the segment so far is
 * flushed, those alternatives nest below it at depth+1, then the branch resumes in a fresh
 * continuation segment — so a sub-variation appears directly below the move it replaces,
 * in reading order, instead of dumped after the whole line.
 */
function buildVariationLine(head: AnalysisMoveNode, depth: number): VNode[] {
	const out: VNode[] = [];
	let node: AnalysisMoveNode | undefined = head;
	let lineChildren: VNode[] = [];
	let isContinuation = false;
	let showIndex = true;
	const flushSegment = (): void => {
		out.push(buildVariationSegment(depth, isContinuation, lineChildren));
	};

	while (node) {
		lineChildren.push(buildPlyVNode(node, showIndex || node.ply % 2 === 0));
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
			flushSegment(); // Flush the segment ending at this move.
			out.push(...buildVariationGroup(alternatives, depth + 1));
			if (!next) return out; // Nothing left to continue.
			lineChildren = [];
			isContinuation = true;
			showIndex = true;
		}
		node = next;
	}
	flushSegment();
	return out;
}

/** Builds an `.analysis-variation` block (rail + line) at the given depth around its plies. */
function buildVariationSegment(depth: number, isContinuation: boolean, line: VNode[]): VNode {
	const sel = isContinuation
		? 'div.analysis-variation.variation-continuation'
		: 'div.analysis-variation';
	return h(sel, { attrs: { style: `--variation-depth: ${depth}` } }, [
		h('span.variation-rail'),
		h('div.variation-line', line),
	]);
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
			// Always land between the move coord and the eval label — an eval label can already
			// be there (interactive analysis can label a ply before the review classifies it,
			// while the review is still running), and a bare append would land after it.
			const existingEval = ply.querySelector('.review-eval');
			if (existingEval) ply.insertBefore(glyph, existingEval);
			else ply.append(glyph);
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
	reconcileMoveTree();
}

/**
 * Deletes `node` (and its subtree). If the currently-viewed position was inside that
 * subtree, we navigate back to the deletion point's parent — the latest still-valid
 * position — which rebuilds the board, legal moves, and engine analysis (arrows clear
 * and recompute) for it. If we were before/elsewhere, we stay put. Either way the flat
 * move list (its now-shortened active line) and the move tree are resynced.
 */
function deleteAnalysisNode(node: AnalysisMoveNode): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return;

	const current = movetree.getCurrentNode(gamefile);
	const viewingDeleted = current !== undefined && movetree.isInSubtree(node, current);

	const parent = movetree.deleteNode(node);
	if (!parent) return; // Can't delete the root.

	// Fall back to the latest valid position first, while the flat list is still full —
	// navigation rewinds the board along it, so it must run before we truncate below.
	if (viewingDeleted) navigateToAnalysisNode(gamefile, parent);

	// Resync the flat list to the shortened active line — navigation's in-branch path leaves
	// gamefile.moves untouched, so reconcile would otherwise re-graft the deleted moves.
	gamefile.moves = movetree.getMovesFromLine(movetree.getActiveLine());
	// Realign the conclusion too, since the front may have changed.
	gamefile.gameConclusion = movetree.getActiveLineConclusion();
	GameBus.dispatch('moves-changed');
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
	// A node detached from the tree has no valid line to navigate — bail rather than corrupt
	// the flat move list. Happens when a game review holds mainline nodes captured at its start
	// and the user deletes a mainline move (e.g. clicking the eval graph or a lapse stat after).
	const root = movetree.getRoot();
	if (!root || !movetree.isInSubtree(root, node)) return;

	const mesh = gameslot.getMesh();
	premoves.cancelPremoves(gamefile, mesh);

	// gameConclusion is a global state that belongs to the active line's front. Snapshot the
	// branch we're leaving before swapping lines, then restore the target branch's own conclusion
	// once its line is active — otherwise a decisive line's conclusion would bleed onto branches
	// that don't end the game.
	movetree.storeActiveLineConclusion(gamefile.gameConclusion);

	const targetIndex = node.ply;
	frametracker.onVisualChange();

	// A line is a unique root→front path, so the active line already IS the target's line exactly
	// when they share a front node — only then is this an in-branch move needing no swap. (Sharing
	// the prefix before the current branch's fork isn't enough — that still needs the swap.)
	const targetLine = movetree.getLineForNode(node);
	const activeLine = movetree.getActiveLine();
	const sameBranch = activeLine[activeLine.length - 1] === targetLine[targetLine.length - 1];

	if (sameBranch) {
		// In-branch: go straight there; viewIndex animates the final ply.
		movesequence.viewIndex(gamefile, mesh, targetIndex, true);
	} else {
		// Cross-branch: rewind along the current line only to the shared fork ply, swap in the target
		// branch, then replay forward. The final transition animates — the forward leg, or the rewind
		// itself when the target IS the fork (a pure rewind).
		const currentNode = movetree.getCurrentNode(gamefile)!;
		const forkPly = movetree.getCommonAncestorPly(currentNode, node);
		const willForward = targetIndex > forkPly;
		movesequence.viewIndex(gamefile, mesh, forkPly, !willForward);

		movetree.setActiveLineToNode(node);
		gamefile.moves = movetree.getMovesFromLine(targetLine);
		gamefile.gameConclusion = movetree.getActiveLineConclusion();

		movesequence.viewIndex(gamefile, mesh, targetIndex, true); // No-op when the target is the fork itself
	}

	// Re-highlight whoever's turn it is at the new branch's front.
	guiclock.updateTempo(gamefile);

	selection.unselectPiece();
}

// Registration ------------------------------------------------------------------

guimoveslist.registerRenderer({
	reconcile: reconcileMoveTree,
	updateCurrentPly: highlightCurrentNode,
	scrollToCurrentPly: scrollToCurrentNode,
	onGameLoaded: () => movetree.initFromGame(gameslot.getGamefile()!),
	onMovesChanged: () => movetree.syncAfterMovesChanged(gameslot.getGamefile()!),
	onGameUnloaded: clearMoveTree,
});

// Game Review API -----------------------------------------------------------------------

/**
 * Navigates the board to the given move-tree node (the review graph's click-to-jump).
 * Clicking an already-selected node zooms to its destination coordinate — the same
 * behavior a ply button gives when clicked again (see createVariationPlyButton).
 */
function navigateToNode(node: AnalysisMoveNode, scrollIntoView = false): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile || gamesession.isLoading()) return;
	const wasAlreadySelected = movetree.getCurrentNode(gamefile) === node;
	navigateToAnalysisNode(gamefile, node);
	// The root (starting position, ply -1) has no move/destination square to zoom to.
	if (wasAlreadySelected && node.ply >= 0) guimoveslist.zoomToPlyDestination(gamefile, node.ply);
	if (scrollIntoView) scrollToCurrentNode();
}

/**
 * Grafts a legal line of move tokens onto the tree as a variation beneath `parent`.
 * Purely logical — the viewed move never changes, so this makes no mesh changes, and the
 * move list is repainted just once per synchronous batch (scheduleReconcile).
 */
function addVariation(parent: AnalysisMoveNode, tokens: string[]): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile || gamesession.isLoading() || tokens.length === 0) return;
	// A caller may hold a node captured earlier (e.g. a game review's mainline nodes). Deleting a
	// move can orphan that node's subtree, so `parent` may no longer be attached to the tree —
	// skip it rather than graft onto a detached node.
	const root = movetree.getRoot();
	if (!root || !movetree.isInSubtree(root, parent)) return;
	if (parent.children.some((child) => child.move?.token === tokens[0])) return;

	const { moves, conclusion } = generateVariationMoves(gamefile, parent, tokens);
	if (moves.length === 0) return;
	movetree.appendVariation(parent, moves, conclusion);

	scheduleReconcile();
}

/**
 * Generates a legal PV as a fresh sequence of MoveFull objects branching from `parent`, entirely
 * on the logical board — no mesh updates, no move-list events. The board and its active move list
 * are left exactly as they were: fully rewound to the start first (so the swapped-in line never
 * unapplies a move it doesn't contain), replayed to the parent to generate the branch, then
 * restored to the viewed move.
 */
function generateVariationMoves(
	gamefile: GameFile,
	parent: AnalysisMoveNode,
	pv: string[],
): { moves: MoveFull[]; conclusion: GameConclusion | undefined } {
	const restoreMoves = gamefile.moves;
	const restoreIndex = gamefile.state.local.moveIndex;
	const restoreConclusion = gamefile.gameConclusion;

	// Position the logical board at the parent along a throwaway copy of its line.
	applyToIndex(gamefile, -1);
	gamefile.moves = movetree.getMovesToNode(parent);
	applyToIndex(gamefile, parent.ply);

	const moves: MoveFull[] = [];
	let conclusion: GameConclusion | undefined;
	for (const token of pv) {
		const result = movevalidation.isTokenMoveLegal(gamefile, token);
		if (!result.valid) {
			console.warn(
				`Analysis: illegal move "${token}" when adding variation, stopping at ply ${parent.ply + moves.length + 1}`,
			);
			console.warn('Entire pv:', pv);
			break;
		}
		moves.push(movepiece.generateAndMakeMove(gamefile, result.tagged));
		conclusion = wincondition.getGameConclusion(gamefile);
		if (conclusion) break; // The line ends the game — stop extending it.
	}

	// Restore the viewed position and its move list exactly as they were.
	applyToIndex(gamefile, -1);
	gamefile.moves = restoreMoves;
	applyToIndex(gamefile, restoreIndex);
	gamefile.gameConclusion = restoreConclusion;

	// A PV promotion can reallocate the piece arrays; the mesh — which we deliberately never touch
	// — must then be rebuilt once so its buffers match, otherwise later navigation renders stale
	// pieces. Same position, so it's not a visual change; the only mesh work a review ever does.
	const mesh = gameslot.getMesh();
	if (mesh && gamefile.pieces.newlyRegenerated)
		piecemodels.regenAll(gamecore.getGameContext(), gamefile, mesh);

	return { moves, conclusion };
}

/** Logically steps the board to `index` — no mesh, no events (analysis moves are always global). */
function applyToIndex(gamefile: GameFile, index: number): void {
	const forward = index >= gamefile.state.local.moveIndex;
	movepiece.goToMove(gamefile, index, (move) =>
		movepiece.applyMove(gamefile, move, forward, true),
	);
}

/**
 * Coalesces move-tree repaints: many variations grafted in one synchronous pass (restoring a
 * cached review) collapse to a single repaint, while variations arriving across separate turns
 * (a live review) each repaint as they land.
 */
let reconcilePending = false;
function scheduleReconcile(): void {
	if (reconcilePending) return;
	reconcilePending = true;
	queueMicrotask(() => {
		reconcilePending = false;
		reconcileMoveTree();
	});
}

export default {
	navigateToNode,
	addVariation,
};
