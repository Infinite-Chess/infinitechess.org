// src/client/scripts/esm/game/misc/keybinds.ts

/**
 * This script will store the keybinds for various game actions.
 *
 * Currently we only store keybinds that actually CHANGE.
 * But in the future we can expand this with perhaps an option menu.
 */

import perspective from '../rendering/perspective.js';
import preferences from '../../components/header/preferences.js';
import etoolmanager from '../boardeditor/tools/etoolmanager.js';
import guinavigation from '../gui/guinavigation.js';
import { listener_document } from '../chess/game.js';
import { Mouse, MouseButton } from '../input.js';

/** Returns the mouse button currently assigned to board dragging. */
function getBoardDragMouseButton(): MouseButton | undefined {
	if (perspective.getEnabled()) return undefined;
	if (guinavigation.isAnnotationsButtonEnabled()) return Mouse.LEFT; // Allows a second pointer to pinch zoom the board even when drawing annote with first pointer.
	if (etoolmanager.isLeftMouseReserved()) return Mouse.RIGHT;
	// Default: Left mouse drags board
	return Mouse.LEFT;
}

/** Returns the mouse button currently assigned to drawing annotations. */
function getAnnotationMouseButton(): MouseButton | undefined {
	if (guinavigation.isAnnotationsButtonEnabled() || perspective.getEnabled()) return Mouse.RIGHT;
	if (etoolmanager.isLeftMouseReserved()) return undefined; // NO BUTTON draws annotations (right click reserved for dragging)
	// Default: Right mouse draws annotations
	return Mouse.RIGHT;
}

/** Returns the mouse button currently assigned to collapsing annotations, or cancelling premoves. */
function getCollapseMouseButton(): MouseButton | undefined {
	if (etoolmanager.isLeftMouseReserved()) return undefined; // Left click reserved for drawing tool
	// Default: Right mouse
	return Mouse.LEFT;
}

/** Returns the mouse button currently assigned to piece selection. */
function getPieceSelectionMouseButton(): MouseButton | undefined {
	if (etoolmanager.isLeftMouseReserved()) return undefined; // Left click reserved for drawing tool
	// Default: Left mouse
	return Mouse.LEFT;
}

/**
 * Returns true if piece dragging should currently be treated as enabled.
 * The Ctrl key, if held, temporarily inverts the drag preference.
 */
function getEffectiveDragEnabled(): boolean {
	const dragEnabled = preferences.getDragEnabled();
	const ctrlOverride =
		listener_document.isKeyHeld('ControlLeft') || listener_document.isKeyHeld('ControlRight');
	return ctrlOverride ? !dragEnabled : dragEnabled;
}

export default {
	getBoardDragMouseButton,
	getAnnotationMouseButton,
	getCollapseMouseButton,
	getPieceSelectionMouseButton,
	getEffectiveDragEnabled,
};
