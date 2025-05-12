
/**
 * This script hides the original piece and renders a copy at the pointer location.
 * It also highlights the square that the piece would be dropped on (to do)
 * and plays the sound when the piece is dropped.
 */


import type { BufferModel } from "../buffermodel.js";
import type { Color } from "../../../util/math.js";
import type { Coords } from "../../../chess/util/coordutil.js";
import type { BoundingBox } from "../../../util/math.js";
import type { Piece } from "../../../chess/util/boardutil.js";
import type { RawType } from "../../../chess/util/typeutil.js";

import spritesheet from "../spritesheet.js";
import coordutil from "../../../chess/util/coordutil.js";
import frametracker from "../frametracker.js";
import { createModel } from "../buffermodel.js";
import space from "../../misc/space.js";
import droparrows from "./droparrows.js";
import selection from "../../chess/selection.js";
import preferences from "../../../components/header/preferences.js";
import themes from "../../../components/header/themes.js";
import typeutil from "../../../chess/util/typeutil.js";
import animation from "../animation.js";
import { listener_document, listener_overlay } from "../../chess/game.js";
import { InputListener, Mouse } from "../../input.js";
import mouse from "../../../util/mouse.js";
import boardpos from "../boardpos.js";
// @ts-ignore
import shapes from "../shapes.js";
// @ts-ignore
import bufferdata from "../bufferdata.js";
// @ts-ignore
import perspective from "../perspective.js";
// @ts-ignore
import camera from "../camera.js";
// @ts-ignore
import board from "../board.js";


// Variables --------------------------------------------------------------------------------------


const z: number = 0.01;

/**
 * The minimum size of the rendered dragged piece on screen, in virtual pixels.
 * When zoomed out, this prevents it becoming tiny relative to the other pieces.
 */
const dragMinSizeVirtualPixels = {
	/** 2D desktop mode */
	mouse: 50, // Only applicable in 2D mode, not perspective
	/** Mobile/touchscreen mode */
	touch: 50
};

/**
 * The width of the box/rank/file outline used to emphasize the hovered square.
 */
const outlineWidth = {
	/** 2D desktop mode */
	mouse: 0.08,
	// Since on touchscreen the rank/column outlines are ALWAYS enabled,
	// make them a little less noticeable/distracting.
	/** Mobile/touchscreen mode */
	touch: 0.065
};

/** When using a touchscreen, the piece is shifted upward by this amount to prevent it being covered by fingers. */
const touchscreenOffset: number = 1.6; // Default: 2
/** When each square becomes smaller than this in virtual pixels, we render rank/column outlines instead of the outline box. */
const minSizeToDrawOutline: number = 40;

/** Adjustments for the dragged piece while in perspective mode. */
const perspectiveConfigs: { z: number, shadowColor: Color } = {
	/** The height the piece is rendered above the board when in perspective mode. */
	z: 0.6,
	/** The color of the shadow of the dragged piece. */
	shadowColor: [0.1, 0.1, 0.1, 0.5]
};


/** If true, `pieceSelected` is currently being held. */
let areDragging = false;
/**
 * When true, the next time a piece is dropped on its own square, it will NOT be unselected.
 * But if this is false, it WOULD be unselected.
 * Pieces are unselected every second time dropped.
 */
let parity: boolean = true;

/** The ID of the pointer that is dragging the piece. */
let pointerId: string | undefined;

/** The coordinates of the piece before it was dragged. */
let startCoords: Coords | undefined;
/** The world location the piece has been dragged to. */
let worldLocation: Coords | undefined;
/** The square that the piece would be moved to if dropped now. It will be outlined. */
let hoveredCoords: Coords | undefined;
/** The type of piece being dragged. */
let pieceType: number | undefined;


// Functions --------------------------------------------------------------------------------------


function areDraggingPiece(): boolean {
	return areDragging;
}

/** If true, the last pick-up action newly selected that piece, vs picking up an already-selected piece. */
function getDragParity(): boolean {
	return parity;
}

/**
 * Start dragging a piece.
 * @param type - The type of piece being dragged
 * @param pieceCoords - the square the piece was on
 */
