// src/server/config/i18n.ts

import i18next from 'i18next';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { LanguageDetector } from 'i18next-http-middleware';

import translationLoader from './translationLoader.js';
import { getDefaultLanguage } from '../utility/translate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Initializes i18next, loads languages from .toml files.
 * **Should be ran only once**.
 */
function initTranslations(): void {
	// The loader handles reading files, XSS sanitization, and setting supported languages
	const translations = translationLoader.loadTranslations();

	i18next.use(LanguageDetector).init({
		// debug: true,
		preload: Object.keys(translations), // List of languages to preload
		resources: translations,
		defaultNS: 'default',
		fallbackLng: getDefaultLanguage(),
	});
}

export { initTranslations };
