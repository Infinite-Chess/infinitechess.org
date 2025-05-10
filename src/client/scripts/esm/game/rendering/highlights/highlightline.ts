
/**
 * This script renders our single-line legal sliding moves
 * when we are zoomed out far.
 */


// @ts-ignore
import perspective from '../perspective.js';
// @ts-ignore
import movement from '../movement.js';
// @ts-ignore
import board from '../board.js';
import { createModel } from '../buffermodel.js';
import space from '../../misc/space.js';


import type { BoundingBox, Color } from '../../../util/math.js';
import type { Coords } from '../../../chess/util/coordutil.js';




/**
 * A single highlight line.
 * 
 * Coords are clamped to screen edge, since
 * we can't render lines out to infinity.
 */
interface Line {
	/** The starting point coords. */
	start: Coords
	/** The ending point coords. */
	end: Coords
	/** The equation of the line in general form. [A,B,C] */
	coefficients: [number, number, number]
	/** The color of the line. */
	color: Color
	/**
	 * The piece type that should be displayed when hovering over the line, if there is one.
	 * Otherwise, a glow dot is rendered when hovering over it.
	 */
	piece?: number
}
 


/**
 * Returns the respective bounding box inside which we should render highlight lines out to,
 * according to whether we're in perspective mode or not.
 */
function getRenderRange(): BoundingBox {
	const a = perspective.distToRenderBoard / movement.getBoardScale();
	return perspective.getEnabled() ? { left: -a, right: a, bottom: -a, top: a } : board.gboundingBoxFloat();
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
	getRenderRange,
	genLinesModel,
};

export type {
	Line,
};