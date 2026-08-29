// src/client/scripts/esm/game/keybinds.ts

/**
 * Stores the keybinds for various game actions.
 *
 * Bindings are resolved through an InputProfile so individual pages can override them.
 * The normal game uses DEFAULT_PROFILE; pages like the board editor may swap in
 * their own profile via setProfile().
 */

import perspective from './rendering/perspective.js';
import preferences from '../util/preferences.js';
import { listener_document } from './chess/gamecore.js';
import { Mouse, MouseButton } from './input.js';

/**
 * A set of mouse-button bindings for the core board actions.
 * Pages may provide their own profile to remap any of these.
 */
export interface InputProfile {
	/** The mouse button assigned to board dragging. */
	getBoardDragMouseButton(): MouseButton | undefined;
	/** The mouse button assigned to drawing annotations. */
	getAnnotationMouseButton(): MouseButton | undefined;
	/** The mouse button assigned to collapsing annotations, or cancelling premoves. */
	getCollapseMouseButton(): MouseButton | undefined;
	/** The mouse button assigned to piece selection. */
	getPieceSelectionMouseButton(): MouseButton | undefined;
}

/** The default bindings, used by most pages. */
const DEFAULT_PROFILE: InputProfile = {
	getBoardDragMouseButton: () => (perspective.getEnabled() ? undefined : Mouse.LEFT),
	getAnnotationMouseButton: () => Mouse.RIGHT,
	getCollapseMouseButton: () => Mouse.LEFT,
	getPieceSelectionMouseButton: () => Mouse.LEFT,
};

/** The bindings currently in effect. */
let activeProfile: InputProfile = DEFAULT_PROFILE;

/** Overrides the active input profile. Used by pages that remap bindings, e.g. the board editor. */
function setProfile(profile: InputProfile): void {
	activeProfile = profile;
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
	setProfile,
	getBoardDragMouseButton: (): MouseButton | undefined => activeProfile.getBoardDragMouseButton(),
	getAnnotationMouseButton: (): MouseButton | undefined => activeProfile.getAnnotationMouseButton(), // prettier-ignore
	getCollapseMouseButton: (): MouseButton | undefined => activeProfile.getCollapseMouseButton(),
	getPieceSelectionMouseButton: (): MouseButton | undefined => activeProfile.getPieceSelectionMouseButton(), // prettier-ignore
	getEffectiveDragEnabled,
};
