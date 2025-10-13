// src/client/scripts/esm/game/rendering/transitions/TransitionManager.ts

/**
 * This handles the smooth transitioning from one area of the board to another.
 *
 * There are two types of transitions:
 *
 * Panning Transition - Quicker, doesn't zoom at all, teleports at the halfway t value so it can
 * span arbitrary distances in constant time.
 *
 * Zooming Transition - Slower. For large differences in scale, it uses a 3-stage process to
 * ensure a maximum duration is never exceeded, preventing infinitely long transitions.
 */


import perspective from '../perspective.js';
import space from '../../misc/space.js';
import boardtiles from '../boardtiles.js';
import boarddrag from '../boarddrag.js';
import boardpos from '../boardpos.js';
import math from '../../../../../../shared/util/math/math.js';
import area, { Area } from '../area.js';
import coordutil, { BDCoords, Coords, DoubleCoords } from '../../../../../../shared/chess/util/coordutil.js';
import bd, { BigDecimal } from '../../../../../../shared/util/bigdecimal/bigdecimal.js';
import bounds, { BoundingBox, BoundingBoxBD } from '../../../../../../shared/util/math/bounds.js';
import meshes from '../meshes.js';


// Type Definitions ----------------------------------------------------------------------


/** Main Transition type. Either Zooming OR Panning. */
type Transition = ZoomTransition & {
	/** Whether this is a Zooming Transition, vs a Panning one. Panning transitions don't need a destination scale. */
	isZoom: true;
} | PanTransition & {
	isZoom: false;
}

export type ZoomTransition = {
	/** The destination board location. */
	destinationCoords: BDCoords;
	/** The destination board location. */
	destinationScale: BigDecimal;
}

type PanTransition = {
	/** The destination board location. */
	destinationCoords: BDCoords;
}



// Constants ----------------------------------------------------------------------


/** The maximum number of transitions we will retain in our history, for undoing transitions. */
const HISTORY_CAP = 20;

/** Stores config for the duration of standard (short) Zooming Transitions. */
const ZOOM_TRANSITION_DURATION_MILLIS = {
	/** The minimum, or base amount. All transitions take atleast this long. */
	BASE: 350, // Default: 600
	/**
	 * An additional amount added for every "e" level of scale difference, in millis.
	 * 
	 * NOTE: For extremely large differences in scale from origin scale to destination scale,
	 * Zooming Transitions take far too long. We should overhaul them when implementing infinite move distance. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	 */
	MULTIPLIER: 40, // Default: 70
	/** In perspective mode we apply a multiplier so the transition goes a tad slower. */
	PERSPECTIVE_MULTIPLIER: 1.3,
} as const;

/**
 * Config for long-distance Zooming Transitions that exceed the natural log threshold.
 * This ensures that no matter how large the scale difference, the transition has a fixed, predictable duration.
 */
const LONG_ZOOM_CONFIG = {
	/** The fixed total duration of a long zoom transition. */
	DURATION_MILLIS: 3500,
	/** How the total duration is split between the three stages. MUST sum to 1.0. */
	STAGE_SPLIT: {
		ACCELERATE: 0.25, // 25% of time accelerating scale
		CRUISE: 0.5, // 50% of time moving the focus point
		DECELERATE: 0.25, // 25% of time decelerating scale
	},
	/**
	 * NEW KINEMATIC MODEL CONSTANT
	 * The "comfortable" acceleration used for the start and end of the transition.
	 * This is a design parameter that dictates the "feel" of the ease-in/out.
	 * Units are in: ln(scale) / second^2. A higher value feels snappier.
	 */
	EDGE_ACCELERATION: 40.0, // Default: 40.0
} as const;


/** Stores config for Panning Transitions. */
const PAN_TRANSITION_CONFIG = {
	/** Duration of ALL Panning Transitions. */
	DURATION_MILLIS: 800,
	/**
	 * The maximum distance a Panning Transition will travel before
	 * teleporting mid-transition to reach its destination in constant time,
	 * in world space units (not affected by board scale).
	 */
	MAX_PAN_DISTANCE: 90,
} as const;


