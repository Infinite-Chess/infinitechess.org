
// src/client/scripts/esm/game/rendering/transition.ts

/**
 * This handles the smooth transitioning from one area of the board to another.
 * 
 * There are two types of transitions:
 * 
 * Panning Transition - Quicker, doesn't zoom at all, teleports at the halfway t value so it can
 * span arbitrary distances in constant time.
 * 
 * Zooming Transition - Slower, doesn't teleport mid-transition, has to zoom to the area.
 */


import perspective from './perspective.js';
import space from '../misc/space.js';
import boardtiles from './boardtiles.js';
import boarddrag from './boarddrag.js';
import boardpos from './boardpos.js';
import math from '../../util/math/math.js';
import area, { Area } from './area.js';
import coordutil, { BDCoords, Coords, DoubleCoords } from '../../chess/util/coordutil.js';
import bd, { BigDecimal } from '../../util/bigdecimal/bigdecimal.js';


// Type Definitions ----------------------------------------------------------------------


/** Main Transition type. Either Zooming OR Panning. */
type Transition = ZoomTransition & {
	/** Whether this is a Zooming Transition, vs a Panning one. Panning transitions don't need a destination scale. */
	isZoom: true;
} | PanTransition & {
	isZoom: false;
}

type ZoomTransition = {
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

/** Stores config for the duration of Zooming Transitions. */
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
};

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
};


const ONE = bd.FromBigInt(1n);
const NEGONE = bd.FromBigInt(-1n);


// Variables ----------------------------------------------------------------------


const teleportHistory: Transition[] = [];


// State --------------------------------------------------------------------------


// The state of the current transition

/** Whether we're currently transitioning. */
let isTeleporting: boolean = false;
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

/** [EXACT] The origin coords. */
let originCoords: BDCoords;
/** [EXACT] The destination coords. */
let destinationCoords: BDCoords;
/**
 * If the current transition is a Panning Transition, this is the precalculated
 * difference between the current transition's origin and destination coords.
 */
let differenceCoords: BDCoords;

/** [ESTIMATION] If the current transition is a Zooming Transition, this is the origin world space coords. */
let originWorldSpace: DoubleCoords;
/** [ESTIMATION] If the current transition is a Zooming Transition, this is the destination world space coords. */
let destinationWorldSpace: DoubleCoords;
/** Precalculated difference between the current transition's calculated origin and destination world space coords. */
let differenceWorldSpace: DoubleCoords;

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


// Initiating Transitions ---------------------------------------------------------------------


/** Sets common variables between starting either a Zooming or Panning Transition. */
function onTransitionStart() {
	isTeleporting = true;
	startTime = Date.now();
	originCoords = boardpos.getBoardPos();
	originScale = boardpos.getBoardScale();

	boardpos.eraseMomentum(); // Reset velocities to zero
	boarddrag.cancelBoardDrag(); // We don't want to allow dragging during a transition.
}

/** Starts a Zooming Transition. */
function zoomTransition(tel1: ZoomTransition, tel2: ZoomTransition | undefined, ignoreHistory: boolean): void { // tel2 can be undefined, if only 1
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
	const durationMultiplier = perspective.getEnabled() ? ZOOM_TRANSITION_DURATION_MILLIS.PERSPECTIVE_MULTIPLIER : 1;
	durationMillis = (ZOOM_TRANSITION_DURATION_MILLIS.BASE + Math.abs(differenceE) * ZOOM_TRANSITION_DURATION_MILLIS.MULTIPLIER) * durationMultiplier;
	
	if (!ignoreHistory) pushToTelHistory({ isZoom, destinationCoords: boardpos.getBoardPos(), destinationScale: boardpos.getBoardScale() });
}

