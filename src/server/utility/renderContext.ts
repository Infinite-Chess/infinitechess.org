// src/server/utility/renderContext.ts

/**
 * Builds the render contexts (template locals) for SSR'd pages: the base context
 * every page extending layout.njk needs — language, translation helpers, and auth
 * state — plus the error page's, which adds the localized title and message.
 */

import type { Request } from 'express';
import type { LanguageOption } from '../config/componentTranslationLoader.js';
import type { ScriptTranslations } from '../../shared/types/script-translations.js';

import { logEventsAndPrint } from '../middleware/logEvents.js';
import {
	getLanguageOptions,
	getScriptTranslations,
	getTemplateTranslations,
} from '../config/componentTranslationLoader.js';

/** The locals every SSR'd page template requires to render. */
type BaseRenderContext = {
	/** The resolved language to serve for the request. */
	lang: string;
	templateT: (component: string) => Record<string, any>;
	scriptT: <C extends keyof ScriptTranslations>(component: C) => ScriptTranslations[C];
	memberInfo: Request['memberInfo'];
	/** The supported languages (code + display names) for the header language dropdown. */
	languageOptions: LanguageOption[];
};

/** Returns the locals every SSR'd page template requires to render. */
export function getBaseRenderContext(req: Request): BaseRenderContext {
	return {
		lang: req.lang,
		templateT: (component: string) => getTemplateTranslations(component, req.lang),
		scriptT: <C extends keyof ScriptTranslations>(component: C) =>
			getScriptTranslations(component, req.lang),
		// Fallback to signed out state if memberInfo was forgotten to be set (or a crash happened before it was set)
		memberInfo: req.memberInfo ?? { signedIn: false },
		languageOptions: getLanguageOptions(),
	};
}

/**
 * Returns the locals error.njk needs to render the page for `status`.
 * @param retryAfter - Seconds until a rate-limited client may retry. Only passed for 429s; when set,
 * the page renders its "Back to home" button disabled until this many seconds have elapsed.
 */
export function getErrorPageContext(
	req: Request,
	status: number,
	retryAfter?: number,
): BaseRenderContext & {
	code: number;
	title: string;
	message: string;
	retryAfter?: number;
} {
	const base = getBaseRenderContext(req);
	const t = getTemplateTranslations('error', base.lang);
	// Only codes with their own table in the TOML get their
	// own page; any other code falls back to the 500 page.
	let code = status;
	if (t[status] === undefined) {
		logEventsAndPrint(
			`No error page copy exists for status ${status}; falling back to the 500 page. Add a [${status}] table to error TOML.`,
			'errLog.txt',
		);
		code = 500;
	}
	const entry = t[code];
	return {
		...base,
		code,
		title: entry.title,
		message: entry.message,
		retryAfter,
	};
}
