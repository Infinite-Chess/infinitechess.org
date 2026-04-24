// src/client/scripts/esm/game/rendering/dragging/dragarrows.ts

/**
 * This script handles clicking and dragging arrow indicators that point to your
 * own off-screen pieces, allowing you to drag and move that piece without
 * needing to pan or zoom to it.
 *
 * This is the companion feature to droparrows.ts (which handles dropping your
 * dragged piece onto arrows to capture off-screen opponent pieces).
 */

import type { Color } from '../../../../../../shared/util/math/math.js';
import type { Piece } from '../../../../../../shared/chess/util/boardutil.js';
import type { LegalMoves } from '../../../../../../shared/chess/logic/legalmoves.js';
import type { HoveredArrow } from '../arrows/arrows.js';
import type { Vec2, Vec2Key, Vec3 } from '../../../../../../shared/util/math/vectors.js';
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
import legalmoves from '../../../../../../shared/chess/logic/legalmoves.js';

import space from '../../misc/space.js';
import mouse from '../../../util/mouse.js';
import webgl from '../webgl.js';
import camera from '../camera.js';
import meshes from '../meshes.js';
import arrows from '../arrows/arrows.js';
import boardpos from '../boardpos.js';
import gameslot from '../../chess/gameslot.js';
import selection from '../../chess/selection.js';
import { Mouse } from '../../input.js';
import primitives from '../primitives.js';
import droparrows from './droparrows.js';
import preferences from '../../../components/header/preferences.js';
import guigameinfo from '../../gui/guigameinfo.js';
import frametracker from '../frametracker.js';
import loadbalancer from '../../misc/loadbalancer.js';
import draganimation from './draganimation.js';
import guinavigation from '../../gui/guinavigation.js';
import legalmovemodel from '../highlights/legalmovemodel.js';
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

/** Settings for the animated arrows shown beside the candidate arrow indicator. */
const CANDIDATE_ANIM = {
	/** Period of the oscillation, in milliseconds. */
	PERIOD_MS: 800,
	/** Amplitude of the oscillation, as a multiple of the arrow indicator half-width. */
	AMPLITUDE: 0.3,
	/** Initial phase offset as a fraction of the full period (0–1). */
	PHASE_INITIAL: 0.1,
	/** Color of the arrows [r, g, b, a]. */
	COLOR: [0, 0, 0, 0.8] as Color,
};

/** The width of the slide zone, as a percentage of arrow indicator images. */
const SLIDE_ZONE_WIDTH = 1.7;
/** Radial gradient rendered inside the slide zone. */
const SLIDE_ZONE_GRADIENT = {
	COLORS: [
		[1, 1, 1, 0.2],
		[1, 1, 1, 0.6],
	] as Color[],
	/** World units between each individual color ring. */
	SPACING: 5,
	/** World units per second the phase advances. */
	VELOCITY: 9,
};

// State ---------------------------------------------------------------------------------

/** The candidate arrow — set when mouse is pressed on an own-piece arrow, cleared when pointer releases. */
let candidate: CandidateArrow | undefined;
/**
 * Whether the drag has been activated (mouse moved past the activation threshold).
 * Can only ever be true if candidate is also defined.
 */
let isDragActive: boolean = false;
/** Whether the dragged piece is currently positioned inside the slide zone. */
let currentlyInSlideZone: boolean = false;

/** Timestamp when the current candidate was set, used for the candidate animation. */
let candidateAnimStartTime: number = 0;
/** Current phase offset for the slide zone radial gradient, in world units. */
let slideZonePhase: number = 0;

// Main update ---------------------------------------------------------------------------

/**
 * Main per-frame update.
 *
 * CALL AFTER droparrows.shiftArrows() and BEFORE arrows.executeArrowShifts().
 */
function update(): void {
	if (!gameslot.getGamefile()) return;
	if (!arrows.areArrowsActiveThisFrame()) return;

	if (isDragActive) {
		updateActiveDrag();
	} else if (candidate !== undefined) {
		updateCandidate();
	} else {
		detectCandidateArrow();
	}

	if (candidate !== undefined) {
		// Keep rendering while the candidate animation is active,
		// OR there's an active drag.
		frametracker.onVisualChange();

		if (isDragActive) {
			// Update the phase of the slide zone gradient to create a moving effect
			slideZonePhase =
				(slideZonePhase + SLIDE_ZONE_GRADIENT.VELOCITY * loadbalancer.getDeltaTime()) %
				(SLIDE_ZONE_GRADIENT.COLORS.length * SLIDE_ZONE_GRADIENT.SPACING);
			frametracker.onVisualChange(); // Render this frame (slide zone is being animated)
		}
	}
}

