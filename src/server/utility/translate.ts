// src/server/utility/translate.ts

/**
 * Retrieves the translation for the code and language specified.
 */

import type { Request } from 'express';

import i18next from 'i18next';

// Constnats -----------------------------------------------------------------

const DEFAULT_LANGUAGE = 'en-US';

// Functions -----------------------------------------------------------------

/**
 * Determines the language to be used for serving an HTML file to a request.
 * The language is determined in the following order of precedence:
 * 1. The 'lng' query parameter, which can be different than the others.
 * 2. The 'i18next' cookie, which can also be different than the others.
 * 3. The value of req.i18n.resolvedLanguage (typical of users' first-connection to the site),
 * which is ALWAYS defined! This is determined by several different factors,
 * but i18next also takes into account the 'Accept-Language' header for this property.
 * 4. A default language, if none of the above are supported.
 *
 * The selected language is validated against supported languages,
 * using a default language if none are supported.
 * @param req - The Express request object.
 * @returns The language to be used.
 */
function getLanguageToServe(req: Request): string {
	const cookies = req.cookies;

	const supportedLngs = i18next.options.supportedLngs;
	if (!(supportedLngs instanceof Array)) {
		throw new Error('i18next.options.supportedLngs was not set');
	}

	let language = req.query['lng'] || cookies.i18next || req.i18n.resolvedLanguage;
	if (!supportedLngs.includes(language)) language = cookies.i18next; // Query param language not supported
	if (!supportedLngs.includes(language)) language = req.i18n.resolvedLanguage; // Cookie language not supported
	if (!supportedLngs.includes(language)) language = DEFAULT_LANGUAGE; // Resolved language from i18next not supported
	return language;
}

/**
 * Retrieves the translation for a given key and language.
 * @param key - The translation key to look up. For example, `"play.javascript.termination.checkmate"`
 * @param language - The language code for the translation. Default: `"en-US"`
 * @returns The translated string.
 */
function getTranslation(key: string, language: string = DEFAULT_LANGUAGE): string {
	const options = { lng: language };
	return i18next.t(key, options);
}

/**
 * Retrieves the translation for a given key and req. It reads the req's cookies for its preferred language.
 * @param key - The translation key to look up. For example, `"play.javascript.termination.checkmate"`
 * @param req - The request object
 * @returns The translated string.
 */
function getTranslationForReq(key: string, req: Request): string {
	const language = getLanguageToServe(req);
	return getTranslation(key, language);
}

// Exports -------------------------------------------------------------------

export { DEFAULT_LANGUAGE, getLanguageToServe, getTranslation, getTranslationForReq };
