// src/server/middleware/resolveLanguage.ts

/**
 * Resolves the language to serve each request into req.lang.
 * Precedence: the language-override cookie (if it names a supported language) → the
 * Accept-Language header (best supported match, with base-language fallback) → the default.
 */

import type { Request, Response, NextFunction } from 'express';

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
	for (const tag of getSupportedLanguages()) {
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
function resolveLanguageForRequest(req: Request): string {
	// req.cookies is only populated by the cookie parser; if that hasn't run, parse the header.
	// This can occasionally be called from the rateLimit middleware to render a 429 error page.
	const cookies = req.cookies ?? parseCookie(req.headers.cookie ?? '');
	const override = cookies[LANGUAGE_COOKIE];
	// The cookie is JavaScript-accessible, so don't trust it, make sure it's supported.
	if (typeof override === 'string' && getSupportedLanguages().includes(override)) return override;

	const best: string | false = offers.length ? req.acceptsLanguages(...offers) : false;
	return (best && (baseToRegional.get(best) ?? best)) || tconfig.DEFAULT_LANGUAGE;
}

/** Resolves and caches req.lang for the request, then continues. */
export function resolveLanguage(req: Request, res: Response, next: NextFunction): void {
	req.lang = resolveLanguageForRequest(req);
	// Make sure the cookie's former name is cleared.
	if (req.cookies['i18next'] !== undefined) res.clearCookie('i18next');
	next();
}

/**
 * Guarantees a language to serve for a request. Backup for `req.lang`
 * if you're not confident that that will be defined from this middleware
 * by the point you need the language. For example if the user
 * is rate limited and we need to render the 429 error page.
 * @returns The language code to serve.
 */
export function getLanguageToServe(req: Request): string {
	return req.lang ?? resolveLanguageForRequest(req);
}