/** Branch A: drag is active. Manage slide zone positioning and arrow shifts. */
function updateActiveDrag(): void {
	if (!draganimation.areDraggingPiece()) {
		// The drag was completed or cancelled by selection.ts (piece was dropped/moved).
		reset();
		return;
	}

	if (findCandidateHoveredArrow() !== undefined) {
		// Mouse moved back within threshold — deactivate the drag.
		draganimation.setForceRankFileOutline(false);
		isDragActive = false;
		// console.log('Set isDragActive = false');
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
		// console.log('Set candidate = undefined');
		return;
	}

	if (findCandidateHoveredArrow() !== undefined) return; // Still within threshold — wait.

	// Threshold crossed — initiate drag of the off-screen piece.
	const gamefile = gameslot.getGamefile()!;
	const piece: Piece | undefined = boardutil.getPieceFromCoords(
		gamefile.boardsim.pieces,
		candidate!.pieceCoords,
	);
	if (!piece) {
		// Piece disappeared (shouldn't happen during candidate phase, but guard it).
		candidate = undefined;
		// console.log('Set candidate = undefined');
		return;
	}

	selection.selectPiece(gamefile, gameslot.getMesh(), piece, true);
	mouse.cancelMouseClick(Mouse.LEFT); // Prevent the eventual release from being treated as a click/teleport.
	isDragActive = true;
	// console.log('Set isDragActive = true');
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
		if (!hoveredArrow.ownsSlide) continue; // Piece can't slide in this direction.
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
		// console.log('Set candidate');

		candidateAnimStartTime = performance.now();
		break;
	}
}

// Active drag management ---------------------------------------------------------------

/**
 * Returns the hovered arrow that matches the current candidate, or undefined if not found.
 * The arrow may move every frame (panning & zooming), so we have to re-check each frame.
 */
