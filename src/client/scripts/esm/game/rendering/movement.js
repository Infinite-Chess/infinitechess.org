
// Import Start
import loadbalancer from '../misc/loadbalancer.js';
import input from '../input.js';
import perspective from './perspective.js';
import board from './board.js';
import math from '../../util/math.js';
import transition from './transition.js';
import guipromotion from '../gui/guipromotion.js';
import guititle from '../gui/guititle.js';
import frametracker from './frametracker.js';
import game from '../chess/game.js';
import coordutil from '../../chess/util/coordutil.js';
import docutil from '../../util/docutil.js';
import selection from '../chess/selection.js';
import gameslot from '../chess/gameslot.js';
import draganimation from './dragging/draganimation.js';
// Import End

"use strict";

/** This script stores our board position and scale and controls our panning and zooming. */

const panAccel_3D = 75; // Perspective mode: Acceleration/decceleartion rate of board velocity.   Default: 50
const panAccel_2D = 145; // 2D mode: Deccelleration rate of panning.   Default: 100
const panVelCap_2D = 22.0; // Hyptenuse cap of x & y speeds   Default: 11
const panVelCap_3D = 16.0; // Hyptenuse cap of x & y speeds   Default: 11

const scaleAccel_Desktop = 6.0; // Acceleration of board scaling   Default: 6
const scaleAccel_Mobile = 14.0; // Acceleration of board scaling   Default: 6
const scaleVelCap = 1.0; // Default: 1.0
const maximumScale = 5.0;
const scrollScaleVel = 0.015; // Dampener multiplied to amount scroll-wheel has scrolled every frame.   Default: 0.03
const scrollScaleVelCap = 2.5;

// Camera position does not change, only the board position
let boardPos = [0,0]; // Coordinates
let panVel = [0,0]; // Current panning velocity
let boardScale = 1; // Current scale. Starts at 1.5 to be higher on the title screen.
let scaleVel = 0; // Current scale velocity

/**
 * Stores past board positions from the last few frames. Used to calculate throw velocity.
 * [ {time, boardPos, boardScale}, ]
 */
let positionHistory = [];
const positionHistoryMillis = 80; // The amount of milliseconds to look back into for board velocity calculation.

let boardIsGrabbed = 0; // Are we currently dragging the board?  0 = false   1 = mouse variant   2 = touch variant
let boardPosMouseGrabbed; // What coordinates the mouse has grabbed the board.
let boardPosFingerOneGrabbed; // {id, x, y}  What coordinates 1 finger has grabbed the board.
let boardPosFingerTwoGrabbed; //           What coordinates a 2nd finger has grabbed the board.
let scale_WhenBoardPinched; // Equal to the board scale the moment a 2nd finger touched down. (pinching the board)
let fingerPixelDist_WhenBoardPinched; // Equal to the distance between 2 fingers the moment they touched down. (pinching the board)

let scale_When1TileIs1Pixel_Physical; // Scale limit where each tile takes up exactly 1 physical pixel on screen
let scale_When1TileIs1Pixel_Virtual; // Scale limit where each tile takes up exactly 1 VIRTUAL pixel on screen
let scaleIsLess1Pixel_Physical = false;
let scaleIsLess1Pixel_Virtual = false; // Set to true when we're so zoomed out, 1 cell is smaller than 1 pixel!! Everything renders differently!

// 

/**
 * Returns a copy of the boardPos in memory, otherwise the memory location
 * could be used to modify the original.
 * @returns {[number,number]}
 */
function getBoardPos() {
	return coordutil.copyCoords(boardPos);
}

function setBoardPos(newPos) {
	if (!Array.isArray(newPos)) throw new Error(`New position must be an array! ${newPos}`);
	if (isNaN(newPos[0]) || isNaN(newPos[1])) throw new Error(`Cannot set position to ${newPos}!`);
	boardPos = newPos;
	frametracker.onVisualChange();
}

// Should be a single value, so this isn't a reference to memory location is it?
function getBoardScale() {
	return boardScale;
}

