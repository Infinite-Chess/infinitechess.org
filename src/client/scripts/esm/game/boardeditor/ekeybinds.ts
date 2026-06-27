// src/client/scripts/esm/game/boardeditor/ekeybinds.ts

/**
 * The board editor's input profile.
 *
 * Overrides the default game keybinds so that an active drawing/selection tool
 * can reserve the left mouse button, shifting board dragging to the right.
 */

import type { InputProfile } from '../misc/keybinds.js';

import perspective from '../rendering/perspective.js';
import etoolmanager from './tools/etoolmanager.js';
import guiboardcontrols from '../gui/guiboardcontrols.js';
import { Mouse, MouseButton } from '../input.js';

/** The board editor's keybind overrides. */
const EDITOR_PROFILE: InputProfile = {
	getBoardDragMouseButton(): MouseButton | undefined {
		if (perspective.getEnabled()) return undefined;
		// Allows a second pointer to pinch zoom the board even when drawing annote with first pointer.
		if (guiboardcontrols.isAnnotationsButtonEnabled()) return Mouse.LEFT;
		if (etoolmanager.isLeftMouseReserved()) return Mouse.RIGHT;
		// Default: Left mouse drags board
		return Mouse.LEFT;
	},
	getAnnotationMouseButton(): MouseButton | undefined {
		if (guiboardcontrols.isAnnotationsButtonEnabled() || perspective.getEnabled())
			return Mouse.RIGHT;
		if (etoolmanager.isLeftMouseReserved()) return undefined; // NO BUTTON draws annotations (right click reserved for dragging)
		// Default: Right mouse draws annotations
		return Mouse.RIGHT;
	},
	getCollapseMouseButton(): MouseButton | undefined {
		if (etoolmanager.isLeftMouseReserved()) return undefined; // Left click reserved for drawing tool
		// Default: Right mouse
		return Mouse.LEFT;
	},
	getPieceSelectionMouseButton(): MouseButton | undefined {
		if (etoolmanager.isLeftMouseReserved()) return undefined; // Left click reserved for drawing tool
		// Default: Left mouse
		return Mouse.LEFT;
	},
};

export default EDITOR_PROFILE;
