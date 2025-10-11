
// src/client/scripts/esm/game/rendering/transitions/TransitionManager.ts

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
function onTransitionStart(): void {
	isTransitioning = true;
	startTime = Date.now();
	originCoords = boardpos.getBoardPos();
	originScale = boardpos.getBoardScale();

	boardpos.eraseMomentum(); // Reset velocities to zero
	boarddrag.cancelBoardDrag(); // We don't want to allow dragging during a transition.
}

/** Starts a Zooming Transition. */
function startZoomTransition(tel1: ZoomTransition, tel2: ZoomTransition | undefined, ignoreHistory: boolean): void { // tel2 can be undefined, if only 1
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

	const t = elapsedTime / durationMillis; // 0-1 elapsed time (t) value
	const easedT = math.easeInOut(t);

	if (isZoom) ZoomingTransition.updateZoomingTransition(easedT, originCoords, destinationCoords, originWorldSpace, differenceWorldSpace, originE, differenceE, isZoomOut);
	else PanningTransition.updatePanningTransition(t, easedT, originCoords, destinationCoords, differenceCoords);
}

/** Sets the board position & scale to the destination of the current transition, and ends the transition. */
function finishTransition(): void { // Called at the end of a teleport
	// Set the final coords and scale
	boardpos.setBoardPos(destinationCoords);
	boardpos.setBoardScale(destinationScale);

	if (nextTransition) startZoomTransition(nextTransition, undefined, true);
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