function setBoardScale(newScale) {
	if (isNaN(newScale)) throw new Error(`Cannot set scale to ${newScale}!`);
	if (newScale <= 0) throw new Error(`Cannot set scale to ${newScale}!`);

	boardScale = newScale;

	// Cap the scale
	if (boardScale > maximumScale) {
		boardScale = maximumScale;
		scaleVel = 0;
	}

	// Update variables keeping track of if our zoom is so great that each cell is smaller than 1 pixel
	if (boardScale < scale_When1TileIs1Pixel_Physical) scaleIsLess1Pixel_Physical = true;
	else scaleIsLess1Pixel_Physical = false;
	if (boardScale < scale_When1TileIs1Pixel_Virtual) scaleIsLess1Pixel_Virtual = true;
	else scaleIsLess1Pixel_Virtual = false;
	// scaleIsLess1Pixel_Virtual = true;
    
	frametracker.onVisualChange();
}

function getScale_When1TileIs1Pixel_Physical() {
	return scale_When1TileIs1Pixel_Physical;
}

function setScale_When1TileIs1Pixel_Physical(newValue) {
	scale_When1TileIs1Pixel_Physical = newValue;
}

function getScale_When1TileIs1Pixel_Virtual() {
	return scale_When1TileIs1Pixel_Virtual;
}

function setScale_When1TileIs1Pixel_Virtual(newValue) {
	scale_When1TileIs1Pixel_Virtual = newValue;
}

function isScaleLess1Pixel_Physical() {
	return scaleIsLess1Pixel_Physical;
}

/**
 * Returns *true* if we're zoomed out enough to render the legal moves as lines.
 * @returns {boolean}
 */
function isScaleLess1Pixel_Virtual() {
	return scaleIsLess1Pixel_Virtual;
}

// Called from game.updateBoard()
function recalcPosition() {
	if (transition.areWeTeleporting()) return; // Exit if we are teleporting
	if (loadbalancer.gisAFK()) return; // Exit if we're AFK. Save our CPU!

	panBoard();
	recalcScale();
}

// Updates board position dependant on panVel
function panBoard() {
	if (panVel[0] === 0 && panVel[1] === 0) return; // Exit if we're not moving
    
	frametracker.onVisualChange(); // Visual change, render the screen this frame.
	boardPos[0] += loadbalancer.getDeltaTime() * panVel[0] / boardScale;
	boardPos[1] += loadbalancer.getDeltaTime() * panVel[1] / boardScale;
}

function recalcScale() {
	if (scaleVel === 0) return; // Exit if we're not zooming

	// Dampen the scale change to create a soft zoom limit
	const damp = scaleVel > 0 || boardScale > board.glimitToDampScale() ? 1
        : boardScale / board.glimitToDampScale();

	frametracker.onVisualChange(); // Visual change, render the screen this frame.
	const newScale = boardScale * (1 + loadbalancer.getDeltaTime() * scaleVel * damp);
	setBoardScale(newScale);
}

// Called from game.updateBoard()
function updateNavControls() {

	checkIfBoardDropped(); // Needs to be before exiting from teleporting

	if (transition.areWeTeleporting()) return; // Exit if teleporting
	if (guipromotion.isUIOpen()) { // User needs to select a promotion piece, dont update navigation
		decceleratePanVel();
		deccelerateScaleVel();
		return; 
	}

	// Keyboard
	detectPanning(); // Movement (WASD)
	detectZooming(); // Zoom/Scale (Space shift, mouse wheel)
}

function checkIfBoardDropped() {
	if (boardIsGrabbed === 0) return; // Not grabbed

	if (boardIsGrabbed === 1) { // Mouse grabbed

		if (!input.isMouseHeld_Left()) { // Dropped board
			throwBoard(); // Mouse throws the board
			cancelBoardDrag();
		}
		return;
	}
    
	// boardIsGrabbed === 2   (Finger grab)

	const touchHeldsLength = input.getTouchHelds().length;
	
	const now = Date.now();
	if (touchHeldsLength < 2 && boardPosFingerTwoGrabbed !== undefined) throwScale(now); // One finger has been released.
	if (touchHeldsLength > 0) return;
	throwBoard(now); //Both fingers have been released.
	
	// Drop board
	boardPosFingerTwoGrabbed = undefined;
	cancelBoardDrag();
	return;
}

