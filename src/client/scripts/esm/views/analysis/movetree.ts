// src/client/scripts/esm/views/analysis/movetree.ts

/**
 * Analysis-only move tree. The core board engine still consumes a flat
 * `gamefile.moves`; this preserves every explored continuation and exposes the
 * chosen branch as that flat active line.
 */

import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { MoveFull } from '../../../../../shared/chess/logic/movepiece.js';
import type { GameConclusion } from '../../../../../shared/chess/util/winconutil.js';

interface AnalysisMoveNode {
	id: number;
	ply: number;
	move: MoveFull | undefined;
	parent: AnalysisMoveNode | undefined;
	children: AnalysisMoveNode[];
	forceVariation?: boolean;
	/**
	 * The global game-conclusion at this node's position, if it terminates the game. Only a
	 * line's front node is ever terminal, so this lets each branch restore its own conclusion
	 * when reselected instead of inheriting whatever was last on the shared gamefile.
	 */
	gameConclusion?: GameConclusion;
}

let root: AnalysisMoveNode | undefined;
let activeLine: AnalysisMoveNode[] = [];
let nextNodeId = 1;

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
}

function clear(): void {
	root = undefined;
	activeLine = [];
	nextNodeId = 1;
}

function isReady(): boolean {
	return root !== undefined;
}

function getRoot(): AnalysisMoveNode | undefined {
	return root;
}

function getActiveLine(): AnalysisMoveNode[] {
	return activeLine;
}

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

function isMainLine(node: AnalysisMoveNode): boolean {
	let current: AnalysisMoveNode | undefined = node;
	while (current?.parent) {
		if (current.forceVariation || current.parent.children[0] !== current) return false;
		current = current.parent;
	}
	return true;
}

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
 * a fresh node. Records the resulting front's game-conclusion.
 */
function syncAfterMovesChanged(gamefile: GameFile): void {
	if (!root) initFromGame(gamefile);
	if (!root) return;

	const activeMoveCount = activeLine.length - 1;
	if (gamefile.moves.length < activeMoveCount) {
		activeLine = activeLine.slice(0, gamefile.moves.length + 1);
	} else {
		let parent = activeLine[activeLine.length - 1] ?? root;
		for (let i = activeMoveCount; i < gamefile.moves.length; i++) {
			const move = gamefile.moves[i]!;
			let child = parent.children.find((candidate) => isSameMove(candidate.move, move));
			if (!child) {
				child = createNode(move, i, parent);
				parent.children.push(child);
			} else {
				gamefile.moves[i] = child.move!;
			}
			activeLine.push(child);
			parent = child;
		}
	}

	// Record the front's conclusion — where a freshly-played move (e.g. a new variation) first
	// captures whether it ends the game, since no branch-switch does it for us.
	storeActiveLineConclusion(gamefile.gameConclusion);
}

function setActiveLineToNode(node: AnalysisMoveNode): AnalysisMoveNode[] {
	const line = getLineForNode(node);
	activeLine = line;
	return line;
}

/** The stored game-conclusion of the active line's front (terminal) node, if the branch ends the game. */
function getActiveLineConclusion(): GameConclusion | undefined {
	return activeLine[activeLine.length - 1]?.gameConclusion;
}

/** Persists this branch's global game-conclusion onto its front node, so it survives switching branches. */
function storeActiveLineConclusion(conclusion: GameConclusion | undefined): void {
	const front = activeLine[activeLine.length - 1];
	if (front) front.gameConclusion = conclusion;
}

/** The full active line for `node`: its path from root, extended forward along the mainline. */
function getLineForNode(node: AnalysisMoveNode): AnalysisMoveNode[] {
	return extendWithMainline(getLineToNode(node));
}

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

/** Appends the mainline continuation past `line`'s end (first child of each node, until a fork or leaf). */
function extendWithMainline(line: AnalysisMoveNode[]): AnalysisMoveNode[] {
	const extended = [...line];
	let current = extended[extended.length - 1];
	while (current?.children[0] && !current.children[0].forceVariation) {
		current = current.children[0];
		extended.push(current);
	}
	return extended;
}

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

/** Promotes `node` to the mainline by promoting it and every ancestor at each fork up to the root. */
function makeMainLine(node: AnalysisMoveNode): void {
	let current: AnalysisMoveNode | undefined = node;
	while (current?.parent) {
		promoteAtFork(current);
		current = current.parent;
	}
}

/** Demotes a mainline `node` to a variation, so its parent's next child becomes the mainline. */
function forceVariation(node: AnalysisMoveNode): void {
	if (!node.parent || node.parent.children[0] !== node) return;
	node.forceVariation = true;
}

function deleteNode(node: AnalysisMoveNode): AnalysisMoveNode | undefined {
	const parent = node.parent;
	if (!parent) return undefined;
	removeChild(parent, node);
	if (activeLine.includes(node)) activeLine = getLineForNode(parent);
	return parent;
}

function removeChild(parent: AnalysisMoveNode, child: AnalysisMoveNode): void {
	parent.children = parent.children.filter((node) => node !== child);
	child.parent = undefined;
}

function getMovesFromLine(line: AnalysisMoveNode[]): MoveFull[] {
	return line.slice(1).map((node) => node.move!);
}

function isSameMove(left: MoveFull | undefined, right: MoveFull): boolean {
	return (
		left !== undefined &&
		left.token === right.token &&
		left.generateIndex === right.generateIndex
	);
}

export default {
	initFromGame,
	clear,
	isReady,
	getRoot,
	getActiveLine,
	getCurrentNode,
	isInSubtree,
	isMainLine,
	beginBranchFromViewedPosition,
	syncAfterMovesChanged,
	setActiveLineToNode,
	getActiveLineConclusion,
	storeActiveLineConclusion,
	getLineForNode,
	promoteAtFork,
	makeMainLine,
	forceVariation,
	deleteNode,
	getMovesFromLine,
};

export type { AnalysisMoveNode };
