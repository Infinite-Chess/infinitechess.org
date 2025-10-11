
// src/client/scripts/esm/game/rendering/transitions/PanTransition.ts

import type { BDCoords } from "../../../../../../shared/chess/util/coordutil";
import coordutil from "../../../../../../shared/chess/util/coordutil";
import bd, { BigDecimal } from "../../../../../../shared/util/bigdecimal/bigdecimal";
import boardpos from "../boardpos";
import TransitionManager from "./TransitionManager";


export type PanTransition = {
	/** The destination board location. */
	destinationCoords: BDCoords;
}


const ONE = bd.FromBigInt(1n);
const NEGONE = bd.FromBigInt(-1n);


/** Updates the board position and scale for the current PANNING Transition. */
function updatePanningTransition(t: number, easedT: number, originCoords: BDCoords, destinationCoords: BDCoords, differenceCoords: BDCoords): void {
    
	// What is the scale?
	// What is the maximum distance we should pan b4 teleporting to the other half?
	const boardScale = boardpos.getBoardScale();
	const maxPanDist = bd.FromNumber(TransitionManager.PAN_TRANSITION_CONFIG.MAX_PAN_DISTANCE);
	const maxDistSquares = bd.divide_floating(maxPanDist, boardScale);
	const transGreaterThanMaxDist = bd.compare(bd.abs(differenceCoords[0]), maxDistSquares) > 0 || bd.compare(bd.abs(differenceCoords[1]), maxDistSquares) > 0;

	let newX: BigDecimal;
	let newY: BigDecimal;

	const difference = coordutil.copyBDCoords(differenceCoords);
	const easedTBD = bd.FromNumber(easedT);

	if (!transGreaterThanMaxDist) { // No mid-transition teleport required to maintain constant duration.
		// Calculate new world-space
		const addX = bd.multiply_fixed(difference[0], easedTBD);
		const addY = bd.multiply_fixed(difference[1], easedTBD);
		// Convert to board position
		newX = bd.add(originCoords[0], addX);
		newY = bd.add(originCoords[1], addY);
	} else { // Mid-transition teleport REQUIRED to maintain constant duration.
		// 1st half or 2nd half?
		const firstHalf = t < 0.5;
		const neg = firstHalf ? ONE : NEGONE;
		const actualEasedT = bd.FromNumber(firstHalf ? easedT : 1 - easedT);

		// Create a new, shorter vector that points in the exact same direction,
		// but with a length that is visually manageable on screen.

		// To preserve the vector's direction, we must scale it based on its largest component.
		const absDiffX = bd.abs(difference[0]);
		const absDiffY = bd.abs(difference[1]);
		const maxComponent = bd.max(absDiffX, absDiffY);

		const ratio = bd.divide_floating(maxDistSquares, maxComponent);

		difference[0] = bd.multiply_floating(difference[0], ratio);
		difference[1] = bd.multiply_floating(difference[1], ratio);

		const target = firstHalf ? originCoords : destinationCoords;

		const addX = bd.multiply_floating(bd.multiply_floating(difference[0], actualEasedT), neg);
		const addY = bd.multiply_floating(bd.multiply_floating(difference[1], actualEasedT), neg);

		newX = bd.add(target[0], addX);
		newY = bd.add(target[1], addY);
	}

	boardpos.setBoardPos([newX, newY]);
}


export default {
	updatePanningTransition,
};