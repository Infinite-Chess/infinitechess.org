
/**
 * This script handles the dragging of the board,
 * and throwing it after letting go.
 */


import type { BDCoords, DoubleCoords } from "../../chess/util/coordutil.js";

import mouse from "../../util/mouse.js";
import boardpos from "./boardpos.js";
import guipromotion from "../gui/guipromotion.js";
import vectors from "../../util/math/vectors.js";
import coordutil from "../../chess/util/coordutil.js";
import perspective from "./perspective.js";
import transition from "./transition.js";
import bd, { BigDecimal } from "../../util/bigdecimal/bigdecimal.js";
import { listener_overlay } from "../chess/game.js";
import { Mouse } from "../input.js";



// Types -------------------------------------------------------------


/**
 * A board position/scale entry, used for calculating its velocity
 * for throwing the board after dragging it.
 */
interface PositionHistoryEntry {
	time: number;
	boardPos: BDCoords;
	boardScale: BigDecimal;
}


// Variables -------------------------------------------------------------


/** Whether we currently dragging the board */
let boardIsGrabbed: boolean = false;

/** Equal to the board scale the moment a 2nd finger touched down. (pinching the board) */
let scale_WhenBoardPinched: BigDecimal | undefined;
/** Equal to the distance between 2 fingers the moment they touched down. (pinching the board) */
let fingerPixelDist_WhenBoardPinched: number | undefined;


/** The ID of the first pointer that grabbed the board */
let pointer1Id: string | undefined;
/** The ID of the second pointer that grabbed the board */
let pointer2Id: string | undefined;


/** What coordinates 1 finger has grabbed the board, if it has. */
let pointer1BoardPosGrabbed: BDCoords | undefined;
/** What coordinates a 2nd finger has grabbed the board, if it has. */
let pointer2BoardPosGrabbed: BDCoords | undefined;



/** Stores past board positions from the last few frames. Used to calculate throw velocity after dragging. */
const positionHistory: PositionHistoryEntry[] = [];
const positionHistoryWindowMillis: number = 80; // The amount of milliseconds to look back into for board velocity calculation.


// Functions -------------------------------------------------------------------


/** Whether the board is currently being dragged by one or more pointers. */
function isBoardDragging(): boolean {
	return boardIsGrabbed;
}



/**
 * Returns the ids of all pointers that started pressing down this frame
 * that are capable of dragging the board. That is:
 * A. Left mouse button pointers
 * B. Touch pointers
 */
function getBoardDraggablePointersDown(): string[] {
	// Prevent duplicates by using a Set
	return [...new Set([
		...listener_overlay.getPointersDown(Mouse.LEFT),
		...listener_overlay.getTouchPointersDown()
	])];
}

/**
 * Returns the ids of all existing pointers that are capable of dragging the board. That is:
 * A. Left mouse button pointers
 * B. Touch pointers
 */
function getBoardDraggablePointers(): string[] {
	// Prevent duplicates by using a Set
	return [...new Set([
		...listener_overlay.getAllPointers(Mouse.LEFT),
		...listener_overlay.getAllTouchPointers()
	])];
}

/**
 * Returns the number of pointers that started pressing down this frame
 * that are capable of dragging the board. That is:
 * A. Left mouse button pointers
 * B. Touch pointers
 */
function getBoardDraggablePointersDownCount(): number {
	return getBoardDraggablePointersDown().length;
}

/**
 * Returns the number of currently existing pointers that are capable of dragging the board. That is:
 * A. Left mouse button pointers
 * B. Touch pointers
 */
function getBoardDraggablePointerCount(): number {
	return getBoardDraggablePointers().length;
}



/** Checks if the board needs to be grabbed by any new pointers pressed down this frame. */
function checkIfBoardGrabbed(): void {
	if (perspective.getEnabled() || transition.areTransitioning() || guipromotion.isUIOpen()) return;

	// All pointers down that are either left mouse button, or a touch
	const allPointersDown = getBoardDraggablePointersDown();

	// For every new pointer touched down / created this frame...
	for (const pointerId of allPointersDown) {
		listener_overlay.claimPointerDown(pointerId); // Remove the pointer down so other scripts don't use it

		if (!boardIsGrabbed) { // First pointer
			// console.log('Board grabbed');
			pointer1Id = pointerId;
			pointer1BoardPosGrabbed = mouse.getTilePointerOver_Float(pointer1Id!)!;
			// console.log('pointer1BoardPosGrabbed', pointer1BoardPosGrabbed);
			boardIsGrabbed = true;
			boardpos.setPanVel([0,0]); // Erase all momentum
		} else if (pointer2Id === undefined) { // Second pointer
			// console.log('Board pinched');

			pointer2Id = pointerId;
			pointer2BoardPosGrabbed = mouse.getTilePointerOver_Float(pointer2Id!)!;
		
			// Pixel distance
			const p1Pos = listener_overlay.getPointerPos(pointer1Id!)!;
			const p2Pos = listener_overlay.getPointerPos(pointer2Id!)!;
			fingerPixelDist_WhenBoardPinched = vectors.euclideanDistanceDoubles(p1Pos, p2Pos);
			if (fingerPixelDist_WhenBoardPinched === 0) throw Error('Finger pixel dist when pinching is 0');
		
			// Scale
			scale_WhenBoardPinched = boardpos.getBoardScale();
		} // else Already 2 fingers down, do nothing on a third

		addCurrentPositionToHistory();
	}
}