function pickUpPiece(piece: Piece, resetParity: boolean) {
	if (!preferences.getDragEnabled()) return; // Dragging is disabled
	areDragging = true;
	if (resetParity) parity = true;

	const respectiveListener = getRespectiveListener();
	pointerId = respectiveListener.getMouseId(Mouse.LEFT);

	startCoords = piece.coords;
	pieceType = piece.type;
	// If any one animation's end coords is currently being animated towards the coords of the picked up piece, clear the animation.
	if (animation.animations.some(a => coordutil.areCoordsEqual_noValidate(piece.coords, a.path[a.path.length - 1]!) )) animation.clearAnimations(true);
}

function getRespectiveListener(): InputListener {
	return perspective.getEnabled() ? listener_document : listener_overlay;
}

/**
 * Call AFTER selection.update()
 */
function updateDragLocation() {
	if (!areDragging) return;
	
	/**
	 * If the promotion UI is open, change the world location of
	 * the dragged piece to the promotion square
	 */
	const squarePawnPromotingOn = selection.getSquarePawnIsCurrentlyPromotingOn();
	if (squarePawnPromotingOn !== undefined) {
		const worldCoords = space.convertCoordToWorldSpace(squarePawnPromotingOn);
		worldLocation = worldCoords;
		hoveredCoords = squarePawnPromotingOn;
		return;
	} else {
		// Normal drag location
		worldLocation = mouse.getPointerWorld(pointerId!)!;
		hoveredCoords = space.convertWorldSpaceToCoords_Rounded(worldLocation);
	}
}

/** Call AFTER {@link updateDragLocation} and BEFORE {@link renderPiece} */
function setDragLocationAndHoverSquare(worldLoc: Coords, hoverSquare: Coords) {
	worldLocation = worldLoc;
	hoveredCoords = hoverSquare;
}

/** Whether the pointer dragging the selected piece has released yet. */
function hasPointerReleased(): boolean {
	if (!areDragging) throw Error("Don't call hasPointerReleased() when not dragging a piece");
	const respectiveListener = getRespectiveListener();
	const pointer = respectiveListener.getPointer(pointerId!);
	return pointer === undefined || !pointer.isHeld;
}

/**
 * Places the pointer that was dragging the piece back into the pointers down list.
 * This allows other scripts to utilize it, such as boarddrag.
 */
function unclaimPointer() {
	// console.log("Unclaiming pointer", pointerId);
	const respectiveListener = getRespectiveListener();
	respectiveListener.unclaimPointerDown(pointerId!);
}

/** Returns the pointer id that is dragging the piece. */
function getPointerId(): string {
	if (!areDragging) throw Error("Don't call getPointerId() when not dragging a piece");
	return pointerId!;
}

/**
 * Stop dragging the piece and optionally play a sound.
 * @param playSound - Plays a sound. This should be true if the piece moved; false if it was dropped on the original square.
 * @param wasCapture - If true, the capture sound is played. This has no effect if `playSound` is false.
 */
function dropPiece() {
	// console.error("Dropped piece");
	if (!areDragging) return;
	areDragging = false;
	pieceType = undefined;
	startCoords = undefined;
	worldLocation = undefined;
	hoveredCoords = undefined;
	parity = false; // The next time this piece is dropped on its home square, it will be deselected
	droparrows.onDragTermination();
	frametracker.onVisualChange();
}

/** Puts the dragged piece back. Doesn't make a move. */
function cancelDragging() {
	dropPiece();
	parity = true;
}


// Rendering --------------------------------------------------------------------------------------------


// Hides the original piece by rendering a transparent square model above it in the depth field.
function renderTransparentSquare() {
	if (!startCoords) return;

	const color = [0,0,0,0];
	const data = shapes.getTransformedDataQuad_Color_FromCoord(startCoords, color); // Hide orginal piece
	return createModel(data, 2, "TRIANGLES", true).render([0,0,z]);
}

// Renders the box outline, the dragged piece and its shadow
function renderPiece() {
	if (!areDragging ||  perspective.isLookingUp() || !worldLocation) return;

	const outlineModel: BufferModel = hoveredCoords !== undefined ? genOutlineModel() : genIntersectingLines();
	outlineModel.render();

	genPieceModel()?.render();
}

/**
 * Generates the model of the dragged piece and its shadow.
 * @returns The buffer model
 */
