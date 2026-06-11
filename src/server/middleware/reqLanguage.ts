// src/server/middleware/reqLanguage.ts

/**
 * Installs the request-bound resolved language `req.lang`.
 *
 * Like `req.t`, it's a lazy getter on the Express request prototype rather than a
 * middleware-set property, so it's available everywhere — including code that runs before
 * the main pipeline (e.g. the rate limiter, or the error handler rendering a localized
 * 429/500 page) — with no ordering concerns. On first access it resolves the language
 * and caches the result on the request instance for the remainder of the request.
 *
 * Precedence: the language-override cookie (if it names a supported language) → the
 * Accept-Language header (best supported match, with base-language fallback) → the default.
 */

import type { IncomingMessage } from 'http';
import type { Express, Request } from 'express';

import accepts from 'accepts';
import { parse as parseCookie } from 'cookie';

import tconfig from '../config/translationconfig.js';
import { getSupportedLanguages } from '../config/componentTranslationLoader.js';

/** The cookie storing the user's manual language override. */
const LANGUAGE_COOKIE = 'lang';

/**
 * Supported full tags ("en-US") plus their base tags ("en"), offered
 * to the Accept-Language negotiator so a region variant ("de-AT")
 * still matches via its base. Built by initLanguageResolution.
 */
let offers: string[] = [];
/**
 * Maps a base tag back to our preferred regional variant
 * ("de" → "de-DE"). Built by initLanguageResolution.
 */
let baseToRegional = new Map<string, string>();

/**
 * Precomputes the Accept-Language negotiation structures from the supported-language set.
 * Call once, after the translations have loaded.
 */
export function initLanguageResolution(): void {
	baseToRegional = new Map();
	// Sort so the variant chosen per base is deterministic (not dependent on component
	// load order) — e.g. for base "zh", "zh-CN" is picked over "zh-TW".
	for (const tag of [...getSupportedLanguages()].sort()) {
		const base = tag.split('-')[0]!;
		if (!baseToRegional.has(base)) baseToRegional.set(base, tag); // first (sorted) variant per base
	}
	// Full tags first, then base tags: offers are ordered most- to least-specific so the
	// negotiator favors an explicit regional match over a base fallback on a quality tie.
	offers = [...new Set([...getSupportedLanguages(), ...baseToRegional.keys()])];
}

/**
 * Calculates the best language to serve a request — from the override
 * cookie (if supported), else the Accept-Language header, else the default.
 */
export function resolveLanguageForRequest(req: IncomingMessage): string {
	// parse the cookie header manually (req.cookies isn't set for upgrade requests)
	const override = parseCookie(req.headers.cookie ?? '')[LANGUAGE_COOKIE];
	// The cookie is JavaScript-accessible, so don't trust it, make sure it's supported.
	if (typeof override === 'string' && getSupportedLanguages().includes(override)) return override;

	// Identical to Express's req.acceptsLanguages, but supports websocket upgrade requests.
	const best: string | false = offers.length ? accepts(req).languages(offers) : false;
	return (best && (baseToRegional.get(best) ?? best)) || tconfig.DEFAULT_LANGUAGE;
}

/**
 * Defines the lazy `req.lang` getter on the Express request prototype. Call once at app setup.
 * @param app - The express application instance.
 */
export function installReqLanguage(app: Express): void {
	Object.defineProperty(app.request, 'lang', {
		configurable: true,
		get(this: Request): string {
			const lang = resolveLanguageForRequest(this);
			// Cache on the instance: an own property shadows this prototype getter,
			// so subsequent reads on the same request skip resolution entirely.
			Object.defineProperty(this, 'lang', { value: lang, configurable: true });
			return lang;
		},
	});
}
