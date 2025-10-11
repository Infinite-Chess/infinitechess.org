
// src/client/scripts/esm/game/rendering/transitions/ZoomTransition.ts

import { BDCoords, DoubleCoords } from "../../../../../../shared/chess/util/coordutil";
import bd, { BigDecimal } from "../../../../../../shared/util/bigdecimal/bigdecimal";
import boardpos from "../boardpos";


export type ZoomTransition = {
	/** The destination board location. */
	destinationCoords: BDCoords;
	/** The destination board location. */
	destinationScale: BigDecimal;
}


/** Updates the board position and scale for the current ZOOMING Transition. */
function updateZoomingTransition(
	easedT: number,
	originCoords: BDCoords,
	destinationCoords: BDCoords,
	originWorldSpace: DoubleCoords,
	differenceWorldSpace: DoubleCoords,
	originE: number,
	differenceE: number,
	isZoomOut: boolean
): void {

	// Scale

	// Smoothly transition E (the logarithm of the scale), then convert back to scale
	const newE = bd.FromNumber(originE + differenceE * easedT);
	const newScale = bd.exp(newE);
	boardpos.setBoardScale(newScale);

	// Coords. Needs to be after changing scale because the new world-space is dependant on scale
	// SEE GRAPH ON DESMOS "World-space converted to boardPos" for my notes while writing this algorithm

	const targetCoords = isZoomOut ? originCoords : destinationCoords;

	// Calculate new world-space
	const newWorldX = bd.FromNumber(originWorldSpace[0] + differenceWorldSpace[0] * easedT);
	const newWorldY = bd.FromNumber(originWorldSpace[1] + differenceWorldSpace[1] * easedT);
	// Convert to board position
	const boardScale = boardpos.getBoardScale();
	const shiftX = bd.divide_floating(newWorldX, boardScale);
	const shiftY = bd.divide_floating(newWorldY, boardScale);
	const newX = bd.subtract(targetCoords[0], shiftX);
	const newY = bd.subtract(targetCoords[1], shiftY);

	boardpos.setBoardPos([newX, newY]);
}


export default {
	updateZoomingTransition,
};