const ONE = bd.FromBigInt(1n);
const NEGONE = bd.FromBigInt(-1n);


// Variables ----------------------------------------------------------------------


const teleportHistory: Transition[] = [];


// State --------------------------------------------------------------------------


// The state of the current transition

/** Whether we're currently transitioning. */
let isTransitioning: boolean = false;
/**
 * If defined, then after the current transition is
 * finished, we should immediately start this transition.
 * 
 * This should be defined for transitions which first require us to
 * zoom out to fit everything on screen before zooming back into them.
 */
let nextTransition: ZoomTransition | undefined;

/** Precalculated total duration of the current transition. */
let durationMillis: number;

let startTime: number;
/** Whether the current transition is a Zooming Transition, vs a Panning Transition. */
let isZoom: boolean;
/**
 * If the current transition is a Zooming Transition, this is whether
 * the destination scale requires us to zoom out to get there.
 */
let isZoomOut: boolean;


// Shared State

/** [EXACT] The origin coords. */
let originCoords: BDCoords;
/** [EXACT] The destination coords. */
let destinationCoords: BDCoords;

/** [EXACT] The origin scale. */
let originScale: BigDecimal;
/** [EXACT] The destination scale. */
let destinationScale: BigDecimal;
/** The logarithm of the origin scale. */
let originE: number;
/** The logarithm of the destination scale. */
let destinationE: number;
/** Precalculated difference between the current transition's origin and destination scale's "e" value. */
let differenceE: number;


// Pan-specific State

/**
 * If the current transition is a Panning Transition, this is the precalculated
 * difference between the current transition's origin and destination coords.
 */
let differenceCoords: BDCoords;


// Zoom-specific State, pre-calculated

/** [ESTIMATION] If the current transition is a Zooming Transition, this is the origin world space coords. */
let originWorldSpace: DoubleCoords;
/** If the current transition is a Zooming Transition, this is the destination world space coords. */
let destinationWorldSpace: DoubleCoords;
/** Precalculated difference between the current transition's calculated origin and destination world space coords. */
let differenceWorldSpace: DoubleCoords;

/**
 * Which kinematic model to use for the current long zoom transition.
 * 
 * - C_INF: C-infinity, 1-stage model (shortest duration, smoothest).
 *   Used if its natural duration fits within the cap transition duration.
 * 
 * - C_ONE_2_STAGE: C¹, velocity-continuous, 2-stage model.
 *   Used if C_INF would take too long, but this model fits within the cap duration.
 *   Without this fallback model, C_ONE_3_STAGE at specific zooms would have to
 *   accelerate, decelerate, accelerate, then decelerate again, which feels bad.
 * 
 * - C_ONE_3_STAGE: C¹, velocity-continuous, 3-stage model with fixed duration.
 *   Used if both other models would take too long.
 *   Compresses the potentially arbitrarily large scale difference into stage 2.
 */
let zoomModel: 'C_INF' | 'C_ONE_2_STAGE' | 'C_ONE_3_STAGE';
let stageEndTimes: { stage1: number; stage2: number; stage3: number; };

// C¹ 3-Stage Model State
let accel_stage1: number;
let accel_stage2: number;
let e_at_stage1_end: number;
let v_at_stage1_end: number;
let e_at_stage2_mid: number;
let v_at_stage2_mid: number;
let e_at_stage2_end: number;
let v_at_stage2_end: number;

// NEW: C-Infinity 1-Stage Model State
let initial_accel_c_inf: number;
let jerk_c_inf: number;


// Initiating Transitions ---------------------------------------------------------------------


/** Sets common variables between starting either a Zooming or Panning Transition. */
function onTransitionStart(): void {
	isTransitioning = true;
	startTime = Date.now();
	originCoords = boardpos.getBoardPos();
	originScale = boardpos.getBoardScale();

	boardpos.eraseMomentum(); // Reset velocities to zero
	boarddrag.cancelBoardDrag(); // We don't want to allow dragging during a transition.
}

