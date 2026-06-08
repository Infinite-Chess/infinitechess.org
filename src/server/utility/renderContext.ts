// src/server/utility/renderContext.ts

/**
 * Builds the render contexts (template locals) for SSR'd pages: the base context
 * every page extending layout.njk needs — language, translation helpers, and auth
 * state — plus the error page's, which adds the localized title and message.
 */

import type { Request } from 'express';
import type { ScriptTranslations } from '../../shared/types/script-translations.js';

import { getLanguageToServe } from './translate.js';
import {
	getScriptTranslations,
	getTemplateTranslations,
} from '../config/componentTranslationLoader.js';

/** Returns the locals every SSR'd page template requires to render. */
export function getBaseRenderContext(req: Request): {
	lang: string;
	templateT: (component: string) => Record<string, any>;
	scriptT: <C extends keyof ScriptTranslations>(component: C) => ScriptTranslations[C];
	memberInfo: Request['memberInfo'];
} {
	const lang = getLanguageToServe(req);
	return {
		lang,
		templateT: (component: string) => getTemplateTranslations(component, lang),
		scriptT: <C extends keyof ScriptTranslations>(component: C) =>
			getScriptTranslations(component, lang),
		// Fallback to signed out state if memberInfo was forgotten to be set (or a crash happened before it was set)
		memberInfo: req.memberInfo ?? { signedIn: false },
	};
}

/** Returns the locals error.njk needs to render the page for `status`. */
export function getErrorPageContext(
	req: Request,
	status: number,
): ReturnType<typeof getBaseRenderContext> & { code: number; title: string; message: string } {
	const base = getBaseRenderContext(req);
	const t = getTemplateTranslations('error', base.lang);
	// Fall back to the 500 copy for any code without its own table in the TOML.
	const entry = t[status] ?? t[500];
	return {
		...base,
		code: status,
		title: entry.title,
		message: entry.message,
	};
}
