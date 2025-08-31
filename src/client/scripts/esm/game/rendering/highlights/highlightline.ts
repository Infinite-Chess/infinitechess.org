
/**
 * This script renders our single-line legal sliding moves
 * when we are zoomed out far.
 */


import perspective from '../perspective.js';
import boardtiles from '../boardtiles.js';
import space from '../../misc/space.js';
import boardpos from '../boardpos.js';
import bd, { BigDecimal } from '../../../util/bigdecimal/bigdecimal.js';
import { createModel } from '../buffermodel.js';


import type { BDCoords } from '../../../chess/util/coordutil.js';
import type { Color } from '../../../util/math/math.js';
import type {  BoundingBoxBD } from '../../../util/math/bounds.js';
import type { LineCoefficientsBD } from '../../../util/math/vectors.js';




/**
 * A single highlight line.
 * 
 * Coords are clamped to screen edge, since
 * we can't render lines out to infinity.
 */
interface Line {
	/** The starting point coords. */
	start: BDCoords
	/** The ending point coords. */
	end: BDCoords
	/** The equation of the line in general form. [A,B,C] */
	coefficients: LineCoefficientsBD
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

		const distToRenderBoardBD: BigDecimal = bd.FromNumber(perspective.distToRenderBoard);
		const scale: BigDecimal = boardpos.getBoardScale();
		const position = boardpos.getBoardPos();

		const distToRenderBoard_Tiles: BigDecimal = bd.divide_floating(distToRenderBoardBD, scale);

		// Shift the box based on our current board position
		return {
			left: bd.subtract(position[0], distToRenderBoard_Tiles),
			right: bd.add(position[0], distToRenderBoard_Tiles),
			bottom: bd.subtract(position[1], distToRenderBoard_Tiles),
			top: bd.add(position[1], distToRenderBoard_Tiles),
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