/** Starts a Zooming Transition. */
function startZoomTransition(tel1: ZoomTransition, tel2: ZoomTransition | undefined, ignoreHistory: boolean): void {
	onTransitionStart();

	nextTransition = tel2;
	
	destinationCoords = tel1.destinationCoords;
	destinationScale = tel1.destinationScale;
	originE = bd.ln(originScale); // We're using base E
	destinationE = bd.ln(destinationScale);
	differenceE = destinationE - originE;

	isZoom = true;
	isZoomOut = bd.compare(destinationScale, originScale) < 0;

	// Determine world coordinates
	if (isZoomOut) {
		originWorldSpace = [0,0];
		destinationWorldSpace = space.convertCoordToWorldSpace(originCoords, destinationCoords, destinationScale);
	} else { // Is a zoom-in
		originWorldSpace = space.convertCoordToWorldSpace(destinationCoords);
		destinationWorldSpace = [0,0];
	}
	differenceWorldSpace = coordutil.subtractDoubleCoords(destinationWorldSpace, originWorldSpace);

	// Perspective duration multiplier
	const perspectiveMultiplier = perspective.getEnabled() ? ZOOM_TRANSITION_DURATION_MILLIS.PERSPECTIVE_MULTIPLIER : 1;
    
	// Determine which model to use by checking each profile's
	// natural duration (excludes base duration or capping) in order.

	// 1. First, the C-infinity model.
	// Calculate its natural duration if capped at our comfortable EDGE_ACCELERATION.
	const natural_duration_c_inf_millis = Math.sqrt(Math.abs(6 * differenceE / LONG_ZOOM_CONFIG.EDGE_ACCELERATION)) * 1000;

	// C¹ 2-stage model natural duration, which is acceleration-capped.
	const natural_duration_c_one_millis = Math.sqrt(Math.abs(differenceE / LONG_ZOOM_CONFIG.EDGE_ACCELERATION)) * 2 * 1000;

	if (natural_duration_c_inf_millis <= LONG_ZOOM_CONFIG.DURATION_MILLIS) {
		// --- CASE A: C-INFINITY 1-STAGE MODEL ---
		console.log("Using C-Infinity 1-Stage Model");
		zoomModel = 'C_INF';

		// Add the base duration to the natural duration, and cap at the long zoom duration.
		durationMillis = ZOOM_TRANSITION_DURATION_MILLIS.BASE + natural_duration_c_inf_millis;
		durationMillis = Math.min(durationMillis, LONG_ZOOM_CONFIG.DURATION_MILLIS);
		const T = durationMillis / 1000; // Final duration in seconds

		// Based on this final duration, solve for the required initial acceleration and jerk.
		if (T > 0) {
			initial_accel_c_inf = 6 * differenceE / (T * T);
			jerk_c_inf = -2 * initial_accel_c_inf / T; // Jerk is constant throughout
		} else {
			initial_accel_c_inf = 0;
			jerk_c_inf = 0;
		}
	} else if (natural_duration_c_one_millis <= LONG_ZOOM_CONFIG.DURATION_MILLIS) {
		// --- CASE B: C¹ 2-STAGE MODEL (Velocity Continuous) ---
		console.log("Using C¹ 2-Stage Model");
		zoomModel = 'C_ONE_2_STAGE';
		durationMillis = natural_duration_c_one_millis;
		
		accel_stage1 = Math.sign(differenceE) * LONG_ZOOM_CONFIG.EDGE_ACCELERATION;
		const t_half_secs = durationMillis / 2000;

		stageEndTimes = {
			stage1: t_half_secs * 1000,
			// Not used, but set for consistency
			stage2: durationMillis, 
			stage3: durationMillis,
		};

		// Pre-calculate boundary conditions for the handoff.
		v_at_stage1_end = accel_stage1 * t_half_secs;
		e_at_stage1_end = originE + (0.5 * accel_stage1 * t_half_secs * t_half_secs);
	} else {
		// --- CASE C: 3-STAGE MODEL ---
		console.log("Using C¹ 3-Stage Model");
		// Both other models would take too long. Use the fixed-duration 3-stage profile.
		zoomModel = 'C_ONE_3_STAGE';
		durationMillis = LONG_ZOOM_CONFIG.DURATION_MILLIS;

		const t1 = (durationMillis * LONG_ZOOM_CONFIG.STAGE_SPLIT.ACCELERATE) / 1000;
		const t2 = (durationMillis * LONG_ZOOM_CONFIG.STAGE_SPLIT.CRUISE) / 1000;
		const t_s2_half = t2 / 2;

		stageEndTimes = {
			stage1: t1 * 1000,
			stage2: (t1 + t2) * 1000,
			stage3: durationMillis,
		};
		
		// Set Stage 1 acceleration and determine the distance it covers.
		// The direction of acceleration depends on the direction of the zoom.
		accel_stage1 = Math.sign(differenceE) * LONG_ZOOM_CONFIG.EDGE_ACCELERATION;

		// Distance covered in Stage 1 & 3 is determined by the fixed edge acceleration.
		// Using d = v₀t + 0.5at², where v₀=0 for stage 1. Stage 3 is symmetrical.
		const dist_stage1_and_3 = accel_stage1 * t1 * t1;

		// Calculate the remaining distance that must be covered in Stage 2.
		const remaining_dist = differenceE - dist_stage1_and_3;
			
		// Solve for the Stage 2 acceleration needed to cover that remaining distance.
		// We use the formula: d = v₀t + 0.5at²
		// For the first half of stage 2, v₀ is the velocity at the end of stage 1.
		v_at_stage1_end = accel_stage1 * t1;
		// The distance for the first half of stage 2 is remaining_dist / 2.
		// (remaining_dist / 2) = v_at_stage1_end * t_s2_half + 0.5 * a₂ * t_s2_half²
		// Rearranging to solve for a₂:
		accel_stage2 = (remaining_dist - 2 * v_at_stage1_end * t_s2_half) / (t_s2_half * t_s2_half);

		const edgeAccelPositive = Math.sign(differenceE) === 1;
		if (edgeAccelPositive && accel_stage2 < 0 || !edgeAccelPositive && accel_stage2 > 0) {
			console.warn("Calculated stage 2 acceleration has the wrong sign: " + accel_stage2);
		}
		
		// Pre-calculate all boundary conditions to use in the update loop.
		e_at_stage1_end = originE + (0.5 * dist_stage1_and_3);
		v_at_stage2_mid = v_at_stage1_end + accel_stage2 * t_s2_half;
		e_at_stage2_mid = e_at_stage1_end + (v_at_stage1_end * t_s2_half) + (0.5 * accel_stage2 * t_s2_half * t_s2_half);

		// By symmetry of the C¹ model within Stage 2, velocity at the end is guaranteed to match velocity at the start.
		v_at_stage2_end = v_at_stage1_end; 
		e_at_stage2_end = e_at_stage1_end + remaining_dist; // By definition
	}

	console.log("Duration: " + durationMillis + "ms");


	if (!ignoreHistory) pushToTelHistory({ isZoom, destinationCoords: boardpos.getBoardPos(), destinationScale: boardpos.getBoardScale() });
}

