
/**
 * This script handles the animation of pieces.
 * It also plays the sounds.
 */

import type { BDCoords, Coords, DoubleCoords } from '../../../../../shared/chess/util/coordutil.js';
import type { Piece } from '../../../../../shared/chess/util/boardutil.js';
import type { Color } from '../../../../../shared/util/math/math.js';

// @ts-ignore
import statustext from '../gui/statustext.js';
import arrows from './arrows/arrows.js';
import frametracker from './frametracker.js';
import math from '../../../../../shared/util/math/math.js';
import splines from '../../util/splines.js';
import coordutil from '../../../../../shared/chess/util/coordutil.js';
import boardpos from './boardpos.js';
import gamesound from '../misc/gamesound.js';
import instancedshapes from './instancedshapes.js';
import piecemodels from './piecemodels.js';
import texturecache from '../../chess/rendering/texturecache.js';
import vectors, { Vec3 } from '../../../../../shared/util/math/vectors.js';
import { createModel, createModel_Instanced_GivenAttribInfo } from './buffermodel.js';
import bd, { BigDecimal } from '../../../../../shared/util/bigdecimal/bigdecimal.js';
import typeutil, { RawType, TypeGroup } from '../../../../../shared/chess/util/typeutil.js';
import meshes from './meshes.js';
import perspective from './perspective.js';

// Type Definitions -----------------------------------------------------------------------

/** Represents an animation segment between two waypoints. */
interface AnimationSegment {
	start: BDCoords;
	end: BDCoords;
	/** The length of the individual segment. */
	length: BigDecimal;

	/** The precalculated difference going from start to the end. */
	difference: BDCoords;
	/** The precalculated ratio of the x difference to the distance (hypotenuse, total length). Doesn't need extreme precision. */
	xRatio: number;
	/** The precalculated ratio of the y difference to the distance (hypotenuse, total length). Doesn't need extreme precision. */
	yRatio: number;
}

/** Information about the progress of a current animation. */
type SegmentInfo = {
	/**
	 * The INTEGER segment number along the entire animation path, 0-based.
	 * 0 means it is at or beyond the first waypoint, 1 means it is at or beyond the second waypoint, etc.
	 */
	segmentNum: number,
	/**
	 * The distance along the segment the animation currently is, in squares.
	 * This is more ideal than a percentage between 0-1 since its hard to
	 * predict how much precision you'll need to represent that percentage
	 * in order to get a non-gittery animation for long distance animations.
	 */
	distance: BigDecimal,
	/** Whether the distance is from the start of the segment, or the end backwards. */
	forward: boolean
};

/** Represents an animation of a piece. */
interface Animation {
	/** The type of piece to animate. */
	type: number;
	/** The original integer coordinates of the piece's path. Minimum: 2 */
	path: Coords[]
	/** The high resolution waypoints the piece will pass throughout the animation. */
	path_smooth: BDCoords[];
	/** The segments between each waypoint */
	segments: AnimationSegment[];
	/** Pieces that need to be shown, up until a set path point is reached. Usually needed for captures. 0 is the start of the path. */
	showKeyframes: Map<number, Piece[]>;
	/** Pieces that need to be hidded, up until a set path point is reached. Usually needed for reversing captures and hiding the moved piece. 0 is the start of the path. */
	hideKeyframes: Map<number, Coords[]>;
	/** The time the animation started. */
	startTimeMillis: number;
	/** The duration of the animation. */
	durationMillis: number;
	/** The total distance the piece will travel throughout the animation across all waypoints. */
	totalDistance: BigDecimal;
	/** Whether the animation is for a premove. */
	premove: boolean;
	/** Whether the sound has been played yet. */
	soundPlayed: boolean;
	/** The id of the timeout that will play the sound a little before the animation finishes, so there isn't a delay. */
	soundTimeoutId?: ReturnType<typeof setTimeout>;
	/** The id of the timeout that will remove the animation from the list once it's over. */
	scheduledRemovalId?: ReturnType<typeof setTimeout>;	
}


