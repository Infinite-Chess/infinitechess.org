// src/server/utility/translate.ts

/**
 * Retrieves the translation for the code and language specified.
 */

import type { Request } from 'express';
import type { TranslationKeys } from '../../types/translations.js';

import i18next from 'i18next';

import tconfig from '../config/translationconfig.js';
import { resolveLanguageForRequest } from '../middleware/resolveLanguage.js';

// Functions -----------------------------------------------------------------

/**
 * Guarantees a language to serve for a request. Backup to `req.lang`
 * if you're not confident that that will be defined from the resolveLanguage
 * middleware by the point you need the language. For example if the
 * user is rate limited and we need to render the 429 error page.
 * @param req - The Express request object.
 * @returns The language code to serve.
 */
function getLanguageToServe(req: Request): string {
	return req.lang ?? resolveLanguageForRequest(req);
}

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

/**
 * Retrieves the translation for a given key and req. It reads the req's cookies for its preferred language.
 * @param key - The translation key to look up. For example, `"play.javascript.termination.checkmate"`
 * @param req - The request object
 * @returns The translated string.
 */
function getTranslationForReq(key: TranslationKeys, req: Request): string {
	const language = getLanguageToServe(req);
	return getTranslation(key, language);
}

// Exports -------------------------------------------------------------------

export { getLanguageToServe, getTranslation, getTranslationForReq };
