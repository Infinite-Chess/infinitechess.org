// src/server/config/i18n.ts

import i18next from 'i18next';
import { LanguageDetector } from 'i18next-http-middleware';

import translationLoader from './translationLoader.js';
import { DEFAULT_LANGUAGE } from '../utility/translate.js';

/** Initializes i18next for the server process, loading languages from .toml files. */
function initTranslations(): void {
	// The loader handles reading files, XSS sanitization, and setting supported languages
	const translations = translationLoader.loadTranslations();

	i18next.use(LanguageDetector).init({
		// debug: true,
		preload: Object.keys(translations), // List of languages to preload
		resources: translations,
		defaultNS: 'default',
		fallbackLng: DEFAULT_LANGUAGE,
	});
}

export { initTranslations };
