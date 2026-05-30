// src/client/types/globals.d.ts

import type { TranslationsObject } from '../../types/translations.js';
import type { ClientTranslations } from '../../shared/types/client-translations.js';

/**
 * Legacy i18next-era client translations. Backs the global `translations` object
 * injected by EJS templates of pages not yet migrated to Nunjucks/per-component TOMLs.
 * Remove this type (and the `translations` global) once every page has been migrated
 * and the legacy flat-file translation system is deleted — see
 * dev-utils/REDESIGN/TRANSLATION_SYSTEM.md "Target end state".
 */
type LegacyClientTranslations = TranslationsObject['play']['javascript'] &
	TranslationsObject['play']['play-menu'] &
	TranslationsObject['member']['javascript'] &
	TranslationsObject['login']['javascript'] &
	TranslationsObject['leaderboard']['javascript'] &
	TranslationsObject['create-account']['javascript'] &
	TranslationsObject['reset-password']['javascript'] &
	TranslationsObject['password-validation'];

declare global {
	/**
	 * Legacy global translations object injected by EJS templates.
	 * Contains flattened translation properties from various sections.
	 * The actual shape varies by page, but this represents the union of all possible translations.
	 */
	const translations: LegacyClientTranslations;

	/**
	 * Per-component client translations, injected into the page as
	 * `window.t` by the Nunjucks SSR layout (see TRANSLATION_SYSTEM.md).
	 * Only components included on the current page are populated at runtime.
	 */
	const t: ClientTranslations;

	/** htmlscript injected inline inside the game page. It handles the loading animation. */
	var htmlscript: {
		/** Called on failure to load a page asset. */
		callback_LoadingError: () => void;
		/** Removes this specific html element's listener for a loading error. */
		removeOnerror: (this: HTMLElement) => void;
	};

	/** Main script that starts the game loop. Called from htmlscript.js */
	var main: {
		start: () => void;
	};

	/**
	 * Hashed URL for the downsampler audio worklet processor script, injected by Nunjucks via the asset manifest.
	 *
	 * Unlike static `import()` calls (which esbuild rewrites to hashed paths at bundle time),
	 * `AudioWorklet.addModule()` takes an opaque string argument that esbuild cannot analyze or rewrite.
	 */
	var $downsamplerProcessorUrl: string;

	// Our Custom Events
	interface DocumentEventMap {
		'premoves-toggle': CustomEvent<boolean>;
		'lingering-annotations-toggle': CustomEvent<boolean>;
		'starfield-toggle': CustomEvent<boolean>;
		'master-volume-change': CustomEvent<number>;
		'ambience-toggle': CustomEvent<boolean>;
		'ray-count-change': CustomEvent<number>;
		canvas_resize: CustomEvent<{ width: number; height: number }>;
	}
}
