// src/client/scripts/esm/game/rendering/dragging/draganimation.ts

/**
 * This script hides the original piece and renders a copy at the pointer location.
 * It also highlights the square that the piece would be dropped on (to do)
 * and plays the sound when the piece is dropped.
 */

import type { Color } from '../../../../../../shared/util/math/math.js';
import type { Piece } from '../../../../../../shared/chess/util/boardutil.js';
import type { Coords, DoubleCoords } from '../../../../../../shared/chess/util/coordutil.js';

import bd from '@naviary/bigdecimal';

import typeutil from '../../../../../../shared/chess/util/typeutil.js';
import bdcoords from '../../../../../../shared/chess/util/bdcoords.js';
import coordutil from '../../../../../../shared/chess/util/coordutil.js';

import space from '../../misc/space.js';
import mouse from '../../../util/mouse.js';
import meshes from '../meshes.js';
import camera from '../camera.js';
import boardpos from '../boardpos.js';
import keybinds from '../../misc/keybinds.js';
import selection from '../../chess/selection.js';
import animation from '../animation.js';
import { Mouse } from '../../input.js';
import droparrows from './droparrows.js';
import boardtiles from '../boardtiles.js';
import primitives from '../primitives.js';
import preferences from '../../../components/header/preferences.js';
import perspective from '../perspective.js';
import { GameBus } from '../../GameBus.js';
import texturecache from '../../../chess/rendering/texturecache.js';
import frametracker from '../frametracker.js';
import legalmovemodel from '../highlights/legalmovemodel.js';
import instancedshapes from '../instancedshapes.js';
import { listener_overlay } from '../../chess/game.js';
import { createRenderable, createRenderable_Instanced } from '../../../webgl/Renderable.js';

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
	touch: 50,
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
	touch: 0.065,
} as const;

/** When using a touchscreen, the piece is shifted upward by this amount to prevent it being covered by fingers. */
const touchscreenOffset: number = 1.6; // Default: 2
/** When each square becomes smaller than this in virtual pixels, we render rank/column outlines instead of the outline box. */
const minSizeToDrawOutline: number = 40;

/** Adjustments for the dragged piece while in perspective mode. */
const perspectiveConfigs: { z: number; shadowColor: Color } = {
	/** The height the piece is rendered above the board when in perspective mode. */
	z: 0.6,
	/** The color of the shadow of the dragged piece. */
	shadowColor: [0.1, 0.1, 0.1, 0.5],
} as const;

/** If true, `pieceSelected` is currently being held. */
let areDragging = false;
/**
 * When true, the rank/file outline is always rendered during dragging,
 * regardless of zoom level. Set by dragarrows.ts during slide zone mode.
 */
let forceRankFileOutline: boolean = false;
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

/** Forces the rank/file outline to always render during dragging. Used by dragarrows.ts in slide zone mode. */
function setForceRankFileOutline(value: boolean): void {
	forceRankFileOutline = value;
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
	if (!keybinds.getEffectiveDragEnabled()) return; // Dragging is disabled
	areDragging = true;
	if (resetParity) parity = true;

	const respectiveListener = mouse.getRelevantListener();
	pointerId = respectiveListener.getMouseId(Mouse.LEFT);

	startCoords = piece.coords;
	pieceType = piece.type;
	// If any one animation's end coords is currently being animated towards the coords of the picked up piece, clear the animation.
	if (
		animation.animations.some((a) =>
			coordutil.areCoordsEqual(piece.coords, a.path[a.path.length - 1]!),
		)
	)
		animation.clearAnimations(true);
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
		const worldCoords = space.convertCoordToWorldSpace(
			bdcoords.FromCoords(squarePawnPromotingOn),
		);
		worldLocation = worldCoords;
		hoveredCoords = squarePawnPromotingOn;
		return;
	} else {
		// Normal drag location
		worldLocation = mouse.getPointerWorld(pointerId!);
		hoveredCoords = worldLocation
			? space.convertWorldSpaceToCoords_Rounded(worldLocation)
			: undefined;
	}
}

/** Call AFTER {@link updateDragLocation} and BEFORE {@link renderPiece} */
function setDragLocationAndHoverSquare(worldLoc: DoubleCoords, hoverSquare: Coords): void {
	worldLocation = worldLoc;
	hoveredCoords = hoverSquare;
}

/** Returns the id of the pointer currently dragging a piece. */
function getPointerIdDraggingPiece(): string | undefined {
	if (!areDragging) throw Error('Unexpected!');
	return pointerId;
}

/**
 * Returns the square the dragged piece is currently hovering over.
 * Set by updateDragLocation or setDragLocationAndHoverSquare
 * by the droparrows or dragarrows features.
 */
