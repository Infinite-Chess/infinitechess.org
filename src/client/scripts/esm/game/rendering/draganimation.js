
// Import start
import shapes from "./shapes.js";
import buffermodel from "./buffermodel.js";
import bufferdata from "./bufferdata.js";
import options from "./options.js";
import spritesheet from "./spritesheet.js";
import perspective from "./perspective.js";
import sound from "../misc/sound.js";
import frametracker from "./frametracker.js";
import movement from "./movement.js";
import input from "../input.js";
import space from "../misc/space.js";
import camera from "./camera.js";
import coordutil from "../../chess/util/coordutil.js";
// Import end

/**
 * Type Definitions
 * @typedef {import('./buffermodel.js').BufferModel} BufferModel
 */

"use strict";

/**
 * This script hides the original piece and renders a copy at the pointer location.
 * It also highlights the square that the piece would be dropped on (to do)
 * and plays the sound when the piece is dropped.
 */

/**
 * To Do:
 * - Emphasise the hovered square like Lichess and Chess.com.
 */

const z = 0.01;
/** When not in perspective the pieces size is independent of board scale. */
const touchscreenScale = 2;
const mouseScale = 1;
/** When using a touchscreen, the piece is shifted upward by this amount to prevent it being covered by fingers. */
const touchscreenOffset = 2;
/**
 * The minimum size of the dragged piece relative to the stationary pieces.
 * When zoomed in, this prevents it becoming tiny relative to the others.
 */
const minimumScale = 0.9;
/** The width of the box outline used to emphasize the hovered square. */
const outlineWidth_Mouse = 0.1;
const outlineWidth_Touch = 0.05;

/** The hight the piece is rendered above the board when in perspective mode. */
const perspectiveHeight = 0.6;
const shadowColor = [0.1, 0.1, 0.1, 0.5];

/** The coordinates of the piece before it was dragged. @type {number[]} */
let startCoords;
/** The world location the piece has been dragged to. @type {number[]} */
let worldLocation;
/** The square that will be outlined. @type {number[]} */
let hoveredCoords;
/** The type of piece being dragged. @type {string} */
let pieceType;

// Hides the original piece
function renderTransparentSquare() {
	if (!startCoords) return;
	let transparentModel = genTransparentModel();
	transparentModel.render();
}

// Renders the box outline, the dragged piece and its shadow
function renderPiece() {
	if (perspective.isLookingUp() || !worldLocation) return;
	let outlineModel;
	if (hoveredCoords) outlineModel = genOutlineModel();
	else outlineModel = genIntersectingLines();
	outlineModel.render();
	genPieceModel().render();
}

/**
 * Generates a transparent model to hide the original piece.
 * @returns {BufferModel} The buffer model
 */
function genTransparentModel() {
	let color = [0,0,0,0];
	let data = shapes.getTransformedDataQuad_Color3D_FromCoord(startCoords, z, color); //Hide orginal piece
	return buffermodel.createModel_Colored(new Float32Array(data), 3, "TRIANGLES");
}

/**
 * Generates the model of the dragged piece and its shadow.
 * @returns {BufferModel} The buffer model
 */
function genPieceModel() {
	if (perspective.isLookingUp()) return;
	const perspectiveEnabled = perspective.getEnabled();
	const touchscreen = input.getPointerIsTouch();
	const boardScale = movement.getBoardScale();
	const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	
	const { texleft, texbottom, texright, textop } = bufferdata.getTexDataOfType(pieceType, rotation);
	const { r, g, b, a } = options.getColorOfType(pieceType);
	
	// In perspective the piece is rendered above the surface of the board.
	const height = perspectiveEnabled ? perspectiveHeight * boardScale : z;
	
	// If touchscreen is being used the piece is rendered larger and offset upward to prevent
	// it being covered by the finger.
	let size = perspectiveEnabled ? boardScale : touchscreen ? touchscreenScale : mouseScale;
	const minimumSize = boardScale * minimumScale;
	if (size < minimumSize) size = minimumSize;
	const left = worldLocation[0] - size / 2;
	const bottom = worldLocation[1] - size / 2 + (touchscreen ? touchscreenOffset : 0);
	const right = worldLocation[0] + size / 2;
	const top = worldLocation[1] + size / 2 + (touchscreen ? touchscreenOffset : 0);
	
	let data = [];
	if (perspectiveEnabled) data.push(...bufferdata.getDataQuad_ColorTexture3D(left, bottom, right, top, z, texleft, texbottom, texright, textop, ...shadowColor)); // Shadow
	data.push(...bufferdata.getDataQuad_ColorTexture3D(left, bottom, right, top, height, texleft, texbottom, texright, textop, r, g, b, a)); // Piece
	return buffermodel.createModel_ColorTextured(new Float32Array(data), 3, "TRIANGLES", spritesheet.getSpritesheet());
}