/**
 * Forcefully terminates a board drag WITHOUT throwing the board.
 */
function cancelBoardDrag() {
	boardIsGrabbed = 0;
	clearPositionHistory();
}

/** Called after letting go of the board. Applies velocity to the board according to how fast the mouse was moving */
function throwBoard(time) {
	removeOldPositions(time);
	if (positionHistory.length < 2) return;
	const firstBoardState = positionHistory[0];
	const lastBoardState = positionHistory[positionHistory.length - 1];
	const deltaX = lastBoardState.boardPos[0] - firstBoardState.boardPos[0];
	const deltaY = lastBoardState.boardPos[1] - firstBoardState.boardPos[1];
	const deltaT = (lastBoardState.time - firstBoardState.time) / 1000; 
	panVel = [deltaX / deltaT * boardScale, deltaY / deltaT * boardScale];
}

function throwScale(time) {
	removeOldPositions(time);
	if (positionHistory.length < 2) return;
	const firstBoardState = positionHistory[0];
	const lastBoardState = positionHistory[positionHistory.length - 1];
	const ratio = lastBoardState.boardScale / firstBoardState.boardScale;
	const deltaTime = (lastBoardState.time - firstBoardState.time) / 1000;
	scaleVel = (ratio - 1 ) / deltaTime;
}

/** Clears the list of past positions. Call this to prevent teleportation giving momentum.*/
function clearPositionHistory() {
	positionHistory = [];
}

function addCurrentPositionToHistory() {
	const time = Date.now();
	removeOldPositions(time);
	positionHistory.push({ time, boardPos, boardScale });
}

function removeOldPositions(time) {
	const earliestTime = time - positionHistoryMillis;
	while (positionHistory[0]?.time < earliestTime) positionHistory.shift();
}

// Checks if the mouse or finger has started dragging the board. Keep in mind if the
// user clicked a piece, then the click event has been removed, so you can't do both at once.
function checkIfBoardDragged() {
	if (perspective.getEnabled() || transition.areWeTeleporting() || draganimation.areDraggingPiece()) return;

	if (boardIsGrabbed === 0) { // Not already grabbed
		if (input.isMouseDown_Left()) grabBoard_WithMouse();
		else if (input.getTouchHelds().length > 0) grabBoard_WithFinger();
	}

	else if (boardIsGrabbed === 2) updateBoardPinch(); // Fingers have pinched
}

function grabBoard_WithMouse() {
	boardIsGrabbed = 1;
	const tile_MouseOver_Float = board.gtile_MouseOver_Float();
	boardPosMouseGrabbed = [tile_MouseOver_Float[0], tile_MouseOver_Float[1]];
	erasePanVelocity();
}

function erasePanVelocity() { panVel = [0,0]; } // Erase all panning velocity

function grabBoard_WithFinger() {
	boardIsGrabbed = 2;
	erasePanVelocity();
	const fingerOneOrTwo = 1;
	recalcPositionFingerGrabbedBoard(fingerOneOrTwo);
	if (input.getTouchHelds().length > 1) initBoardPinch();
}

function recalcPositionFingerGrabbedBoard(fingerOneOrTwo) {
	if (fingerOneOrTwo === 1) boardPosFingerOneGrabbed = board.gpositionFingerOver(input.getTouchHelds()[0].id);
	else boardPosFingerTwoGrabbed = board.gpositionFingerOver(input.getTouchHelds()[1].id);
}

// Called whenever board is pinched. Calculates boardPosFingerTwoGrabbed, scale_WhenBoardPinched, and fingerPixelDist_WhenBoardPinched.
function initBoardPinch() {
	// Finger 2
	const fingerOneOrTwo = 2;
	recalcPositionFingerGrabbedBoard(fingerOneOrTwo);

	scale_WhenBoardPinched = boardScale; // Scale

	// Pixel distance...
	const touch1 = input.getTouchHeldByID(boardPosFingerOneGrabbed.id);
	const touch2 = input.getTouchHeldByID(boardPosFingerTwoGrabbed.id);

	const xDiff = touch1.x - touch2.x;
	const yDiff = touch1.y - touch2.y;

	fingerPixelDist_WhenBoardPinched = Math.hypot(xDiff, yDiff);
}

