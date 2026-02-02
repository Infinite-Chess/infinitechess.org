// src/server/config/i18n.ts

import i18next from 'i18next';
import { LanguageDetector } from 'i18next-http-middleware';

import translationLoader from './translationLoader.js';
import { DEFAULT_LANGUAGE } from '../utility/translate.js';

/** Initializes i18next for the server process, loading languages from .toml files. */
function initTranslations(): void {
	const translations = translationLoader.loadTranslations();
	const supportedLngs = Object.keys(translations);

	i18next.use(LanguageDetector).init({
		resources: translations,
		supportedLngs,
		defaultNS: 'default',
		fallbackLng: DEFAULT_LANGUAGE,
		// debug: true, // Enable debug mode to see logs for missing keys and other details
	});
}

export { initTranslations };
