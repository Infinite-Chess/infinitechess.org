// src/client/scripts/esm/views/analysis/rendering/enginearrows.ts

/**
 * Renders the analysis engine's suggested moves as arrows on the board — the
 * best move of each MultiPV line, colored by rank (best = blue, alternatives
 * fade out), like lichess' analysis arrows.
 */

import type { Color } from '../../../../../../shared/types/color.js';
import type { Arrow } from '../../../game/rendering/highlights/annotations/annotations.js';
import type { Coords } from '../../../../../../shared/util/coordutil.js';
import type { CevalLine, CevalUpdate } from '../ceval.js';

import coordutil from '../../../../../../shared/util/coordutil.js';
import icnmoves, { MoveCoords } from '../../../../../../shared/chess/logic/icn/icnmoves.js';

import gameslot from '../../../game/chess/gameslot.js';
import drawarrows from '../../../game/rendering/highlights/annotations/drawarrows.js';
import frametracker from '../../../board/rendering/frametracker.js';
import { createRenderable } from '../../../board/rendering/renderable.js';

// Types -----------------------------------------------------------------------

/** One engine suggestion to draw. */
interface EngineArrow {
	start: Coords;
	end: Coords;
	/** 0 = best line; higher ranks render more faded. */
	rank: number;
}

// Constants -------------------------------------------------------------------

/** Best-line arrow color (blue, like lichess' engine arrows). */
const COLOR: Color = [0.15, 0.48, 0.85, 0.85];
/** Each rank is this much more transparent than the previous. */
const RANK_OPACITY_MULTIPLIER = 0.7;

// State -----------------------------------------------------------------------

/** The currently displayed engine arrows, with precalculated render properties. */
let arrows: { arrow: Arrow; rank: number }[] = [];

// Functions -------------------------------------------------------------------

/** Points the board arrows at each line's first move (only for the viewed position). */
function update(update: CevalUpdate): void {
	const gamefile = gameslot.getGamefile();
	// Stale analysis (user already navigated elsewhere): don't draw wrong-position arrows.
	if (!gamefile || gamefile.state.local.moveIndex !== update.moveIndex) return clearArrows();

	const engineArrows: EngineArrow[] = [];
	update.lines.forEach((line, rank) => {
		const parsed = parseFirstMove(line);
		if (parsed) engineArrows.push({ start: parsed.startCoords, end: parsed.endCoords, rank });
	});

	arrows = engineArrows
		// A same-square "move" can't be drawn as an arrow. In engines, A1>A1 is a default move.
		.filter((a) => !coordutil.areCoordsEqual(a.start, a.end))
		.map((a) => ({
			arrow: drawarrows.createArrow(a.start, a.end),
			rank: a.rank,
		}));
	frametracker.onVisualChange();
}

/** Parses a compact move token "x,y>x,y=Q" into start/end coords. */
function parseFirstMove(line: CevalLine): MoveCoords | undefined {
	const token = line.moves[0];
	if (!token) return undefined;
	try {
		return icnmoves.parseTokenMove(token);
	} catch (e) {
		console.error('Failed to parse engine move token', token, e);
		return undefined;
	}
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
			const color: Color = [...COLOR];
			color[3] *= Math.pow(RANK_OPACITY_MULTIPLIER, rank);
			return drawarrows.getDataArrow(arrow, color);
		});

	createRenderable(data, 2, 'TRIANGLES', 'color', true).render();
}

export default {
	update,
	clearArrows,
	render,
};
