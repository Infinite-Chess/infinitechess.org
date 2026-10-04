// src/client/scripts/esm/views/analysis/moveevals.ts

/**
 * Deepest known white-POV evaluation for every move-tree node on the analysis page.
 * Both normal interactive analysis and Game Review feed this store, so the move list
 * has one rendering path and never loses a deeper result to a shallower one.
 */

import ceval from './ceval.js';
import movetree from './movetree.js';
import { GameBus } from '../../board/GameBus.js';

// Types -----------------------------------------------------------------------

/** A white-POV score: centipawns, or full moves to mate. */
interface Score {
	cp?: number;
	mate?: number;
}

export interface MoveEvalLabel extends Score {
	depth: number;
}

// State -----------------------------------------------------------------------

const labels = new Map<number, MoveEvalLabel>();
const listeners = new Set<(nodeId: number) => void>();

// Store -----------------------------------------------------------------------

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
		cp: line.cp,
		mate: line.mate,
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

/** The node's deepest known label. */
function get(nodeId: number): MoveEvalLabel | undefined {
	return labels.get(nodeId);
}

/** Drops every label, for when the game unloads. */
function clear(): void {
	labels.clear();
}

/** Subscribes to every stored label. */
function onLabel(listener: (nodeId: number) => void): void {
	listeners.add(listener);
}

// Formatting ------------------------------------------------------------------

/** Formats a score like lichess, e.g. "+1.4", "-0.3", "#5", "#-3". Rounds before signing, so ±4 cp reads "0.0". */
function format(score: Score): string {
	if (score.mate !== undefined) return `#${score.mate}`;
	const pawns = Math.round((score.cp ?? 0) / 10) / 10;
	return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
}

export default {
	// Store
	store,
	get,
	onLabel,
	// Formatting
	format,
};
