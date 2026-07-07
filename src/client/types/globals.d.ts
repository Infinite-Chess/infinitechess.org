// src/client/types/globals.d.ts

import type { Player } from '../../shared/chess/util/typeutil.js';
import type { StaticGameSetup } from '../../shared/types.js';
import type { TranslationsObject } from '../../types/translations.js';
import type { ScriptTranslations } from '../../shared/types/script-translations.js';

/**
 * Legacy i18next-era client translations. Backs the global `translations` object
 * injected by EJS templates of pages not yet migrated to Nunjucks/per-component TOMLs.
 * Remove this type (and the `translations` global) once every page has been migrated
 * and the legacy flat-file translation system is deleted — see
 * docs/systems/TRANSLATIONS.md "Target end state".
 */
type LegacyClientTranslations = TranslationsObject['play']['javascript'] &
	TranslationsObject['play']['play-menu'] &
	TranslationsObject['member']['javascript'] &
	TranslationsObject['leaderboard']['javascript'];

/** The subset of Cloudflare Turnstile's `window.turnstile` API we use. */
interface Turnstile {
	/** Renders a widget into `container`, returning an opaque widget id for later `reset`. */
	render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
	/** Clears the widget's token and re-issues the challenge, yielding a fresh single-use token. */
	reset: (widgetId: string) => void;
	/** Destroys the widget and frees its resources; the widget id is invalid afterward. */
	remove: (widgetId: string) => void;
}

/** Options passed to `turnstile.render()` for explicit widget rendering. */
interface TurnstileRenderOptions {
	/** The public site key, in Managed mode the default. */
	sitekey: string;
	/** Widget color theme. Pass the page's resolved theme; omitting it defaults to `'auto'`. */
	theme: 'light' | 'dark';
	/** Called with the verification token once the challenge is solved. */
	callback: (token: string) => void;
	/** Called when the challenge errors out. */
	'error-callback': () => void;
	/** Called when a previously-issued token expires (tokens have a ~300s TTL). */
	'expired-callback': () => void;
}

declare global {
	/**
	 * Legacy global translations object injected by EJS templates.
	 * Contains flattened translation properties from various sections.
	 * The actual shape varies by page, but this represents the union of all possible translations.
	 */
	const translations: LegacyClientTranslations;

	/**
	 * Per-component script-facing translations, injected into the page as
	 * `window.t` by the Nunjucks SSR layout (see docs/systems/TRANSLATIONS.md).
	 * Only components included on the current page are populated at runtime.
	 * Mirrors the server's `req.t`.
	 */
	const t: ScriptTranslations;

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

	/**
	 * SSR→client data for the game page (/game/:id), injected by game.njk.
	 * Includes all static information about a game.
	 */
	var gamePageData: {
		/** The numeric game id, decoded from the base62 URL segment. */
		id: number;
		/** Best-effort liveness hint at SSR time; may be stale by render, so the client re-confirms. */
		isLive: boolean;
		/** The viewer's color, SSR-resolved from their cookie identity. Undefined for spectators. */
		role?: Player;
	} & StaticGameSetup;

	/**
	 * SSR→client data for the analysis page (/analysis/:id?), injected by analysis.njk.
	 */
	var analysisPageData: {
		/** Base62 id of a game to auto-load, or null for a fresh board. */
		gameId: string | null;
		/** Hashed URL of the analysis engine worker script (from the asset manifest). */
		workerUrl: string;
	};

	/** Cloudflare Turnstile's API, injected by their `api.js` script (see register.njk). */
	var turnstile: Turnstile;
	/** Called by Turnstile's `api.js` (`?onload=…`) once ready; register.ts assigns it to render the widget. */
	var onloadTurnstileCallback: () => void;

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
