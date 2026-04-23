// src/client/scripts/esm/game/rendering/dragging/dragarrows.ts

/**
 * This script handles clicking and dragging arrow indicators that point to your
 * own off-screen pieces, allowing you to drag and move that piece without
 * needing to pan or zoom to it.
 *
 * This is the companion feature to droparrows.ts (which handles dropping your
 * dragged piece onto arrows to capture off-screen opponent pieces).
 */

import type { Vec2 } from '../../../../../../shared/util/math/vectors.js';
import type { Color } from '../../../../../../shared/util/math/math.js';
import type { Piece } from '../../../../../../shared/chess/util/boardutil.js';
import type {
	Coords,
	BDCoords,
	DoubleCoords,
} from '../../../../../../shared/chess/util/coordutil.js';

import vectors from '../../../../../../shared/util/math/vectors.js';
import geometry from '../../../../../../shared/util/math/geometry.js';
import bdcoords from '../../../../../../shared/chess/util/bdcoords.js';
import boardutil from '../../../../../../shared/chess/util/boardutil.js';
import coordutil from '../../../../../../shared/chess/util/coordutil.js';

import space from '../../misc/space.js';
import mouse from '../../../util/mouse.js';
import camera from '../camera.js';
import arrows from '../arrows/arrows.js';
import gameslot from '../../chess/gameslot.js';
import selection from '../../chess/selection.js';
import { Mouse } from '../../input.js';
import primitives from '../primitives.js';
import droparrows from './droparrows.js';
import preferences from '../../../components/header/preferences.js';
import renderanims from '../renderanims.js';
import frametracker from '../frametracker.js';
import draganimation from './draganimation.js';
import { createRenderable } from '../../../webgl/Renderable.js';

// Types ---------------------------------------------------------------------------------

/**
 * State stored when the user presses the mouse on an own-piece arrow indicator.
 * Persists until the pointer is released or the drag is fully initiated.
 */
interface CandidateArrow {
	/** Integer board coordinates of the off-screen piece the arrow points to. */
	pieceCoords: Coords;
	/** The type of the off-screen piece the arrow points to. */
	pieceType: number;
	/** The direction vector of the arrow indicator. */
	vector: Vec2;
	/** The input pointer ID holding the mouse button down. */
	pointerId: string;
}

// Constants -------------------------------------------------------------------------------

/** The width of the slide zone, as a percentage of arrow indicator images. */
const SLIDE_ZONE_WIDTH = 1.5;
const SLIDE_ZONE_FILL_COLOR: Color = [1, 1, 1, 0.2];
const SLIDE_ZONE_OUTLINE_COLOR: Color = [1, 1, 1, 0.7];

// State ---------------------------------------------------------------------------------

/** The candidate arrow — set when mouse is pressed on an own-piece arrow, cleared when pointer releases. */
let candidate: CandidateArrow | undefined;
/** Whether the drag has been activated (mouse moved past the activation threshold). */
let isDragActive: boolean = false;
/** Whether the mouse is currently inside the slide zone while the drag is active. */
let currentlyInSlideZone: boolean = false;

// Main update ---------------------------------------------------------------------------

/**
 * Main per-frame update.
 *
 * CALL AFTER droparrows.shiftArrows() and BEFORE arrows.executeArrowShifts().
 */
function update(): void {
	if (!gameslot.getGamefile()) return;

	if (isDragActive) {
		updateActiveDrag();
	} else if (candidate !== undefined) {
		updateCandidate();
	} else {
		detectCandidateArrow();
	}
}

/** Branch A: drag is active. Manage slide zone positioning and arrow shifts. */
function updateActiveDrag(): void {
	if (!draganimation.areDraggingPiece()) {
		// The drag was completed or cancelled by selection.ts (piece was dropped/moved).
		reset();
		return;
	}

	if (isCandidateArrowHovered()) {
		// Mouse moved back within threshold — deactivate the drag.
		draganimation.setForceRankFileOutline(false);
		isDragActive = false;
		console.log('Set isDragActive = false');
		selection.unselectPiece(); // Fires 'piece-unselected' → draganimation.cancelDragging()
		return;
	}

	const mouseWorld = mouse.getPointerWorld(candidate!.pointerId);
	if (!mouseWorld) return;

	manageActiveDrag(mouseWorld);
}

