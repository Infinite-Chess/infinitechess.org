
/**
 * This script handles the animation of pieces.
 * It also plays the sounds.
 */

import type { Coords } from '../../chess/util/coordutil.js';
import type { Piece } from '../../chess/logic/boardchanges.js';
import type { Color } from '../../chess/util/colorutil.js';

import arrows from './arrows/arrows.js';
import gamefileutility from '../../chess/util/gamefileutility.js';
import gameslot from '../chess/gameslot.js';
import { createModel } from './buffermodel.js';
import frametracker from './frametracker.js';
import spritesheet from './spritesheet.js';
import math from '../../util/math.js';
// @ts-ignore
import bufferdata from './bufferdata.js';
// @ts-ignore
import sound from '../misc/sound.js';
// @ts-ignore
import movement from './movement.js';
// @ts-ignore
import options from './options.js';
// @ts-ignore
import board from './board.js';
// @ts-ignore
import perspective from './perspective.js';
// @ts-ignore
import shapes from './shapes.js';


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
	type: string;
	/** The waypoints the piece will pass throughout the animation. Minimum: 2 */
	waypoints: Coords[];
	/** The piece captured, if one was captured. This will be rendered in place for the during of the animation. */
	captured?: Piece;
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

	/** Whether the animation distance is large enough to merit teleporting half way through the animation so as to not move too quickly. */
	usesTeleport?: boolean;
	/** This is what the distance needs to be multiplied so it doesn't exceed {@link maxDistB4Teleport} */
	teleportThreshold?: number;

	/** The segments between each waypoint, if there are more then 2. */
	segments?: AnimationSegment[];
}


// Variables -------------------------------------------------------------------------------


/**
 * The z offset of the transparent square meant to block out the default
 * rendering of the pieces while the animation is visible.
 * 
 * THIS MUST BE GREATER THAN THE Z AT WHICH PIECES ARE RENDERED.
 */
const transparentSquareZ: number = 0.01;
/** By adding a negative offset, the sound doesn't appear delayed. */
const soundOffset: number = -100;
/** The maximum distance an animation can be without teleporting mid-animation. */
const maxDistB4Teleport: number = 80; // 80

/** Used for calculating the duration of move animations. */
const moveAnimationDuration = {
	/** The base amount of duration, in millis. */
	baseMillis: 150, // Default: 150
	/** The multiplier amount of duration, in millis, multiplied by the capped move distance. */
	multiplierMillis: 6,
	/** The multiplierMillis when there's atleast 3+ waypoints */
	multiplierMillis_waypoints: 15, // Default: 12
};

/** The list of all current animations */
const animations: Animation[] = [];


// Functions -------------------------------------------------------------------------------


/**
 * Animates a piece after moving it.
 * @param type - The type of piece to animate
 * @param waypoints - The waypoints the piece will pass throughout the animation. Minimum: 2
 * @param captured - The piece captured, if one was captured. This will be rendered in place for the during of the animation.
 * @param resetAnimations - If false, allows animation of multiple pieces at once. Useful for castling. Default: true
 */
function animatePiece(type: string, waypoints: Coords[], captured?: Piece, resetAnimations: boolean = true): void {
	if (resetAnimations) clearAnimations(true);

	const totalDistance = getTotalLengthOfPathTraveled(waypoints);
	const newAnimation: Animation = {
		type,
		waypoints,
		captured,
		startTimeMillis: performance.now(),
		durationMillis: getDurationMillisOfMoveAnimation(totalDistance, waypoints.length),
		totalDistance: totalDistance,
		soundPlayed: false,
		usesTeleport: waypoints.length === 2 && totalDistance > maxDistB4Teleport
	};

	if (newAnimation.usesTeleport) newAnimation.teleportThreshold = maxDistB4Teleport / totalDistance;

	if (waypoints.length > 2) {
		// Assign properties of animation used for multi-segment animations
		// Properties needed:   segments, cumulativeDistances, usesTeleport, teleportThreshold
		const segments: AnimationSegment[] = [];
		for (let i = 0; i < waypoints.length - 1; i++) { 
			const start = waypoints[i]!;
			const end = waypoints[i + 1]!;
			const segDist = math.euclideanDistance(start, end);
			segments.push({ start, end, distance: segDist });
		}
		newAnimation.segments = segments;
	}


	const timeUntilSoundIsPlayed = newAnimation.durationMillis + soundOffset;
	newAnimation.soundTimeoutId = setTimeout(() => playAnimationsSound(newAnimation, false), timeUntilSoundIsPlayed);

	animations.push(newAnimation);
	scheduleRemoval(newAnimation);
}

