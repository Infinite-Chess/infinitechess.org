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
import ZoomingTransition, { ZoomTransition } from './ZoomingTransition.js';
import PanningTransition, { PanTransition } from './PanningTransition.js';


// Type Definitions ----------------------------------------------------------------------


/** Main Transition type. Either Zooming OR Panning. */
type Transition = ZoomTransition & {
	/** Whether this is a Zooming Transition, vs a Panning one. Panning transitions don't need a destination scale. */
	isZoom: true;
} | PanTransition & {
	isZoom: false;
}


// Constants ----------------------------------------------------------------------


/** The maximum number of transitions we will retain in our history, for undoing transitions. */
const HISTORY_CAP = 20;

/** Stores config for the duration of standard (short) Zooming Transitions. */
const ZOOM_TRANSITION_DURATION_MILLIS = {
	/** The minimum, or base amount. All transitions take atleast this long. */
	BASE: 600, // Default: 600
	/**
	 * An additional amount added for every "e" level of scale difference, in millis.
	 * 
	 * NOTE: For extremely large differences in scale from origin scale to destination scale,
	 * Zooming Transitions take far too long. We should overhaul them when implementing infinite move distance. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	 */
	MULTIPLIER: 70, // Default: 70
	/** In perspective mode we apply a multiplier so the transition goes a tad slower. */
	PERSPECTIVE_MULTIPLIER: 1.3,
} as const;

/**
 * Config for long-distance Zooming Transitions that exceed the natural log threshold.
 * This ensures that no matter how large the scale difference, the transition has a fixed, predictable duration.
 */
const LONG_ZOOM_CONFIG = {
	/** The natural log difference that triggers a long zoom instead of a standard one. */
	LN_DIFFERENCE_THRESHOLD: 10.0, // Default: 10.0 (e^10, about 22,000x scale change)
	/** The fixed total duration of a long zoom transition. */
	// DURATION_MILLIS: 3000,
	DURATION_MILLIS: 9000, // Testing
	/** How the total duration is split between the three stages. MUST sum to 1.0. */
	STAGE_SPLIT: {
		ACCELERATE: 0.25, // 25% of time accelerating scale
		TRANSITION_FOCUS: 0.5, // 50% of time moving the focus point
		DECELERATE: 0.25, // 25% of time decelerating scale
	},
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


// Zoom-specific State

/** [ESTIMATION] If the current transition is a Zooming Transition, this is the origin world space coords. */
let originWorldSpace: DoubleCoords;
/** [ESTIMATION] If the current transition is a Zooming Transition, this is the destination world space coords. */
let destinationWorldSpace: DoubleCoords;
/** Precalculated difference between the current transition's calculated origin and destination world space coords. */
let differenceWorldSpace: DoubleCoords;


// Long Zoom State

let isLongZoom: boolean = false;
let stageDurations: {
	stage1_end: number;
	stage2_end: number;
	stage3_end: number;
};
let e_at_stage1_end: number;
let e_at_stage2_start: number;


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
	isLongZoom = false;
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

	// Is this a standard zoom or a long-distance 3-stage zoom?
	if (Math.abs(differenceE) > LONG_ZOOM_CONFIG.LN_DIFFERENCE_THRESHOLD) {
		// Long Zoom
		console.log("Starting long zoom transition");
		isLongZoom = true;
		durationMillis = LONG_ZOOM_CONFIG.DURATION_MILLIS * perspectiveMultiplier;

		// Pre-calculate stage end times
		stageDurations = {
			stage1_end: durationMillis * LONG_ZOOM_CONFIG.STAGE_SPLIT.ACCELERATE,
			stage2_end: durationMillis * (LONG_ZOOM_CONFIG.STAGE_SPLIT.ACCELERATE + LONG_ZOOM_CONFIG.STAGE_SPLIT.TRANSITION_FOCUS),
			stage3_end: durationMillis, // Or durationMillis
		};

		// Pre-calculate the 'e' values at the boundaries of the stages
		const e_change_in_edge_stages = Math.sign(differenceE) * LONG_ZOOM_CONFIG.LN_DIFFERENCE_THRESHOLD;
		e_at_stage1_end = originE + e_change_in_edge_stages;
		e_at_stage2_start = destinationE - e_change_in_edge_stages;
	} else {
		// Standard Zoom
		isLongZoom = false;
		durationMillis = (ZOOM_TRANSITION_DURATION_MILLIS.BASE + Math.abs(differenceE) * ZOOM_TRANSITION_DURATION_MILLIS.MULTIPLIER) * perspectiveMultiplier;
	}

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
		if (!isLongZoom) {
			const t = elapsedTime / durationMillis; // 0-1 elapsed time (t) value
			const easedT = math.easeInOut(t);
			ZoomingTransition.updateSimpleZoomingTransition(easedT, originCoords, destinationCoords, originWorldSpace, differenceWorldSpace, originE, differenceE, isZoomOut);
		} else {
			updateLongZoomTransition(elapsedTime);
		}
	} else {
		// Panning Transition
		const t = elapsedTime / durationMillis; // 0-1 elapsed time (t) value
		const easedT = math.easeInOut(t);
		PanningTransition.updatePanningTransition(t, easedT, originCoords, destinationCoords, differenceCoords);
	}
}


