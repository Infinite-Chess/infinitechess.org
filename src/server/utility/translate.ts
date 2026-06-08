// src/server/utility/translate.ts

/**
 * Retrieves the translation for the code and language specified.
 */

import type { Request } from 'express';
import type { TranslationKeys } from '../../types/translations.js';

import i18next from 'i18next';
import { parse as parseCookie } from 'cookie';

import tconfig from '../config/translationconfig.js';

// Functions -----------------------------------------------------------------

/**
 * Determines the language to be used for serving an HTML file to a request.
 * The language is determined in the following order of precedence:
 * 1. The 'lng' query parameter, which can be different than the others.
 * 2. The 'i18next' cookie, which can also be different than the others.
 * 3. The value of req.i18n.resolvedLanguage (typical of users' first-connection to the site).
 * This is determined by several different factors, but i18next also takes into account the
 * 'Accept-Language' header for this property.
 * 4. A default language, if none of the above are supported.
 *
 * The selected language is validated against supported languages,
 * using a default language if none are supported.
 *
 * Works even before the cookie-parser and i18next middleware have run (e.g. when called from the global rate limiter).
 * @param req - The Express request object.
 * @returns The language to be used.
 */
function getLanguageToServe(req: Request): string {
	// req.cookies is only populated by the cookie-parser middleware;
	// if it hasn't run, parse the raw Cookie header manually.
	const cookies = req.cookies ?? parseCookie(req.headers.cookie ?? '');

	const supportedLngs = i18next.options.supportedLngs;
	if (!(supportedLngs instanceof Array)) {
		throw new Error('i18next.options.supportedLngs was not set');
	}

	let language: string | undefined = cookies['i18next'];
	// req.i18n is set by the i18next middleware, which likewise may not have run yet.
	// AFTER the target end state of TRANSLATION_SYSTEM.md, the resolved language needs
	// to be GUARANTEED, then coming from our own accept-language header parsing middleware.
	if (!language || !supportedLngs.includes(language)) language = req.i18n?.resolvedLanguage; // Cookie language not supported
	if (!language || !supportedLngs.includes(language)) language = tconfig.DEFAULT_LANGUAGE; // Resolved language not supported
	return language;
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