/** Calculates the total length of the path traveled by the piece in the animation. */
function getTotalLengthOfPathTraveled(waypoints: Coords[]): number {
	let totalLength = 0;
	for (let i = 0; i < waypoints.length - 1; i++) {
		const start = waypoints[i]!;
		const end = waypoints[i + 1]!;
		totalLength += math.euclideanDistance(start, end);
	}
	return totalLength;
}

/** Calculates the duration in milliseconds a particular move would take to animate. */
function getDurationMillisOfMoveAnimation(totalDistance: number, waypointCount: number): number {
	const cappedDist = Math.min(totalDistance, maxDistB4Teleport);
	const multiplierToUse = waypointCount > 2 ? moveAnimationDuration.multiplierMillis_waypoints : moveAnimationDuration.multiplierMillis;
	const additionMillis = cappedDist * multiplierToUse;
	return moveAnimationDuration.baseMillis + additionMillis;
}

/**
 * Terminates all animations.
 * 
 * Should be called when we're skipping through moves quickly
 * (in that scenario we immediately play the sound),
 * or when the game is unloaded.
 */
function clearAnimations(playSounds = false) {
	for (const animation of animations) {
		clearTimeout(animation.soundTimeoutId); // Don't play it twice..
		clearTimeout(animation.scheduledRemovalId); // Don't remove it twice..
		if (playSounds && !animation.soundPlayed) playAnimationsSound(animation, true); // .. play it NOW.
	}
	animations.length = 0; // Empties existing animations
}

/** Schedules the removal of an animation after it's over. */
function scheduleRemoval(animation: Animation) {
	animation.scheduledRemovalId = setTimeout(() => {
		const index = animations.indexOf(animation);
		if (index === -1) return; // Already removed
		animations.splice(index, 1);
		frametracker.onVisualChange();
	}, animation.durationMillis);
}

/** Flags the frame to be rendered if there are any animations, and adds an arrow indicator animation for each */
function update() {
	if (animations.length === 0) return;

	frametracker.onVisualChange();
	animations.forEach(animation => shiftArrowIndicatorOfAnimatedPiece(animation) ); // Animate the arrow indicator
}

/** Animates the arrow indicator */
function shiftArrowIndicatorOfAnimatedPiece(animation: Animation) {
	const animationCurrentCoords = getCurrentCoordsOfAnimation(animation);
	const piece = gamefileutility.getPieceAtCoords(gameslot.getGamefile()!, animation.waypoints[animation.waypoints.length - 1]!)!;
	arrows.shiftArrow(piece, animationCurrentCoords, animation.captured);
}

/** Plays the sound of the animation.
 * @param animation - The animation to play the sound for.
 * @param dampen - Whether to dampen the sound. This should be true if we're skipping through moves quickly.
 */
function playAnimationsSound(animation: Animation, dampen: boolean) {
	if (animation.captured !== undefined) sound.playSound_capture(animation.totalDistance, dampen);
	else sound.playSound_move(animation.totalDistance, dampen);
	animation.soundPlayed = true;
}


// Rendering -------------------------------------------------------------------------------


/**
 * Renders the transparent squares that block out the default rendering of the pieces while the animation is visible.
 * This works because they are higher in the depth buffer than the pieces.
 */
function renderTransparentSquares() {
	if (animations.length === 0) return;

	// Generate the model...
	const data: number[] = [];
	const color: Color = [0, 0, 0, 0];
	animations.forEach(animation => {
		const lastWaypoint = animation.waypoints[animation.waypoints.length - 1];
		data.push(...shapes.getTransformedDataQuad_Color_FromCoord(lastWaypoint, color));
	});

	const transparentModel = createModel(data, 2, "TRIANGLES", true);
	const position: [number, number, number] = [0,0,transparentSquareZ];
	transparentModel.render(position);
}

