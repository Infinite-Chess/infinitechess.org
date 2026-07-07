// src/client/scripts/esm/game/rendering/highlights/enginearrows.ts

/**
 * Renders the analysis engine's suggested moves as arrows on the board — the
 * best move of each MultiPV line, colored by rank (best = blue, alternatives
 * fade out), like lichess' analysis arrows.
 */

import type { Color } from '../../../../../../shared/util/math/math.js';
import type { Arrow } from './annotations/annotations.js';
import type { Coords } from '../../../../../../shared/chess/util/coordutil.js';

import drawarrows from './annotations/drawarrows.js';
import frametracker from '../frametracker.js';
import { createRenderable } from '../../../webgl/Renderable.js';

// Types --------------------------------------------------------------------

/** One engine suggestion to draw. */
interface EngineArrow {
	start: Coords;
	end: Coords;
	/** 0 = best line; higher ranks render more faded. */
	rank: number;
}

// Constants -----------------------------------------------------------------

/** Best-line arrow color (blue, like lichess' engine arrows). */
const BEST_COLOR: Color = [0.15, 0.48, 0.85, 0.85];
/** Alternative-line arrow color (grey-blue). */
const ALT_COLOR: Color = [0.35, 0.5, 0.65, 1];
/** Opacity per rank for alternative lines (rank 1..4). */
const ALT_OPACITY = [0.55, 0.42, 0.32, 0.25];

// State -----------------------------------------------------------------------

/** The currently displayed engine arrows, with precalculated render properties. */
let arrows: { arrow: Arrow; rank: number }[] = [];

// Functions ---------------------------------------------------------------------

/** Replaces the displayed engine arrows. */
function setArrows(engineArrows: EngineArrow[]): void {
	arrows = engineArrows
		// A same-square "move" can't be drawn as an arrow.
		.filter((a) => a.start[0] !== a.end[0] || a.start[1] !== a.end[1])
		.map((a) => ({ arrow: drawarrows.createArrow(a.start, a.end), rank: a.rank }));
	frametracker.onVisualChange();
}

/** Clears all displayed engine arrows. */
function clearArrows(): void {
	if (arrows.length === 0) return;
	arrows = [];
	frametracker.onVisualChange();
}

/** Renders the engine arrows. Call each frame from a render hook. */
function render(): void {
	if (arrows.length === 0) return;

	// Draw worst-ranked first so the best line's arrow ends up on top.
	const data: number[] = [...arrows]
		.sort((a, b) => b.rank - a.rank)
		.flatMap(({ arrow, rank }) => {
			const color: Color =
				rank === 0
					? BEST_COLOR
					: [ALT_COLOR[0], ALT_COLOR[1], ALT_COLOR[2], ALT_OPACITY[Math.min(rank - 1, ALT_OPACITY.length - 1)]!]; // prettier-ignore
			return drawarrows.getDataArrow(arrow, color);
		});

	createRenderable(data, 2, 'TRIANGLES', 'color', true).render();
}

export default {
	setArrows,
	clearArrows,
	render,
};

export type { EngineArrow };