// Constants -------------------------------------------------------------------


const ZERO = bd.FromBigInt(0n);
const ONE = bd.FromBigInt(1n);

/** Config for the splines. */
const SPLINES: {
	/** The number of points per segment of the spline. */
	RESOLUTION: number;
	/** The thickness of the spline. Used when debug rendering. */
	WIDTH: number;
	/** The color of the spline. Used when debug rendering. */
	COLOR: [number, number, number, number];
} = {
	RESOLUTION: 10, // Default: 10
	WIDTH: 0.15, // Default: 0.15
	COLOR: [1, 0, 0, 1] // Default: [1, 0, 0, 1]
};

/**
 * The z offset of the transparent square meant to block out the default
 * rendering of the pieces while the animation is visible.
 * 
 * THIS MUST BE GREATER THAN THE Z AT WHICH PIECES ARE RENDERED.
 */
const TRANSPARENT_SQUARE_Z: number = 0.01;
/** By adding a negative offset, the sound doesn't appear delayed. */
const SOUND_OFFSET: number = -100;
/** The maximum distance an animation can be without teleporting mid-animation. */
const MAX_DISTANCE_BEFORE_TELEPORT: number = 80; // 80

/** Used for calculating the duration of move animations. */
const MOVE_ANIMATION_DURATION = {
	/** The base amount of duration, in millis. */
	baseMillis: 150, // Default: 150
	/** The multiplier amount of duration, in millis, multiplied by the capped move distance. */
	multiplierMillis: 6,
	/** The multiplierMillis when there's atleast 3+ waypoints */
	multiplierMillis_Curved: 12, // Default: 12
	/** Replaces {@link MOVE_ANIMATION_DURATION.baseMillis} when {@link DEBUG} is true. */
	baseMillis_Debug: 2000,
	/** Replaces {@link MOVE_ANIMATION_DURATION.multiplierMillis} when {@link DEBUG} is true. */
	multiplierMillis_Debug: 15,
	/** Replaces {@link MOVE_ANIMATION_DURATION.multiplierMillis_Curved} when {@link DEBUG} is true. */
	multiplierMillis_Curved_Debug: 30,
};


// Variables -------------------------------------------------------------------------------


/** The list of all current animations */
const animations: Animation[] = [];

/** If this is enabled, the spline of the animations will be rendered, and the animations' duration increased. */
let DEBUG = false;


// Adding / Clearing Animations -----------------------------------------------------------------------


/**
 * Animates a single piece after moving it. One king/rook in castling counts as one animation.
 * One animation can hide the animated piece at its destination square, and show captured pieces.
 * @param type - The type of piece to animate
 * @param path - The waypoints the piece will pass throughout the animation. Minimum: 2
 * @param showKeyframes
 * @param hideKeyframes
 * @param instant - Whether the animation should be instantanious, only playing the SOUND. If this is true, the animation will not be added to the list of animations, and will not be rendered.
 * @param resetAnimations - If false, allows animation of multiple pieces at once. Useful for castling. Default: true
 */