/** Starts a Panning Transition. */
function startPanTransition(endCoord: BDCoords, ignoreHistory: boolean): void {
	onTransitionStart();

	destinationCoords = endCoord;
	differenceCoords = coordutil.subtractBDCoords(destinationCoords, originCoords);
	destinationScale = originScale;
	
	isZoom = false;

	durationMillis = PAN_TRANSITION_CONFIG.DURATION_MILLIS;
	
	if (!ignoreHistory) pushToTelHistory({ isZoom, destinationCoords: boardpos.getBoardPos() });
}

/**
 * Starts a Zooming Transition to a list of coordinates.
 * If an intermediate zoom-out is needed first, it will be done.
 */
function zoomToCoordsList(coordsList: Coords[]): void {
	const box = bounds.getBoxFromCoordsList(coordsList);
	zoomToCoordsBox(box);
}

/**
 * Starts a Zooming Transition to an integer bounding box.
 * If an intermediate zoom-out is needed first, it will be done.
 */
function zoomToCoordsBox(box: BoundingBox): void {
	const boxFloating = meshes.expandTileBoundingBoxToEncompassWholeSquare(box);
	const thisArea = area.calculateFromUnpaddedBox(boxFloating);
	area.initTransitionFromArea(thisArea, false);
}

/**
 * Starts a Zooming Transition to a list of coordinates.
 * Will not incur an intermediate transition if all coords are not on screen originally.
 */
