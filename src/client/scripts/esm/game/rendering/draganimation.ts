
/**
 * This script hides the original piece and renders a copy at the pointer location.
 * It also highlights the square that the piece would be dropped on (to do)
 * and plays the sound when the piece is dropped.
 */


import type { BufferModel } from "./buffermodel.js";
import type { Color } from "../../chess/util/colorutil.js";
import type { Coords } from "../../chess/util/coordutil.js";
import type { BoundingBox } from "../../util/math.js";

import spritesheet from "./spritesheet.js";
import coordutil from "../../chess/util/coordutil.js";
import frametracker from "./frametracker.js";
import { createModel } from "./buffermodel.js";
// @ts-ignore
import shapes from "./shapes.js";
// @ts-ignore
import bufferdata from "./bufferdata.js";
// @ts-ignore
import options from "./options.js";
// @ts-ignore
import perspective from "./perspective.js";
// @ts-ignore
import sound from "../misc/sound.js";
// @ts-ignore
import movement from "./movement.js";
// @ts-ignore
import input from "../input.js";
// @ts-ignore
import camera from "./camera.js";
// @ts-ignore
import themes from "../../components/header/themes.js";
// @ts-ignore
import preferences from "../../components/header/preferences.js";
// @ts-ignore
import board from "./board.js";


// Variables --------------------------------------------------------------------------------------


const z: number = 0.01;
/** When not in perspective the pieces size is independent of board scale. */
const touchscreenScale: number = 2;
const mouseScale: number = 1;
/** When using a touchscreen, the piece is shifted upward by this amount to prevent it being covered by fingers. */
const touchscreenOffset: number = 1.6; // Default: 2
/**
 * The minimum size of the dragged piece relative to the stationary pieces.
 * When zoomed in, this prevents it becoming tiny relative to the others.
 */
const minScale: number = 1;
/** When the scale is smaller (more zoomed out) than this, we render rank/column outlines instead of the box. */
const maxScaleToDrawOutline: number = 0.65;
/** The width of the box outline used to emphasize the hovered square. */
const outlineWidth_Mouse: number = 0.08; // Default: 0.1
const outlineWidth_Touch: number = 0.05;

/** The hight the piece is rendered above the board when in perspective mode. */
const perspectiveHeight: number = 0.6;
const shadowColor: Color = [0.1, 0.1, 0.1, 0.5];

/** The coordinates of the piece before it was dragged. */
let startCoords: Coords | undefined;
/** The world location the piece has been dragged to. */
let worldLocation: Coords | undefined;
/** The square that will be outlined. */
let hoveredCoords: Coords | undefined;
/** The type of piece being dragged. */
let pieceType: string | undefined;


// Functions --------------------------------------------------------------------------------------


// Hides the original piece
function renderTransparentSquare() {
	if (!startCoords) return;
	const transparentModel = genTransparentModel();
	transparentModel.render([0,0,z]); // Since this data did NOT contain the z coordinates, we can translate it by it here
}

// Renders the box outline, the dragged piece and its shadow
function renderPiece() {
	if (perspective.isLookingUp() || !worldLocation) return;

	const outlineModel: BufferModel = hoveredCoords !== undefined ? genOutlineModel() : genIntersectingLines();
	outlineModel.render();

	const draggedPieceModel = genPieceModel();
	if (draggedPieceModel !== undefined) draggedPieceModel.render();
}

/**
 * Generates a transparent model to hide the original piece.
 * @returns The buffer model
 */
function genTransparentModel(): BufferModel {
	const color = [0,0,0,0];
	const data = shapes.getTransformedDataQuad_Color_FromCoord(startCoords, color); // Hide orginal piece
	return createModel(data, 2, "TRIANGLES", true);
}

/**
 * Generates the model of the dragged piece and its shadow.
 * @returns The buffer model
 */
