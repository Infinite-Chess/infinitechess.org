
/**
 * This script calculates and renders the highlight lines
 * of the currently selected piece's legal moves.
 */


import preferences from "../../../components/header/preferences.js";
import selection from "../../chess/selection.js";
import coordutil, { Coords, CoordsKey } from "../../../chess/util/coordutil.js";
import math from "../../../util/math.js";
import highlightline from "./highlightline.js";
import boardpos from "../boardpos.js";


import type { Line } from "./highlightline.js";
import type { Vec2 } from "../../../util/math.js";




/**
 * Calculates all the lines formed from the highlight
 * lines of the current selected piece's legal moves.
 * */
function getLines(): Line[] {
	const lines: Line[] = [];

	const pieceSelected = selection.getPieceSelected()!;
	if (!pieceSelected) return lines;

	const pieceCoords = pieceSelected.coords;
	const legalmoves = selection.getLegalMovesOfSelectedPiece()!; // CAREFUL not to modify!

	const boundingBox = highlightline.getRenderRange();
	
	const color_options = { isOpponentPiece: selection.isOpponentPieceSelected(), isPremove: selection.arePremoving() };
	const color = preferences.getLegalMoveHighlightColor(color_options); // Returns a copy
	color[3] = 1; // Highlight lines should be fully opaque

	for (const strline in legalmoves.sliding) {
		const slideKey = strline as CoordsKey;
		const line = coordutil.getCoordsFromKey(slideKey);
		const lineIsVertical = line[0] === 0;

		const intersectionPoints = math.findLineBoxIntersections(pieceCoords, line, boundingBox).map(intersection => intersection.coords);
		if (intersectionPoints.length < 2) continue;
        
		const leftLimitPointCoord = getPointOfDiagSlideLimit(pieceCoords, legalmoves.sliding[slideKey], line, false);
		// const leftLimitPointWorld = space.convertCoordToWorldSpace(leftLimitPointCoord);
		const start = clampPointToSlideLimit(intersectionPoints[0]!, leftLimitPointCoord, false, lineIsVertical);

		const rightLimitPointCoord = getPointOfDiagSlideLimit(pieceCoords, legalmoves.sliding[slideKey], line, true);
		// const rightLimitPointWorld = space.convertCoordToWorldSpace(rightLimitPointCoord);
		const end = clampPointToSlideLimit(intersectionPoints[1]!, rightLimitPointCoord, true, lineIsVertical);

		// Skip if zero length
		if (coordutil.areCoordsEqual_noValidate(start, end)) continue;

		const coefficients = math.getLineGeneralFormFromCoordsAndVec(start, line);

		lines.push({ start, end, coefficients, color, piece: pieceSelected.type });
	};

	return lines;
}

/** Calculates the furthest square the piece can slide to, given the direction, parity, and moveset. */
function getPointOfDiagSlideLimit(pieceCoords: Coords, moveset: Coords, line: Vec2, positive: boolean): Coords { // positive is true if it's the right/top half of the slide direction
	const steps = positive ? moveset[1] : moveset[0];
	const yDiff = line[1] * steps;
	const xDiff = line[0] * steps;
	return [pieceCoords[0] + xDiff, pieceCoords[1] + yDiff];
}

/** Doesn't let a point exceed how far the piece can slide. */
function clampPointToSlideLimit(point: Coords, slideLimit: Coords, positive: boolean, lineIsVertical: boolean): Coords { // slideLimit = [x,y]
	const cappingAxis = lineIsVertical ? 1 : 0;
	if (!positive && point[cappingAxis] < slideLimit[cappingAxis]
        || positive && point[cappingAxis] > slideLimit[cappingAxis]) return [...slideLimit];
	return [...point];
}



function render() {
	if (!boardpos.areZoomedOut()) return; // Quit if we're not even zoomed out.

	const lines = getLines();
	if (lines.length === 0) return; // No lines to draw

	highlightline.genLinesModel(lines).render();
}


export default {
	getLines,
	render,
};