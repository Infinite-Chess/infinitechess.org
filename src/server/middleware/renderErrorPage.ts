// src/server/middleware/renderErrorPage.ts

/**
 * Renders the styled SSR error page for `status`. Only call once HTML is wanted — it always renders.
 *
 * resolveAuth.resolve runs first (the header needs auth state); it's idempotent, so it covers errors that
 * reached here without passing a page route. Render errors are caught here rather than thrown, so a
 * failure can't loop back into the error handler.
 */

import type { Request, Response } from 'express';

import logEvents from '../utility/logEvents.js';
import resolveAuth from './resolveAuth.js';
import renderContext from '../utility/renderContext.js';

function render(req: Request, res: Response, status: number): void {
	resolveAuth.resolve(req, res, () => {
		const context = renderContext.getErrorPageContext(req, status);
		res.status(context.code).render(
			'error.njk',
			context,
			(renderErr: Error | null, html: string) => {
				if (!renderErr) {
					// No error, good to send the rendered page
					res.send(html);
				} else {
					// Log the rendering error and return the plain message
					logEvents.addAndPrint(
						`Critical error rendering ${context.code} page: ${renderErr.stack}`,
						'errLog',
					);
					res.type('txt').send(req.t.responses.errors.server_error);
				}
			},
		);
	});
}

// Exports ---------------------------------------------------------------------

export default { render };
