
// Import Start
import bufferdata from './bufferdata.js';
import sound from '../misc/sound.js';
import movement from './movement.js';
import options from './options.js';
import board from './board.js';
import math from '../../util/math.js';
import perspective from './perspective.js';
import { createModel } from './buffermodel.js';
import frametracker from './frametracker.js';
import spritesheet from './spritesheet.js';
import shapes from './shapes.js';
import arrows from './arrows/arrows.js';
import gamefileutility from '../../chess/util/gamefileutility.js';
import gameslot from '../chess/gameslot.js';
// Import End

/**
 * Type Definitions
 * @typedef {import('../../chess/logic/movepiece.js').Move} Move
 * @typedef {import('./buffermodel.js').BufferModel} BufferModel
 * @typedef {import('../../chess/logic/boardchanges.js').Piece} Piece
 */

"use strict";

/**
 * This script handles the smooth animation when moving a piece from one coord to another
 * Also plays our sounds!
 */

/**
 * The z offset of the transparent square meant to block out the default
 * rendering of the pieces while the animation is visible.
 * 
 * THIS MUST BE GREATER THAN THE Z AT WHICH PIECES ARE RENDERED.
 */
const transparentSquareZ = 0.01;

const timeToPlaySoundEarly = 100;

const maxDistB4Teleport = 80; // 80

const animations = []; // { duration, startTime, type, waypoints, captured, distIsGreater }

/** Used for calculating the duration move animations. */
const moveAnimationDuration = {
	/** The base amount of duration, in millis. */
	baseMillis: 150, // Default: 150
	/** The multiplier amount of duration, in millis, multiplied by the capped move distance. */
	multiplierMillis: 6,
	/** The multiplierMillis when there's atleast 3+ waypoints */
	multiplierMillis_waypoints: 12,
};

/**
 * Animates a piece after moving it.   
 * @param {string} type - The type of piece to animate
 * @param {number[][]} waypoints - Coords[]
 * @param {Piece} [captured] The piece captured, if one was captured.
 * @param {boolean} [resetAnimations] If false, allows animation of multiple pieces at once. Useful for castling. Default: true
 */
function animatePiece(type, waypoints, captured, resetAnimations = true) { // captured: { type, coords }
	if (resetAnimations) clearAnimations(true);

	const dist = getTotalLengthOfPathTraveled(waypoints); // Distance between start and end points of animation.

	const newAnimation = {
		startTime: performance.now(),
		soundPlayed: false,
	
		type,
		waypoints,
		captured,
	
		duration: getDurationMillisOfMoveAnimation(dist, waypoints.length),
		// IF the totalDistance from waypoint1 to the last waypoint is too big, the piece teleports mid-animation.
		distIsGreater: waypoints.length === 2 && dist > maxDistB4Teleport, // Teleport only for single-segment

		// Additional properties for multi-segment animations
		segments: [],
		segmentDistances: [],
		cumulativeDistances: [],
		totalDistance: dist,
	};

	// Precompute segment data if there are multiple waypoints
	if (waypoints.length > 2) {
		const segments = [];
		const segmentDistances = [];
		let cumulative = 0;
		for (let i = 0; i < waypoints.length - 1; i++) {
			const start = waypoints[i];
			const end = waypoints[i + 1];
			const segDist = math.euclideanDistance(start, end);
			segments.push({ start, end });
			segmentDistances.push(segDist);
			cumulative += segDist;
			newAnimation.cumulativeDistances.push(cumulative);
		}
		newAnimation.segments = segments;
		newAnimation.segmentDistances = segmentDistances;
	}

	// Set a timer when to play the sound
	const timeToPlaySound = newAnimation.duration - timeToPlaySoundEarly;
	newAnimation.soundTimeoutID = setTimeout(playAnimationsSound, timeToPlaySound, newAnimation);

	animations.push(newAnimation);
}

function getTotalLengthOfPathTraveled(waypoints) {
	let totalLength = 0;
	for (let i = 0; i < waypoints.length - 1; i++) {
		const start = waypoints[i];
		const end = waypoints[i + 1];
		totalLength += math.euclideanDistance(start, end);
	}
	return totalLength;
}

/**
 * Calculates the duration in milliseconds a particular move would take to animate.
 * @param {Move} move 
 */
function getDurationMillisOfMoveAnimation(dist, waypointCount) {
	const cappedDist = Math.min(dist, maxDistB4Teleport);
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
		clearTimeout(animation.soundTimeoutID); // Don't play it twice..
		if (playSounds && !animation.soundPlayed) playAnimationsSound(animation, true); // .. play it NOW.
	}
	animations.length = 0; // Empties existing animations
}

// For each animation, plays the sound if it's time, and deletes the animation if over.
function update() {
	if (animations.length === 0) return;

	frametracker.onVisualChange();

	for (let i = animations.length - 1; i >= 0; i--) {
		const thisAnimation = animations[i];

		const passedTime = performance.now() - thisAnimation.startTime;

		if (passedTime > thisAnimation.duration) animations.splice(i, 1); // Delete this animation
		else shiftArrowIndicatorOfAnimatedPiece(thisAnimation); // Animate the arrow indicator
	}
}

/** Animates the arrow indicator */
function shiftArrowIndicatorOfAnimatedPiece(animation) { // { duration, startTime, type, waypoints, captured, distIsGreater }
	const animationCurrentCoords = getCurrentCoordsOfAnimation(animation);
	const piece = gamefileutility.getPieceAtCoords(gameslot.getGamefile(), animation.waypoints[animation.waypoints.length - 1]);
	arrows.shiftArrow(piece, animationCurrentCoords, animation.captured);
}

