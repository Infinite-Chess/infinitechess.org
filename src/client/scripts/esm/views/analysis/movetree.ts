// src/client/scripts/esm/views/analysis/movetree.ts

/**
 * Analysis-only move tree. The core board engine still consumes a flat
 * `gamefile.moves`; this preserves every explored continuation and exposes the
 * chosen branch as that flat active line.
 */

import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { MoveFull } from '../../../../../shared/chess/logic/movepiece.js';
import type { GameConclusion } from '../../../../../shared/chess/util/typeschemas.js';

// Types -----------------------------------------------------------------------

/** A single position in the analysis tree: one move plus its continuations. */
export interface AnalysisMoveNode {
	/** Unique, monotonically-assigned identifier for this node. */
	id: number;
	/** Half-move number (0-based); the root is -1. */
	ply: number;
	/** The move reaching this node, or `undefined` for the root. */
	move: MoveFull | undefined;
	/** The node this one branches from, or `undefined` for the root. */
	parent: AnalysisMoveNode | undefined;
	/** Continuations from this node; the first is the mainline, the rest variations. */
	children: AnalysisMoveNode[];
	/** When set, this node is treated as a variation even if it's its parent's first child. */
	forceVariation?: boolean;
	/**
	 * The game-conclusion at this node's position, if it terminates the game. Kept even once
	 * played past, so each branch restores its own conclusion when reselected.
	 */
	gameConclusion?: GameConclusion;
}

// State -----------------------------------------------------------------------

/** Root of the tree (a placeholder node at ply -1), or `undefined` until built. */
let root: AnalysisMoveNode | undefined;
/** The loaded game's final node, where its recorded ending sits. */
let loadedGameEnd: AnalysisMoveNode | undefined;
/** The selected branch, root-first; its node at index `i` sits at `gamefile` moveIndex `i - 1`. */
let activeLine: AnalysisMoveNode[] = [];
/** Counter handing out the next node `id`; reset whenever the tree is rebuilt. */
let nextNodeId = 1;

// Building --------------------------------------------------------------------

/** (Re)builds the tree from scratch as a single trunk mirroring the flat `gamefile.moves`. */
function initFromGame(gamefile: GameFile): void {
	nextNodeId = 1;
	root = createNode(undefined, -1, undefined);
	activeLine = [root];

	let parent = root;
	for (let i = 0; i < gamefile.moves.length; i++) {
		const child = createNode(gamefile.moves[i]!, i, parent);
		parent.children.push(child);
		activeLine.push(child);
		parent = child;
	}
	loadedGameEnd = parent;
}

/** A fresh childless node, under the next `id`. */
function createNode(
	move: MoveFull | undefined,
	ply: number,
	parent: AnalysisMoveNode | undefined,
): AnalysisMoveNode {
	return {
		id: nextNodeId++,
		ply,
		move,
		parent,
		children: [],
	};
}

/** Discards the tree, until the next game builds one. */
function clear(): void {
	root = undefined;
	loadedGameEnd = undefined;
	activeLine = [];
	nextNodeId = 1;
}

// Queries ---------------------------------------------------------------------

/** Whether the tree has been built. */
function isReady(): boolean {
	return root !== undefined;
}

/** The tree's root, or `undefined` until built. */
function getRoot(): AnalysisMoveNode | undefined {
	return root;
}

/** The loaded game's final node, or `undefined` until built. */
function getLoadedGameEnd(): AnalysisMoveNode | undefined {
	return loadedGameEnd;
}

/** The selected branch, root-first. */
function getActiveLine(): AnalysisMoveNode[] {
	return activeLine;
}

/** The node of the position being viewed. */
function getCurrentNode(gamefile: GameFile): AnalysisMoveNode | undefined {
	return activeLine[gamefile.state.local.moveIndex + 1];
}

/** Whether `node` is `subtreeRoot` itself or a descendant of it. */
function isInSubtree(subtreeRoot: AnalysisMoveNode, node: AnalysisMoveNode): boolean {
	let current: AnalysisMoveNode | undefined = node;
	while (current) {
		if (current === subtreeRoot) return true;
		current = current.parent;
	}
	return false;
}

