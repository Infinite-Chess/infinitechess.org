
/**
 * This script contains several wrappers for getting the
 * mouse position, world space, or coordinates,
 * reading the correct listener depending on whether we're in perspective mode or not.
 */


import { listener_document, listener_overlay } from "../game/chess/game.js";
import input2, { Mouse, MouseButton } from "../game/input.js";
import space from "../game/misc/space.js";
// @ts-ignore
import camera from "../game/rendering/camera.js";
// @ts-ignore
import perspective from "../game/rendering/perspective.js";


import type { Coords } from "../chess/util/coordutil.js";


/**
 * This is capable of getting the mouse position, EVEN IF
 * it is off screen! Only the document's event listener is capable
 * of receiving 'mousemove' events when the mouse is off screen.
 * 
 * If another pointer id is used, such as a touch event, we cannot
 * detect the mouse position when it is off screen.
 */
function getPointerPosition_Offscreen(pointerId: string): Coords | undefined {
	if (pointerId === 'mouse') {
		// The mouse on the document is sensitive to 'mousemove' events even when the mouse is outside the element/window.
		// This allows us to continue dragging the board/piece even when the mouse is outside the window.
		const mousePos = listener_document.getPointerPos(pointerId!);
		if (!mousePos) return undefined;
		// Make the coordinates relative to the element instead of the document.
		return input2.getRelativeMousePosition(mousePos, listener_overlay.element);
	} else {
		return listener_overlay.getPointerPos(pointerId!);
	}
}

/**
 * Returns the world space coordinates of the mouse pointer,
 * or the crosshair if the mouse is locked (in perspective mode).
 */
function getMouseWorld(button: MouseButton = Mouse.LEFT): Coords | undefined {
	if (!perspective.getEnabled()) {
		// const mousePos = listener_overlay.getMousePosition(button);
		const mouseId = listener_overlay.getMouseId(button);
		if (!mouseId) return undefined;
		let mousePos = getPointerPosition_Offscreen(mouseId);
		if (!mousePos) {
			// Pointer likely doesn't exist anymore (touch event lifted).
			// This will return its last known position.
			mousePos = listener_overlay.getMousePosition(button);
		}
		if (!mousePos) return undefined;
		return convertMousePositionToWorldSpace(mousePos, listener_overlay.element);
	} else return getCrossHairWorld(); // Mouse is locked, we must be in perspective mode. Calculate the mouse world according to the crosshair location instead.
}

/**
 * Returns the world space coordinates of the mouse pointer,
 * or the crosshair if in perspective mode.
 */
function getPointerWorld(pointerId: string): Coords | undefined {
	if (!perspective.getEnabled()) {
		const pointerPos = getPointerPosition_Offscreen(pointerId);
		if (!pointerPos) return undefined;
		return convertMousePositionToWorldSpace(pointerPos, listener_overlay.element);
	} else return getCrossHairWorld(); // Mouse is locked, we must be in perspective mode. Calculate the mouse world according to the crosshair location instead.
}

function getCrossHairWorld(): Coords {
	const rotX = (Math.PI / 180) * perspective.getRotX();
	const rotZ = (Math.PI / 180) * perspective.getRotZ();
	
	// Calculate intersection point
	const hyp = -Math.tan(rotX) * camera.getPosition()[2];

	// x^2 + y^2 = hyp^2
	// hyp = sqrt( x^2 + y^2 )

	const mouseWorld: Coords = [
		hyp * Math.sin(rotZ),
		hyp * Math.cos(rotZ)
	];

	// console.log(mouseWorld);
	return mouseWorld;
}

