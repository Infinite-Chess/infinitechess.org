// src/client/scripts/esm/game/boardnav.ts

/**
 * Board navigation: panning with WASD, zooming with space/shift and the mouse wheel,
 * and rotating the view with the mouse while in perspective mode.
 */

import type { DoubleCoords } from '../../../../shared/util/coordutil.js';

import vectors from '../../../../shared/util/math/vectors.js';

import mouse from './mouse.js';
import camera from '../board/rendering/camera.js';
import docutil from '../util/docutil.js';
import boardpos from '../board/rendering/boardpos.js';
import deltatime from '../board/deltatime.js';
import boarddrag from './rendering/boarddrag.js';
import selection from './chess/selection.js';
import { Mouse } from './input.js';
import Transition from './rendering/transitions/Transition.js';
import perspective from './rendering/perspective.js';
import guipromotion from './gui/guipromotion.js';
import { listener_document, listener_canvas } from './listeners.js';

// Constants -------------------------------------------------------------------

/** The accelleration/deceleration rate of the board velocity. */
const PAN_ACCEL = {
	'2D': 145,
	'3D': 75,
};

/** Maximum panning speed. Capped on the x/y hypotenuse. */
const PAN_VEL_CAP = {
	'2D': 22.0,
	'3D': 16.0,
};

/**
 * The acceleration/deceleration rate of the board SCALE velocity.
 * Mobile only decelerates — its scale velocity comes from finger movement.
 */
const SCALE_ACCEL = {
	DESKTOP: 6.0,
	MOBILE: 14.0,
};

/**
 * The scale velocity cap, per input. SPACE_SHIFT is not the absolute cap —
 * scrolling reaches the higher SCROLL one.
 */
const SCALE_VEL_CAP = {
	SPACE_SHIFT: 2.0,
	SCROLL: 2.5,
};

/** Dampener multiplied to the wheel delta before applying it to the scale velocity. */
const WHEEL_MULTIPLIER = 0.015; // Default: 0.015

// Panning & Zooming Controls WASD/Space/Shift/Wheel ---------------------------

/** Applies one frame of perspective rotation, panning and zooming to the board. */
function update(): void {
	updatePerspectiveRotation();

	boarddrag.checkIfBoardDropped(); // Needs to be before exiting from teleporting

	if (Transition.areTransitioning()) return; // Exit if teleporting

	// Keyboard
	detectPanning(); // Movement (WASD)
	detectZooming(); // Zoom/Scale (Space shift, mouse wheel)
}

/** Updates the perspective camera rotation based on mouse input. */
function updatePerspectiveRotation(): void {
	if (!perspective.getEnabled()) return;

	// If they pushed escape, the mouse will no longer be locked.
	// If the mouse is unlocked, don't rotate view.
	if (!perspective.isMouseLocked()) {
		// Check if needs to relock
		if (
			selection.getSquarePawnIsCurrentlyPromotingOn() === undefined &&
			listener_canvas.isMouseClicked(Mouse.LEFT)
		) {
			listener_canvas.claimMouseClick(Mouse.LEFT);
			perspective.relockMouse();
		} else if (listener_canvas.isMouseDown(Mouse.LEFT)) {
			listener_canvas.claimMouseDown(Mouse.LEFT); // Prevents piece drag start from claiming this mouse down.
		}
	} else {
		const mouseChange = listener_document.getPhysicalPointerDelta('mouse');
		if (mouseChange) perspective.addRotation(mouseChange[0], mouseChange[1]);
	}
}

