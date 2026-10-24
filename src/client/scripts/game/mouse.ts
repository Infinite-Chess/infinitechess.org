// src/client/scripts/game/mouse.ts

/**
 * This script contains several wrappers for getting the
 * mouse position, world space, or coordinates,
 * reading the correct listener depending on whether we're in perspective mode or not.
 */

import type { BDCoords, Coords, DoubleCoords } from '../../../shared/util/coordutil.js';

import space from '../board/rendering/space.js';
import camera from '../board/rendering/camera.js';
import boardpos from '../board/rendering/boardpos.js';
import perspective from './rendering/perspective.js';
import { listener_document, listener_canvas } from './listeners.js';
import input, { InputListener, MOUSE, MouseButton } from './input.js';

// World Space -----------------------------------------------------------------

/**
 * Returns the world space coordinates of the mouse pointer,
 * or the crosshair if the mouse is locked (in perspective mode).
 */
function getMouseWorld(button: MouseButton = MOUSE.LEFT): DoubleCoords | undefined {
	if (!perspective.getEnabled()) {
		// Before the first click there may be no button-associated pointer yet,
		// but the physical 'mouse' pointer still tracks hover movement.
		const physicalPointerId = listener_canvas.getMousePhysicalId(button) ?? 'mouse';
		let mousePos = getPhysicalPointerPosition_Offscreen(physicalPointerId);
		if (!mousePos) {
			// Pointer likely doesn't exist anymore (touch event lifted).
			// This will return its last known position.
			mousePos = listener_canvas.getMousePosition(button);
		}
		if (!mousePos) return undefined;
		return convertMousePositionToWorldSpace(mousePos);
	} else return getCrossHairWorld(); // Mouse is locked, we must be in perspective mode. Calculate the mouse world according to the crosshair location instead.
}

/**
 * This is capable of getting the mouse position, EVEN IF
 * it is off screen! Only the document's event listener is capable
 * of receiving 'mousemove' events when the mouse is off screen.
 *
 * If another pointer id is used, such as a touch event, we cannot
 * detect the mouse position when it is off screen.
 *
 * ONLY WORKS IF WE LEFT-CLICK-DRAG off the screen. NOT if we right-click-drag!
 */
function getPhysicalPointerPosition_Offscreen(physicalPointerId: string): DoubleCoords | undefined {
	if (physicalPointerId === 'mouse') {
		// The mouse on the document is sensitive to 'mousemove' events even when the mouse is outside the element/window.
		// This allows us to continue dragging the board/piece even when the mouse is outside the window.
		const mousePos = listener_document.getPhysicalPointerPos(physicalPointerId);
		if (!mousePos) return undefined;
		// Make the coordinates relative to the element instead of the document.
		return input.getRelativeMousePosition(mousePos, listener_canvas.element);
	} else {
		return listener_canvas.getPhysicalPointerPos(physicalPointerId);
	}
}

/**
 * Converts a position on the canvas, in virtual pixels from its top-left corner, to world space.
 * Reads the canvas size from the camera, the same snapshot as its screen box, never the live DOM.
 */
function convertMousePositionToWorldSpace(mouse: DoubleCoords): DoubleCoords {
	const screenBox = camera.getScreenBoundingBox();
	const screenWidth = screenBox.right - screenBox.left;
	const screenHeight = screenBox.top - screenBox.bottom;
	const canvasWidth = camera.getCanvasWidthVirtualPixels();
	const canvasHeight = camera.getCanvasHeightVirtualPixels();
	// The world space coordinates are sensitive to whether we're viewing white's or black's perspective.
	// prettier-ignore
	const mouseWorldSpace: DoubleCoords = camera.getIsViewingBlackPerspective() ? [
		screenBox.right - (mouse[0] / canvasWidth) * screenWidth,
		// [0,0] is the top LEFT corner of the screen, according to mouse coordinates.
		screenBox.bottom + (mouse[1] / canvasHeight) * screenHeight,
	] : [
		screenBox.left + (mouse[0] / canvasWidth) * screenWidth,
		// [0,0] is the top LEFT corner of the screen, according to mouse coordinates.
		screenBox.top - (mouse[1] / canvasHeight) * screenHeight,
	];
	return mouseWorldSpace;
}