function getHoveredCoords(): Coords | undefined {
	return hoveredCoords;
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

GameBus.addEventListener('piece-unselected', () => {
	cancelDragging();
});

/** Puts the dragged piece back. Doesn't make a move. */
function cancelDragging(): void {
	dropPiece();
	parity = true;
}

// Rendering --------------------------------------------------------------------------------------------

// Hides the original piece by rendering a transparent square model above it in the depth field.
function renderTransparentSquare(): void {
	if (!startCoords) return;

	const color: Color = [0, 0, 0, 0];
	const data = meshes.QuadWorld_Color(startCoords, color); // Hide orginal piece
	return createRenderable(data, 2, 'TRIANGLES', 'color', true).render([0, 0, z]);
}

// Renders the box outline, the dragged piece and its shadow
function renderPiece(): void {
	if (!areDragging || perspective.isLookingUp() || !worldLocation) return;

	renderOutline();
	renderPieceModel();
}

/** Generates the model of the dragged piece and its shadow. */
function renderPieceModel(): void {
	if (typeutil.SVGLESS_TYPES.has(typeutil.getRawType(pieceType!))) return; // No SVG/texture for this piece (void), can't render it.

	const perspectiveEnabled = perspective.getEnabled();
	const touchscreenUsed = listener_overlay.isPointerTouch(pointerId!);
	const boardScale = boardpos.getBoardScaleAsNumber();
	const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	const { texleft, texbottom, texright, textop } = meshes.getPieceTexCoords();

	// In perspective the piece is rendered above the surface of the board.
	const height = perspectiveEnabled ? perspectiveConfigs.z * boardScale : z;

	// If touchscreen is being used the piece is rendered larger and offset upward to prevent
	// it being covered by the finger.
	let size: number = boardScale;
	if (!selection.getSquarePawnIsCurrentlyPromotingOn() && !perspective.getEnabled()) {
		// Apply a minimum size only if we're not currently promoting a pawn (promote UI open) and not in perspective mode.
		// The minimum world space the dragged piece should be rendered
		const minSizeWorldSpace = touchscreenUsed
			? space.convertPixelsToWorldSpace_Virtual(dragMinSizeVirtualPixels.touch) // Mobile/touchscreen mode
			: space.convertPixelsToWorldSpace_Virtual(dragMinSizeVirtualPixels.mouse); // 2D desktop mode
		size = Math.max(size, minSizeWorldSpace); // Apply the minimum size
	}

	const halfSize = size / 2;
	const left = worldLocation![0] - halfSize;
	const bottom =
		worldLocation![1] - halfSize + (touchscreenUsed ? touchscreenOffset * rotation : 0);
	const right = worldLocation![0] + halfSize;
	const top = worldLocation![1] + halfSize + (touchscreenUsed ? touchscreenOffset * rotation : 0);

	const data: number[] = [];
	// prettier-ignore
	if (perspectiveEnabled) data.push(...primitives.Quad_ColorTexture3D(left, bottom, right, top, z, texleft, texbottom, texright, textop, ...perspectiveConfigs.shadowColor)); // Shadow
	// prettier-ignore
	data.push(...primitives.Quad_ColorTexture3D(left, bottom, right, top, height, texleft, texbottom, texright, textop, 1, 1, 1, 1)); // Piece
	createRenderable(
		data,
		3,
		'TRIANGLES',
		'colorTexture',
		true,
		texturecache.getTexture(pieceType!),
	).render();
}

/**
 * Renders the outline emphasizing the hovered square.
 * If mouse is being used the square is outlined.
 * On touchscreen (or in slide zone mode) the entire rank and file are outlined.
 */
// prettier-ignore
function renderOutline(): void {
	const pointerIsTouch = listener_overlay.isPointerTouch(pointerId!);
	// The coordinates of the edges of the square
	const { left, right, bottom, top } = meshes.getCoordBoxWorld(hoveredCoords!);
	const boardScale = boardpos.getBoardScaleAsNumber();
	const width = (pointerIsTouch ? outlineWidth.touch : outlineWidth.mouse) * boardScale;
	const color = preferences.getBoxOutlineColor();

	// Outline the entire rank & file when:
	// 1. We're not hovering over the start square.
	// 2. It is a touch screen, OR we are zoomed out enough.
	if (
		!coordutil.areCoordsEqual(hoveredCoords!, startCoords!) &&
		(forceRankFileOutline || pointerIsTouch || bd.toNumber(boardtiles.gtileWidth_Pixels()) < minSizeToDrawOutline)
	) {
		// Outline the entire rank and file
		const screenBox = camera.getRespectiveScreenBox();
		const data: number[] = [];
		data.push(...primitives.Quad_Color(left, screenBox.bottom, left + width, screenBox.top, color)); // left
		data.push(...primitives.Quad_Color(screenBox.left, bottom, screenBox.right, bottom + width, color)); // bottom
		data.push(...primitives.Quad_Color(right - width, screenBox.bottom, right, screenBox.top, color)); // right
		data.push(...primitives.Quad_Color(screenBox.left, top - width, screenBox.right, top, color)); // top
		createRenderable(data, 2, 'TRIANGLES', 'color', true).render();
	} else {
		// Outline the hovered square using an instanced box outline model
		const vertexData = instancedshapes.getDataBoxOutline();
		const offset = legalmovemodel.getOffset();
		const offsetCoord = coordutil.subtractCoords(hoveredCoords!, offset);
		const instanceData: number[] = [Number(offsetCoord[0]), Number(offsetCoord[1])];
		const { position, scale } = meshes.getBoardRenderTransform(offset);
		createRenderable_Instanced(vertexData, instanceData, 'TRIANGLES', 'colorInstanced', true)
			.render(position, scale);
	}
}

export default {
	areDraggingPiece,
	getDragParity,
	pickUpPiece,
	updateDragLocation,
	setDragLocationAndHoverSquare,
	setForceRankFileOutline,
	getPointerIdDraggingPiece,
	getHoveredCoords,
	hasPointerReleased,
	dropPiece,
	renderTransparentSquare,
	renderPiece,
};