/** Starts a Panning Transition. */
function panTransition(endCoord: BDCoords, ignoreHistory: boolean): void {
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
 * 
 * Will not incur a following transition if all coords are not on screen.
 */
function zoomTransitionToCoordsList(coordsList: Coords[]) {
	const theArea: Area = area.calculateFromCoordsList(coordsList);
	zoomTransitionToArea(theArea);
}

/**
 * Starts a Zooming Transition to a predefined Area.
 * 
 * Will not incur a following transition if the area is not on screen.
 */
function zoomTransitionToArea(theArea: Area) {
	const trans: ZoomTransition = {
		destinationCoords: theArea.coords,
		destinationScale: theArea.scale,
	};
	zoomTransition(trans, undefined, false);
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
		area.initTelFromArea(thisArea, true);
	} else { // Panning transition
		panTransition(previousTrans.destinationCoords, true);
	}
}


// Updating --------------------------------------------------------------------------------------


/** If we are currently transitioning, this updates the board position and scale. */
function update(): void {
	if (!isTeleporting) return; // Not transitioning

	const elapsedTime = Date.now() - startTime;
	if (elapsedTime >= durationMillis) {
		finishTransition();
		return;
	}

	const t = elapsedTime / durationMillis; // 0-1 elapsed time (t) value
	const easedT = math.easeInOut(t);

	if (isZoom) updateZoomingTransition(easedT);
	else updatePanningTransition(t, easedT);
}

/** Updates the board position and scale for the current ZOOMING Transition. */
function updateZoomingTransition(easedT: number): void {

	// Scale

	// Smoothly transition E (the logarithm of the scale), then convert back to scale
	const newE = originE + differenceE * easedT;
	const E_CONSTANT = bd.FromNumber(Math.E);
	const newScale = bd.pow(E_CONSTANT, newE);
	boardpos.setBoardScale(newScale);

	// Coords. Needs to be after changing scale because the new world-space is dependant on scale
	// SEE GRAPH ON DESMOS "World-space converted to boardPos" for my notes while writing this algorithm

	const targetCoords = isZoomOut ? originCoords : destinationCoords;

	// Calculate new world-space
	const newWorldX = bd.FromNumber(originWorldSpace[0] + differenceWorldSpace[0] * easedT);
	const newWorldY = bd.FromNumber(originWorldSpace[1] + differenceWorldSpace[1] * easedT);
	// Convert to board position
	const boardScale = boardpos.getBoardScale();
	const shiftX = bd.divide_floating(newWorldX, boardScale);
	const shiftY = bd.divide_floating(newWorldY, boardScale);
	const newX = bd.subtract(targetCoords[0], shiftX);
	const newY = bd.subtract(targetCoords[1], shiftY);

	boardpos.setBoardPos([newX, newY]);
}

/** Updates the board position and scale for the current PANNING Transition. */
function updatePanningTransition(t: number, easedT: number): void {

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

		// Need to pick one that is non-zero to avoid division by zero
		const nonZeroDiff = bd.isZero(difference[0]) ? bd.abs(difference[1]) : bd.abs(difference[0]);
		const ratio = bd.divide_floating(maxDistSquares, nonZeroDiff);

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

	if (nextTransition) zoomTransition(nextTransition, undefined, true);
	else isTeleporting = false;
}


// Utility ------------------------------------------------------------------------------


/** Whether we are currently transitioning.  */
function areTransitioning(): boolean {
	return isTeleporting;
}

/** Erases teleport history. */
function eraseTelHist(): void {
	teleportHistory.length = 0;
}

/** Cancels the current transition. */
function terminate(): void {
	// Clear current transition state
	isTeleporting = false;
	nextTransition = undefined;
}


// Exports ------------------------------------------------------------------------------


export default {
	// Initiating Transitions
	areTransitioning,
	zoomTransition,
	zoomTransitionToCoordsList,
	zoomTransitionToArea,
	undoTransition,
	// Updating
	update,
	// Utility
	eraseTelHist,
	panTransition,
	terminate,
};

export type {
	ZoomTransition,
};