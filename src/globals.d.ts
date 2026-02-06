// src/globals.d.ts

import type { MemberInfo } from './server/types';
import type { TranslationsObject } from './types/translations';

/**
 * Client-side translations subset.
 * EJS templates use spread operators to flatten nested translation objects.
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
	 * Global translations object injected by EJS templates.
	 * Contains flattened translation properties from various sections.
	 * The actual shape varies by page, but this represents the union of all possible translations.
	 */
	const translations: ClientTranslations;

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
