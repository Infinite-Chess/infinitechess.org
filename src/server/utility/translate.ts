// src/server/utility/translate.ts

/**
 * Retrieves the translation for the code and language specified.
 */

import type { TranslationKeys } from '../../types/translations.js';

import i18next from 'i18next';

import tconfig from '../config/translationconfig.js';

// Functions -----------------------------------------------------------------

/**
 * Retrieves the translation for a given key and language.
 * @param key - The translation key to look up. For example, `"play.javascript.termination.checkmate"`
 * @param language - The language code for the translation. Default: `"en-US"`
 * @param options - Additional i18next options (e.g., returnObjects for array translations)
 * @returns The translated string or object.
 */
function getTranslation(key: TranslationKeys, language: string = tconfig.DEFAULT_LANGUAGE): string {
	const options = { lng: language };
	return i18next.t(key, options);
}

// Exports -------------------------------------------------------------------

export { getTranslation };