function findCandidateHoveredArrow(): HoveredArrow | undefined {
	if (!candidate) return undefined;
	return arrows.getHoveredArrows().find((h) => {
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

	const topBarDepth = space.convertPixelsToWorldSpace_Virtual(guinavigation.getHeightOfNavBar());
	const bottomBarDepth = space.convertPixelsToWorldSpace_Virtual(
		guigameinfo.getHeightOfGameInfoBar(),
	);

	const inRight = dir[0] > 0n && mouseWorld[0] > screenBox.right - slideZoneDepth;
	const inLeft = dir[0] < 0n && mouseWorld[0] < screenBox.left + slideZoneDepth;
	const inTop = dir[1] > 0n && mouseWorld[1] > screenBox.top - slideZoneDepth - topBarDepth;
	const inBottom =
		dir[1] < 0n && mouseWorld[1] < screenBox.bottom + slideZoneDepth + bottomBarDepth;
	currentlyInSlideZone = inRight || inLeft || inTop || inBottom;

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
	const hoveredCoords: Coords = space.roundCoords(intersectionBD);

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

// Cleanup -----------------------------------------------------------------------------

/** Resets all drag arrow state. Called when the drag naturally completes or is force-cleared. */
function reset(): void {
	// console.error('Resetting state');
	candidate = undefined;
	isDragActive = false;
	currentlyInSlideZone = false;
	candidateAnimStartTime = 0;
	draganimation.setForceRankFileOutline(false);
}

// Rendering ---------------------------------------------------------------------------

/** Renders all dragarrows visuals: the slide zone gradient and the slide move highlights. */
function render(): void {
	if (!arrows.areArrowsActiveThisFrame()) return;
	renderCandidateArrows();
	renderSlideZone();
	renderSlideMoveHighlights();
}

/**
 * Renders two animated arrowhead triangles on either side of the candidate arrow indicator,
 * perpendicular to the arrow direction, while awaiting drag activation.
 */
function renderCandidateArrows(): void {
	if (!candidate || isDragActive) return;

	const worldLocation = findCandidateHoveredArrow()?.worldLocation;
	if (!worldLocation) return;

	const halfWidth = arrows.getArrowIndicatorHalfWidth();
	const size = halfWidth * 0.3; // Same proportions as the standard small arrows

	// Determine the perpendicular axis from the indicator's screen position by measuring
	// the raw world-space distance to each edge pair. The indicator sits on whichever edge is closer.
	const screenBox = camera.getScreenBoundingBox(false);
	const cx = worldLocation[0];
	const cy = worldLocation[1];
	const distToHorizontalEdge = screenBox.right - Math.abs(cx);
	const distToVerticalEdge = screenBox.top - Math.abs(cy);
	// px/py is the unit vector along which the extra arrows oscillate
	let px: number, py: number;
	if (distToHorizontalEdge < distToVerticalEdge) {
		// Indicator is on the left or right edge → extra arrows go above/below
		px = 0;
		py = 1;
	} else {
		// Indicator is on the top or bottom edge → extra arrows go left/right
		px = 1;
		py = 0;
	}

	// Sine-wave oscillation with a configurable initial phase offset.
	const elapsed = performance.now() - candidateAnimStartTime;
	const phase = 2 * Math.PI * (elapsed / CANDIDATE_ANIM.PERIOD_MS + CANDIDATE_ANIM.PHASE_INITIAL);
	const sineOffset = halfWidth * CANDIDATE_ANIM.AMPLITUDE * 0.5 * (1 - Math.cos(phase));

	const data: number[] = [];
	const [r, g, b, a] = CANDIDATE_ANIM.COLOR;

	// Render an arrowhead triangle in each perpendicular direction (+/-)
	for (const sign of [1, -1] as const) {
		const spx = sign * px;
		const spy = sign * py;

		// Center of the base of this arrowhead triangle
		const bx = cx + spx * (halfWidth + sineOffset);
		const by = cy + spy * (halfWidth + sineOffset);

		// Perpendicular-of-perpendicular, for the width of the triangle base
		const qx = -spy;
		const qy = spx;

		// Triangle: two base corners + tip
		// prettier-ignore
		data.push(
			bx + qx * size,  by + qy * size,  r, g, b, a,
			bx - qx * size,  by - qy * size,  r, g, b, a,
			bx + spx * size, by + spy * size, r, g, b, a,
		);
	}

	createRenderable(data, 2, 'TRIANGLES', 'color', true).render();
}

/** Renders a radial gradient over the slide zone when active. */
function renderSlideZone(): void {
	if (!isDragActive || !candidate) return;

	const screenBox = camera.getScreenBoundingBox(false);
	// Slide zone depth in world space units
	const depth = 2.0 * arrows.getArrowIndicatorHalfWidth() * SLIDE_ZONE_WIDTH;
	const dir = candidate.vector;

	// Build mask geometry — color values are irrelevant, only the geometry is used for stenciling.
	const maskData: number[] = [];
	const dummyColor: Color = [0, 0, 0, 1];
	const topBarDepth = space.convertPixelsToWorldSpace_Virtual(guinavigation.getHeightOfNavBar());
	const bottomBarDepth = space.convertPixelsToWorldSpace_Virtual(
		guigameinfo.getHeightOfGameInfoBar(),
	);
	// prettier-ignore
	if (dir[0] > 0n) maskData.push(...primitives.Quad_Color(screenBox.right - depth, screenBox.bottom, screenBox.right, screenBox.top, dummyColor));
	// prettier-ignore
	if (dir[0] < 0n) maskData.push(...primitives.Quad_Color(screenBox.left, screenBox.bottom, screenBox.left + depth, screenBox.top, dummyColor));
	// prettier-ignore
	if (dir[1] > 0n) maskData.push(...primitives.Quad_Color(screenBox.left, screenBox.top - depth - topBarDepth, screenBox.right, screenBox.top, dummyColor));
	// prettier-ignore
	if (dir[1] < 0n) maskData.push(...primitives.Quad_Color(screenBox.left, screenBox.bottom, screenBox.right, screenBox.bottom + depth + bottomBarDepth, dummyColor));

	if (maskData.length === 0) return;

	const maskRenderable = createRenderable(maskData, 2, 'TRIANGLES', 'color', true);
	webgl.executeMaskedDraw(
		() => maskRenderable.render(),
		undefined,
		() =>
			renderRadialGradient(
				SLIDE_ZONE_GRADIENT.COLORS,
				SLIDE_ZONE_GRADIENT.SPACING,
				slideZonePhase,
			),
		'and',
	);
}

/**
 * Renders a full-screen radial gradient emanating from the screen center.
 * Colors repeat outward with the given spacing (world units) and phase offset.
 */
function renderRadialGradient(colors: Color[], spacing: number, phase: number): void {
	const screenBox = camera.getScreenBoundingBox(false);
	const maxX = Math.max(Math.abs(screenBox.left), Math.abs(screenBox.right));
	const maxY = Math.max(Math.abs(screenBox.top), Math.abs(screenBox.bottom));
	const radius = Math.sqrt(maxX * maxX + maxY * maxY);

	const data = primitives.RadialGradient(0, 0, radius, colors, spacing, phase, 360);
	if (data.length > 0) createRenderable(data, 2, 'TRIANGLES', 'color', true).render();
}

/**
 * When dragging an arrow indicator and the mouse is inside the slide zone,
 * renders white box outlines along the piece's sliding direction,
 * showing you what squares you can reach next by sliding the piece there.
 */
function renderSlideMoveHighlights(): void {
	if (!candidate || !currentlyInSlideZone) return;

	const hoveredCoords = draganimation.getHoveredCoords();
	if (!hoveredCoords) return;

	const gamefile = gameslot.getGamefile()!;
	const pieceType = candidate.pieceType;

	// Get the piece's moveset
	const moveset = legalmoves.getPieceMoveset(gamefile.boardsim, pieceType);

	// Find the canonical moveset sliding key (x-component is never negative in moveset keys)
	const normalizedVec: Vec2 = vectors.absVector(candidate.vector);
	const lineKey: Vec2Key = vectors.getKeyFromVec2(normalizedVec);

	// If the slide direction is orthogonal, skip. The entire orthogonal lines are already outlined in draganimation.ts
	if (normalizedVec[0] === 0n || normalizedVec[1] === 0n) return;

	// Only proceed if the piece actually slides in this direction
	if (!moveset.sliding?.[lineKey]) return;

	// For pieces that skip squares (e.g. knightriders), the hovered square may not be
	// a valid landing spot for the piece from its actual position. Skip in that case.
	const draggedPiece = boardutil.getPieceFromCoords(
		gamefile.boardsim.pieces,
		candidate.pieceCoords,
	)!;
	const legalMoves: LegalMoves = legalmoves.getEmptyLegalMoves(moveset);
	legalmoves.appendPotentialMoves(draggedPiece, moveset, legalMoves); // Appending potential is enough
	if (!legalmoves.doSlideRangesContainSquare(legalMoves, candidate.pieceCoords, hoveredCoords))
		return;

	// Create a virtual piece at the hovered coords for move calculation
	const piece: Piece = { type: pieceType, coords: hoveredCoords, index: -1 };

	// Build premove-style LegalMoves containing ONLY the arrow's sliding direction.
	// Premoves ignore friendly/enemy blocking (only voids and world border restrict).
	const moves: LegalMoves = legalmoves.getEmptyLegalMoves(moveset);
	moves.sliding[lineKey] = moveset.sliding[lineKey]!;
	legalmoves.removeObstructedMoves(
		gamefile.boardsim,
		gamefile.basegame.gameRules.worldBorder,
		piece,
		moveset,
		moves,
		true, // premove = true: only voids and world border restrict movement
	);

	// Render white box outlines for all reachable squares using the shared transform
	const model = legalmovemodel.generateModelForSlideHighlightOutlines(hoveredCoords, moves);
	const boardPos = boardpos.getBoardPos();
	const model_Offset = legalmovemodel.getOffset();
	const position: Vec3 = meshes.getModelPosition(boardPos, model_Offset, 0);
	const boardScale = boardpos.getBoardScaleAsNumber();
	const scale: Vec3 = [boardScale, boardScale, 1];
	model.render(position, scale);
}

// Exports ------------------------------------------------------------------------------

export default {
	update,
	render,
};