/** Renders the animations of the pieces. */
function renderAnimations() {
	if (animations.length === 0) return;

	// Generate the model of the pieces currently being animated...
	const data: number[] = [];
	animations.forEach(animation => {
		const currentAnimationCoords = getCurrentCoordsOfAnimation(animation);
		if (animation.captured !== undefined) appendDataOfPiece(data, animation.captured.type, animation.captured.coords);
		appendDataOfPiece(data, animation.type, currentAnimationCoords);
	});

	const model = createModel(data, 2, "TRIANGLES", true, spritesheet.getSpritesheet());
	model.render();
}

/** Returns the coordinate the animation's piece should be rendered this frame. */
function getCurrentCoordsOfAnimation(animation: Animation): Coords {
	
	const elapsed = performance.now() - animation.startTimeMillis;
	/** Range 0 to 1, representing the progress of the animation. */
	const progress = Math.min(elapsed / animation.durationMillis, 1);
	/** The eased progress of the animation. */
	const eased = easeInOut(progress);

	if (animation.segments !== undefined) return getMultiSegmentInterpolation(animation, eased);
	if (animation.usesTeleport) return getTeleportInterpolation(animation, eased);
	return interpolateCoords(animation.waypoints[0]!, animation.waypoints[1]!, eased);
}

/**
 * Adds the vertex data of the piece of an animation to the data array. 
 * @param data - The running list of data to append to.
 * @param type - The type of piece the data and animation is for.
 * @param coords - The coordinates of the piece of the animation.
*/
function appendDataOfPiece(data: number[], type: string, coords: Coords): void {
	const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	const { texleft, texbottom, texright, textop } = bufferdata.getTexDataOfType(type, rotation);

	const boardPos = movement.getBoardPos();
	const boardScale = movement.getBoardScale();
	const squareCenter = board.gsquareCenter();
	const startX = (coords[0] - boardPos[0] - squareCenter) * boardScale;
	const startY = (coords[1] - boardPos[1] - squareCenter) * boardScale;
	const endX = startX + 1 * boardScale;
	const endY = startY + 1 * boardScale;

	const { r, g, b, a } = options.getColorOfType(type);

	const bufferData = bufferdata.getDataQuad_ColorTexture(startX, startY, endX, endY, texleft, texbottom, texright, textop, r, g, b, a);

	data.push(...bufferData);
}

/**
 * Applies an ease-in-out function to the progress value.
 * @param progress - The linear progress value (between 0 and 1).
 */
function easeInOut(progress: number): number {
	return -0.5 * Math.cos(Math.PI * progress) + 0.5;
}


// Interpolating between different types of animations -----------------------------------------------


/** Interpolates between two coordinates. */
function interpolateCoords(start: Coords, end: Coords, progress: number): Coords {
	return [
      start[0] + (end[0] - start[0]) * progress,
      start[1] + (end[1] - start[1]) * progress,
    ];
}

/** Returns the interpolated coordinates between two waypoints, with a teleportation effect in the middle once the distance is too large. */
function getTeleportInterpolation(animation: Animation, progress: number): Coords {
	const start = animation.waypoints[0]!;
	const end = animation.waypoints[1]!;
	if (progress < 0.5) {
		// First half: animate from start to first threshold point
		return interpolateCoords(start, end, progress * animation.teleportThreshold!);
	} else {
		// Second half: animate from second threshold point to end
		const invertedProgress = 1 - progress;
		return interpolateCoords(start, end, 1 - (invertedProgress * animation.teleportThreshold!));
	}
}

/** Returns the interpolated coordinates between multiple waypoints. */
function getMultiSegmentInterpolation(animation: Animation, progress: number): Coords {
	const targetDistance = progress * animation.totalDistance;
    
	let accumulated = 0;
	for (const segment of animation.segments!) {
		if (targetDistance <= accumulated + segment.distance) {
			const segmentProgress = (targetDistance - accumulated) / segment.distance;
			return interpolateCoords(segment.start, segment.end, segmentProgress);
		}
		accumulated += segment.distance;
	}
    
	// Fallback to last segment end
	return animation.waypoints[animation.waypoints.length - 1]!;
}


// -----------------------------------------------------------------------------------------


export default {
	animatePiece,
	update,
	renderTransparentSquares,
	renderAnimations,
	getDurationMillisOfMoveAnimation,
	clearAnimations,
};