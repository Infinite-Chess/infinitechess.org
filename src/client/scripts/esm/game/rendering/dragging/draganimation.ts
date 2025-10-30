
/**
 * This script hides the original piece and renders a copy at the pointer location.
 * It also highlights the square that the piece would be dropped on (to do)
 * and plays the sound when the piece is dropped.
 */


import type { Renderable } from "../../../webgl/Renderable.js";
import type { Color } from "../../../../../../shared/util/math/math.js";
import type { Coords, DoubleCoords } from "../../../../../../shared/chess/util/coordutil.js";
import type { Piece } from "../../../../../../shared/chess/util/boardutil.js";


import spritesheet from "../spritesheet.js";
import coordutil from "../../../../../../shared/chess/util/coordutil.js";
import frametracker from "../frametracker.js";
import { createRenderable } from "../../../webgl/Renderable.js";
import space from "../../misc/space.js";
import droparrows from "./droparrows.js";
import selection from "../../chess/selection.js";
import preferences from "../../../components/header/preferences.js";
import themes from "../../../../../../shared/components/header/themes.js";
import typeutil from "../../../../../../shared/chess/util/typeutil.js";
import animation from "../animation.js";
import mouse from "../../../util/mouse.js";
import boardpos from "../boardpos.js";
import bd from "../../../../../../shared/util/bigdecimal/bigdecimal.js";
import boardtiles from "../boardtiles.js";
import primitives from "../primitives.js";
import { listener_overlay } from "../../chess/game.js";
import { Mouse } from "../../input.js";
import meshes from "../meshes.js";
import perspective from "../perspective.js";
import camera from "../camera.js";


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
} as const;

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
} as const;

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
} as const;


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
let worldLocation: DoubleCoords | undefined;
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
function pickUpPiece(piece: Piece, resetParity: boolean): void {
	if (!preferences.getDragEnabled()) return; // Dragging is disabled
	areDragging = true;
	if (resetParity) parity = true;

	const respectiveListener = mouse.getRelevantListener();
	pointerId = respectiveListener.getMouseId(Mouse.LEFT);

	startCoords = piece.coords;
	pieceType = piece.type;
	// If any one animation's end coords is currently being animated towards the coords of the picked up piece, clear the animation.
	if (animation.animations.some(a => coordutil.areCoordsEqual(piece.coords, a.path[a.path.length - 1]!) )) animation.clearAnimations(true);
}

/**
 * Call AFTER selection.update()
 */
function updateDragLocation(): void {
	if (!areDragging) return;
	
	/**
	 * If the promotion UI is open, change the world location of
	 * the dragged piece to the promotion square
	 */
	const squarePawnPromotingOn = selection.getSquarePawnIsCurrentlyPromotingOn();
	if (squarePawnPromotingOn !== undefined) {
		const worldCoords = space.convertCoordToWorldSpace(bd.FromCoords(squarePawnPromotingOn));
		worldLocation = worldCoords;
		hoveredCoords = squarePawnPromotingOn;
		return;
	} else {
		// Normal drag location
		worldLocation = mouse.getPointerWorld(pointerId!);
		hoveredCoords = worldLocation ? space.convertWorldSpaceToCoords_Rounded(worldLocation) : undefined;
	}
}

/** Call AFTER {@link updateDragLocation} and BEFORE {@link renderPiece} */
function setDragLocationAndHoverSquare(worldLoc: DoubleCoords, hoverSquare: Coords): void {
	worldLocation = worldLoc;
	hoveredCoords = hoverSquare;
}

/** Returns the id of the pointer currently dragging a piece. */
function getPointerIdDraggingPiece(): string | undefined {
	if (!areDragging) throw Error("Unexpected!");
	return pointerId;
}

/** Whether the pointer dragging the selected piece has released yet. */
function hasPointerReleased(): boolean {
	if (!areDragging) throw Error("Don't call hasPointerReleased() when not dragging a piece");
	const respectiveListener = mouse.getRelevantListener();
	return !respectiveListener.isPointerHeld(pointerId!);
}

// /** Returns the pointer id that is dragging the piece. */
// function getPointerId(): string {
// 	if (!areDragging) throw Error("Don't call getPointerId() when not dragging a piece");
// 	return pointerId!;
// }

/**
 * Stop dragging the piece.
 */
function dropPiece(): void {
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
	// Rapidly picking up and dropping a piece triggers a simulated click.
	// If we don't claim it here, annotations will read it to Collapse annotations.
	if (mouse.isMouseClicked(Mouse.LEFT)) mouse.claimMouseClick(Mouse.LEFT);
}

/** Puts the dragged piece back. Doesn't make a move. */
function cancelDragging(): void {
	dropPiece();
	parity = true;
}


// Rendering --------------------------------------------------------------------------------------------


// Hides the original piece by rendering a transparent square model above it in the depth field.
function renderTransparentSquare(): void {
	if (!startCoords) return;

	const color: Color = [0,0,0,0];
	const data = meshes.QuadWorld_Color(startCoords, color); // Hide orginal piece
	return createRenderable(data, 2, "TRIANGLES", 'color', true).render([0,0,z]);
}