/** Branch B: candidate exists but drag not yet active. Check threshold and initiate drag. */
function updateCandidate(): void {
	const respectiveListener = mouse.getRelevantListener();
	if (!respectiveListener.isPointerHeld(candidate!.pointerId)) {
		// Pointer released without crossing threshold — clear candidate, allow normal arrow click.
		candidate = undefined;
		console.log('Set candidate = undefined');
		return;
	}

	if (isCandidateArrowHovered()) return; // Still within threshold — wait.

	// Threshold crossed — initiate drag of the off-screen piece.
	const gamefile = gameslot.getGamefile()!;
	const piece: Piece | undefined = boardutil.getPieceFromCoords(
		gamefile.boardsim.pieces,
		candidate!.pieceCoords,
	);
	if (!piece) {
		// Piece disappeared (shouldn't happen during candidate phase, but guard it).
		candidate = undefined;
		console.log('Set candidate = undefined');
		return;
	}

	selection.selectPiece(gamefile, gameslot.getMesh(), piece, true);
	mouse.cancelMouseClick(Mouse.LEFT); // Prevent the eventual release from being treated as a click/teleport.
	isDragActive = true;
	console.log('Set isDragActive = true');
	draganimation.setForceRankFileOutline(true);
	frametracker.onVisualChange();
}

/** Branch C: no candidate. Check for a new mouse-down on an own-piece arrow. */
function detectCandidateArrow(): void {
	if (!mouse.isMouseDown(Mouse.LEFT)) return;

	const hoveredArrowsList = arrows.getHoveredArrows();
	if (hoveredArrowsList.length === 0) return;

	// Claim the mouse down for any arrow hover to prevent board drag.
	mouse.claimMouseDown(Mouse.LEFT);

	// Early exit on dragging disabled now, since the mouse down has been claimed.
	if (!preferences.getDragEnabled()) return;

	const gamefile = gameslot.getGamefile()!;

	for (const hoveredArrow of hoveredArrowsList) {
		if (hoveredArrow.piece.floating) continue; // Ignore animated arrows.
		const pieceType = hoveredArrow.piece.type;
		if (selection.canSelectPieceType(gamefile.basegame, pieceType) !== 2) continue; // Not own draggable piece.

		const pieceCoords = bdcoords.coordsToBigInt(hoveredArrow.piece.coords);
		const pointerId = mouse.getRelevantListener().getMouseId(Mouse.LEFT)!;

		candidate = {
			pieceCoords,
			pieceType,
			vector: hoveredArrow.vector,
			pointerId,
		};
		console.log('Set candidate');

		renderanims.startPulse(hoveredArrow.worldLocation);
		break;
	}
}

// Active drag management ---------------------------------------------------------------

/**
 * Whether the candidate arrow is present in the current frame's hovered arrows list.
 * The arrow may move every frame (panning & zooming), so we have to re-check each frame.
 */
function isCandidateArrowHovered(): boolean {
	if (!candidate) return false;
	return arrows.getHoveredArrows().some((h) => {
		if (h.piece.floating) return false;
		const hCoords = bdcoords.coordsToBigInt(h.piece.coords);
		return (
			coordutil.areCoordsEqual(hCoords, candidate!.pieceCoords) &&
			coordutil.areCoordsEqual(h.vector, candidate!.vector)
		);
	});
}

/**
 * Handles the per-frame logic when the drag is active and the mouse is past threshold.
 * Determines if the mouse is in the slide zone and updates drag position accordingly.
 */
function manageActiveDrag(mouseWorld: DoubleCoords): void {
	// Slide zone depth in world space units
	const slideZoneDepth = 2.0 * arrows.getArrowIndicatorHalfWidth() * SLIDE_ZONE_WIDTH;
	// Always use the 2D screen box for slide zone boundaries, even in perspective mode.
	const screenBox = camera.getScreenBoundingBox(false);
	const dir = candidate!.vector;

	const inRight = dir[0] > 0n && mouseWorld[0] > screenBox.right - slideZoneDepth;
	const inLeft = dir[0] < 0n && mouseWorld[0] < screenBox.left + slideZoneDepth;
	const inTop = dir[1] > 0n && mouseWorld[1] > screenBox.top - slideZoneDepth;
	const inBottom = dir[1] < 0n && mouseWorld[1] < screenBox.bottom + slideZoneDepth;
	currentlyInSlideZone = inRight || inLeft || inTop || inBottom;

	// console.log('Set currentlyInSlideZone = ', currentlyInSlideZone);

	if (currentlyInSlideZone) {
		updateSlideZoneDrag(mouseWorld);
	} else {
		updateOnScreenDrag();
	}
}

