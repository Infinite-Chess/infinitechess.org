
/**
 * This script will store the keybinds for various game actions.
 * 
 * Currently we only store keybinds that actually CHANGE.
 * But in the future we can expand this with perhaps an option menu.
 */

import guinavigation from "../gui/guinavigation.js";
import boardeditor from "./boardeditor.js";
import { Mouse, MouseButton } from "../input.js";


/** Returns the mouse button currently assigned to board dragging. */
function getBoardDragMouseButton(): MouseButton {
	// Exception: Board editor is using a drawing tool,
	// AND the mobile annotations button is off: Right mouse drags board
	if (boardeditor.areUsingDrawingtool() && !guinavigation.isAnnotationsButtonEnabled()) return Mouse.RIGHT;

	// Default: Left mouse drags board
	return Mouse.LEFT;
}

/** Returns the mouse button currently assigned to drawing annotations. */
function getAnnotationMouseButton(): MouseButton | undefined {
	// Exception: Board editor is using a drawing tool,
	// AND the mobile annotations button is off: NO BUTTON draws annotations
	if (boardeditor.areUsingDrawingtool() && !guinavigation.isAnnotationsButtonEnabled()) return undefined;

	// Default: Right mouse draws annotations
	return Mouse.RIGHT;
}

/** Returns the mouse button currently assigned to collapsing annotations, or cancelling premoves. */
function getCollapseMouseButton(): MouseButton | undefined {
	// Exception: Board editor is using a drawing tool: NO BUTTON
	if (boardeditor.areUsingDrawingtool()) return undefined;

	// Default: Right mouse
	return Mouse.LEFT;
}


export default {
	getBoardDragMouseButton,
	getAnnotationMouseButton,
	getCollapseMouseButton,
};