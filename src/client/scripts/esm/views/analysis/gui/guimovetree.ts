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
import type { AnalysisMoveNode } from '../movetree.js';

import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter.js';

import movetree from '../movetree.js';
import gameslot from '../../../game/chess/gameslot.js';
import premoves from '../../../game/chess/premoves.js';
import selection from '../../../game/chess/selection.js';
import animation from '../../../game/rendering/animation.js';
import gamesession from '../../../game/chess/gamesession.js';
import { GameBus } from '../../../game/GameBus.js';
import frametracker from '../../../game/rendering/frametracker.js';
import movesequence from '../../../game/chess/movesequence.js';
import guimoveslist from '../../../game/gui/guimoveslist.js';

// State ---------------------------------------------------------------------------------------

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
	tree.classList.add('analysis-move-tree');
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
	if (current) {
		current.classList.add('current');
		guimoveslist.centerPly(current);
	}
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
	ply.addEventListener('contextmenu', (e) => openAnalysisContextMenu(e, node));

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
	const row = document.createElement('div');
	row.classList.add('move-row', 'analysis-mainline-row');
	const num = document.createElement('span');
	num.classList.add('move-num');
	num.textContent = node.ply % 2 === 0 ? String(node.ply / 2 + 1) : formatMoveIndex(node.ply);
	row.append(num);
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

	setTimeout(() => {
		document.addEventListener('click', closeAnalysisContextMenu, { once: true });
		document.addEventListener('keydown', closeContextMenuOnEscape);
	}, 0);
}

/** Builds one context-menu button that runs `onClick` then closes the menu. */
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
	document.removeEventListener('click', closeAnalysisContextMenu);
	document.removeEventListener('keydown', closeContextMenuOnEscape);
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
	const targetIndex = movetree.getNodeMoveIndex(node);

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

// Registration -------------------------------------------------------------------------------

guimoveslist.registerRenderer({
	reconcile: reconcileMoveTree,
	updateCurrentPly: highlightCurrentNode,
	onGameLoaded: () => movetree.initFromGame(gameslot.getGamefile()!),
	onMovesChanged: () => movetree.syncAfterMovesChanged(gameslot.getGamefile()!),
	onGameUnloaded: () => movetree.clear(),
});