/** Mouse is in the slide zone — compute intersection and keep piece off-screen. */
function updateSlideZoneDrag(mouseWorld: DoubleCoords): void {
	draganimation.setForceRankFileOutline(true);
	// droparrows has already snapped the drag position and queued a moveArrow shift for the
	// captured piece's location — don't overwrite it with an animateArrow shift.
	if (droparrows.getCaptureCoords() !== undefined) return;

	const mouseBDCoords: BDCoords = space.convertWorldSpaceToCoords(mouseWorld);
	const pieceBDCoords: BDCoords = bdcoords.FromCoords(candidate!.pieceCoords);
	const arrowDir = candidate!.vector;
	const perpDir = vectors.getPerpendicularVector(arrowDir);

	// Line 1: through mouse in arrow direction.
	const line1 = vectors.getLineGeneralFormFromCoordsAndVecBD(mouseBDCoords, arrowDir);
	// Line 2: through piece, perpendicular to arrow direction.
	const line2 = vectors.getLineGeneralFormFromCoordsAndVecBD(pieceBDCoords, perpDir);

	// Intersection gives the dragged piece's board position.
	const intersectionBD: BDCoords | undefined = geometry.calcIntersectionPointOfLinesBD(
		...line1,
		...line2,
	);
	if (!intersectionBD) return; // Lines are parallel (shouldn't happen with perpendicular lines).

	const intersectionWorld: DoubleCoords = space.convertCoordToWorldSpace(intersectionBD);
	const hoveredCoords: Coords = space.convertWorldSpaceToCoords_Rounded(intersectionWorld);

	draganimation.setDragLocationAndHoverSquare(intersectionWorld, hoveredCoords);

	// Queue arrow shifts — animateArrow handles deletion of the original arrow and places
	// animated arrows (for each applicable slide direction) at the intersection.
	arrows.animateArrow(candidate!.pieceCoords, intersectionBD, candidate!.pieceType);
}

/** Mouse is outside the slide zone — piece follows mouse normally, original arrow removed. */
function updateOnScreenDrag(): void {
	draganimation.setForceRankFileOutline(false);
	// droparrows has already queued a moveArrow shift — don't overwrite it with a deleteArrow.
	if (droparrows.getCaptureCoords() !== undefined) return;
	// Delete the original arrow. Normal drag rendering takes over.
	arrows.deleteArrow(candidate!.pieceCoords);
}

// Rendering ---------------------------------------------------------------------------

/**
 * Renders the slide zone rectangle(s) along the screen edge(s) indicated by
 * the candidate arrow's direction.
 * Only renders when a drag is active and the mouse is inside the slide zone.
 */
function renderSlideZone(): void {
	if (!isDragActive || !candidate) return;

	const screenBox = camera.getScreenBoundingBox(false);
	// Slide zone depth in world space units
	const depth = 2.0 * arrows.getArrowIndicatorHalfWidth() * SLIDE_ZONE_WIDTH;
	const dir = candidate.vector;

	const fillData: number[] = [];

	// prettier-ignore
	if (dir[0] > 0n) renderSlideRect(fillData, screenBox.right - depth, screenBox.bottom, screenBox.right, screenBox.top);
	// prettier-ignore
	if (dir[0] < 0n) renderSlideRect(fillData, screenBox.left, screenBox.bottom, screenBox.left + depth, screenBox.top);
	// prettier-ignore
	if (dir[1] > 0n) renderSlideRect(fillData, screenBox.left, screenBox.top - depth, screenBox.right, screenBox.top);
	// prettier-ignore
	if (dir[1] < 0n) renderSlideRect(fillData, screenBox.left, screenBox.bottom, screenBox.right, screenBox.bottom + depth);

	if (fillData.length > 0) createRenderable(fillData, 2, 'TRIANGLES', 'color', true).render();
}

/**
 * Appends fill data for one slide zone rectangle and immediately renders its outline.
 * Outlines are rendered per-rect to avoid LINE_LOOP incorrectly connecting separate rectangles.
 */
function renderSlideRect(
	fillData: number[],
	left: number,
	bottom: number,
	right: number,
	top: number,
): void {
	fillData.push(...primitives.Quad_Color(left, bottom, right, top, SLIDE_ZONE_FILL_COLOR));
	const outlineData = primitives.Rect(left, bottom, right, top, SLIDE_ZONE_OUTLINE_COLOR);
	createRenderable(outlineData, 2, 'LINE_LOOP', 'color', true).render();
}

// Cleanup -----------------------------------------------------------------------------

/** Resets all drag arrow state. Called when the drag naturally completes or is force-cleared. */
function reset(): void {
	console.error('Resetting state');
	candidate = undefined;
	isDragActive = false;
	currentlyInSlideZone = false;
	draganimation.setForceRankFileOutline(false);
}

export default {
	update,
	renderSlideZone,
};
