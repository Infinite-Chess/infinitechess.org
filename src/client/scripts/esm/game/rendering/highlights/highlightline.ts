
/**
 * This script renders our single-line legal sliding moves
 * when we are zoomed out far.
 */


import { createModel } from '../buffermodel.js';
import space from '../../misc/space.js';


import type { Color } from '../../../util/math.js';
import type { Coords } from '../../../chess/util/coordutil.js';





const perspectiveLimitToTeleport = 50;


/** A single highlight line */
interface Line {
	/** The starting point coords. */
	start: Coords
	/** The ending point coords. */
	end: Coords
	/** The equation of the line in general form. */
	coefficients: [number, number, number]
	/** The color of the line. */
	color: Color
	/** The piece type that should be displayed when hovering over the line, if there is one. */
	piece: number
}







function genLinesModel(lines: Line[]) {
	const data: number[] = lines.flatMap(line => getLineData(line));
	return createModel(data, 2, 'LINES', true);
}

function getLineData(line: Line) {
	const startWorld = space.convertCoordToWorldSpace(line.start);
	const endWorld = space.convertCoordToWorldSpace(line.end);
	const [ r, g, b, a ] = line.color;
	return [
		//         Vertex                 Color
		startWorld[0], startWorld[1],   r, g, b, a,
		endWorld[0], endWorld[1],       r, g, b, a
	];
}

export default {
	genLinesModel,
};

export type {
	Line,
};