function animatePiece(type: number, path: Coords[], showKeyframes: Map<number, Piece[]>, hideKeyframes: Map<number, Coords[]>, instant?: boolean, resetAnimations = false, premove = false): void {
	if (path.length < 2) throw new Error("Animation requires at least 2 waypoints");
	if (resetAnimations) clearAnimations(true);

	// Generate smooth spline waypoints
	const path_smooth = splines.generateSplinePath(path, SPLINES.RESOLUTION);
	const segments = createAnimationSegments(path_smooth);
	// Calculates the total length of the path traveled by the piece in the animation.
	const totalDistance: BigDecimal = segments.reduce((sum, seg) => bd.add(sum, seg.length), ZERO);

	// The hideShowKeyframes need to be stretched to match the resolution of the spline.
	hideKeyframes = stretchKeyframesForResolution(hideKeyframes, SPLINES.RESOLUTION, path.length);
	showKeyframes = stretchKeyframesForResolution(showKeyframes, SPLINES.RESOLUTION, path.length);

	// If this animation involves rendering a piece that doesn't have an SVG (void),
	// we can't animate/render it. Make it an instant animationinstead.
	const typesInvolved: Set<RawType> = new Set([typeutil.getRawType(type)]);
	showKeyframes.forEach(w => w.forEach(p => typesInvolved.add(typeutil.getRawType(p.type))));
	if (new Set([...typesInvolved, ...typeutil.SVGLESS_TYPES]).size < typesInvolved.size + typeutil.SVGLESS_TYPES.size) instant = true; // Instant animations still play the sound

	// Handle instant animation (piece was dropped): Play the SOUND ONLY, but don't animate.
	if (instant) return gamesound.playMove(totalDistance, showKeyframes.size !== 0, premove);

	

	const newAnimation: Animation = {
		type,
		path,
		path_smooth,
		segments,
		showKeyframes,
		hideKeyframes,
		startTimeMillis: performance.now(),
		durationMillis: calculateAnimationDuration(totalDistance, path_smooth.length),
		totalDistance,
		premove,
		soundPlayed: false,
	};

	scheduleSoundPlayback(newAnimation);
	scheduleAnimationRemoval(newAnimation);
	animations.push(newAnimation);
}

/**
 * Terminates all animations.
 * 
 * Should be called when we're skipping through moves quickly
 * (in that scenario we immediately play the sound),
 * or when the game is unloaded.
 */
function clearAnimations(playSounds = false): void {
	animations.forEach(animation => {
		clearTimeout(animation.soundTimeoutId); // Don't play it twice..
		clearTimeout(animation.scheduledRemovalId); // Don't remove it twice..
		if (playSounds && !animation.soundPlayed) playAnimationSound(animation); // .. play it NOW.
	});
	animations.length = 0; // Empties existing animations
}

function toggleDebug(): void {
	DEBUG = !DEBUG;
	statustext.showStatus(`Toggled animation splines: ${DEBUG}`, false, 0.5);
}


// Helper Functions -----------------------------------------------------------

/**
 * Stretches a {@link Animation.showKeyframes} or {@link Animation.hideKeyframes}
 * to match the resolution of the animation spline.
 */
function stretchKeyframesForResolution<T>(keyframes: Map<number, T>, resolution: number, waypointCount: number): Map<number, T> {
	if (waypointCount < 3) return keyframes;
	const t: Map<number, T> = new Map();
	for (const [k, v] of keyframes) {
		t.set(k * resolution, v);
	}
	return t;
}

/** Creates the segments between each waypoint. */
function createAnimationSegments(waypoints: BDCoords[]): AnimationSegment[] {
	const segments: AnimationSegment[] = [];
	for (let i = 0; i < waypoints.length - 1; i++) {
		const start = waypoints[i]!;
		const end = waypoints[i + 1]!;
		const difference: BDCoords = coordutil.subtractBDCoords(end, start);
		// Since the difference can be arbitrarily large, we need to normalize it
		// NEAR the range 0-1 (don't matter if it's not exact) so that we can use javascript numbers.
		const normalizedVector: DoubleCoords = vectors.normalizeVectorBD(difference);
		const normalizedVectorHypot: number = Math.hypot(...normalizedVector);
		segments.push({
			start,
			end,
			length: vectors.euclideanDistanceBD(start, end),
			difference: difference,
			xRatio: normalizedVector[0] / normalizedVectorHypot,
			yRatio: normalizedVector[1] / normalizedVectorHypot,
		});
	}
	return segments;
}