/** Detects WASD controls, updating board velocity accordingly. */
function detectPanning(): void {
	if (boarddrag.isBoardDragging()) return; // Only pan if we aren't dragging the board

	let panVel = boardpos.getPanVel();

	let panning = false; // Any panning key pressed this frame?
	if (!guipromotion.isUIOpen()) {
		// Disable the controls temporarily
		if (listener_document.isKeyHeld('KeyD')) {
			panning = true;
			accelPanVel(panVel, 0);
		}
		if (listener_document.isKeyHeld('KeyA')) {
			panning = true;
			accelPanVel(panVel, 180);
		}
		if (listener_document.isKeyHeld('KeyW')) {
			panning = true;
			accelPanVel(panVel, 90);
		}
		if (listener_document.isKeyHeld('KeyS')) {
			panning = true;
			accelPanVel(panVel, -90);
		}
	}

	if (panning) {
		// Make sure the velocity doesn't exceed the cap
		const hyp = Math.hypot(...panVel);
		const relativePanVelCap = perspective.getEnabled() ? PAN_VEL_CAP['3D'] : PAN_VEL_CAP['2D'];
		const ratio = hyp / relativePanVelCap;
		if (ratio > 1) {
			// Too fast, divide components by the ratio to cap our velocity
			panVel[0] /= ratio;
			panVel[1] /= ratio;
		}
	} else {
		panVel = deccelPanVel(panVel);
	}

	boardpos.setPanVel(panVel); // Set the pan velocity
}

/** Accelerates the given pan velocity in the provided vector direction. */
function accelPanVel(panVel: DoubleCoords, angleDegs: number): DoubleCoords {
	const baseAngle = -camera.getRotZ();
	const dirOfTravel = baseAngle + angleDegs;
	const angleRad = vectors.degreesToRadians(dirOfTravel);
	const XYComponents: DoubleCoords = vectors.getXYComponentsFromAngle(angleRad);
	const accelToUse = perspective.getEnabled() ? PAN_ACCEL['3D'] : PAN_ACCEL['2D'];
	panVel[0] += deltatime.get() * accelToUse * XYComponents[0];
	panVel[1] += deltatime.get() * accelToUse * XYComponents[1];
	return panVel;
}

/** Deccelerates the given pan velocity towards zero, without skipping past it. */
function deccelPanVel(panVel: DoubleCoords): DoubleCoords {
	if (panVel[0] === 0 && panVel[1] === 0) return panVel; // Already stopped

	const rateToUse = perspective.getEnabled() ? PAN_ACCEL['3D'] : PAN_ACCEL['2D'];

	const hyp = Math.hypot(...panVel);
	const newHyp = hyp - deltatime.get() * rateToUse;
	if (newHyp < 0) return [0, 0]; // Stop completely before we start going in the opposite direction

	const ratio = newHyp / hyp;

	const newPanVel: DoubleCoords = [panVel[0] * ratio, panVel[1] * ratio];

	return newPanVel;
}

/** Detects Space/Shift/Wheel controls, updating board SCALE velocity accordingly. */
function detectZooming(): void {
	let scaleVel = boardpos.getScaleVel();

	let scaling = false;
	let scrolling = false;
	if (!guipromotion.isUIOpen()) {
		// Disable the controls temporarily
		// Space/Shift
		if (listener_document.isKeyHeld('Space')) {
			scaling = true;
			scaleVel -= deltatime.get() * SCALE_ACCEL.DESKTOP;
		}
		if (listener_document.isKeyHeld('ShiftLeft')) {
			scaling = true;
			scaleVel += deltatime.get() * SCALE_ACCEL.DESKTOP;
		}
		// Mouse wheel
		const wheelDelta = mouse.getWheelDelta();
		if (wheelDelta !== 0) {
			scaling = true;
			scrolling = true;
			scaleVel -= WHEEL_MULTIPLIER * wheelDelta;
		}
	}

	if (scaling) {
		// Cap the velocity
		const capToUse = scrolling ? SCALE_VEL_CAP.SCROLL : SCALE_VEL_CAP.SPACE_SHIFT;
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

	const deccelerationToUse = docutil.isMouseSupported()
		? SCALE_ACCEL.DESKTOP
		: SCALE_ACCEL.MOBILE;

	if (scaleVel > 0) {
		scaleVel -= deltatime.get() * deccelerationToUse;
		if (scaleVel < 0) scaleVel = 0;
	} else {
		// scaleVel < 0
		scaleVel += deltatime.get() * deccelerationToUse;
		if (scaleVel > 0) scaleVel = 0;
	}

	return scaleVel;
}

// Exports ---------------------------------------------------------------------

export default {
	update,
};
