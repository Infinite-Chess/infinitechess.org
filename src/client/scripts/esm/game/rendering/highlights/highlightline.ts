
/**
 * This script renders our single-line legal sliding moves
 * when we are zoomed out far.
 */


// @ts-ignore
import perspective from '../perspective.js';
import boardtiles from '../boardtiles.js';
import space from '../../misc/space.js';
import boardpos from '../boardpos.js';
import { createModel } from '../buffermodel.js';


import type { Coords } from '../../../chess/util/coordutil.js';
import type { Color } from '../../../util/math/math.js';
import type {  BoundingBoxBD } from '../../../util/math/bounds.js';
import type { Vec3 } from '../../../util/math/vectors.js';




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
	coefficients: Vec3
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
function getRenderRange(): BoundingBoxBD {
	if (!perspective.getEnabled()) { // 2D mode
		return boardtiles.gboundingBoxFloat();
	} else { // Perspective mode
		const distToRenderBoard_Tiles = perspective.distToRenderBoard / boardpos.getBoardScale();
		// Shift the box based on our current board position
		const boardPos = boardpos.getBoardPos();
		return {
			left: boardPos[0] - distToRenderBoard_Tiles,
			right: boardPos[0] + distToRenderBoard_Tiles,
			bottom: boardPos[1] - distToRenderBoard_Tiles,
			top: boardPos[1] + distToRenderBoard_Tiles,
		};
	}
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