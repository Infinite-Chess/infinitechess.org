
/**
 * This script highlights the start and end squares
 * of the last move played.
 */

import { createModel } from "../buffermodel.js";
import moveutil from "../../../chess/util/moveutil.js";
import preferences from "../../../components/header/preferences.js";
// @ts-ignore
import shapes from "../shapes.js";


// Type Definitions -----------------------------------------------------------------------------


// @ts-ignore
import type gamefile from '../../../chess/logic/gamefile.js';


// Variables -----------------------------------------------------------------------------


function highlightLastMove(gamefile: gamefile) {
	const lastMove = moveutil.getCurrentMove(gamefile);
	if (!lastMove) return; // Don't render if last move is undefined.

	const color = preferences.getLastMoveHighlightColor();

	const data: number[] = [];

	data.push(...shapes.getTransformedDataQuad_Color_FromCoord(lastMove.startCoords, color));
	data.push(...shapes.getTransformedDataQuad_Color_FromCoord(lastMove.endCoords, color));

	const model = createModel(data, 2, "TRIANGLES", true);
	model.render();
}


export {
	highlightLastMove,
};