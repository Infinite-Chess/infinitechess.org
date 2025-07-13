
/**
 * This script handles the animation of pieces.
 * It also plays the sounds.
 */

import type { Coords } from '../../chess/util/coordutil.js';
import type { Piece } from '../../chess/util/boardutil.js';
import type { Color } from '../../util/math.js';

import arrows from './arrows/arrows.js';
import { createModel } from './buffermodel.js';
import frametracker from './frametracker.js';
import math from '../../util/math.js';
import splines from '../../util/splines.js';
import coordutil from '../../chess/util/coordutil.js';
import spritesheet from './spritesheet.js';
import boardpos from './boardpos.js';
import sound from '../misc/sound.js';
import typeutil, { RawType } from '../../chess/util/typeutil.js';
// @ts-ignore
import bufferdata from './bufferdata.js';
// @ts-ignore
import boardtiles from './boardtiles.js';
// @ts-ignore
import perspective from './perspective.js';
// @ts-ignore
import shapes from './shapes.js';
// @ts-ignore
import statustext from '../gui/statustext.js';

// Type Definitions -----------------------------------------------------------------------

/** Represents an animation segment between two waypoints. */
interface AnimationSegment {
	start: Coords;
	end: Coords;
	distance: number;
}

/** Represents an animation of a piece. */
interface Animation {
	/** The type of piece to animate. */
	type: number;
	/** The waypoints the piece will pass throughout the animation. Minimum: 2 */
	path: Coords[];
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
	totalDistance: number;
	/** Whether the sound has been played yet. */
	soundPlayed: boolean;
	/** The id of the timeout that will play the sound a little before the animation finishes, so there isn't a delay. */
	soundTimeoutId?: ReturnType<typeof setTimeout>;
	/** The id of the timeout that will remove the animation from the list once it's over. */
	scheduledRemovalId?: ReturnType<typeof setTimeout>;	
}