// Test if fingers have dropped board, or fingers swapped out
function updateBoardPinch() {
	const touchHeldsLength = input.getTouchHelds().length;

	if (boardPosFingerTwoGrabbed === undefined) { // Only 1 grabbed finger 
		if (touchHeldsLength === 1) { // Check if the finger changed
			if (boardPosFingerOneGrabbed.id !== input.getTouchHelds()[0].id) recalcPositionFingerGrabbedBoard(1);
		} else if (touchHeldsLength > 1) { // Add finger, or update both if changed
			const touchHeldsIncludesTouch1 = input.touchHeldsIncludesID(boardPosFingerOneGrabbed.id);
			if (!touchHeldsIncludesTouch1) recalcPositionFingerGrabbedBoard(1); // Finger changed, update
			initBoardPinch();
		}
	} else { // 2 grabbed fingers
		if (touchHeldsLength === 1) { // Drop to 1 finger
			recalcPositionFingerGrabbedBoard(1);
			boardPosFingerTwoGrabbed = undefined;
		} else if (touchHeldsLength > 1) { // Check if any or both fingers changed, update
			const touchHeldsIncludesTouch1 = input.touchHeldsIncludesID(boardPosFingerOneGrabbed.id);
			const touchHeldsIncludesTouch2 = input.touchHeldsIncludesID(boardPosFingerTwoGrabbed.id);
			if (!touchHeldsIncludesTouch1 || !touchHeldsIncludesTouch2) { // 1+ changed
				const fingerOneOrTwo = 1;
				recalcPositionFingerGrabbedBoard(fingerOneOrTwo);
				initBoardPinch();
			}
		}
	}
}

// Are we pressing arrow keys / wasd ?
function detectPanning() {

	if (boardIsGrabbed !== 0) return; // Only pan if we aren't dragging the board

	let panning = false; // Any panning key pressed this frame?
	if (input.atleast1KeyHeld()) { // Skip all if no key is pressed, saves cpu.
		if (input.isKeyHeld('d')) {
			panning = true;
			// if (perspective.getEnabled()) panAccel_Perspective(0)
			// else panVel[0] += loadbalancer.getDeltaTime() * panAccel;
			panAccel_Perspective(0);
		} if (input.isKeyHeld('a')) {
			panning = true;
			// if (perspective.getEnabled()) panAccel_Perspective(180)
			// else panVel[0] -= loadbalancer.getDeltaTime() * panAccel;
			panAccel_Perspective(180);
		} if (input.isKeyHeld('w')) {
			panning = true;
			// if (perspective.getEnabled()) panAccel_Perspective(90)
			// else panVel[1] += loadbalancer.getDeltaTime() * panAccel;
			panAccel_Perspective(90);
		} if (input.isKeyHeld('s')) {
			panning = true;
			// if (perspective.getEnabled()) panAccel_Perspective(-90)
			// else panVel[1] -= loadbalancer.getDeltaTime() * panAccel;
			panAccel_Perspective(-90);
		}
	}
	if (panning) { // Make sure velocity hypotenuse hasn't gone over cap
		// Calculate hypotenuse
		const hyp = Math.hypot(...panVel);
		const capToUse = perspective.getEnabled() ? panVelCap_3D : panVelCap_2D;
		const ratio = capToUse / hyp;
		if (ratio < 1) { // Too fast, multiply components by the ratio to cap our velocity
			panVel[0] *= ratio;
			panVel[1] *= ratio;
		}
	} else decceleratePanVel();
}

function panAccel_Perspective(angle) {
	const baseAngle = -perspective.getRotZ();
	const dirOfTravel = baseAngle + angle;

	const angleRad = math.degreesToRadians(dirOfTravel);

	const XYComponents = math.getXYComponents_FromAngle(angleRad);

	const accelToUse = perspective.getEnabled() ? panAccel_3D : panAccel_2D;
	panVel[0] += loadbalancer.getDeltaTime() * accelToUse * XYComponents[0];
	panVel[1] += loadbalancer.getDeltaTime() * accelToUse * XYComponents[1];
}

