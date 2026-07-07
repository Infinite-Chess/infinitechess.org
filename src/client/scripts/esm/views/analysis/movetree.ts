// src/client/scripts/esm/views/analysis/movetree.ts

/**
 * Analysis-only move tree. The core board engine still consumes a flat
 * `gamefile.moves`; this preserves every explored continuation and exposes the
 * chosen branch as that flat active line.
 */

import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { MoveFull } from '../../../../../shared/chess/logic/movepiece.js';

interface AnalysisMoveNode {
	id: number;
	ply: number;
	move: MoveFull | undefined;
	parent: AnalysisMoveNode | undefined;
	children: AnalysisMoveNode[];
	forceVariation?: boolean;
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

function getNodeMoveIndex(node: AnalysisMoveNode): number {
	return getLineToNode(node).length - 2;
}

function beginBranchFromViewedPosition(gamefile: GameFile): void {
	if (!root) initFromGame(gamefile);
	activeLine = activeLine.slice(0, gamefile.state.local.moveIndex + 2);
}

function syncAfterMovesChanged(gamefile: GameFile): void {
	if (!root) initFromGame(gamefile);
	if (!root) return;

	const activeMoveCount = activeLine.length - 1;
	if (gamefile.moves.length < activeMoveCount) {
		activeLine = activeLine.slice(0, gamefile.moves.length + 1);
		return;
	}

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

function setActiveLineToNode(node: AnalysisMoveNode): AnalysisMoveNode[] {
	const line = getLineForNode(node);
	activeLine = line;
	return line;
}

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

function makeMainLine(node: AnalysisMoveNode): void {
	let current: AnalysisMoveNode | undefined = node;
	while (current?.parent) {
		promoteAtFork(current);
		current = current.parent;
	}
}

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

function sharedPrefixLength(left: AnalysisMoveNode[], right: AnalysisMoveNode[]): number {
	let i = 0;
	while (left[i] && right[i] && left[i] === right[i]) i++;
	return i;
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
	getNodeMoveIndex,
	beginBranchFromViewedPosition,
	syncAfterMovesChanged,
	getLineForNode,
	setActiveLineToNode,
	promoteAtFork,
	makeMainLine,
	forceVariation,
	deleteNode,
	getMovesFromLine,
	sharedPrefixLength,
};

export type { AnalysisMoveNode };