function singleZoomToCoordsList(coordsList: Coords[]): void {
	const transitionArea: Area = area.calculateFromCoordsList(coordsList);
	zoomTransitionToArea(transitionArea);
}

/**
 * Starts a Zooming Transition to floating point coords location.
 * Will not incur an intermediate transition if it is not on screen originally.
 */
function singleZoomToBDCoords(coords: BDCoords): void {
	const snapBoundingBox: BoundingBoxBD = { left: coords[0], right: coords[0], bottom: coords[1], top: coords[1] };
	const boxFloating: BoundingBoxBD = meshes.expandTileBoundingBoxToEncompassWholeSquareBD(snapBoundingBox);
	const transitionArea: Area = area.calculateFromUnpaddedBox(boxFloating);
	zoomTransitionToArea(transitionArea);
}

/**
 * Starts a Zooming Transition to a predefined Area.
 * 
 * Will not incur a following transition if the area is not on screen.
 */
function zoomTransitionToArea(theArea: Area): void {
	const trans: ZoomTransition = {
		destinationCoords: theArea.coords,
		destinationScale: theArea.scale,
	};
	startZoomTransition(trans, undefined, false);
}

/** Appends the given transition to the history. */
function pushToTelHistory(trans: Transition): void {
	teleportHistory.push(trans);
	if (teleportHistory.length > HISTORY_CAP) teleportHistory.shift(); // Trim excess
}

/** Undos the last transition by transitioning to that transition's  */
function undoTransition(): void {
	const previousTrans = teleportHistory.pop();
	if (!previousTrans) return; // Nothing in history

	if (previousTrans.isZoom) { // Zooming Transition
		const thisArea: Area = {
			coords: previousTrans.destinationCoords,
			scale: previousTrans.destinationScale,
			boundingBox: boardtiles.getBoundingBoxOfBoard(previousTrans.destinationCoords, previousTrans.destinationScale)
		};
		area.initTransitionFromArea(thisArea, true);
	} else { // Panning transition
		startPanTransition(previousTrans.destinationCoords, true);
	}
}


// Updating --------------------------------------------------------------------------------------


/** If we are currently transitioning, this updates the board position and scale. */
function update(): void {
	if (!isTransitioning) return; // Not transitioning

	const elapsedTime = Date.now() - startTime;
	if (elapsedTime >= durationMillis) {
		finishTransition();
		return;
	}

	if (isZoom) {
		// Zooming Transition
		updateZoomingTransition(elapsedTime);
	} else {
		// Panning Transition
		const t = elapsedTime / durationMillis; // 0-1 elapsed time (t) value
		const easedT = math.easeInOut(t);
		updatePanningTransition(t, easedT, originCoords, destinationCoords, differenceCoords);
	}
}


/**
 * Handles the kinematic update logic for all zoom transitions.
 */