/** Handles the 3-stage update logic for long-distance zooms. */
function updateLongZoomTransition(elapsedTime: number): void {
	let newE: BigDecimal;
	let focusPointWorldSpace: DoubleCoords;
	const targetCoords: BDCoords = isZoomOut ? originCoords : destinationCoords;

	if (elapsedTime < stageDurations.stage1_end) {
		// Stage 1: Accelerate Scale
		const t = elapsedTime / (stageDurations.stage1_end);
		const easedT = math.easeOut(t); // Use easeOut because we are accelerating *from* the start

		// Focus point is LOCKED to the origin
		focusPointWorldSpace = originWorldSpace;

		// Interpolate 'e' only up to the threshold amount
		const current_e_change = (e_at_stage1_end - originE) * easedT;
		newE = bd.FromNumber(originE + current_e_change);

	} else if (elapsedTime < stageDurations.stage2_end) {
		// Stage 2: Transition Focus Point and Scale
		const stage2_duration = stageDurations.stage2_end - stageDurations.stage1_end;
		const stage2_elapsed = elapsedTime - stageDurations.stage1_end;
		const t = stage2_elapsed / stage2_duration;
		const easedT = math.easeInOut(t); // A smooth sine-like curve is good here

		// Focus point transitions from origin to destination
		const worldX = originWorldSpace[0] + differenceWorldSpace[0] * easedT;
		const worldY = originWorldSpace[1] + differenceWorldSpace[1] * easedT;
		focusPointWorldSpace = [worldX, worldY];

		// Scale transitions through the vast middle-ground
		const e_change_in_stage2 = e_at_stage2_start - e_at_stage1_end;
		newE = bd.FromNumber(e_at_stage1_end + e_change_in_stage2 * easedT);

	} else {
		// Stage 3: Decelerate Scale
		const stage3_duration = stageDurations.stage3_end - stageDurations.stage2_end;
		const stage3_elapsed = elapsedTime - stageDurations.stage2_end;
		const t = stage3_elapsed / stage3_duration;
		const easedT = math.easeIn(t); // Use easeIn because we are decelerating *to* the end

		// Focus point is LOCKED to the destination
		focusPointWorldSpace = destinationWorldSpace;

		// Interpolate 'e' for the final threshold amount
		const current_e_change = (destinationE - e_at_stage2_start) * easedT;
		newE = bd.FromNumber(e_at_stage2_start + current_e_change);
	}

	const newScale = bd.exp(newE);
	boardpos.setBoardScale(newScale);

	// In every stage, we use the same final calculation to set board position
	ZoomingTransition.updateBoardPosFromFocus(targetCoords, focusPointWorldSpace, newScale);
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

export type {
	ZoomTransition,
};