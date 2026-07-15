// src/client/scripts/esm/views/analysis/moveevals.ts

/**
 * Deepest known white-POV evaluation for every move-tree node on the analysis page.
 * Both normal interactive analysis and Game Review feed this store, so the move list
 * has one rendering path and never loses a deeper result to a shallower one.
 */

import ceval from './ceval.js';
import movetree from './movetree.js';
import { GameBus } from '../../game/GameBus.js';

export interface MoveEvalLabel {
	cp?: number;
	mate?: number;
	depth: number;
}

const labels = new Map<number, MoveEvalLabel>();
const listeners = new Set<(nodeId: number) => void>();

GameBus.addEventListener('game-unloaded', clear);

// Normal analysis updates this on every streamed depth. The ceval cache already
// suppresses depth regressions; this guard also protects labels seeded by a review.
ceval.onUpdate((update) => {
	if (!update) return;
	const line = update.lines[0];
	if (!line) return;
	if (update.moveIndex === -1) return; // The starting position has no move-list label.
	const node = movetree.getActiveLine()[update.moveIndex + 1];
	if (!node) return; // Stale update whose ply is no longer in the active line.
	store(node.id, {
		depth: update.depth,
		...(line.cp !== undefined && { cp: line.cp }),
		...(line.mate !== undefined && { mate: line.mate }),
	});
});

/** Stores a label only when it is at least as deep as the node's current best. */
function store(nodeId: number, label: MoveEvalLabel): boolean {
	const previous = labels.get(nodeId);
	if (previous && previous.depth > label.depth) return false;
	if (
		previous &&
		previous.depth === label.depth &&
		previous.cp === label.cp &&
		previous.mate === label.mate
	)
		return false;
	labels.set(nodeId, label);
	for (const listener of listeners) listener(nodeId);
	return true;
}

function get(nodeId: number): MoveEvalLabel | undefined {
	return labels.get(nodeId);
}

function clear(): void {
	labels.clear();
}

function onLabel(listener: (nodeId: number) => void): void {
	listeners.add(listener);
}

export default { store, get, onLabel };