function updateZoomingTransition(elapsedTime: number): void {
	let currentE: number;
	const targetCoords: BDCoords = isZoomOut ? originCoords : destinationCoords;
	const t_sec = elapsedTime / 1000;

	switch (zoomModel) {
		case 'C_INF': {
			// --- C-INFINITY 1-STAGE UPDATE LOGIC ---
			// Position with constant jerk is given by the cubic formula:
			// e(t) = e₀ + v₀t + 0.5a₀t² + (1/6)jt³
			// Since e₀ and v₀ are 0 relative to the start:
			currentE = originE + (0.5 * initial_accel_c_inf * t_sec * t_sec) + ((1 / 6) * jerk_c_inf * t_sec * t_sec * t_sec);
			break;
		}
		case 'C_ONE_2_STAGE': {
			// --- C¹ 2-STAGE UPDATE LOGIC ---
			if (elapsedTime <= stageEndTimes.stage1) {
				// Stage 1: Accelerate
				const t = t_sec;
				currentE = originE + (0.5 * accel_stage1 * t * t);
			} else {
				// Stage 2: Symmetrical Decelerate
				const t_s2 = t_sec - (stageEndTimes.stage1 / 1000);
				currentE = e_at_stage1_end + (v_at_stage1_end * t_s2) - (0.5 * accel_stage1 * t_s2 * t_s2);
			}
			break;
		}
		case 'C_ONE_3_STAGE': {
			// --- C¹ 3-STAGE UPDATE LOGIC ---
			if (elapsedTime <= stageEndTimes.stage1) {
				// STAGE 1: Constant positive acceleration
				// console.log("Stage 1");

				const t = t_sec;
				currentE = originE + (0.5 * accel_stage1 * t * t);
			} else if (elapsedTime <= stageEndTimes.stage2) {
				// STAGE 2: Higher acceleration, then symmetrical deceleration.
				// console.log("Stage 2");
				const t_s2 = t_sec - (stageEndTimes.stage1 / 1000);
				const t_s2_half = (stageEndTimes.stage2 - stageEndTimes.stage1) / 2000;
				if (t_s2 <= t_s2_half) {
					// First half of Stage 2: Constant acceleration
					currentE = e_at_stage1_end + (v_at_stage1_end * t_s2) + (0.5 * accel_stage2 * t_s2 * t_s2);
				} else {
					// Second half of Stage 2: Symmetrical constant deceleration
					const t_s2_b = t_s2 - t_s2_half; // Time into the second half
					currentE = e_at_stage2_mid + (v_at_stage2_mid * t_s2_b) - (0.5 * accel_stage2 * t_s2_b * t_s2_b);
				}
			} else {
				// STAGE 3: Constant negative acceleration (symmetrical to stage 1)
				// console.log("Stage 3");
				const t_s3 = t_sec - (stageEndTimes.stage2 / 1000);
				currentE = e_at_stage2_end + (v_at_stage2_end * t_s3) - (0.5 * accel_stage1 * t_s3 * t_s3);
			}
			break;
		}
	}

	// This focus point location logic is identical for all models.

	let scaleProgress = 0;
	if (differenceE !== 0) scaleProgress = (currentE - originE) / differenceE;

	// Apply the final scale and position to the board.
	const newScale = bd.exp(bd.FromNumber(currentE));
	boardpos.setBoardScale(newScale);

	// Calculate and set the new board position, based on where the focus point should be.
	// SEE GRAPH ON DESMOS "World-space converted to boardPos" for my notes while writing this algorithm

	const worldX = bd.FromNumber(originWorldSpace[0] + differenceWorldSpace[0] * scaleProgress);
	const worldY = bd.FromNumber(originWorldSpace[1] + differenceWorldSpace[1] * scaleProgress);

	// Convert the world-space offset to a board-space offset
	const shiftX = bd.divide_floating(worldX, newScale);
	const shiftY = bd.divide_floating(worldY, newScale);

	// Apply the shift to the target coordinates to get the new board position
	const newX = bd.subtract(targetCoords[0], shiftX);
	const newY = bd.subtract(targetCoords[1], shiftY);

	boardpos.setBoardPos([newX, newY]);
}