// Constants -------------------------------------------------------------------


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
function animatePiece(type: number, path: Coords[], showKeyframes: Map<number, Piece[]>, hideKeyframes: Map<number, Coords[]>, instant?: boolean, resetAnimations: boolean = true): void {
	if (path.length < 2) throw new Error("Animation requires at least 2 waypoints");
	if (resetAnimations) clearAnimations(true);

	// Generate smooth spline waypoints
	const path_HighResolution = splines.generateSplinePath(path, SPLINES.RESOLUTION);
	const segments = createAnimationSegments(path_HighResolution);
	// Calculates the total length of the path traveled by the piece in the animation.
	const totalDistance = segments.reduce((sum, seg) => sum + seg.distance, 0);

	// The hideShowKeyframes need to be stretched to match the resolution of the spline.
	hideKeyframes = stretchKeyframesForResolution(hideKeyframes, SPLINES.RESOLUTION, path.length);
	showKeyframes = stretchKeyframesForResolution(showKeyframes, SPLINES.RESOLUTION, path.length);

	// If this animation involves rendering a piece that doesn't have an SVG (void),
	// we can't animate/render it. Make it an instant animationinstead.
	const typesInvolved: Set<RawType> = new Set([typeutil.getRawType(type)]);
	showKeyframes.forEach(w => w.forEach(p => typesInvolved.add(typeutil.getRawType(p.type))));
	if (new Set([...typesInvolved, ...typeutil.SVGLESS_TYPES]).size < typesInvolved.size + typeutil.SVGLESS_TYPES.size) instant = true; // Instant animations still play the sound

	// Handle instant animation (piece was dropped): Play the SOUND ONLY, but don't animate.
	if (instant) return playSoundOfDistance(totalDistance, showKeyframes.size !== 0);

	

	const newAnimation: Animation = {
		type,
		path: path_HighResolution,
		segments,
		showKeyframes,
		hideKeyframes,
		startTimeMillis: performance.now(),
		durationMillis: calculateAnimationDuration(totalDistance, path_HighResolution.length),
		totalDistance,
		soundPlayed: false
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

function toggleDebug() {
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
function createAnimationSegments(waypoints: Coords[]): AnimationSegment[] {
	const segments: AnimationSegment[] = [];
	for (let i = 0; i < waypoints.length - 1; i++) {
		const start = waypoints[i]!;
		const end = waypoints[i + 1]!;
		segments.push({
			start,
			end,
			distance: math.euclideanDistance(start, end)
		});
	}
	return segments;
}

/** Calculates the duration in milliseconds a particular move would take to animate. */
function calculateAnimationDuration(totalDistance: number, waypointCount: number): number {
	const baseMillis = DEBUG ? MOVE_ANIMATION_DURATION.baseMillis_Debug : MOVE_ANIMATION_DURATION.baseMillis;
	const cappedDist = Math.min(totalDistance, MAX_DISTANCE_BEFORE_TELEPORT);
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
function scheduleAnimationRemoval(animation: Animation) {
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
function playAnimationSound(animation: Animation) {
	playSoundOfDistance(animation.totalDistance, animation.showKeyframes.size !== 0);
	animation.soundPlayed = true;
}

/**
 * Plays the sound of a move.
 * @param distance - The distance the piece traveled.
 * @param captured - Whether the animation involved a capture.
 */
function playSoundOfDistance(distance: number, captured: boolean) {
	if (captured) sound.playSound_capture(distance);
	else sound.playSound_move(distance);
}


// Updating -------------------------------------------------------------------------------


/** Flags the frame to be rendered if there are any animations, and adds an arrow indicator animation for each */
function update() {
	if (animations.length === 0) return;

	frametracker.onVisualChange();
	animations.forEach(animation => shiftArrowIndicatorOfAnimatedPiece(animation) ); // Animate the arrow indicator
}

/** Animates the arrow indicator */
function shiftArrowIndicatorOfAnimatedPiece(animation: Animation) {
	const segment = getCurrentSegment(animation);
	// Delete the arrows of the hidden pieces
	forEachActiveKeyframe(animation.hideKeyframes, segment, coords => coords.forEach(c => arrows.shiftArrow(1, true, c))); // Use an arbitrary piece type
	const animationCurrentCoords = getCurrentAnimationPosition(animation.segments, segment);
	// Add the arrow of the animated piece (also removes the arrow it off its destination square)
	arrows.shiftArrow(animation.type, false, animation.path[animation.path.length - 1]!, animationCurrentCoords);
	// Add the arrows of the captured pieces only after we've shifted the piece that captured it
	forEachActiveKeyframe(animation.showKeyframes, segment, pieces => pieces.forEach(p => arrows.shiftArrow(p.type, true, undefined, p.coords)));
}


// Rendering -------------------------------------------------------------------------------


/**
 * Renders the transparent squares that block out the default rendering of the pieces while the animation is visible.
 * This works because they are higher in the depth buffer than the pieces.
 */
function renderTransparentSquares(): void {
	if (!animations.length) return;

	const color: Color = [0, 0, 0, 0];
	// Calls map() on each animation, and then flats() the results into a single array.
	const data = animations.flatMap(animation => {
		const hidesData: number[] = [];
		const segment = getCurrentSegment(animation);
		forEachActiveKeyframe(animation.hideKeyframes, segment, v => {
			v.forEach(coord => hidesData.push(...shapes.getTransformedDataQuad_Color_FromCoord(coord, color)));
		});
		return hidesData; 
	});

	createModel(data, 2, "TRIANGLES", true)
		.render([0, 0, TRANSPARENT_SQUARE_Z]);
}

/** Renders the animations of the pieces. */
function renderAnimations() {
	if (animations.length === 0) return;

	if (DEBUG) animations.forEach(animation => splines.renderSplineDebug(animation.path, SPLINES.WIDTH, SPLINES.COLOR));

	// Calls map() on each animation, and then flats() the results into a single array.
	const data = animations.flatMap(animation => {
		const segment = getCurrentSegment(animation);
		const currentPos = getCurrentAnimationPosition(animation.segments, segment);
		const piecesData: number[] = [];
		forEachActiveKeyframe(animation.showKeyframes, segment, pieces => {
			pieces.forEach(p => piecesData.push(...generatePieceData(p.type, p.coords))); // Render this captured piece
		});
		piecesData.push(...generatePieceData(animation.type, currentPos)); // Render the moving piece
		return piecesData;
	});

	createModel(data, 2, "TRIANGLES", false, spritesheet.getSpritesheet()).render();
}

/**
 * Adds the vertex data of the piece of an animation to the data array. 
 * @param data - The running list of data to append to.
 * @param type - The type of piece the data and animation is for.
 * @param coords - The coordinates of the piece of the animation.
*/
function generatePieceData(type: number, coords: Coords): number[] {
	const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	const { texleft, texbottom, texright, textop } = bufferdata.getTexDataOfType(type, rotation);
	const { startX, startY, endX, endY } = calculateBoardPosition(coords);
    
	return bufferdata.getDataQuad_Texture(
		startX, startY, endX, endY,
		texleft, texbottom, texright, textop,
	);
}

/** Calculates the position of a piece on the board from its coordinates. */
function calculateBoardPosition(coords: Coords) {
	const boardPos = boardpos.getBoardPos();
	const boardScale = boardpos.getBoardScale();
	const squareCenter = boardtiles.gsquareCenter();
	const startX = (coords[0] - boardPos[0] - squareCenter) * boardScale;
	const startY = (coords[1] - boardPos[1] - squareCenter) * boardScale;
	return {
		startX,
		startY,
		endX: startX + 1 * boardScale,
		endY: startY + 1 * boardScale
	};
}


// Animation Calculations -----------------------------------------------------

/**
 * Gets the current progress in float form.
 * The whole number is the segment that has been reached.
 * The decimal component is the progress in that segment.
 * For example, 1.6 means the animation is 60% through the second segment.
 * Roses's have a higher spline resolution, so they cram a lot more segments
 * in between each waypoint.
 * @param animation - The animation to calculate the current segment for.
 * @param maxDistB4Teleport  - The maximum distance the animation should be allowed to travel before teleporting mid-animation near the end of its destination. This should be specified if we're animating a miniimage, since when we're zoomed out, the animation moving faster is perceivable.
 * @returns The animation's segment progress
 */
function getCurrentSegment(animation: Animation, maxDistB4Teleport = MAX_DISTANCE_BEFORE_TELEPORT): number {
	const elapsed = performance.now() - animation.startTimeMillis;
	/** The interpolated progress of the animation. */
	const t = Math.min(elapsed / animation.durationMillis, 1);
	/** The eased progress of the animation. */
	const easedT = math.easeInOut(t);

	/** The total distance along the animation path the animated piece should currently be at. */
	let targetDistance: number;
	if (animation.totalDistance <= maxDistB4Teleport) { // Total distance is short enough to animate the whole path
		targetDistance = easedT * animation.totalDistance;
	} else { // The total distance is great enough to merit teleporting: Skip the middle of the path
		if (easedT < 0.5) {
			// First half
			targetDistance = easedT * 2 * (maxDistB4Teleport / 2);
		} else { // easedT >= 0.5
			// Second half: animate final portion of path
			const portionFromEnd = (easedT - 0.5) * 2 * (maxDistB4Teleport / 2);
			targetDistance = (animation.totalDistance - maxDistB4Teleport / 2) + portionFromEnd;
		}
	}

	// Return the segment the piece should be at, based on the target distance,
	// and how far along the segment it currently is.
	let accumulated = 0;
	for (const [i, segment] of animation.segments.entries()) {
		if (targetDistance <= accumulated + segment.distance) { // The piece is in this segment
			const segmentProgress = (targetDistance - accumulated) / segment.distance;
			return segmentProgress + i;
		}
		accumulated += segment.distance;
	}
	return animation.segments.length;
}

/**
 * Calculates the position of the moved piece from the progress of the animation.
 * @param segments - The segments of the animation.
 * @param segmentNum - The segment number, which is the progress of the animation from {@link getCurrentSegment}.
 * @returns the coordinate the animation's piece should be rendered this frame.
 */
function getCurrentAnimationPosition(segments: AnimationSegment[], segmentNum: number): Coords {
	if (segmentNum >= segments.length) return segments[segments.length - 1]!.end;
	const segment = segments[Math.floor(segmentNum)]!;
	return coordutil.lerpCoords(segment.start, segment.end, segmentNum % 1);
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