/** The ply of the deepest node that is `a`, `b`, or an ancestor of both (their branch fork). */
function getCommonAncestorPly(a: AnalysisMoveNode, b: AnalysisMoveNode): number {
	const bChain = new Set<AnalysisMoveNode>();
	for (let n: AnalysisMoveNode | undefined = b; n; n = n.parent) bChain.add(n);
	for (let n: AnalysisMoveNode | undefined = a; n; n = n.parent) if (bChain.has(n)) return n.ply;
	return -1; // The root is always shared, so this is unreachable.
}

/** Whether every move from the root to `node` is its parent's mainline continuation. */
function isMainLine(node: AnalysisMoveNode): boolean {
	let current: AnalysisMoveNode | undefined = node;
	while (current?.parent) {
		if (current.forceVariation || current.parent.children[0] !== current) return false;
		current = current.parent;
	}
	return true;
}

// Active line -----------------------------------------------------------------

/**
 * Truncates the active line to the viewed position, discarding its continuation so
 * the next move played branches from here instead of matching the old mainline.
 */
function beginBranchFromViewedPosition(gamefile: GameFile): void {
	if (!root) initFromGame(gamefile);
	activeLine = activeLine.slice(0, gamefile.state.local.moveIndex + 2);
}

/**
 * Reconciles the tree with `gamefile.moves` after it changed: trims the active line on an undo,
 * or on new moves reuses a matching existing child (canonicalizing the flat move to it) or grafts
 * a fresh node. A reused child rejoins its branch, restoring the flat list to that whole branch.
 * Records the resulting front's game-conclusion.
 */
function syncAfterMovesChanged(gamefile: GameFile): void {
	if (!root) initFromGame(gamefile);
	if (!root) return;

	const activeMoveCount = activeLine.length - 1;
	if (gamefile.moves.length < activeMoveCount) {
		activeLine = activeLine.slice(0, gamefile.moves.length + 1);
	} else {
		let parent = activeLine[activeLine.length - 1] ?? root;
		let rejoinedExistingBranch = false;
		for (let i = activeMoveCount; i < gamefile.moves.length; i++) {
			const move = gamefile.moves[i]!;
			let child = parent.children.find((candidate) => isSameMove(candidate.move, move));
			if (!child) {
				child = createNode(move, i, parent);
				parent.children.push(child);
			} else {
				// Not a leak: same position via the same path yields identical changes/state, and
				// only the tree's copy carries the ICN's comment and clockStamp.
				gamefile.moves[i] = child.move!;
				rejoinedExistingBranch = true;
			}
			activeLine.push(child);
			parent = child;
		}

		// Rejoining an existing branch restores the rest of it, so it stays navigable instead of
		// dead-ending at the move just played. Returns early on purpose: the global conclusion
		// describes the played move's position, not this front's, so we adopt the front's instead.
		if (rejoinedExistingBranch) {
			activeLine = extendWithMainline(activeLine);
			gamefile.moves = getMovesFromLine(activeLine);
			gamefile.gameConclusion = getActiveLineConclusion();
			return;
		}
	}

	// Record the front's conclusion — where a freshly-played move (e.g. a new variation) first
	// captures whether it ends the game, since no branch-switch does it for us.
	storeActiveLineConclusion(gamefile.gameConclusion);
}

/** Selects `node`'s full line as the active branch. */
function setActiveLineToNode(node: AnalysisMoveNode): void {
	activeLine = getLineForNode(node);
}

/** The stored game-conclusion of the active line's front node, if the branch ends the game. */
function getActiveLineConclusion(): GameConclusion | undefined {
	return activeLine[activeLine.length - 1]?.gameConclusion;
}

/** Stores the branch's game-conclusion on its front node, so it survives switching branches. */
function storeActiveLineConclusion(conclusion: GameConclusion | undefined): void {
	const front = activeLine[activeLine.length - 1];
	if (front) front.gameConclusion = conclusion;
}

/** The full active line for `node`: its path from root, extended forward along the mainline. */
function getLineForNode(node: AnalysisMoveNode): AnalysisMoveNode[] {
	return extendWithMainline(getLineToNode(node));
}

