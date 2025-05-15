
/**
 * This script handles the dragging of the board,
 * and throwing it after letting go.
 */

// @ts-ignore
import perspective from "./perspective.js";
// @ts-ignore
import transition from "./transition.js";
import math from "../../util/math.js";
import mouse from "../../util/mouse.js";
import { listener_overlay } from "../chess/game.js";
import boardpos from "./boardpos.js";
import guipromotion from "../gui/guipromotion.js";



import type { Coords } from "../../chess/util/coordutil.js";



// Types -------------------------------------------------------------


/**
 * A board position/scale entry, used for calculating its velocity
 * for throwing the board after dragging it.
 */
interface PositionHistoryEntry {
	time: number;
	boardPos: Coords;
	boardScale: number;
}


// Variables -------------------------------------------------------------


/** Whether we currently dragging the board */
let boardIsGrabbed: boolean = false;

/** Equal to the board scale the moment a 2nd finger touched down. (pinching the board) */
let scale_WhenBoardPinched: number | undefined;
/** Equal to the distance between 2 fingers the moment they touched down. (pinching the board) */
let fingerPixelDist_WhenBoardPinched: number | undefined;


/** The ID of the first pointer that grabbed the board */
let pointer1Id: string | undefined;
/** The ID of the second pointer that grabbed the board */
let pointer2Id: string | undefined;


/** What coordinates 1 finger has grabbed the board, if it has. */
let pointer1BoardPosGrabbed: Coords | undefined;
/** What coordinates a 2nd finger has grabbed the board, if it has. */
let pointer2BoardPosGrabbed: Coords | undefined;



/** Stores past board positions from the last few frames. Used to calculate throw velocity after dragging. */
const positionHistory: PositionHistoryEntry[] = [];
const positionHistoryWindowMillis: number = 80; // The amount of milliseconds to look back into for board velocity calculation.


// Functions -------------------------------------------------------------------


/** Whether the board is currently being dragged by one or more pointers. */
function isBoardDragging(): boolean {
	return boardIsGrabbed;
}

/** Checks if the board needs to be grabbed by any new pointers pressed down this frame. */
function checkIfBoardGrabbed() {
	if (perspective.getEnabled() || transition.areWeTeleporting() || guipromotion.isUIOpen()) return;

	// For every new pointer touched down / created this frame...
	for (const pointerId of [...listener_overlay.getPointersDown()]) {
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
			fingerPixelDist_WhenBoardPinched = math.euclideanDistance(p1Pos, p2Pos);
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
function checkIfBoardDropped() {
	if (!boardIsGrabbed) return; // Not grabbed

	const now = Date.now();

	const allPointers = listener_overlay.getAllPointers();

	const pointer1Released = allPointers.every(p => p.id !== pointer1Id || !p.isHeld);

	if (pointer2Id === undefined) { // 1 finger drag
		if (pointer1Released) { // Finger has been released
			throwBoard(now);
			cancelBoardDrag();
		} // else still one finger holding the board
	} else { // 2 finger drag
		const pointer2Released = allPointers.every(p => p.id !== pointer2Id || !p.isHeld);
	
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
function cancelBoardDrag() {
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
function throwBoard(time: number) {
	removeOldPositions(time);
	if (positionHistory.length < 2) return;
	const firstBoardState = positionHistory[0]!;
	const lastBoardState = positionHistory[positionHistory.length - 1]!;
	const deltaX = lastBoardState.boardPos[0] - firstBoardState.boardPos[0];
	const deltaY = lastBoardState.boardPos[1] - firstBoardState.boardPos[1];
	const deltaT = (lastBoardState.time - firstBoardState.time) / 1000;
	const boardScale = lastBoardState.boardScale;
	const newPanVel: Coords = [
		deltaX / deltaT * boardScale,
		deltaY / deltaT * boardScale
	];
	// console.log('Throwing board with velocity', newPanVel);
	boardpos.setPanVel(newPanVel);
}

/**
 * Called after letting go of the board with a second finger. Applies scale
 * velocity to the board according to how fast the fingers were pinching
 */
function throwScale(time: number) {
	removeOldPositions(time);
	if (positionHistory.length < 2) return;
	const firstBoardState = positionHistory[0]!;
	const lastBoardState = positionHistory[positionHistory.length - 1]!;
	const ratio = lastBoardState.boardScale / firstBoardState.boardScale;
	const deltaTime = (lastBoardState.time - firstBoardState.time) / 1000;
	boardpos.setScaleVel((ratio - 1) / deltaTime);
}


/** Called if the board is being dragged, calculates the new board position. */
function dragBoard() {
	if (!boardIsGrabbed) return;

	// Calculate new board position...

	if (pointer2Id === undefined) { // 1 Finger drag

		const mouseWorld = mouse.getPointerWorld(pointer1Id!)!;
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
		const newBoardPos: Coords = [
			pointer1BoardPosGrabbed![0] - (mouseWorld[0] / boardScale),
			pointer1BoardPosGrabbed![1] - (mouseWorld[1] / boardScale),
		];
		boardpos.setBoardPos(newBoardPos);

	} else { // 2 Fingers grab/pinch   (center the board position, & calculate scale)

		const pointer1Pos = listener_overlay.getPointerPos(pointer1Id!)!;
		const pointer2Pos = listener_overlay.getPointerPos(pointer2Id!)!;
		const pointer1World = mouse.convertMousePositionToWorldSpace(pointer1Pos, listener_overlay.element);
		const pointer2World = mouse.convertMousePositionToWorldSpace(pointer2Pos, listener_overlay.element);

		// Calculate the new scale by comparing the touches current distance in pixels to their distance when they first started pinching
		const thisPixelDist = math.euclideanDistance(pointer1Pos, pointer2Pos);
		let ratio = thisPixelDist / fingerPixelDist_WhenBoardPinched!;
	
		// If the scale is greatly zoomed out, start slowing it down
		const limitToDampScale = boardpos.glimitToDampScale();
		if (scale_WhenBoardPinched! < limitToDampScale && ratio < 1) {
			const dampener = scale_WhenBoardPinched! / limitToDampScale;
			ratio = (ratio - 1) * dampener + 1;
		}
	
		const newScale = scale_WhenBoardPinched! * ratio;
		boardpos.setBoardScale(newScale);

		/**
		 * For calculating the new board position, treat the two fingers
		 * as one finger dragging from the midpoint between them.
		 */

		const midCoords: Coords = [
			(pointer1BoardPosGrabbed![0] + pointer2BoardPosGrabbed![0]) / 2,
			(pointer1BoardPosGrabbed![1] + pointer2BoardPosGrabbed![1]) / 2
		];

		const midPosWorld: Coords = [
			(pointer1World[0] + pointer2World[0]) / 2,
			(pointer1World[1] + pointer2World[1]) / 2
		];

		const newBoardPos: Coords = [
			midCoords[0] - midPosWorld[0] / newScale,
			midCoords[1] - midPosWorld[1] / newScale
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
function addCurrentPositionToHistory() {
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
function removeOldPositions(now: number) {
	const earliestTime = now - positionHistoryWindowMillis;
	while (positionHistory.length > 0 && positionHistory[0]!.time < earliestTime) positionHistory.shift();
}


// Exports ------------------------------------------------------------


export default {
	isBoardDragging,
	checkIfBoardGrabbed,
	dragBoard,
	checkIfBoardDropped,
	cancelBoardDrag,
};