function decceleratePanVel() {
	if (panVel[0] === 0 && panVel[1] === 0) return; // Already stopped

	const rateToUse = perspective.getEnabled() ? panAccel_3D : panAccel_2D;

	const hyp = Math.hypot(...panVel);
	const ratio = (hyp - loadbalancer.getDeltaTime() * rateToUse) / hyp;
	if (ratio < 0) panVel = [0,0]; // Stop completely before we start going in the opposite direction
	else {
		panVel[0] *= ratio;
		panVel[1] *= ratio;
	}
}

function deccelerateScaleVel() {
	if (scaleVel === 0) return; // Already stopped

	const deccelerationToUse = docutil.isTouchSupported() ? scaleAccel_Mobile : scaleAccel_Desktop;

	if (scaleVel > 0) {
		scaleVel -= loadbalancer.getDeltaTime() * deccelerationToUse;
		if (scaleVel < 0) scaleVel = 0;
	} else { // scaleVel < 0
		scaleVel += loadbalancer.getDeltaTime() * deccelerationToUse;
		if (scaleVel > 0) scaleVel = 0;
	}
}

// Are we pressing space/shift or scrolling?
function detectZooming() {
	let scaling = false;
	if (input.isKeyHeld(' ')) {
		scaling = true;
		scaleVel -= loadbalancer.getDeltaTime() * scaleAccel_Desktop;
		if (scaleVel < -scaleVelCap) scaleVel = -scaleVelCap;
	}
	if (input.isKeyHeld('shift')) {
		scaling = true;
		scaleVel += loadbalancer.getDeltaTime() * scaleAccel_Desktop;
		if (scaleVel > scaleVelCap) scaleVel = scaleVelCap;
	}
	if (!scaling) deccelerateScaleVel();

	// Mouse wheel
	if (input.getMouseWheel() !== 0) {
		scaleVel -= scrollScaleVel * input.getMouseWheel();
		if (scaleVel > scrollScaleVelCap) scaleVel = scrollScaleVelCap;
		else if (scaleVel < -scrollScaleVelCap) scaleVel = -scrollScaleVelCap;
	}
}

// Sets panVel to a random direction, and sets speed to titleBoardVel. Called when the title screen is initiated.
function randomizePanVelDir() {
    
	const randTheta = Math.random() * 2 * Math.PI;

	const XYComponents = math.getXYComponents_FromAngle(randTheta);

	panVel[0] = XYComponents[0] * guititle.boardVel;
	panVel[1] = XYComponents[1] * guititle.boardVel;
}

// Called if the board is being dragged, calculates new board position.
function dragBoard() {
	if (boardIsGrabbed === 1) dragBoard_WithMouse(); // Mouse is dragging board
	else if (boardIsGrabbed === 2) dragBoard_WithFingers(); // Finger is dragging board
	// Added > 0 so it's more clear
	if (boardIsGrabbed > 0) addCurrentPositionToHistory();
}

// Called when board is being dragged by mouse, calculates new board position.
function dragBoard_WithMouse() {
	frametracker.onVisualChange(); // Visual change. Render the screen this frame.
	// If scale was 1, what's the new position?
	// => Grabbed position subtract pixelMousePos / pixelsPerTile
	const n = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	const newBoardX = boardPosMouseGrabbed[0] - (n * input.getMousePos()[0] / board.gtileWidth_Pixels());
	const newBoardY = boardPosMouseGrabbed[1] - (n * input.getMousePos()[1] / board.gtileWidth_Pixels());
	boardPos = [newBoardX, newBoardY];
}