/** `node`'s path from the root, root-first. */
function getLineToNode(node: AnalysisMoveNode): AnalysisMoveNode[] {
	const line: AnalysisMoveNode[] = [];
	let current: AnalysisMoveNode | undefined = node;
	while (current) {
		line.push(current);
		current = current.parent;
	}
	line.reverse();
	return line;
}

/** Appends the mainline continuation past `line`'s end, until a forced variation or leaf. */
function extendWithMainline(line: AnalysisMoveNode[]): AnalysisMoveNode[] {
	const extended = [...line];
	let current = extended[extended.length - 1];
	while (current?.children[0] && !current.children[0].forceVariation) {
		current = current.children[0];
		extended.push(current);
	}
	return extended;
}

/** Whether two moves played from the same position are the same move. */
function isSameMove(left: MoveFull | undefined, right: MoveFull): boolean {
	return (
		left !== undefined &&
		left.token === right.token &&
		left.generateIndex === right.generateIndex
	);
}

// Editing ---------------------------------------------------------------------

/** Promotes `node` to the mainline, promoting it and each ancestor at every fork. */
function makeMainLine(node: AnalysisMoveNode): void {
	let current: AnalysisMoveNode | undefined = node;
	while (current?.parent) {
		promoteAtFork(current);
		current = current.parent;
	}
}

/** Makes `node` its parent's mainline continuation. */
function promoteAtFork(node: AnalysisMoveNode): void {
	const parent = node.parent;
	if (!parent) return;
	// Reorder within the parent's children WITHOUT detaching the parent link (removeChild
	// nulls node.parent, which would corrupt getLineToNode). Also clears a force-variation
	// flag so a previously-demoted mainline move can be promoted back.
	if (parent.children[0] !== node) {
		parent.children = parent.children.filter((child) => child !== node);
		parent.children.unshift(node);
	}
	node.forceVariation = false;
}

/** Demotes a mainline `node` to a variation, so its parent's next child becomes the mainline. */
function forceVariation(node: AnalysisMoveNode): void {
	if (!node.parent || node.parent.children[0] !== node) return;
	node.forceVariation = true;
}

/** Deletes `node` and its subtree, returning its parent, or `undefined` for the root. */
function deleteNode(node: AnalysisMoveNode): AnalysisMoveNode | undefined {
	const parent = node.parent;
	if (!parent) return undefined;
	removeChild(parent, node);
	if (activeLine.includes(node)) activeLine = getLineForNode(parent);
	return parent;
}

/** Detaches `child` from `parent`. */
function removeChild(parent: AnalysisMoveNode, child: AnalysisMoveNode): void {
	parent.children = parent.children.filter((node) => node !== child);
	child.parent = undefined;
}

/**
 * Grafts `moves` as a fresh variation branch beneath `parent`, recording the branch's
 * game-conclusion on its front node. Purely a tree edit — the active line is left untouched.
 */
function appendVariation(
	parent: AnalysisMoveNode,
	moves: MoveFull[],
	conclusion: GameConclusion | undefined,
): void {
	let node = parent;
	for (const move of moves) {
		const child = createNode(move, node.ply + 1, node);
		node.children.push(child);
		node = child;
	}
	node.gameConclusion = conclusion;
}

// Move lists ------------------------------------------------------------------

/** The flat move list a line of nodes plays. */
function getMovesFromLine(line: AnalysisMoveNode[]): MoveFull[] {
	return line.slice(1).map((node) => node.move!);
}

/** The flat move list from the root up to (and including) `node`. */
function getMovesToNode(node: AnalysisMoveNode): MoveFull[] {
	return getMovesFromLine(getLineToNode(node));
}

// Exports ---------------------------------------------------------------------

export default {
	// Building
	initFromGame,
	clear,
	// Queries
	isReady,
	getRoot,
	getLoadedGameEnd,
	getActiveLine,
	getCurrentNode,
	isInSubtree,
	getCommonAncestorPly,
	isMainLine,
	// Active line
	beginBranchFromViewedPosition,
	syncAfterMovesChanged,
	setActiveLineToNode,
	getActiveLineConclusion,
	getLineForNode,
	// Editing
	makeMainLine,
	promoteAtFork,
	forceVariation,
	deleteNode,
	appendVariation,
	// Move lists
	getMovesFromLine,
	getMovesToNode,
};
