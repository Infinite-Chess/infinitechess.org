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

	// If we ever get 'Data after `Connection: close`' errors again, we can enable a block like
	// the following. Otherwise, if after a few months after the website redesign 2.0 update we
	// see no more of these errors, we can delete this block.
	//
	// Node's HTTP parser tags malformed-request errors with an "HPE_" code (e.g. for a "Data after
	// `Connection: close`" parse error). These come from a misbehaving peer/proxy — typically a
	// keep-alive/connection-reuse race between Cloudflare and the origin (see server.ts, where we
	// raise keepAliveTimeout to reduce them) — not a server bug, so we drop them rather than pollute
	// errLog.txt, and reply 400 if the broken connection can still be written to.
	// if ('code' in err && typeof err.code === 'string' && err.code.startsWith('HPE_')) {
	// 	if (!res.headersSent) res.status(400).end();
	// 	return;
	// }

	try {
		const errMessage = `Caught in errorHandler: ${err.stack}`;
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
						logEventsAndPrint(
							`Critical error rendering 500 page: ${renderErr.stack}`,
							'errLog.txt',
						);
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
		logEventsAndPrint(`Critical error in errorHandler middleware: ${detail}`, 'errLog.txt');
		res.status(500).send('Critical server error.');
	}
}

export default errorHandler;
