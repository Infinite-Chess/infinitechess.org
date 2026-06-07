// src/server/utility/baseRenderContext.ts

/**
 * Builds the base render context that layout.njk — and therefore every page that
 * extends it — needs: language, the translation helpers, and auth state.
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
