// src/types/globals.d.ts

import type { MemberInfo } from '../server/types';
import type { TranslationsObject } from './translations';

/**
 * Client-side translations subset.
 * Nunjucks templates spread nested translation objects into the global translations namespace.
 * For example, `...t('play.javascript', {returnObjects: true})` spreads all properties
 * from `play.javascript` directly into the global translations object.
 */
type ClientTranslations = TranslationsObject['index']['javascript'] &
	TranslationsObject['play']['javascript'] &
	TranslationsObject['play']['play-menu'] &
	TranslationsObject['member']['javascript'] &
	TranslationsObject['login']['javascript'] &
	TranslationsObject['leaderboard']['javascript'] &
	TranslationsObject['create-account']['javascript'] &
	TranslationsObject['reset-password']['javascript'] &
	TranslationsObject['password-validation'];

declare global {
	/**
	 * Global translations object injected by Nunjucks templates.
	 * Contains flattened translation properties from various sections.
	 * The actual shape varies by page, but this represents the union of all possible translations.
	 */
	const translations: ClientTranslations;

	/**
	 * Client-side translation strings for the current language, injected by the server.
	 * Keyed by component name (e.g. "header"). Each entry contains the [client] sub-table
	 * of that component's TOML, with keys promoted one level up.
	 * For typed access, cast to the generated interface from src/client/types/translations/<component>.ts.
	 * @example
	 * import type { HeaderClientT } from '../../types/translations/header.js';
	 * const t = window.__t?.header as HeaderClientT;
	 */
	var __t: Record<string, Record<string, string>>;

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

	// Our Custom Events
	interface DocumentEventMap {
		ping: CustomEvent<number>;
		'socket-closed': CustomEvent<void>;
		'premoves-toggle': CustomEvent<boolean>;
		'lingering-annotations-toggle': CustomEvent<boolean>;
		'starfield-toggle': CustomEvent<boolean>;
		'master-volume-change': CustomEvent<number>;
		'ambience-toggle': CustomEvent<boolean>;
		'ray-count-change': CustomEvent<number>;
		canvas_resize: CustomEvent<{ width: number; height: number }>;
	}

	// Add an optional 'memberInfo' to the global Express Request interface
	namespace Express {
		export interface Request {
			memberInfo?: MemberInfo;
		}
	}
}