function convertMousePositionToWorldSpace(mouse: Coords, element: HTMLElement | typeof document): Coords {
	const mouseCopy: Coords = [...mouse];
	const screenBox = camera.getScreenBoundingBox();
	const screenWidth = screenBox.right - screenBox.left;
	const screenHeight = screenBox.top - screenBox.bottom;
	const clientWidth = element instanceof HTMLElement ? element.clientWidth : window.innerWidth;
	const clientHeight = element instanceof HTMLElement ? element.clientHeight : window.innerHeight;
	// The world space coordinates are sensitive to whether we're viewing white's or black's perspective.
	const mouseWorldSpace: Coords = perspective.getIsViewingBlackPerspective() ? [
		screenBox.right - (mouseCopy[0] / clientWidth) * screenWidth,
		// [0,0] is the top LEFT corner of the screen, according to mouse coordinates.
		screenBox.bottom + (mouseCopy[1] / clientHeight) * screenHeight
	] : [
		screenBox.left + (mouseCopy[0] / clientWidth) * screenWidth,
		// [0,0] is the top LEFT corner of the screen, according to mouse coordinates.
		screenBox.top - (mouseCopy[1] / clientHeight) * screenHeight
	];
	return mouseWorldSpace;
}

function getTileMouseOver_Float(): Coords | undefined {
	const mouseWorld = getMouseWorld();
	if (!mouseWorld) return undefined;
	return space.convertWorldSpaceToCoords(mouseWorld);
}

function getTileMouseOver_Integer(): Coords | undefined {
	const mouseWorld = getMouseWorld();
	if (!mouseWorld) return undefined;
	return space.convertWorldSpaceToCoords_Rounded(mouseWorld);
}

function getTilePointerOver_Float(pointerId: string): Coords | undefined {
	// const pointerCoords = listener_overlay.getPointerPos(pointerId)!;
	const pointerCoords = getPointerPosition_Offscreen(pointerId);
	if (!pointerCoords) return undefined;

	const pointerWorld = convertMousePositionToWorldSpace(pointerCoords, listener_overlay.element);
	return space.convertWorldSpaceToCoords(pointerWorld);
}

function getTilePointerOver_Integer(pointerId: string): Coords | undefined {
	// const pointerCoords = listener_overlay.getPointerPos(pointerId)!;
	const pointerCoords = getPointerPosition_Offscreen(pointerId);
	if (!pointerCoords) return undefined;

	const pointerWorld = convertMousePositionToWorldSpace(pointerCoords, listener_overlay.element);
	return space.convertWorldSpaceToCoords_Rounded(pointerWorld);
}

/**
 * Wrapper for reading the correct listener for whether the mouse button is down,
 * depending on whether we're in perspective mode or not.
 */
function isMouseDown(button: MouseButton): boolean {
	if (perspective.isMouseLocked()) return listener_document.isMouseDown(button);
	else return listener_overlay.isMouseDown(button);
}

/**
 * Wrapper for reading the correct listener for whether the mouse button is held,
 * depending on whether we're in perspective mode or not.
 */
function isMouseHeld(button: MouseButton): boolean {
	if (perspective.isMouseLocked()) return listener_document.isMouseHeld(button);
	else return listener_overlay.isMouseHeld(button);
}

/**
 * Wrapper for reading the correct listener for whether the mouse button was click simulated,
 * depending on whether we're in perspective mode or not.
 */
function isMouseClicked(button: MouseButton): boolean {
	if (perspective.isMouseLocked()) return listener_document.isMouseClicked(button);
	else return listener_overlay.isMouseClicked(button);
}

/**
 * Wrapper for reading the correct listener for whether the mouse button was double-click simulated,
 * depending on whether we're in perspective mode or not.
 */
function isMouseDoubleClickDragged(button: MouseButton): boolean {
	if (perspective.isMouseLocked()) return listener_document.isMouseDoubleClickDragged(button);
	else return listener_overlay.isMouseDoubleClickDragged(button);
}

/**
 * Wrapper for reading the correct listener for the mouse wheel delta,
 * depending on whether the mouse is locked or not (perspective mode).
 */
function getWheelDelta(): number {
	if (perspective.isMouseLocked()) return listener_document.getWheelDelta();
	else return listener_overlay.getWheelDelta();
}


export default {
	getMouseWorld,
	getPointerWorld,
	convertMousePositionToWorldSpace,
	getTileMouseOver_Float,
	getTileMouseOver_Integer,
	getTilePointerOver_Float,
	getTilePointerOver_Integer,
	isMouseDown,
	isMouseHeld,
	isMouseClicked,
	isMouseDoubleClickDragged,
	getWheelDelta,
};