// src/server/utility/errorPageContext.ts

/**
 * Builds the render context for the shared error page (error.njk).
 */

import type { Request } from 'express';

import { getBaseRenderContext } from './baseRenderContext.js';
import { getTemplateTranslations } from '../config/componentTranslationLoader.js';

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
