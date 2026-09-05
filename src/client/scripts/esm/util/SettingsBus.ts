// src/client/scripts/esm/util/SettingsBus.ts

/**
 * Typed event bus for the user's settings — the preferences in preferences.ts, and the
 * header's appearance dropdown. Dispatched wherever a setting is written; listened to by
 * whatever audio, rendering or page code has to react.
 *
 * Separate from GameBus because these fire on every page, including ones with no board.
 */

import { EventBus } from '../../../../shared/util/EventBus.js';

interface SettingsBusEvents {
	// =========== Appearance ============

	/** Dispatched when the board theme changes. Listeners re-read their colors from preferences.ts. */
	'theme-change': void;
	/** Dispatched when the page's light/dark color scheme changes. */
	'color-scheme-change': void;
	/** Dispatched when the legal move highlight shape changes between dots and squares. */
	'legalmove-shape-change': void;
	/** Dispatched when the starfield background is enabled or disabled. */
	'starfield-toggle': boolean;

	// =========== Gameplay ============

	/** Dispatched when premoving is enabled or disabled. */
	'premoves-toggle': boolean;
	/** Dispatched when annotations stop being erased between moves, or start again. */
	'lingering-annotations-toggle': boolean;
	/** Dispatched when perspective mode's field of view changes. */
	'fov-change': void;

	// =========== Sound ============

	/** Dispatched when the master volume changes. Carries the new level, 0 (silent) to 1 (full). */
	'master-volume-change': number;
	/** Dispatched when ambient soundscapes are enabled or disabled. */
	'ambience-toggle': boolean;
}

export const SettingsBus: EventBus<SettingsBusEvents> = new EventBus<SettingsBusEvents>();