/**
 * Returns the world position of the crosshair, dependant on perspective mode rotations.
 * May only return undefined in the case we're looking into the sky.
 */
function getCrossHairWorld(): DoubleCoords | undefined {
	if (camera.isLookingUp()) return;

	const rotX = (Math.PI / 180) * camera.getRotX();
	const rotZ = (Math.PI / 180) * camera.getRotZ();

	// Calculate intersection point
	const hyp = -Math.tan(rotX) * camera.getPosition()[2];

	// x^2 + y^2 = hyp^2
	// hyp = sqrt( x^2 + y^2 )

	const mouseWorld: DoubleCoords = [hyp * Math.sin(rotZ), hyp * Math.cos(rotZ)];

	return mouseWorld;
}

/**
 * Returns the world space coordinates of the given pointer,
 * or the crosshair if in perspective mode.
 */
function getPointerWorld(pointerId: string): DoubleCoords | undefined {
	if (!perspective.getEnabled()) {
		const physicalPointerId = listener_canvas.getPhysicalPointerIdOfPointer(pointerId);
		if (!physicalPointerId) return undefined;
		const pointerPos = getPhysicalPointerPosition_Offscreen(physicalPointerId);
		if (!pointerPos) return undefined;
		return convertMousePositionToWorldSpace(pointerPos);
	} else return getCrossHairWorld(); // Mouse is locked, we must be in perspective mode. Calculate the mouse world according to the crosshair location instead.
}

/**
 * Returns the world space coordinates of a PHYSICAL pointer,
 * or the crosshair if in perspective mode.
 */
function getPhysicalPointerWorld(physicalPointerId: string): DoubleCoords | undefined {
	if (!perspective.getEnabled()) {
		const pointerPos = getPhysicalPointerPosition_Offscreen(physicalPointerId);
		if (!pointerPos) return undefined;
		return convertMousePositionToWorldSpace(pointerPos);
	} else return getCrossHairWorld(); // Mouse is locked, we must be in perspective mode. Calculate the mouse world according to the crosshair location instead.
}

/**
 * Returns all the existing PHYSICAL pointers' world
 * coordinates, depending on the relevant listener.
 */
function getAllPointerWorlds(): DoubleCoords[] {
	const allPhysicalPointerIds = getRelevantListener().getAllPhysicalPointers();
	const pointerWorlds: DoubleCoords[] = [];
	for (const id of allPhysicalPointerIds) {
		const world = getPhysicalPointerWorld(id);
		// Only push them if their world coordinates exist (won't if looking into sky)
		if (world) pointerWorlds.push(world);
	}
	return pointerWorlds;
}

// Tiles -----------------------------------------------------------------------

/** Returns the integer square the mouse is over. */
function getTileMouseOver_Integer(button: MouseButton = MOUSE.LEFT): Coords | undefined {
	const mouseWorld = getMouseWorld(button);
	if (!mouseWorld) return undefined;
	return space.convertWorldSpaceToCoords_Rounded(boardpos, mouseWorld);
}

/** Returns the floating point tile the given LOGICAL pointer is over. */
function getTilePointerOver_Float(pointerId: string): BDCoords | undefined {
	const physicalPointerId = listener_canvas.getPhysicalPointerIdOfPointer(pointerId);
	if (!physicalPointerId) return;
	const pointerCoords = getPhysicalPointerPosition_Offscreen(physicalPointerId);
	if (!pointerCoords) return undefined;

	const pointerWorld = convertMousePositionToWorldSpace(pointerCoords);
	return space.convertWorldSpaceToCoords(boardpos, pointerWorld);
}

/** Gets the given pointer's current coordinates being hovered over, rounded to the integer square. */
function getTilePointerOver_Integer(pointerId: string): Coords | undefined {
	const pointerWorld: DoubleCoords | undefined = getPointerWorld(pointerId);
	if (!pointerWorld) return undefined;
	return space.convertWorldSpaceToCoords_Rounded(boardpos, pointerWorld);
}

