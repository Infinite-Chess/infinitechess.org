
// src/client/scripts/esm/game/rendering/transitions/ZoomingTransition.ts

import { BDCoords, DoubleCoords } from "../../../../../../shared/chess/util/coordutil";
import bd, { BigDecimal } from "../../../../../../shared/util/bigdecimal/bigdecimal";
import boardpos from "../boardpos";


export type ZoomTransition = {
	/** The destination board location. */
	destinationCoords: BDCoords;
	/** The destination board location. */
	destinationScale: BigDecimal;
}

/**
 * Calculates and sets the new board position based on a target coordinate,
 * a desired "focus point" in world space, and the current board scale.
 * Prevents the point of focus from jumping during a zoom.
 * @param targetCoords The board coordinates that should align with the focus point.
 * @param focusPointWorldSpace The screen coordinates [x, y] where the target should appear.
 * @param newScale The current scale of the board for this frame.
 */
function updateBoardPosFromFocus(targetCoords: BDCoords, focusPointWorldSpace: DoubleCoords, newScale: BigDecimal): void {
	// SEE GRAPH ON DESMOS "World-space converted to boardPos" for my notes while writing this algorithm

	const worldX = bd.FromNumber(focusPointWorldSpace[0]);
	const worldY = bd.FromNumber(focusPointWorldSpace[1]);

	// Convert the world-space offset to a board-space offset
	const shiftX = bd.divide_floating(worldX, newScale);
	const shiftY = bd.divide_floating(worldY, newScale);

	// Apply the shift to the target coordinates to get the new board position
	const newX = bd.subtract(targetCoords[0], shiftX);
	const newY = bd.subtract(targetCoords[1], shiftY);

	boardpos.setBoardPos([newX, newY]);
}


export default {
	updateBoardPosFromFocus,
};