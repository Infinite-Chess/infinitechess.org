// src/client/scripts/esm/game/rendering/highlights/selectedpiecehighlightline.ts

/**
 * [ZOOMED OUT] This script calculates and renders the highlight lines
 * of the currently selected piece's legal moves.
 */

import type { Ray } from './annotations/annotations.js';
import type { Line } from './highlightline.js';

import bd from '@naviary/bigdecimal';

import geometry from '../../../../../../shared/util/math/geometry.js';
import bdcoords from '../../../../../../shared/chess/util/bdcoords.js';
import vectors, { Vec2, Vec2Key } from '../../../../../../shared/util/math/vectors.js';
// prettier-ignore
import coordutil, { BDCoords, Coords, CoordsKey, } from '../../../../../../shared/chess/util/coordutil.js';

import boardpos from '../boardpos.js';
import selection from '../../chess/selection.js';
import preferences from '../../../components/header/preferences.js';
import highlightline from './highlightline.js';

/**
 * Calculates all the lines formed from the highlight
 * lines of the current selected piece's legal moves.
 */
function getLines(): Line[] {
	const lines: Line[] = [];

	const pieceSelected = selection.getPieceSelected()!;
	if (!pieceSelected) return lines;

	const pieceCoords = pieceSelected.coords;
	const legalmoves = selection.getLegalMovesOfSelectedPiece()!; // CAREFUL not to modify!

	const boundingBox = highlightline.getRenderRange();

	const color_options = {
		isOpponentPiece: selection.isOpponentPieceSelected(),
		isPremove: selection.arePremoving(),
	};
	const color = preferences.getLegalMoveHighlightColor(color_options); // Returns a copy
	color[3] = 1; // Highlight lines should be fully opaque

	for (const [strline, limits] of Object.entries(legalmoves.sliding)) {
		const slideKey = strline as CoordsKey;
		const step = coordutil.getCoordsFromKey(slideKey);
		const lineIsVertical = step[0] === 0n;
		const cappingAxis = lineIsVertical ? 1 : 0;

		const intersectionPoints = geometry
			.findLineBoxIntersectionsBD(bdcoords.FromCoords(pieceCoords), step, boundingBox)
			.map((intersection) => intersection.coords);
		if (intersectionPoints.length < 2) continue;

		let start: BDCoords = intersectionPoints[0]!;
		if (limits[0] !== null) {
			// The left slide limit has a chance of not reaching intsect1
			const leftLimit: BDCoords = bdcoords.FromCoords([
				pieceCoords[0] + step[0] * limits[0],
				pieceCoords[1] + step[1] * limits[0],
			]); // The first index of limits is already negative, so we don't have to negate the step.
			if (bd.compare(leftLimit[cappingAxis], start[cappingAxis]) > 0) start = leftLimit;
		}

		let end: BDCoords = intersectionPoints[1]!;
		if (limits[1] !== null) {
			// The right slide limit has a chance of not reaching intsect2
			const rightLimit: BDCoords = bdcoords.FromCoords([
				pieceCoords[0] + step[0] * limits[1],
				pieceCoords[1] + step[1] * limits[1],
			]);
			if (bd.compare(rightLimit[cappingAxis], end[cappingAxis]) < 0) end = rightLimit;
		}

		// Skip if zero length
		if (coordutil.areBDCoordsEqual(start, end)) continue;

		const coefficients = vectors.getLineGeneralFormFromCoordsAndVec(pieceCoords, step);

		lines.push({ start, end, coefficients, color, piece: pieceSelected.type });
	}

	return lines;
}

/**
 * Start and end of a line segment. PERFECT integers!
 * We don't need to precalculate the line coefficients because of that.
 */
type Segment = {
	start: Coords;
	end: Coords;
};

/**
 * Converts the selected piece's legal move highlight lines into
 * their ray and line segment components, depending on which slides are infinite or not.
 *
 * Used by drawrays.ts during collapsing, so we can add additional
 * Square annotations at all the intersections of rays with components.
 */
function getLineComponents(): { rays: Ray[]; segments: Segment[] } {
	const rays: Ray[] = [];
	const segments: Segment[] = [];

	const pieceSelected = selection.getPieceSelected()!;
	if (!pieceSelected) return { rays, segments };

	const pieceCoords = pieceSelected.coords;
	const legalmoves = selection.getLegalMovesOfSelectedPiece()!; // CAREFUL not to modify!

	for (const [strline, limits] of Object.entries(legalmoves.sliding)) {
		const slideKey = strline as Vec2Key;
		const step: Vec2 = vectors.getVec2FromKey(slideKey);
		const negStep: Vec2 = vectors.negateVector(step);

		processComponent(coordutil.copyCoords(pieceCoords), negStep, limits[0]); // Negative slide direction
		processComponent(coordutil.copyCoords(pieceCoords), step, limits[1]); // Positive slide direction
	}

	function processComponent(start: Coords, step: Vec2, limit: bigint | null): void {
		if (limit === null) {
			// Can slide infinitly => RAY
			const coefficients = vectors.getLineGeneralFormFromCoordsAndVec(start, step);
			rays.push({ start, vector: step, line: coefficients });
		} else {
			// Can't slide infinitly => SEGMENT
			const end: Coords = [start[0] + step[0] * limit, start[1] + step[1] * limit];
			segments.push({ start, end });
		}
	}

	return { rays, segments };
}

function render(): void {
	if (!boardpos.areZoomedOut()) return; // Quit if we're not even zoomed out.

	const lines = getLines();
	if (lines.length === 0) return; // No lines to draw

	highlightline.genLinesModel(lines).render();
}

export default {
	getLines,
	getLineComponents,
	render,
};