/** Calculates the duration in milliseconds a particular move would take to animate. */
function calculateAnimationDuration(totalDistance: BigDecimal, waypointCount: number): number {
	const baseMillis = DEBUG ? MOVE_ANIMATION_DURATION.baseMillis_Debug : MOVE_ANIMATION_DURATION.baseMillis;
	const cappedDist = Math.min(bd.toNumber(totalDistance), MAX_DISTANCE_BEFORE_TELEPORT);
	let multiplier: number;
	if (DEBUG) multiplier = waypointCount > 2 ? MOVE_ANIMATION_DURATION.multiplierMillis_Curved_Debug : MOVE_ANIMATION_DURATION.multiplierMillis_Debug;
	else	   multiplier = waypointCount > 2 ? MOVE_ANIMATION_DURATION.multiplierMillis_Curved	  	  : MOVE_ANIMATION_DURATION.multiplierMillis;
	const additionMillis = cappedDist * multiplier;

	return baseMillis + additionMillis;
}

/** Schedules the playback of the sound of the animation. */
function scheduleSoundPlayback(animation: Animation): void {
	const playbackTime = Math.max(0, animation.durationMillis + SOUND_OFFSET);
	animation.soundTimeoutId = setTimeout(() => playAnimationSound(animation), playbackTime);
}

/** Schedules the removal of an animation after it's over. */
function scheduleAnimationRemoval(animation: Animation): void {
	animation.scheduledRemovalId = setTimeout(() => {
		const index = animations.indexOf(animation);
		if (index === -1) return; // Already removed
		animations.splice(index, 1);
		frametracker.onVisualChange();
	}, animation.durationMillis);
}

/**
 * Plays the sound of the animation.
 * @param animation - The animation to play the sound for.
 * @param dampen - Whether to dampen the sound. This should be true if we're skipping through moves quickly.
 */
function playAnimationSound(animation: Animation): void {
	gamesound.playMove(animation.totalDistance, animation.showKeyframes.size !== 0, animation.premove);
	animation.soundPlayed = true;
}


// Updating -------------------------------------------------------------------------------


/** Flags the frame to be rendered if there are any animations, and adds an arrow indicator animation for each */
function update(): void {
	if (animations.length === 0) return;

	frametracker.onVisualChange();
	animations.forEach(animation => shiftArrowIndicatorOfAnimatedPiece(animation) ); // Animate the arrow indicator
}

/** Animates the arrow indicator */
function shiftArrowIndicatorOfAnimatedPiece(animation: Animation): void {
	const segmentInfo = getCurrentSegment(animation);
	// Delete the arrows of the hidden pieces
	forEachActiveKeyframe(animation.hideKeyframes, segmentInfo.segmentNum, coords => coords.forEach(c => arrows.deleteArrow(c)));
	const animationCurrentCoords = getCurrentAnimationPosition(animation.segments, segmentInfo);
	// Add the arrow of the animated piece (also removes the arrow it off its destination square)
	arrows.animateArrow(animation.path[animation.path.length - 1]!, animationCurrentCoords, animation.type);
	// Add the arrows of the captured pieces only after we've shifted the piece that captured it
	forEachActiveKeyframe(animation.showKeyframes, segmentInfo.segmentNum, pieces => pieces.forEach(p => arrows.addArrow(p.type, p.coords)));
}


// Rendering -------------------------------------------------------------------------------


/**
 * [ZOOMED IN] Renders the transparent squares that block out the default rendering of the pieces while the animation is visible.
 * This works because they are higher in the depth buffer than the pieces.
 */
function renderTransparentSquares(): void {
	if (!animations.length) return;

	const color: Color = [0, 0, 0, 0];
	// Calls map() on each animation, and then flats() the results into a single array.
	const data = animations.flatMap(animation => {
		const hidesData: number[] = [];
		const segmentNum = getCurrentSegment(animation).segmentNum;
		forEachActiveKeyframe(animation.hideKeyframes, segmentNum, v => {
			v.forEach(coord => hidesData.push(...meshes.QuadWorld_Color(coord, color)));
		});
		return hidesData; 
	});

	createModel(data, 2, "TRIANGLES", true)
		.render([0, 0, TRANSPARENT_SQUARE_Z]);
}

