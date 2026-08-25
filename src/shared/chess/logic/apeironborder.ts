// src/shared/chess/logic/apeironborder.ts

/**
 * The board an engine game is played on: how its world border is derived, and the
 * coordinate range the Apeiron engine can evaluate inside.
 *
 * Split from apeiron_card.ts, which judges whether the engine can handle a position and
 * therefore needs a whole GameFile. A border is decided while a game is still being built,
 * so it is owned down here where game construction can reach it.
 */

import type { LoadedVariant } from './gamefile.js';
import type { BoundingBox, UnboundedRectangle } from '../../util/math/bounds.js';

import bimath from '../../util/math/bimath.js';
import timeutil from '../../util/timeutil.js';

// Constants -------------------------------------------------------------------

/** Maximum signed 64-bit integer value (2^63 - 1). The widest coordinate the Rust engine holds. */
const I64_MAX = 2n ** 63n - 1n;

/**
 * The engine's board geometry, time-versioned like a variant's position: `dist` spaces the border
 * out from the starting position's box, `cap` hard-limits any edge to i64 with a cushion. The 1000
 * between them keeps every preset's border evenly spaced; only pieces beyond that trip the cap.
 *
 * NEVER edit an entry — a game must stay on the board it began on. Add one keyed at the change.
 */
const PLAY_BORDER: Record<number, { dist: bigint; cap: bigint }> = {
	0: { dist: I64_MAX - 2000n, cap: I64_MAX - 1000n },
};

// Functions -------------------------------------------------------------------

/**
 * The world border an engine game is played inside: spaced evenly around the starting position,
 * clamped to what the engine can evaluate. The single source of every engine game's border.
 * @param timestamp - The game's creation time, pinning its {@link PLAY_BORDER} revision.
 */
function forBox(positionBox: BoundingBox, timestamp: number): BoundingBox {
	const { dist, cap } = timeutil.resolveAtTimestamp(PLAY_BORDER, timestamp);
	return {
		left: bimath.max(positionBox.left - dist, -cap),
		right: bimath.min(positionBox.right + dist, cap),
		bottom: bimath.max(positionBox.bottom - dist, -cap),
		top: bimath.min(positionBox.top + dist, cap),
	};
}

/**
 * {@link forBox} for a preset variant, whose starting position
 * is never built just to measure it — the module declares its box outright.
 */
function forVariant(variant: LoadedVariant): BoundingBox {
	const box = variant.mod.getPositionBox?.(variant.dateTimestamp);
	if (box === undefined)
		throw new Error(`Engine-supported variant "${variant.code}" declares no position box.`);
	return forBox(box, variant.dateTimestamp);
}

/** {@link PLAY_BORDER}'s `cap` alone, for callers bounding a position rather than spacing a border. */
function cap(timestamp: number): bigint {
	return timeutil.resolveAtTimestamp(PLAY_BORDER, timestamp).cap;
}

/**
 * An explicit world border reduced to what the engine can evaluate: every
 * edge pulled inside the cap, and an unbounded (or absent) edge becoming it.
 * @param timestamp - Pins the {@link PLAY_BORDER} revision.
 */
function clampToCap(worldBorder: UnboundedRectangle | undefined, timestamp: number): BoundingBox {
	const capValue = cap(timestamp);
	return {
		left: bimath.max(worldBorder?.left ?? -capValue, -capValue),
		right: bimath.min(worldBorder?.right ?? capValue, capValue),
		bottom: bimath.max(worldBorder?.bottom ?? -capValue, -capValue),
		top: bimath.min(worldBorder?.top ?? capValue, capValue),
	};
}

// Exports ---------------------------------------------------------------------

export default {
	forBox,
	forVariant,
	cap,
	clampToCap,
};
