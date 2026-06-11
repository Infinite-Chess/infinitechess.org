// src/server/middleware/reqTranslations.ts

/**
 * Installs the request-bound translations `req.t` — a per-request, fully-typed
 * accessor mirroring the client-side global `t`: `req.t.responses.auth.invalid_token`.
 *
 * Implemented as a lazy getter on the Express request prototype rather than a
 * middleware-set property, so it is available everywhere — including middleware
 * that runs before `resolveLanguage` (e.g. the rate limiter) — without any
 * pipeline-ordering concerns. The language is resolved on first access via the
 * same `getLanguageToServe` fallback `req.lang` itself uses, then the result is
 * cached on the request instance for the remainder of the request.
 */

import type { Express, Request } from 'express';
import type { ScriptTranslations } from '../../shared/types/script-translations.js';

import { getLanguageToServe } from './resolveLanguage.js';
import { getScriptTranslations } from '../config/componentTranslationLoader.js';

/**
 * Builds a translations accessor for a resolved language: a Proxy that resolves each
 * component's script-facing strings lazily, so only the components actually read are
 * looked up. Shared by `req.t` (here) and `ws.t` (see openSocket.ts).
 */
export function buildTranslations(lang: string): ScriptTranslations {
	return new Proxy({} as ScriptTranslations, {
		get(_target, component): unknown {
			if (typeof component !== 'string') return undefined; // ignore symbol access (inspect, etc.)
			return getScriptTranslations(component as keyof ScriptTranslations, lang);
		},
	});
}

/**
 * Defines the lazy `req.t` getter on the Express request prototype. Call once at app setup.
 * @param app - The express application instance.
 */
export function installReqTranslations(app: Express): void {
	Object.defineProperty(app.request, 't', {
		configurable: true,
		get(this: Request): ScriptTranslations {
			const translations = buildTranslations(getLanguageToServe(this));
			// Cache on the instance: an own property shadows this prototype getter,
			// so subsequent reads on the same request skip resolution entirely.
			Object.defineProperty(this, 't', { value: translations, configurable: true });
			return translations;
		},
	});
}