/** [ZOOMED IN] Renders the animations of the pieces. */
function renderAnimations(): void {
	if (animations.length === 0) return;

	if (DEBUG) animations.forEach(animation => splines.renderSplineDebug(animation.path_smooth, SPLINES.WIDTH, SPLINES.COLOR));

	/**
	 * Move away from the depricated spritesheet!
	 * 
	 * We need to generate one instanced buffer model
	 * for each type of piece included in the animations.
	 */

	const boardPos = boardpos.getBoardPos();

	/** Whether the textures should be inverted or not, based on whether we're viewing black's perspective. */
	const inverted = perspective.getIsViewingBlackPerspective();

	const vertexData = instancedshapes.getDataTexture(inverted);

	// We need two separate data groups to control render order.
	// 1. Captured pieces (which should be rendered underneath)
	// 2. The main moving pieces (which should be rendered on top)
	const capturedPiecesInstanceData: TypeGroup<number[]> = {};
	const movingPiecesInstanceData: TypeGroup<number[]> = {};

	animations.forEach(animation => {
		const segmentInfo = getCurrentSegment(animation);
		const currentPos = getCurrentAnimationPosition(animation.segments, segmentInfo);

		// Populate the moving piece data
		processPiece(animation.type, currentPos, movingPiecesInstanceData);

		// Populate the captured piece data
		forEachActiveKeyframe(animation.showKeyframes, segmentInfo.segmentNum, pieces => { // Render all captured pieces in place
			pieces.forEach(p => {
				const coordsBD = bd.FromCoords(p.coords);
				processPiece(p.type, coordsBD, capturedPiecesInstanceData);
			});
		});

	});

	/** Helper for pushing a piece's instancedata to a specified data group. */
	function processPiece(type: number, coords: BDCoords, targetInstanceData: TypeGroup<number[]>): void {
		const relativePosition: DoubleCoords = bd.coordsToDoubles(coordutil.subtractBDCoords(coords, boardPos));
		if (!(type in targetInstanceData)) targetInstanceData[type] = []; // Initialize
		targetInstanceData[type]!.push(...relativePosition);
	}

	// Render all
	
	const boardScale = boardpos.getBoardScaleAsNumber();
	const scale: Vec3 = [boardScale, boardScale, 1];

	/** Renders an entire group of pieces, organized by type. */
	function renderTypeGroup(instanceData: TypeGroup<number[]>): void {
		for (const [typeStr, instance_data] of Object.entries(instanceData)) {
			const type = Number(typeStr);
			const texture = texturecache.getTexture(type);
			createModel_Instanced_GivenAttribInfo(vertexData, instance_data, piecemodels.ATTRIBUTE_INFO, 'TRIANGLES', texture).render(undefined, scale);
		}
	}

	// 1. Render captured pieces FIRST on bottom.
	renderTypeGroup(capturedPiecesInstanceData);
	// 2. Render moving pieces SECOND, so they always appear on top.
	renderTypeGroup(movingPiecesInstanceData);
}


// Animation Calculations -----------------------------------------------------


/**
 * Calculates which segment of the animation the animated piece is currently on,
 * and its distance along that specific segment.
 * @param animation - The animation to calculate the current segment for.
 * @param maxDistB4TeleportNumber - The maximum distance the animation should be allowed to travel
 * 									before teleporting mid-animation near the end of its destination.
 * 									This should be specified if we're animating a miniimage, since when
 * 									we're zoomed out, the animation moving faster is perceivable.
 * 									Can be arbitrarily large.
 * @returns The animation's segment information.
 */