/** Updates the board position and scale for the current PANNING Transition. */
function updatePanningTransition(t: number, easedT: number, originCoords: BDCoords, destinationCoords: BDCoords, differenceCoords: BDCoords): void {
    
	// What is the scale?
	// What is the maximum distance we should pan b4 teleporting to the other half?
	const boardScale = boardpos.getBoardScale();
	const maxPanDist = bd.FromNumber(PAN_TRANSITION_CONFIG.MAX_PAN_DISTANCE);
	const maxDistSquares = bd.divide_floating(maxPanDist, boardScale);
	const transGreaterThanMaxDist = bd.compare(bd.abs(differenceCoords[0]), maxDistSquares) > 0 || bd.compare(bd.abs(differenceCoords[1]), maxDistSquares) > 0;

	let newX: BigDecimal;
	let newY: BigDecimal;

	const difference = coordutil.copyBDCoords(differenceCoords);
	const easedTBD = bd.FromNumber(easedT);

	if (!transGreaterThanMaxDist) { // No mid-transition teleport required to maintain constant duration.
		// Calculate new world-space
		const addX = bd.multiply_fixed(difference[0], easedTBD);
		const addY = bd.multiply_fixed(difference[1], easedTBD);
		// Convert to board position
		newX = bd.add(originCoords[0], addX);
		newY = bd.add(originCoords[1], addY);
	} else { // Mid-transition teleport REQUIRED to maintain constant duration.
		// 1st half or 2nd half?
		const firstHalf = t < 0.5;
		const neg = firstHalf ? ONE : NEGONE;
		const actualEasedT = bd.FromNumber(firstHalf ? easedT : 1 - easedT);

		// Create a new, shorter vector that points in the exact same direction,
		// but with a length that is visually manageable on screen.

		// To preserve the vector's direction, we must scale it based on its largest component.
		const absDiffX = bd.abs(difference[0]);
		const absDiffY = bd.abs(difference[1]);
		const maxComponent = bd.max(absDiffX, absDiffY);

		const ratio = bd.divide_floating(maxDistSquares, maxComponent);

		difference[0] = bd.multiply_floating(difference[0], ratio);
		difference[1] = bd.multiply_floating(difference[1], ratio);

		const target = firstHalf ? originCoords : destinationCoords;

		const addX = bd.multiply_floating(bd.multiply_floating(difference[0], actualEasedT), neg);
		const addY = bd.multiply_floating(bd.multiply_floating(difference[1], actualEasedT), neg);

		newX = bd.add(target[0], addX);
		newY = bd.add(target[1], addY);
	}

	boardpos.setBoardPos([newX, newY]);
}


/** Sets the board position & scale to the destination of the current transition, and ends the transition. */
function finishTransition(): void { // Called at the end of a teleport
	// Set the final coords and scale
	boardpos.setBoardPos(destinationCoords);
	boardpos.setBoardScale(destinationScale);

	if (nextTransition) startZoomTransition(nextTransition, undefined, true); // true to ignore history for the second part of a two-step zoom
	else isTransitioning = false;
}


// Utility ------------------------------------------------------------------------------


/** Whether we are currently transitioning.  */
function areTransitioning(): boolean {
	return isTransitioning;
}

/** Erases teleport history. */
function eraseTelHist(): void {
	teleportHistory.length = 0;
}

/** Cancels the current transition. */
function terminate(): void {
	// Clear current transition state
	isTransitioning = false;
	nextTransition = undefined;
}


// Exports ------------------------------------------------------------------------------


export default {
	// Constants
	ZOOM_TRANSITION_DURATION_MILLIS,
	PAN_TRANSITION_CONFIG,
	// Initiating Transitions
	areTransitioning,
	startZoomTransition,
	startPanTransition,
	zoomToCoordsList,
	zoomToCoordsBox,
	singleZoomToCoordsList,
	singleZoomToBDCoords,
	undoTransition,
	// Updating
	update,
	// Utility
	eraseTelHist,
	terminate,
};