function genPieceModel(): BufferModel | undefined {
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
	let size: number;
	if (touchscreen) {
		size = boardScale;
		if (size < touchscreenScale) size = touchscreenScale;
	} else if (perspectiveEnabled) {
		size = boardScale;
	} else { // 2D Mode
		size = mouseScale * boardScale;
		if (size < minScale) size = minScale;
	}
	const halfSize = size / 2;
	const left = worldLocation![0] - halfSize;
	const bottom = worldLocation![1] - halfSize + (touchscreen ? touchscreenOffset : 0);
	const right = worldLocation![0] + halfSize;
	const top = worldLocation![1] + halfSize + (touchscreen ? touchscreenOffset : 0);
	
	const data: number[] = [];
	if (perspectiveEnabled) data.push(...bufferdata.getDataQuad_ColorTexture3D(left, bottom, right, top, z, texleft, texbottom, texright, textop, ...shadowColor)); // Shadow
	data.push(...bufferdata.getDataQuad_ColorTexture3D(left, bottom, right, top, height, texleft, texbottom, texright, textop, r, g, b, a)); // Piece
	return createModel(data, 3, "TRIANGLES", true, spritesheet.getSpritesheet());
}

/**
 * Generates a model to enphasize the hovered square.
 * If mouse is being used the square is outlined.
 * On touchscreen the entire rank and file are outlined.
 * @returns The buffer model
 */
function genOutlineModel(): BufferModel {
	const boardScale = movement.getBoardScale();
	const data: number[] = [];
	const pointerIsTouch = input.getPointerIsTouch();
	const { left, right, bottom, top } = shapes.getTransformedBoundingBoxOfSquare(hoveredCoords!);
	const width = (pointerIsTouch ? outlineWidth_Touch : outlineWidth_Mouse) * movement.getBoardScale();
	const color = options.getDefaultOutlineColor();
	
	// Checking if the coords are equal prevents the large lines flashing when tapping to select.
	if ((pointerIsTouch || boardScale < maxScaleToDrawOutline) && !coordutil.areCoordsEqual(hoveredCoords, startCoords)) {
		// Outline the entire rank and file
		let boundingBox;
		if (perspective.getEnabled()) {
			const dist = perspective.distToRenderBoard;
			boundingBox = { left: -dist, right: dist, bottom: -dist, top: dist };
		} else boundingBox = camera.getScreenBoundingBox(false);

		data.push(...bufferdata.getDataQuad_Color({ left, right: left + width, bottom: boundingBox.bottom, top: boundingBox.top }, color)); // left
		data.push(...bufferdata.getDataQuad_Color({ left: boundingBox.left, right: boundingBox.right, bottom, top: bottom + width }, color)); // bottom
		data.push(...bufferdata.getDataQuad_Color({ left: right - width, right, bottom: boundingBox.bottom, top: boundingBox.top }, color)); // right
		data.push(...bufferdata.getDataQuad_Color({ left: boundingBox.left, right: boundingBox.right, bottom: top - width, top }, color)); // top
	} else {
		// Outline the hovered square
		data.push(...getBoxFrameData(hoveredCoords!));
	}
	
	return createModel(data, 2, "TRIANGLES", true);
}

/**
 * Generates vertex data for a rectangular frame (box).
 * @param coords - The coordinate of the box frame
 * @returns The vertex data for the frame.
 */