/**
 * Checks if any of the pointers that are currenlty dragging the board
 * have been released, or no longer exist. If so, throw the board and cancel the drag.
 */
function checkIfBoardDropped(): void {
	if (!boardIsGrabbed) return; // Not grabbed

	const now = Date.now();

	// All existing pointers that are either left mouse button, or a touch
	const allPointers = getBoardDraggablePointers();

	const pointer1Released = !allPointers.includes(pointer1Id!);

	if (pointer2Id === undefined) { // 1 finger drag
		if (pointer1Released) { // Finger has been released
			throwBoard(now);
			cancelBoardDrag();
		} // else still one finger holding the board
	} else { // 2 finger drag
		const pointer2Released = !allPointers.includes(pointer2Id);
	
		if (!pointer1Released && !pointer2Released) return; // Both fingers are still holding the board

		throwScale(now);
			
		if (pointer1Released && pointer2Released) { // Both fingers have been released
			throwBoard(now);
			cancelBoardDrag();
		} else { // Only one finger has been released
			if (pointer2Released) { // Only Pointer 2 released
				pointer2Id = undefined;
				pointer2BoardPosGrabbed = undefined;
				// Recalculate pointer 1's grab position
				pointer1BoardPosGrabbed = mouse.getTilePointerOver_Float(pointer1Id!)!;
			} else if (pointer1Released) { // Only Pointer 1 released
				// Make pointer2 pointer1
				pointer1Id = pointer2Id;
				// Recalculate pointer 2's grab position
				pointer1BoardPosGrabbed = mouse.getTilePointerOver_Float(pointer1Id!)!;
				pointer2Id = undefined;
				pointer2BoardPosGrabbed = undefined;
			} else throw Error('Umm how did we get here?');

			scale_WhenBoardPinched = undefined;
			fingerPixelDist_WhenBoardPinched = undefined;
		}
	}
}

/** Forcefully terminates a board drag WITHOUT throwing the board. */
function cancelBoardDrag(): void {
	boardIsGrabbed = false;
	pointer1Id = undefined;
	pointer2Id = undefined;
	pointer1BoardPosGrabbed = undefined;
	pointer2BoardPosGrabbed = undefined;
	scale_WhenBoardPinched = undefined;
	fingerPixelDist_WhenBoardPinched = undefined;
	/** Clears the list of past positions. Call this to prevent teleportation giving momentum.*/
	positionHistory.length = 0;
}

/** Called after letting go of the board. Applies velocity to the board according to how fast the mouse was moving */
function throwBoard(time: number): void {
	removeOldPositions(time);
	if (positionHistory.length < 2) return;
	const firstBoardState = positionHistory[0]!;
	const lastBoardState = positionHistory[positionHistory.length - 1]!;
	const deltaX = bd.subtract(lastBoardState.boardPos[0], firstBoardState.boardPos[0]);
	const deltaY = bd.subtract(lastBoardState.boardPos[1], firstBoardState.boardPos[1]);
	const deltaT = bd.FromNumber((lastBoardState.time - firstBoardState.time) / 1000);
	const boardScale = lastBoardState.boardScale;
	const newPanVel: DoubleCoords = [
		bd.toNumber(bd.multiply_fixed(bd.divide_fixed(deltaX, deltaT), boardScale)),
		bd.toNumber(bd.multiply_fixed(bd.divide_fixed(deltaY, deltaT), boardScale))
	];
	// console.log('Throwing board with velocity', newPanVel);
	boardpos.setPanVel(newPanVel);
}

/**
 * Called after letting go of the board with a second finger. Applies scale
 * velocity to the board according to how fast the fingers were pinching
 */