/**
 * Generates a model to enphasize the hovered square.
 * If mouse is being used the square is outlined.
 * On touchscreen the entire rank and file are outlined.
 * @returns {BufferModel} The buffer model
 */
function genOutlineModel() {
	let data = [];
	const pointerIsTouch = input.getPointerIsTouch()
	const { left, right, bottom, top } = shapes.getTransformedBoundingBoxOfSquare(hoveredCoords);
	const width = (pointerIsTouch ? outlineWidth_Touch : outlineWidth_Mouse) * movement.getBoardScale();
	const color = options.getDefaultOutlineColor();
	
	// Checking if the coords are equal prevents the large lines flashing when tapping to select.
	if (pointerIsTouch && !coordutil.areCoordsEqual(hoveredCoords, startCoords)) {
		// Outline the entire rank and file
		const boundingBox = camera.getScreenBoundingBox(false);
		data.push(...bufferdata.getDataQuad_Color3D({ left, right: left + width, bottom: boundingBox.bottom, top: boundingBox.top }, z, color)); // left
		data.push(...bufferdata.getDataQuad_Color3D({ left: boundingBox.left, right: boundingBox.right, bottom, top: bottom+width }, z, color)); // bottom
		data.push(...bufferdata.getDataQuad_Color3D({ left: right - width, right, bottom: boundingBox.bottom, top: boundingBox.top }, z, color)); // right
		data.push(...bufferdata.getDataQuad_Color3D({ left: boundingBox.left, right: boundingBox.right, bottom: top - width, top }, z, color)); // top
	} else {
		// Outline the hovered square
		data.push(...bufferdata.getDataQuad_Color3D({ left, right: left + width, bottom, top }, z, color)); // left
		data.push(...bufferdata.getDataQuad_Color3D({ left, right, bottom, top: bottom + width }, z, color)); // bottom
		data.push(...bufferdata.getDataQuad_Color3D({ left: right - width, right, bottom, top }, z, color)); // right
		data.push(...bufferdata.getDataQuad_Color3D({ left, right, bottom: top - width, top }, z, color)); // top
	}
	
	return buffermodel.createModel_Colored(new Float32Array(data), 3, "TRIANGLES");
}

/**
 * Generates a model of two lines intersecting at the piece.
 * Used when the piece is unable to be dropped such as when
 * zoomed far out or teleporting.
 * @returns {BufferModel} The buffer model
 */
function genIntersectingLines() {
	const { left, right, bottom, top } = camera.getScreenBoundingBox(false);
	const [ r, g, b, a ] = options.getDefaultOutlineColor();
	let data = [
		left, worldLocation[1], r, g, b, a,
		right, worldLocation[1],r, g, b, a,
		worldLocation[0], bottom, r, g, b, a,
		worldLocation[0], top, r, g, b, a,
	];
	return buffermodel.createModel_Colored(new Float32Array(data), 2, "LINES");
}

/**
 * Start dragging a piece.
 * @param {string} type - The type of piece being dragged
 * @param {number} pieceCoords - the square the piece was on
 */
function pickUpPiece(type, pieceCoords) {
	startCoords = pieceCoords;
	pieceType = type;
}

/**
 * Update the location of the piece being dragged.
 * @param {number[]} coords - the world coordinates the piece has been dragged to
 * @param {number[]} [hoverSquare] - The square the piece would be moved to if dropped now.
 */
function dragPiece(coords, hoverSquare) {
	worldLocation = coords;
	hoveredCoords = hoverSquare;
	frametracker.onVisualChange();
}

/**
 * Stop dragging the piece and optionally play a sound.
 * @param {boolean} playSound - Plays a sound. This should be true if the piece moved; false if it was dropped on the original square.
 * @param {boolean} wasCapture - If true, the capture sound is played. This has no effect if `playSound` is false.
 */
function dropPiece( playSound = false, wasCapture = false ) {
	if (playSound) {
		if (wasCapture) sound.playSound_capture(0, false);
		else sound.playSound_move(0, false);
	}
	pieceType = null;
	startCoords = null;
	worldLocation = null;
	frametracker.onVisualChange();
}

export default {
	pickUpPiece,
	dragPiece,
	dropPiece,
	renderTransparentSquare,
	renderPiece
}