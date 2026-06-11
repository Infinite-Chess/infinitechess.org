// src/server/config/i18n.ts

import i18next from 'i18next';

import translationLoader from './translationLoader.js';
import { loadComponentTranslations } from './componentTranslationLoader.js';

/**
 * Initializes i18next for the server process, loading languages from .toml files.
 * @returns The list of supported languages (those with at least one component translation).
 */
function initTranslations(): string[] {
	// Load OLD translations
	const translations = translationLoader.loadTranslations();
	const supportedLngs = Object.keys(translations);

	i18next.init({
		resources: translations,
		supportedLngs,
		defaultNS: 'default',
		// fallbackLng: DEFAULT_LANGUAGE, // Fallback is handled by deepMerge() in translationLoader
		// debug: true, // Enable debug mode to see logs for missing keys and other details
	});

	// Load NEW translations
	return loadComponentTranslations();
}

export { initTranslations };
