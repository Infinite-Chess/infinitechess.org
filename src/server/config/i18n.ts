// src/server/config/i18n.ts

import i18next from 'i18next';
import middleware from 'i18next-http-middleware'; // THERE IS NO DEFAULT EXPORT??
import path from 'path';
import { fileURLToPath } from 'node:url';
import { loadTranslations } from './translationLoader.js';
import { getDefaultLanguage } from '../utility/translate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve path to the translation folder (Root > translation)
// Going up from: src/server/config/ -> src/server/ -> src/ -> Root
const translationsFolder = path.join(__dirname, '../../../translation');

/**
 * Initializes i18next, loads languages from .toml files.
 * **Should be ran only once**.
 */
function initTranslations(): void {
	// The loader handles reading files, XSS sanitization, and setting supported languages
	const translations = loadTranslations(translationsFolder);

	i18next.use(middleware.LanguageDetector).init({
		// debug: true,
		preload: Object.keys(translations), // List of languages to preload
		resources: translations,
		defaultNS: 'default',
		fallbackLng: getDefaultLanguage(),
	});
}

export { initTranslations };
