
/**
 * This script controls the board navigation
 * via the WASD keys, space/shift, and mouse wheel.
 */


// @ts-ignore
import guipause from "../gui/guipause.js";
// @ts-ignore
import perspective from "../rendering/perspective.js";
// @ts-ignore
import transition from "../rendering/transition.js";
// @ts-ignore
import loadbalancer from "./loadbalancer.js";
// @ts-ignore
import camera from "../rendering/camera.js";
// @ts-ignore
import websocket from "../websocket.js";
// @ts-ignore
import stats from "../gui/stats.js";
// @ts-ignore
import gamefile from "../../chess/logic/gamefile.js";
// @ts-ignore
import statustext from "../gui/statustext.js";
// @ts-ignore
import copypastegame from "../chess/copypastegame.js";
import docutil from "../../util/docutil.js";
import math, { Vec2 } from "../../util/math.js";
import mouse from "../../util/mouse.js";
import { listener_document } from "../chess/game.js";
import guipromotion from "../gui/guipromotion.js";
import boarddrag from "../rendering/boarddrag.js";
import boardpos from "../rendering/boardpos.js";
import selection from "../chess/selection.js";
import jsutil from "../../util/jsutil.js";
import animation from "../rendering/animation.js";
import specialrighthighlights from "../rendering/highlights/specialrighthighlights.js";
import piecemodels from "../rendering/piecemodels.js";
import guinavigation from "../gui/guinavigation.js";
import guigameinfo from "../gui/guigameinfo.js";
import miniimage from "../rendering/miniimage.js";


import type{ Coords } from "../../chess/util/coordutil.js";


// Constants -------------------------------------------------------------------


/** The accelleration/deceleration rate of the board velocity in 2D mode. */
const panAccel2D: number = 145; // Default: 145
/** The accelleration/deceleration rate of the board velocity in 3D mode. */
const panAccel3D: number = 75; // Default: 75

/** The acceleration/deration rate of the board SCALE velocity in 2D mode. */
const scaleAccel_Desktop: number = 6.0; // Acceleration of board scaling   Default: 6
/**
 * The deceleration rate of the board SCALE velocity in 3D mode.
 * (No accerlation, scale velocity is determined by finger movement)
 */
const scaleAccel_Mobile: number = 14.0; // Acceleration of board scaling   Default: 14

/**
 * This is the scale velocity cap when using Space/Shift.
 * It is NOT the absoulte cap which you can reach by scrolling.
 */
const scaleVelCap = 1.0; // Default: 1

/** The  scale velocity cap when u sing the scroll wheel (higher). */
const scaleVelCap_Scroll = 2.5;

/** Dampener multiplied to the wheel delta before applying it to the scale velocity. */
const wheelMultiplier = 0.015; // Default: 0.015


// Panning & Zooming Controls WASD/Space/Shift/Wheel ------------------------------------------------------


// Called from game.updateBoard()
function updateNavControls() {
	if (guipause.areWePaused()) return; // Exit if paused

	boarddrag.checkIfBoardDropped(); // Needs to be before exiting from teleporting

	if (transition.areWeTeleporting()) return; // Exit if teleporting

	// Keyboard
	detectPanning(); // Movement (WASD)
	detectZooming(); // Zoom/Scale (Space shift, mouse wheel)
}


/** Detects WASD controls, updating board velocity accordingly. */
function detectPanning() {
	if (boarddrag.isBoardDragging()) return; // Only pan if we aren't dragging the board

	let panVel = boardpos.getPanVel();

	let panning = false; // Any panning key pressed this frame?
	if (!guipromotion.isUIOpen()) { // Disable the controls temporarily
		if (listener_document.isKeyHeld('KeyD')) {
			panning = true;
			accelPanVel(panVel, 0);
		} if (listener_document.isKeyHeld('KeyA')) {
			panning = true;
			accelPanVel(panVel, 180);
		} if (listener_document.isKeyHeld('KeyW')) {
			panning = true;
			accelPanVel(panVel, 90);
		} if (listener_document.isKeyHeld('KeyS')) {
			panning = true;
			accelPanVel(panVel, -90);
		}
	}

	if (panning) {
		// Make sure the velocity doesn't exceed the cap
		const hyp = Math.hypot(...panVel);
		const relativePanVelCap = boardpos.getRelativePanVelCap();
		const ratio = hyp / relativePanVelCap;
		if (ratio > 1) { // Too fast, divide components by the ratio to cap our velocity
			panVel[0] /= ratio;
			panVel[1] /= ratio;
		}
	} else {
		panVel = deccelPanVel(panVel);
	}

	boardpos.setPanVel(panVel); // Set the pan velocity
}


/** Accelerates the given pan velocity in the provided vector direction. */
function accelPanVel(panVel: Vec2, angleDegs: number): Vec2 {
	const baseAngle = -perspective.getRotZ();
	const dirOfTravel = baseAngle + angleDegs;
	const angleRad = math.degreesToRadians(dirOfTravel);
	const XYComponents: Vec2 = math.getXYComponents_FromAngle(angleRad);
	const accelToUse = perspective.getEnabled() ? panAccel3D : panAccel2D;
	panVel[0] += loadbalancer.getDeltaTime() * accelToUse * XYComponents[0];
	panVel[1] += loadbalancer.getDeltaTime() * accelToUse * XYComponents[1];
	return panVel;
}


