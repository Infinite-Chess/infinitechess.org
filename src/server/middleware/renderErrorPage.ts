// src/server/middleware/renderErrorPage.ts

import type { Request, Response } from 'express';

import { resolveAuth } from './resolveAuth.js';
import { logEventsAndPrint } from './logEvents.js';
import { getErrorPageContext } from '../utility/renderContext.js';

/**
 * Renders the styled SSR error page for `status`. Only call once HTML is wanted — it always renders.
 *
 * resolveAuth runs first (the header needs auth state); it's idempotent, so it covers errors that
 * reached here without passing a page route. Render errors are caught here rather than thrown, so a
 * failure can't loop back into the error handler.
 */
function renderErrorPage(req: Request, res: Response, status: number): void {
	resolveAuth(req, res, () => {
		const context = getErrorPageContext(req, status);
		res.status(context.code).render(
			'error.njk',
			context,
			(renderErr: Error | null, html: string) => {
				if (!renderErr) {
					// No error, good to send the rendered page
					res.send(html);
				} else {
					// Log the rendering error and return the plain message
					logEventsAndPrint(
						`Critical error rendering ${context.code} page: ${renderErr.stack}`,
						'errLog.txt',
					);
					res.send(req.t.responses.errors.server_error);
				}
			},
		);
	});
}

export { renderErrorPage };
