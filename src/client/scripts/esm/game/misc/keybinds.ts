
/**
 * This script will store the keybinds for various game actions.
 * 
 * Currently we only store keybinds that actually CHANGE.
 * But in the future we can expand this with perhaps an option menu.
 */

import guinavigation from "../gui/guinavigation.js";
import boardeditor from "../boardeditor/boardeditor.js";
import perspective from "../rendering/perspective.js";
import { Mouse, MouseButton } from "../input.js";


/** Returns the mouse button currently assigned to board dragging. */
function getBoardDragMouseButton(): MouseButton | undefined {
	if (guinavigation.isAnnotationsButtonEnabled() || perspective.getEnabled()) return undefined;
	if (boardeditor.isLeftMouseReserved()) return Mouse.RIGHT;
	// Default: Left mouse drags board
	return Mouse.LEFT;
}

/** Returns the mouse button currently assigned to drawing annotations. */
function getAnnotationMouseButton(): MouseButton | undefined {
	if (guinavigation.isAnnotationsButtonEnabled() || perspective.getEnabled()) return Mouse.RIGHT;
	if (boardeditor.isLeftMouseReserved()) return undefined; // NO BUTTON draws annotations (right click reserved for dragging)
	// Default: Right mouse draws annotations
	return Mouse.RIGHT;
}

/** Returns the mouse button currently assigned to collapsing annotations, or cancelling premoves. */
function getCollapseMouseButton(): MouseButton | undefined {
	if (boardeditor.isLeftMouseReserved()) return undefined; // Left click reserved for drawing tool
	// Default: Right mouse
	return Mouse.LEFT;
}

/** Returns the mouse button currently assigned to piece selection. */
function getPieceSelectionMouseButton(): MouseButton | undefined {
	if (boardeditor.isLeftMouseReserved()) return undefined; // Left click reserved for drawing tool
	// Default: Left mouse
	return Mouse.LEFT;
}


export default {
	getBoardDragMouseButton,
	getAnnotationMouseButton,
	getCollapseMouseButton,
	getPieceSelectionMouseButton,
};