// Renders the box outline, the dragged piece and its shadow
function renderPiece(): void {
	if (!areDragging || perspective.isLookingUp() || !worldLocation) return;

	genOutlineModel().render();
	genPieceModel()?.render();
}

/**
 * Generates the model of the dragged piece and its shadow.
 * @returns The buffer model
 */
function genPieceModel(): Renderable | undefined {
	if (typeutil.SVGLESS_TYPES.has(typeutil.getRawType(pieceType!))) return; // No SVG/texture for this piece (void), can't render it.

	const perspectiveEnabled = perspective.getEnabled();
	const touchscreenUsed = listener_overlay.isPointerTouch(pointerId!);
	const boardScale = boardpos.getBoardScaleAsNumber();
	const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	
	const { texleft, texbottom, texright, textop } = spritesheet.getTexDataOfType(pieceType!, rotation);
	
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
	if (perspectiveEnabled) data.push(...primitives.Quad_ColorTexture3D(left, bottom, right, top, z, texleft, texbottom, texright, textop, ...perspectiveConfigs.shadowColor)); // Shadow
	data.push(...primitives.Quad_ColorTexture3D(left, bottom, right, top, height, texleft, texbottom, texright, textop, 1, 1, 1, 1)); // Piece
	return createRenderable(data, 3, "TRIANGLES", 'colorTexture', true, spritesheet.getSpritesheet());
}

/**
 * Generates a model to enphasize the hovered square.
 * If mouse is being used the square is outlined.
 * On touchscreen the entire rank and file are outlined.
 * @returns The buffer model
 */
function genOutlineModel(): Renderable {
	const data: number[] = [];
	const pointerIsTouch = listener_overlay.isPointerTouch(pointerId!);
	// The coordinates of the edges of the square
	const { left, right, bottom, top } = meshes.getCoordBoxWorld(hoveredCoords!);
	const boardScale = boardpos.getBoardScaleAsNumber();
	const width = (pointerIsTouch ? outlineWidth.touch : outlineWidth.mouse) * boardScale;
	const color = preferences.getBoxOutlineColor();
	
	// Outline the enire rank & file when:
	// 1. We're not hovering over the start square.
	// 2. It is a touch screen, OR we are zoomed out enough.
	if (!coordutil.areCoordsEqual(hoveredCoords!, startCoords!) && (pointerIsTouch || bd.toNumber(boardtiles.gtileWidth_Pixels()) < minSizeToDrawOutline)) {
		// Outline the entire rank and file
		const screenBox = camera.getRespectiveScreenBox();

		data.push(...primitives.Quad_Color(left, screenBox.bottom, left + width, screenBox.top, color)); // left
		data.push(...primitives.Quad_Color(screenBox.left, bottom, screenBox.right, bottom + width, color)); // bottom
		data.push(...primitives.Quad_Color(right - width, screenBox.bottom, right, screenBox.top, color)); // right
		data.push(...primitives.Quad_Color(screenBox.left, top - width, screenBox.right, top, color)); // top
	} else {
		// Outline the hovered square
		data.push(...getBoxFrameData(hoveredCoords!));
	}
	
	return createRenderable(data, 2, "TRIANGLES", 'color', true);
}

/**
 * Generates vertex data for a rectangular frame (box).
 * @param coords - The coordinate of the box frame
 * @returns The vertex data for the frame.
 */
function getBoxFrameData(coords: Coords): number[] {
	const boardPos = boardpos.getBoardPos();
	// We should be able to work with scale converted to a number
	// because we don't drag pieces when zoomed out far.
	const boardScale: number = boardpos.getBoardScaleAsNumber();
	const squareCenter = boardtiles.getSquareCenterAsNumber();
	const edgeWidth = 0.07 * boardScale;
	const color = themes.getPropertyOfTheme(preferences.getTheme(), 'boxOutlineColor');

	// Subtracting these two arbitrary numbers should result in a small number,
	// since you know how would we be dragging the piece anyway if it wasn't close.
	// (coords - boardPos) * scale
	const relativeX = bd.toNumber(bd.subtract(bd.FromBigInt(coords[0]), boardPos[0])) * boardScale;
	const relativeY = bd.toNumber(bd.subtract(bd.FromBigInt(coords[1]), boardPos[1])) * boardScale;

	// Account for square center offset
	const centerX = relativeX + (0.5 - squareCenter) * boardScale;
	const centerY = relativeY + (0.5 - squareCenter) * boardScale;

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
	function addRectangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): void {
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



export default {
	areDraggingPiece,
	getDragParity,
	pickUpPiece,
	updateDragLocation,
	setDragLocationAndHoverSquare,
	getPointerIdDraggingPiece,
	hasPointerReleased,
	dropPiece,
	cancelDragging,
	renderTransparentSquare,
	renderPiece
};