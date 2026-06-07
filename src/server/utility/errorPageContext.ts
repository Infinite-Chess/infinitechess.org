// src/server/utility/errorPageContext.ts

/**
 * Builds the render context for the shared error page (error.njk),
 * mapping an HTTP status code to the human-readable copy shown on it.
 * Single source of truth for every error page's title and message.
 */

import type { Request } from 'express';

import { getBaseRenderContext } from './baseRenderContext.js';

/** Human-readable copy for each supported error page, keyed by HTTP status code. */
const ERROR_COPY: Record<number, { title: string; message: string }> = {
	404: { title: 'Page Not Found', message: "We couldn't find the page you were looking for." },
	500: { title: 'Server Error', message: 'Something went wrong on our end. Please try again.' },
	// Can add more as needed:
	// 400: { title: 'Bad Request', message: "Something about that request wasn't quite right." },
	// 401: { title: 'Unauthorized', message: 'You need to be signed in to view this page.' },
	// 409: { title: 'Conflict', message: 'That request conflicts with the current state of things.' },
};

/** Returns the locals error.njk needs to render the page for `status`. */
export function getErrorPageContext(
	req: Request,
	status: number,
): ReturnType<typeof getBaseRenderContext> & { code: number; title: string; message: string } {
	const copy = ERROR_COPY[status] ?? ERROR_COPY[500]!;
	return {
		...getBaseRenderContext(req),
		code: status,
		title: copy.title,
		message: copy.message,
	};
}