/** Deccelerates the given pan velocity towards zero, without skipping past it. */
function deccelPanVel(panVel: Vec2): Vec2 {
	if (panVel[0] === 0 && panVel[1] === 0) return panVel; // Already stopped

	const rateToUse = perspective.getEnabled() ? panAccel3D : panAccel2D;

	const hyp = Math.hypot(...panVel);
	const newHyp = hyp - loadbalancer.getDeltaTime() * rateToUse;
	if (newHyp < 0) return [0,0]; // Stop completely before we start going in the opposite direction
	
	const ratio = newHyp / hyp;

	const newPanVel: Coords = [panVel[0] * ratio, panVel[1] * ratio];
	
	return newPanVel;
}


/** Detects Space/Shift/Wheel controls, updating board SCALE velocity accordingly. */
function detectZooming() {
	let scaleVel = boardpos.getScaleVel();

	let scaling = false;
	let scrolling = false;
	if (!guipromotion.isUIOpen()) { // Disable the controls temporarily
		// Space/Shift
		if (listener_document.isKeyHeld('Space')) {
			scaling = true;
			scaleVel -= loadbalancer.getDeltaTime() * scaleAccel_Desktop;
		}
		if (listener_document.isKeyHeld('ShiftLeft')) {
			scaling = true;
			scaleVel += loadbalancer.getDeltaTime() * scaleAccel_Desktop;
		}
		// Mouse wheel
		const wheelDelta = mouse.getWheelDelta();
		if (wheelDelta !== 0) {
			scaling = true;
			scrolling = true;
			scaleVel -= wheelMultiplier * wheelDelta;
		}
	}

	if (scaling) {
		// Cap the velocity
		const capToUse = scrolling ? scaleVelCap_Scroll : scaleVelCap;
		if (scaleVel > capToUse) scaleVel = capToUse;
		else if (scaleVel < -capToUse) scaleVel = -capToUse;
	} else {
		scaleVel = deccelerateScaleVel(scaleVel);
	}

	boardpos.setScaleVel(scaleVel);
}


/** Deccelerates the given scale velocity towards zero, without skipping past it. */
function deccelerateScaleVel(scaleVel: number): number {
	if (scaleVel === 0) return scaleVel; // Already stopped

	const deccelerationToUse = docutil.isMouseSupported() ? scaleAccel_Desktop : scaleAccel_Mobile;

	if (scaleVel > 0) {
		scaleVel -= loadbalancer.getDeltaTime() * deccelerationToUse;
		if (scaleVel < 0) scaleVel = 0;
	} else { // scaleVel < 0
		scaleVel += loadbalancer.getDeltaTime() * deccelerationToUse;
		if (scaleVel > 0) scaleVel = 0;
	}

	return scaleVel;
}


// Toggles ---------------------------------------------------------------------------------


/** Debug toggles that are not only for in a game, but outside. */
function testOutGameToggles() {
	if (listener_document.isKeyDown('Backquote')) camera.toggleDebug();
	if (listener_document.isKeyDown('Digit4')) websocket.toggleDebug(); // Adds simulated websocket latency with high ping
	if (listener_document.isKeyDown('KeyM')) stats.toggleFPS();
}

/** Debug toggles that are only for in a game. */
function testInGameToggles(gamefile: gamefile) {
	if (listener_document.isKeyDown('Escape')) guipause.toggle();
	
	if (listener_document.isKeyDown('Digit1')) selection.toggleEditMode(); // EDIT MODE TOGGLE
	if (listener_document.isKeyDown('Digit2')) {
		console.log(jsutil.deepCopyObject(gamefile));
		console.log('Estimated gamefile memory usage: ' + jsutil.estimateMemorySizeOf(gamefile));
	}
	if (listener_document.isKeyDown('Digit3')) animation.toggleDebug(); // Each animation slows down and renders continuous ribbon
	if (listener_document.isKeyDown('Digit5')) copypastegame.copyGame(true); // Copies the gamefile as a single position, without all the moves.
	if (listener_document.isKeyDown('Digit6')) specialrighthighlights.toggle(); // Highlights special rights and en passant
	
	if (listener_document.isKeyDown('Tab')) guipause.callback_ToggleArrows();
	if (listener_document.isKeyDown('KeyR')) {
		piecemodels.regenAll(gamefile);
		statustext.showStatus('Regenerated piece models.', false, 0.5);
	}
	if (listener_document.isKeyDown('KeyN')) {
		guinavigation.toggle();
		guigameinfo.toggle();
	}
	if (listener_document.isKeyDown('KeyP')) miniimage.toggle();
	
	guinavigation.update();
}


// Exports ---------------------------------------------------------------------------------


export default {
	updateNavControls,
	testOutGameToggles,
	testInGameToggles,
};