// Listener Wrappers -----------------------------------------------------------

/**
 * Wrapper for reading the correct listener for whether the mouse button is down,
 * depending on whether we're in perspective mode or not.
 */
function isMouseDown(button: MouseButton): boolean {
	if (perspective.isMouseLocked()) return listener_document.isMouseDown(button);
	else return listener_canvas.isMouseDown(button);
}

/**
 * Wrapper for reading the correct listener for whether the mouse button is held,
 * depending on whether we're in perspective mode or not.
 */
function isMouseHeld(button: MouseButton): boolean {
	if (perspective.isMouseLocked()) return listener_document.isMouseHeld(button);
	else return listener_canvas.isMouseHeld(button);
}

/**
 * Wrapper for reading the correct listener for whether the mouse button was click simulated,
 * depending on whether we're in perspective mode or not.
 */
function isMouseClicked(button: MouseButton): boolean {
	if (perspective.isMouseLocked()) return listener_document.isMouseClicked(button);
	else return listener_canvas.isMouseClicked(button);
}

/**
 * Wrapper for reading the correct listener for whether the mouse button was double-click simulated,
 * depending on whether we're in perspective mode or not.
 */
function isMouseDoubleClickDragged(button: MouseButton): boolean {
	if (perspective.isMouseLocked()) return listener_document.isMouseDoubleClickDragged(button);
	else return listener_canvas.isMouseDoubleClickDragged(button);
}

/**
 * Wrapper for reading the correct listener for the mouse wheel delta,
 * depending on whether the mouse is locked or not (perspective mode).
 */
function getWheelDelta(): number {
	if (perspective.isMouseLocked()) return listener_document.getWheelDelta();
	else return listener_canvas.getWheelDelta();
}

/**
 * Wrapper for reading the correct listener for claiming the mouse down event,
 * depending on whether we're in perspective mode or not.
 */
function claimMouseDown(button: MouseButton): void {
	if (perspective.isMouseLocked()) listener_document.claimMouseDown(button);
	else listener_canvas.claimMouseDown(button);
}

/**
 * Wrapper for reading the correct listener for claiming the mouse click event,
 * depending on whether we're in perspective mode or not.
 */
function claimMouseClick(button: MouseButton): void {
	if (perspective.isMouseLocked()) listener_document.claimMouseClick(button);
	else listener_canvas.claimMouseClick(button);
}

/**
 * Wrapper for reading the correct listener for canceling the mouse click event,
 * depending on whether we're in perspective mode or not.
 */
function cancelMouseClick(button: MouseButton): void {
	if (perspective.isMouseLocked()) listener_document.cancelMouseClick(button);
	else listener_canvas.cancelMouseClick(button);
}

/**
 * Wrapper for reading the correct listener for getting the most recent mouse id
 * that performed the specified action, depending on whether we're in perspective mode or not.
 */
function getMouseId(button: MouseButton): string | undefined {
	if (perspective.isMouseLocked()) return listener_document.getMouseId(button);
	else return listener_canvas.getMouseId(button);
}

/**
 * Returns the relevant listener for the mouse events,
 * depending on whether we're in perspective mode or not.
 */
function getRelevantListener(): InputListener {
	if (perspective.getEnabled()) return listener_document;
	else return listener_canvas;
}

// Exports ---------------------------------------------------------------------

export default {
	// World Space
	getMouseWorld,
	convertMousePositionToWorldSpace,
	getPointerWorld,
	getPhysicalPointerWorld,
	getAllPointerWorlds,
	// Tiles
	getTileMouseOver_Integer,
	getTilePointerOver_Float,
	getTilePointerOver_Integer,
	// Listener Wrappers
	isMouseDown,
	isMouseHeld,
	isMouseClicked,
	isMouseDoubleClickDragged,
	getWheelDelta,
	claimMouseDown,
	claimMouseClick,
	cancelMouseClick,
	getMouseId,
	getRelevantListener,
};
