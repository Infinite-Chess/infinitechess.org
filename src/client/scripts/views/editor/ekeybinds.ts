// src/client/scripts/views/editor/ekeybinds.ts

/**
 * The board editor's input profile.
 *
 * Overrides the default game keybinds so that an active drawing/selection tool
 * can reserve the left mouse button, shifting board dragging to the right.
 */

import type { InputProfile } from '../../game/keybinds.js';

import perspective from '../../game/rendering/perspective.js';
import etoolmanager from './tools/etoolmanager.js';
import guiboardcontrols from '../../game/gui/guiboardcontrols.js';
import { MOUSE, MouseButton } from '../../game/input.js';

/** The board editor's keybind overrides. */
const EDITOR_PROFILE: InputProfile = {
	getBoardDragMouseButton(): MouseButton | undefined {
		if (perspective.getEnabled()) return undefined;
		// Allows a second pointer to pinch zoom the board even when drawing annote with first pointer.
		if (guiboardcontrols.isAnnotationsButtonEnabled()) return MOUSE.LEFT;
		if (etoolmanager.isLeftMouseReserved()) return MOUSE.RIGHT;
		// Default: Left mouse drags board
		return MOUSE.LEFT;
	},
	getAnnotationMouseButton(): MouseButton | undefined {
		if (guiboardcontrols.isAnnotationsButtonEnabled() || perspective.getEnabled())
			return MOUSE.RIGHT;
		if (etoolmanager.isLeftMouseReserved()) return undefined; // NO BUTTON draws annotations (right click reserved for dragging)
		// Default: Right mouse draws annotations
		return MOUSE.RIGHT;
	},
	getCollapseMouseButton(): MouseButton | undefined {
		if (etoolmanager.isLeftMouseReserved()) return undefined; // Left click reserved for drawing tool
		// Default: Left mouse
		return MOUSE.LEFT;
	},
	getPieceSelectionMouseButton(): MouseButton | undefined {
		if (etoolmanager.isLeftMouseReserved()) return undefined; // Left click reserved for drawing tool
		// Default: Left mouse
		return MOUSE.LEFT;
	},
};

export default EDITOR_PROFILE;