// Set dampen to true if we're skipping quickly through moves
// and we don't want this sound to be so loud
function playAnimationsSound(animation, dampen) {
	if (animation.captured) sound.playSound_capture(animation.totalDistance, dampen);
	else sound.playSound_move(animation.totalDistance, dampen);

	animation.soundPlayed = true;
}

function renderTransparentSquares() {
	if (animations.length === 0) return;

	const transparentModel = genTransparentModel();
	const position = [0,0,transparentSquareZ];
	transparentModel.render(position);
}

/**
 * Generates the model of a completely transparent square.
 * This is used to render-over, or block the normal rendering
 * of the piece in animation until the animation is over.
 * Otherwise there would be 2 copies of it, one in animation and one at its destination.
 * @returns {BufferModel} The buffer model
 */
function genTransparentModel() {
	const data = [];

	const color = [0, 0, 0, 0];
	for (const thisAnimation of animations) {
		data.push(...shapes.getTransformedDataQuad_Color_FromCoord(thisAnimation.waypoints[thisAnimation.waypoints.length - 1], color));
	}

	return createModel(data, 2, "TRIANGLES", true);
}

function renderPieces() {
	if (animations.length === 0) return;

	const pieceModel = genPieceModel();
	// render.renderModel(pieceModel, undefined, undefined, "TRIANGLES", spritesheet.getSpritesheet());
	pieceModel.render();
}

/**
 * Generates the buffer model of the pieces currently being animated.
 * @returns {BufferModel} The buffer model
 */
function genPieceModel() {

	const data = [];

	for (const thisAnimation of animations) {

		const newCoords = getCurrentCoordsOfAnimation(thisAnimation);

		if (thisAnimation.captured) appendDataOfPiece(data, thisAnimation.captured.type, thisAnimation.captured.coords);

		appendDataOfPiece(data, thisAnimation.type, newCoords);
	}

	return createModel(data, 2, "TRIANGLES", true, spritesheet.getSpritesheet());
}

/**
 * Returns the coordinate the animation's piece should be rendered this frame.
 * @param {Object} animation 
 * @returns {number[]}
 */
// Update getCurrentCoordsOfAnimation function:
function getCurrentCoordsOfAnimation(animation) {
	const passedTime = performance.now() - animation.startTime;
	const tLinear = passedTime / animation.duration;
	const equaY = -0.5 * Math.cos(tLinear * Math.PI) + 0.5; // Ease-in-out

	if (animation.waypoints.length > 2) {
		// Handle multi-segment waypoints
		const distanceCovered = equaY * animation.totalDistance;
		let segmentIndex = 0;
		let prevCumulative = 0;

		// Find the current segment
		while (segmentIndex < animation.cumulativeDistances.length && animation.cumulativeDistances[segmentIndex] < distanceCovered) {
			prevCumulative = animation.cumulativeDistances[segmentIndex];
			segmentIndex++;
		}

		// Clamp segmentIndex to valid range
		segmentIndex = Math.min(segmentIndex, animation.segments.length - 1);
		const segment = animation.segments[segmentIndex];
		const segDist = animation.segmentDistances[segmentIndex];
		const segStart = segment.start;
		const segEnd = segment.end;

		// Local t within the segment
		const tSegment = segDist === 0 ? 0 : (distanceCovered - prevCumulative) / segDist;
		const newX = segStart[0] + (segEnd[0] - segStart[0]) * tSegment;
		const newY = segStart[1] + (segEnd[1] - segStart[1]) * tSegment;

		return [newX, newY];
	} else {
		// Existing single-segment logic with teleport check
		const start = animation.waypoints[0];
		const end = animation.waypoints[1];
		let diffX = end[0] - start[0];
		let diffY = end[1] - start[1];

		if (!animation.distIsGreater) {
			return [
				start[0] + diffX * equaY,
				start[1] + diffY * equaY
			];
		} else {
			// 1st half or 2nd half?
			const firstHalf = tLinear < 0.5;
			const neg = firstHalf ? 1 : -1;
			const actualEquaY = firstHalf ? equaY : 1 - equaY;
	
			const ratio = maxDistB4Teleport / animation.totalDistance;
	
			diffX *= ratio;
			diffY *= ratio;
	
			const target = firstHalf ? start : end;
	
			const addX = diffX * actualEquaY * neg;
			const addY = diffY * actualEquaY * neg;

			return [
				target[0] + addX,
				target[1] + addY
			];
		}
	}
}

function appendDataOfPiece(data, type, coords) {

	const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	const { texleft, texbottom, texright, textop } = bufferdata.getTexDataOfType(type, rotation);

	const boardPos = movement.getBoardPos();
	const boardScale = movement.getBoardScale();
	const startX = (coords[0] - boardPos[0] - board.gsquareCenter()) * boardScale;
	const startY = (coords[1] - boardPos[1] - board.gsquareCenter()) * boardScale;
	const endX = startX + 1 * boardScale;
	const endY = startY + 1 * boardScale;

	const { r, g, b, a } = options.getColorOfType(type);

	const bufferData = bufferdata.getDataQuad_ColorTexture(startX, startY, endX, endY, texleft, texbottom, texright, textop, r, g, b, a);

	data.push(...bufferData);
}

export default {
	animatePiece,
	update,
	renderTransparentSquares,
	renderPieces,
	getDurationMillisOfMoveAnimation,
	clearAnimations,
};