function getBoxFrameData(coords: Coords): number[] {
	const boardPos = movement.getBoardPos();
	const boardScale = movement.getBoardScale();
	const squareCenter = board.gsquareCenter();
	const edgeWidth = 0.07 * boardScale;
	const color = themes.getPropertyOfTheme(preferences.getTheme(), 'boxOutlineColor');

	const centerXOfBox = coords[0] + 0.5 - squareCenter;
	const centerYOfBox = coords[1] + 0.5 - squareCenter;
	const centerX = (centerXOfBox - boardPos[0]) * boardScale;
	const centerY = (centerYOfBox - boardPos[1]) * boardScale;

	const vertices: number[] = [];
	const [r, g, b, a] = color;

	// Calculate outer bounds
	const halfBox = (1 / 2) * boardScale;
	const outerLeft = centerX - halfBox;
	const outerRight = centerX + halfBox;
	const outerTop = centerY + halfBox;
	const outerBottom = centerY - halfBox;

	// Calculate inner bounds
	const innerLeft = outerLeft + edgeWidth;
	const innerRight = outerRight - edgeWidth;
	const innerTop = outerTop - edgeWidth;
	const innerBottom = outerBottom + edgeWidth;

	// Helper function to add a rectangle (two triangles)
	function addRectangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) {
		vertices.push(
			x1, y1, r, g, b, a, // Triangle 1, Vertex 1
			x2, y2, r, g, b, a, // Triangle 1, Vertex 2
			x3, y3, r, g, b, a, // Triangle 1, Vertex 3
			x3, y3, r, g, b, a, // Triangle 2, Vertex 1
			x4, y4, r, g, b, a, // Triangle 2, Vertex 2
			x1, y1, r, g, b, a  // Triangle 2, Vertex 3
		);
	}

	// Top edge
	addRectangle(
		outerLeft, outerTop,  // Outer top-left
		outerRight, outerTop, // Outer top-right
		innerRight, innerTop, // Inner top-right
		innerLeft, innerTop   // Inner top-left
	);

	// Bottom edge
	addRectangle(
		outerLeft, outerBottom,  // Outer bottom-left
		innerLeft, innerBottom,  // Inner bottom-left
		innerRight, innerBottom, // Inner bottom-right
		outerRight, outerBottom  // Outer bottom-right
	);

	// Left edge
	addRectangle(
		outerLeft, outerTop,    // Outer top-left
		innerLeft, innerTop,    // Inner top-left
		innerLeft, innerBottom, // Inner bottom-left
		outerLeft, outerBottom  // Outer bottom-left
	);

	// Right edge
	addRectangle(
		outerRight, outerTop,    // Outer top-right
		outerRight, outerBottom, // Outer bottom-right
		innerRight, innerBottom, // Inner bottom-right
		innerRight, innerTop     // Inner top-right
	);

	return vertices;
}

/**
 * Generates a model of two lines intersecting at the piece.
 * Used when the piece is unable to be dropped such as when
 * zoomed far out or teleporting.
 * @returns The buffer model
 */
function genIntersectingLines(): BufferModel {
	let boundingBox: BoundingBox;
	if (perspective.getEnabled()) {
		const dist = perspective.distToRenderBoard;
		boundingBox = { left: -dist, right: dist, bottom: -dist, top: dist };
	} else boundingBox = camera.getScreenBoundingBox(false);
	
	const { left, right, bottom, top } = boundingBox;
	const [ r, g, b, a ] = options.getDefaultOutlineColor();
	const data = [
		left, worldLocation![1], r, g, b, a,
		right, worldLocation![1],r, g, b, a,
		worldLocation![0], bottom, r, g, b, a,
		worldLocation![0], top, r, g, b, a,
	];
	return createModel(data, 2, "LINES", true);
}

/**
 * Start dragging a piece.
 * @param type - The type of piece being dragged
 * @param pieceCoords - the square the piece was on
 */
function pickUpPiece(type: string, pieceCoords: Coords) {
	startCoords = pieceCoords;
	pieceType = type;
}

/**
 * Update the location of the piece being dragged.
 * @param  coords - the world coordinates the piece has been dragged to
 * @param [hoverSquare] - The square the piece would be moved to if dropped now.
 */
function dragPiece(coords: Coords, hoverSquare?: Coords) {
	worldLocation = coords;
	hoveredCoords = hoverSquare;
	frametracker.onVisualChange();
}

/**
 * Stop dragging the piece and optionally play a sound.
 * @param playSound - Plays a sound. This should be true if the piece moved; false if it was dropped on the original square.
 * @param wasCapture - If true, the capture sound is played. This has no effect if `playSound` is false.
 */
function dropPiece(playSound: boolean = false, wasCapture: boolean = false) {
	if (playSound) {
		if (wasCapture) sound.playSound_capture(0, false);
		else sound.playSound_move(0, false);
	}
	pieceType = undefined;
	startCoords = undefined;
	worldLocation = undefined;
	frametracker.onVisualChange();
}



export default {
	pickUpPiece,
	dragPiece,
	dropPiece,
	renderTransparentSquare,
	renderPiece
};