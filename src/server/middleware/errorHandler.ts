// src/server/middleware/errorHandler.ts

import type { Request, Response } from 'express';

import { logEventsAndPrint } from './logEvents.js';
import { getErrorPageContext } from '../utility/renderContext.js';
import { getTranslationForReq } from '../utility/translate.js';

function errorHandler(err: Error, req: Request, res: Response, _next: Function): void {
	// Catches errors from for example the body parser, which can throw if the body is too large.
	// This needs to be handled itself, as i18next was never defined.
	if ('status' in err && typeof err.status === 'number') {
		if (err.status >= 400 && err.status < 500) {
			// Only echo the error's own message back to the client when it is explicitly
			// marked safe to expose (http-errors sets `expose` for e.g. body-parser errors).
			// NEVER leak arbitrary internal messages — they can contain absolute file paths.
			const message = 'expose' in err && err.expose === true ? err.message : 'Bad request';

			res.status(err.status).json({ message });
			return;
		}
	}

	// Any other error bubbling here is likely a server uncaught error (500)

	try {
		const errMessage = `${err.stack}`;
		logEventsAndPrint(errMessage, 'errLog.txt');

		// This sends back to the browser the error, instead of the ENTIRE stack which is PRIVATE.
		const messageForClient = getTranslationForReq('server.javascript.ws-server_error', req);

		if (req.accepts('html')) {
			res.status(500).render(
				'error.njk',
				getErrorPageContext(req, 500), // The error page includes the header which needs auth state.
				// Handle potential errors manually instead of letting them next(err), triggering this handler again and an infinite loop.
				(renderErr: Error | null, html: string) => {
					if (!renderErr) {
						// No error, good to send the rendered page
						res.status(500).send(html);
					} else {
						// Log the rendering error and return the plain message
						console.error('Critical error rendering 500 page:', renderErr);
						res.status(500).send(messageForClient);
					}
				},
			);
		} else if (req.accepts('json')) {
			res.status(500).json({ message: messageForClient });
		} else {
			res.status(500).send(messageForClient);
		}
	} catch (error: unknown) {
		// Last line of defense
		const detail = error instanceof Error ? error.stack : String(error);
		console.error('Critical error in errorHandler middleware:', detail);
		res.status(500).send('Critical server error.');
	}
}

export default errorHandler;