function genPieceModel(): BufferModel | undefined {
	if (perspective.isLookingUp()) return;
	if (typeutil.SVGLESS_TYPES.some((type: RawType) => typeutil.getRawType(pieceType!) === type)) return; // No SVG/texture for this piece (void), can't render it.

	const perspectiveEnabled = perspective.getEnabled();
	const touchscreenUsed = listener_overlay.isMouseTouch(Mouse.LEFT);
	const boardScale = boardpos.getBoardScale();
	const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	
	const { texleft, texbottom, texright, textop } = bufferdata.getTexDataOfType(pieceType, rotation);
	
	// In perspective the piece is rendered above the surface of the board.
	const height = perspectiveEnabled ? perspectiveConfigs.z * boardScale : z;
	
	// If touchscreen is being used the piece is rendered larger and offset upward to prevent
	// it being covered by the finger.
	let size: number = boardScale;
	if (!selection.getSquarePawnIsCurrentlyPromotingOn() && !perspective.getEnabled()) { // Apply a minimum size only if we're not currently promoting a pawn (promote UI open) and not in perspective mode.
		// The minimum world space the dragged piece should be rendered
		const minSizeWorldSpace = touchscreenUsed ? space.convertPixelsToWorldSpace_Virtual(dragMinSizeVirtualPixels.touch)  // Mobile/touchscreen mode
												  : space.convertPixelsToWorldSpace_Virtual(dragMinSizeVirtualPixels.mouse); // 2D desktop mode
		size = Math.max(size, minSizeWorldSpace); // Apply the minimum size
	}

	const halfSize = size / 2;
	const left = worldLocation![0] - halfSize;
	const bottom = worldLocation![1] - halfSize + (touchscreenUsed ? touchscreenOffset * rotation : 0);
	const right = worldLocation![0] + halfSize;
	const top = worldLocation![1] + halfSize + (touchscreenUsed ? touchscreenOffset * rotation : 0);
	
	const data: number[] = [];
	if (perspectiveEnabled) data.push(...bufferdata.getDataQuad_ColorTexture3D(left, bottom, right, top, z, texleft, texbottom, texright, textop, ...perspectiveConfigs.shadowColor)); // Shadow
	data.push(...bufferdata.getDataQuad_ColorTexture3D(left, bottom, right, top, height, texleft, texbottom, texright, textop, 1, 1, 1, 1)); // Piece
	return createModel(data, 3, "TRIANGLES", true, spritesheet.getSpritesheet());
}

/**
 * Generates a model to enphasize the hovered square.
 * If mouse is being used the square is outlined.
 * On touchscreen the entire rank and file are outlined.
 * @returns The buffer model
 */
function genOutlineModel(): BufferModel {
	const data: number[] = [];
	const pointerIsTouch = listener_overlay.isMouseTouch(Mouse.LEFT);
	const { left, right, bottom, top } = shapes.getTransformedBoundingBoxOfSquare(hoveredCoords!);
	const width = (pointerIsTouch ? outlineWidth.touch : outlineWidth.mouse) * boardpos.getBoardScale();
	const color = preferences.getBoxOutlineColor();
	
	// Outline the enire rank & file when:
	// 1. We're not hovering over the start square.
	// 2. It is a touch screen, OR we are zoomed out enough.
	if (!coordutil.areCoordsEqual(hoveredCoords, startCoords) && (pointerIsTouch || board.gtileWidth_Pixels() < minSizeToDrawOutline)) {
		// Outline the entire rank and file
		let boundingBox: BoundingBox;
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
	const boardPos = boardpos.getBoardPos();
	const boardScale = boardpos.getBoardScale();
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
	const [ r, g, b, a ] = preferences.getBoxOutlineColor();
	const data = [
		left, worldLocation![1], r, g, b, a,
		right, worldLocation![1],r, g, b, a,
		worldLocation![0], bottom, r, g, b, a,
		worldLocation![0], top, r, g, b, a,
	];
	return createModel(data, 2, "LINES", true);
}



export default {
	areDraggingPiece,
	getDragParity,
	pickUpPiece,
	updateDragLocation,
	setDragLocationAndHoverSquare,
	hasPointerReleased,
	unclaimPointer,
	getPointerId,
	dropPiece,
	cancelDragging,
	renderTransparentSquare,
	renderPiece
};