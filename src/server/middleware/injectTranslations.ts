// src/server/middleware/injectTranslations.ts

/**
 * Injects shared component translation objects into res.locals.t so that every
 * Nunjucks template has access to them without any per-route boilerplate.
 *
 * Sets on res.locals for every HTML response:
 *   t.header       — HeaderTranslations (server-side keys, for Nunjucks templates)
 *   t.footer       — FooterTranslations (server-side keys, for Nunjucks templates)
 *   tClient.header — HeaderClientT ([client] sub-table, emitted as window.__t for browser JS)
 *
 * Route handlers that need page-specific strings extend t with a `page` key:
 *   res.render('index.njk', { t: { ...res.locals.t, page: getComponentTranslation('index', lang) } })
 */

import type { Request, Response, NextFunction } from 'express';

import { getLanguageToServe } from '../utility/translate.js';
import {
	getComponentTranslation,
	getClientTranslation,
} from '../config/componentTranslationLoader.js';

/** Components that are present on every rendered page and always injected. */
const SHARED_COMPONENTS = ['header', 'footer'] as const;

export function injectTranslations(req: Request, res: Response, next: NextFunction): void {
	// Only inject for HTML page requests, not API/asset requests.
	// Also skip if the Accept header doesn't include text/html (API calls from tests etc.)
	const acceptsHtml = req.headers['accept']?.includes('text/html') ?? false;
	if (!acceptsHtml) {
		next();
		return;
	}

	const lang = getLanguageToServe(req);

	const t: Record<string, Record<string, any>> = {};
	const tClient: Record<string, Record<string, any>> = {};
	for (const component of SHARED_COMPONENTS) {
		try {
			t[component] = getComponentTranslation(component, lang);
			tClient[component] = getClientTranslation(component, lang);
		} catch {
			// Component not yet created — leave both keys absent rather than crashing
		}
	}

	res.locals['t'] = t;
	res.locals['tClient'] = tClient;
	next();
}