function getCurrentSegment(animation: Animation, maxDistB4Teleport: BigDecimal = bd.FromNumber(MAX_DISTANCE_BEFORE_TELEPORT)): SegmentInfo {
	const elapsed = performance.now() - animation.startTimeMillis;
	/** The interpolated progress of the animation. */
	const t = Math.min(elapsed / animation.durationMillis, 1);
	/** The eased progress of the animation. */
	const easedT = math.easeInOut(t);
	const easedTBD = bd.FromNumber(easedT);

	/** The total distance along the animation path the animated piece should currently be at. */
	let targetDistance: BigDecimal;
	let forward = true;

	if (bd.compare(animation.totalDistance, maxDistB4Teleport) <= 0) { // Total distance is short enough to animate the whole path
		targetDistance = bd.multiply_floating(animation.totalDistance, easedTBD);
	} else { // The total distance is great enough to merit teleporting: Skip the middle of the path
		if (easedT < 0.5) {
			// First half
			targetDistance = bd.multiply_fixed(maxDistB4Teleport, easedTBD);
		} else { // easedT >= 0.5
			// Second half: animate final portion of path
			const inverseEasedT = bd.subtract(ONE, easedTBD);
			targetDistance = bd.multiply_fixed(maxDistB4Teleport, inverseEasedT);
			forward = false;
		}
	}

	// Return the segment the piece should be at, based on the target distance,
	// and how far along the segment it currently is.
	let accumulated: BigDecimal = bd.FromBigInt(0n);
	if (forward) {
		for (let i = 0; i < animation.segments.length; i++) {
			const segmentInfo = iterateSegment(i);
			if (segmentInfo) return segmentInfo;
		}
		return { segmentNum: animation.segments.length, distance: ZERO, forward }; // At the end of the path
	} else {
		for (let i = animation.segments.length - 1; i >= 0; i--) {
			const segmentInfo = iterateSegment(i);
			if (segmentInfo) return segmentInfo;
		}
		return { segmentNum: 0, distance: ZERO, forward }; // At the start of the path
	}

	/** Helper for iterating over each segment, accumulating the distance traveled until we reach the target distance. */
	function iterateSegment(i: number): SegmentInfo | undefined {
		const segment = animation.segments[i]!;
		const newAccumulated = bd.add(accumulated, segment.length);
		if (bd.compare(targetDistance, newAccumulated) <= 0) { // The piece is in this segment
			/**
			 * Once we've found the segment we're on, this is how far we travel along that
			 * segment until we reach our target distance of the animation from the very start.
			 */
			const distanceAlongSegment = bd.subtract(targetDistance, accumulated);
			return { segmentNum: i, distance: distanceAlongSegment, forward };
		}

		accumulated = newAccumulated;
		return undefined; // ts gets mad without this
	}
}

/**
 * Calculates the position of the moved piece from the progress of the animation.
 * @param segments - The segments of the animation.
 * @param segmentNum - The segment number, which is the progress of the animation from {@link getCurrentSegment}.
 * @returns the coordinate the animation's piece should be rendered this frame.
 */
function getCurrentAnimationPosition(segments: AnimationSegment[], segmentInfo: SegmentInfo): BDCoords {
	if (segmentInfo.segmentNum >= segments.length) return segments[segments.length - 1]!.end;
	const segment = segments[segmentInfo.segmentNum]!;

	const startPoint = segmentInfo.forward ? segment.start : segment.end;

	const xTraversalAlongSegment = bd.multiply_floating(segmentInfo.distance, bd.FromNumber(segment.xRatio));
	const yTraversalAlongSegment = bd.multiply_floating(segmentInfo.distance, bd.FromNumber(segment.yRatio));

	const addOrSubtract: Function = segmentInfo.forward ? bd.add : bd.subtract;

	return [
		addOrSubtract(startPoint[0], xTraversalAlongSegment),
		addOrSubtract(startPoint[1], yTraversalAlongSegment),
	];
}


// -----------------------------------------------------------------------------------------


/**
 * Iterates over all keyframes that have not been passed by the animation.
 * This is all showKeyframes that are still being shown, or all hideKeyframes that are still being hidden.
 */
// eslint-disable-next-line no-unused-vars
function forEachActiveKeyframe<T>(keyframes: Map<number, T>, segment: number, callback: (value: T) => void): void {
	for (const [k, v] of keyframes) {
		if (k < segment) continue;
		callback(v);
	}
}

export default {
	animations,
	animatePiece,
	clearAnimations,
	toggleDebug,
	update,
	renderTransparentSquares,
	renderAnimations,
	getCurrentSegment,
	getCurrentAnimationPosition,
	forEachActiveKeyframe,
};