function throwScale(time: number): void {
	removeOldPositions(time);
	if (positionHistory.length < 2) return;
	const firstBoardState = positionHistory[0]!;
	const lastBoardState = positionHistory[positionHistory.length - 1]!;
	const ratio = bd.toNumber(bd.divide_floating(lastBoardState.boardScale, firstBoardState.boardScale));
	const deltaTime = (lastBoardState.time - firstBoardState.time) / 1000;
	boardpos.setScaleVel((ratio - 1) / deltaTime);
}


/** Called if the board is being dragged, calculates the new board position. */
function dragBoard(): void {
	if (!boardIsGrabbed) return;

	// Calculate new board position...

	if (pointer2Id === undefined) { // 1 Finger drag

		const mouseWorld = bd.FromDoubleCoords(mouse.getPointerWorld(pointer1Id!)!);
		// console.log('Mouse world', mousePos);

		/**
		 * worldCoordsX / boardScale + boardPosX = mouseCoordsX
		 * worldCoordsY / boardScale + boardPosY = mouseCoordsY
		 * 
		 * Solve for boardPosX & boardPosY:
		 * 
		 * boardPosX = mouseCoordsX - worldCoordsX / boardScale
		 * boardPosY = mouseCoordsY - worldCoordsY / boardScale
		 */

		const boardScale = boardpos.getBoardScale();
		const newBoardPos: BDCoords = [
			// negate and add pointer1BoardPosGrabbed instead of flipped, because we don't need high precision here.
			bd.add(bd.negate(bd.divide_fixed(mouseWorld[0], boardScale)), pointer1BoardPosGrabbed![0]),
			bd.add(bd.negate(bd.divide_fixed(mouseWorld[1], boardScale)), pointer1BoardPosGrabbed![1])
		];
		boardpos.setBoardPos(newBoardPos);

	} else { // 2 Fingers grab/pinch   (center the board position, & calculate scale)

		const pointer1Pos = listener_overlay.getPointerPos(pointer1Id!)!;
		const pointer2Pos = listener_overlay.getPointerPos(pointer2Id!)!;
		const pointer1World = mouse.convertMousePositionToWorldSpace(pointer1Pos, listener_overlay.element);
		const pointer2World = mouse.convertMousePositionToWorldSpace(pointer2Pos, listener_overlay.element);

		// Calculate the new scale by comparing the touches current distance in pixels to their distance when they first started pinching
		const thisPixelDist = vectors.euclideanDistanceDoubles(pointer1Pos, pointer2Pos);
		const ratio = bd.FromNumber(thisPixelDist / fingerPixelDist_WhenBoardPinched!);
	
		const newScale = bd.multiply_floating(scale_WhenBoardPinched!, ratio);
		boardpos.setBoardScale(newScale);

		/**
		 * For calculating the new board position, treat the two fingers
		 * as one finger dragging from the midpoint between them.
		 */

		const midCoords: BDCoords = coordutil.lerpCoords(pointer1BoardPosGrabbed!, pointer2BoardPosGrabbed!, 0.5);

		const midPosWorld: BDCoords = bd.FromDoubleCoords(coordutil.lerpCoordsDouble(pointer1World, pointer2World, 0.5));

		const newBoardPos: BDCoords = [
			// negate and add midCoords instead of flipped, because we don't need high precision here.
			bd.add(bd.negate(bd.divide_fixed(midPosWorld[0], newScale)), midCoords[0]),
			bd.add(bd.negate(bd.divide_fixed(midPosWorld[1], newScale)), midCoords[1])
		];

		boardpos.setBoardPos(newBoardPos);
	}
    
	addCurrentPositionToHistory();
}

/**
 * Adds the board's current position and scale to its history.
 * Used for calculating the velocity of the board after letting go.
 * 
 * History is only kept track of while dragging.
 */
function addCurrentPositionToHistory(): void {
	const now = Date.now();
	removeOldPositions(now);
	positionHistory.push({
		time: now,
		boardPos: boardpos.getBoardPos(),
		boardScale: boardpos.getBoardScale()
	});
}

/**
 * Removes all positions from the history that are older than the
 * positionHistoryWindowMillis.
 */
function removeOldPositions(now: number): void {
	const earliestTime = now - positionHistoryWindowMillis;
	while (positionHistory.length > 0 && positionHistory[0]!.time < earliestTime) positionHistory.shift();
}


// Exports ------------------------------------------------------------


export default {
	isBoardDragging,
	getBoardDraggablePointersDownCount,
	getBoardDraggablePointerCount,
	checkIfBoardGrabbed,
	dragBoard,
	checkIfBoardDropped,
	cancelBoardDrag,
};