// Called when board is being dragged by touch, calculates new board position.
function dragBoard_WithFingers() {
	frametracker.onVisualChange(); // Visual change. Render the screen this frame.

	const n = perspective.getIsViewingBlackPerspective() ? -1 : 1; // Makes black perspective work

	if (boardPosFingerTwoGrabbed === undefined) { // 1 Finger, boardIsGrabbedPos remains the same
		const touch = input.getTouchHelds()[0];
		const newBoardX = boardPosFingerOneGrabbed.x - (n * touch.x / board.gtileWidth_Pixels());
		const newBoardY = boardPosFingerOneGrabbed.y - (n * touch.y / board.gtileWidth_Pixels());

		input.moveMouse(touch);

		boardPos = [newBoardX, newBoardY];
		return;
	}
    
	// 2 Fingers, dynamically adjust grab   (center the board position, & calculate scale)

	// Calculate board mid-point between 2 fingers
	const grabDiffX = boardPosFingerTwoGrabbed.x - boardPosFingerOneGrabbed.x;
	const grabDiffY = boardPosFingerTwoGrabbed.y - boardPosFingerOneGrabbed.y;
	const grabMidX = boardPosFingerOneGrabbed.x + grabDiffX / 2;
	const grabMidY = boardPosFingerOneGrabbed.y + grabDiffY / 2;
    
	// Retrieve the touches information, which includes their location on the screen in pixels. Calculate the screen-mid-point between them in pixels.
	const touchHeld1 = input.getTouchHeldByID(boardPosFingerOneGrabbed.id);
	const touchHeld2 = input.getTouchHeldByID(boardPosFingerTwoGrabbed.id);
	const screenDiffX = touchHeld2.x - touchHeld1.x;
	const screenDiffY = touchHeld2.y - touchHeld1.y;
	const screenMidX = touchHeld1.x + screenDiffX / 2;
	const screenMidY = touchHeld1.y + screenDiffY / 2;

	// Make the board position match the mid-point between the 2 touches
	const newBoardX = grabMidX - n * (screenMidX / board.gtileWidth_Pixels());
	const newBoardY = grabMidY - n * (screenMidY / board.gtileWidth_Pixels());
	boardPos = [newBoardX, newBoardY];
    
	// Calculate the new scale by comparing the touches current distance in pixels to their distance when they first started pinching
	const point1 = [touchHeld1.x, touchHeld1.y];
	const point2 = [touchHeld2.x, touchHeld2.y];
	const thisPixelDist = math.euclideanDistance(point1, point2);
	let ratio = thisPixelDist / fingerPixelDist_WhenBoardPinched;

	// If the scale is greatly zoomed out, start slowing it down
	if (scale_WhenBoardPinched < board.glimitToDampScale() && ratio < 1) {
		const dampener = scale_WhenBoardPinched / board.glimitToDampScale();
		ratio = (ratio - 1) * dampener + 1;
	}

	const newScale = scale_WhenBoardPinched * ratio;
	setBoardScale(newScale);

	input.moveMouse(touchHeld1, touchHeld2);
}

function eraseMomentum() {
	panVel = [0,0];
	scaleVel = 0;
}

function boardOrScaleHasMomentum() {
	return panVel[0] !== 0 || panVel[1] !== 0 || scaleVel !== 0;
}

function boardHasMomentum() {
	return panVel[0] !== 0 || panVel[1] !== 0;
}

function setPositionToArea(area) {
	if (!area) console.error("Cannot set position to an undefined area.");

	const copiedCoords = coordutil.copyCoords(area.coords);
	setBoardPos(copiedCoords);
	setBoardScale(area.scale);
}

export default {
	getScale_When1TileIs1Pixel_Physical,
	setScale_When1TileIs1Pixel_Physical,
	getScale_When1TileIs1Pixel_Virtual,
	setScale_When1TileIs1Pixel_Virtual,
	isScaleLess1Pixel_Physical,
	isScaleLess1Pixel_Virtual,
	getBoardPos,
	setBoardPos,
	getBoardScale,
	setBoardScale,
	recalcPosition,
	panBoard,
	updateNavControls,
	randomizePanVelDir,
	dragBoard,
	boardOrScaleHasMomentum,
	boardHasMomentum,
	eraseMomentum,
	setPositionToArea,
	checkIfBoardDragged,
	cancelBoardDrag,
};