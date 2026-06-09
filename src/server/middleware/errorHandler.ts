// src/server/middleware/errorHandler.ts

import type { Request, Response } from 'express';

import { logEventsAndPrint } from './logEvents.js';
import { getErrorPageContext } from '../utility/renderContext.js';
import { getTranslationForReq } from '../utility/translate.js';

/**
 * Express error handler. Reached by uncaught server errors (statusless or 5xx) and by errors that
 * carry an HTTP status — in practice only the body parsers (express.json / express.urlencoded),
 * which throw 400 / 413 / 415.
 */
function errorHandler(err: Error, req: Request, res: Response, _next: Function): void {
	const status = 'status' in err && typeof err.status === 'number' ? err.status : 500;

	// 4xx are the client's fault (e.g. a malformed or too-large body), not ours, so keep them out of
	// the server error log. Everything else (5xx, or a statusless uncaught error) gets logged.
	const isClientError = status !== undefined && status >= 400 && status < 500;
	if (!isClientError) logEventsAndPrint(`Caught in errorHandler: ${err.stack}`, 'errLog.txt');

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
		if (req.accepts('html')) {
			// Render the styled error page, content-negotiated.
			const context = getErrorPageContext(req, status);
			res.status(context.code).render(
				'error.njk',
				context,
				// Handle render errors manually instead of next(err), which would re-enter this
				// handler and could loop.
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
						res.send(getTranslationForReq('server.javascript.ws-server_error', req));
					}
				},
			);
		} else {
			// Non-HTML (API) client. Echo the error's own message
			// only when it is explicitly marked safe to expose.
			const message =
				'expose' in err && err.expose === true
					? err.message
					: getTranslationForReq('server.javascript.ws-server_error', req);
			res.status(status);
			if (req.accepts('json')) res.json({ message });
			else res.send(message);
		}
	} catch (error: unknown) {
		// Last line of defense
		const detail = error instanceof Error ? error.stack : String(error);
		logEventsAndPrint(`Critical error in errorHandler middleware: ${detail}`, 'errLog.txt');
		res.status(500).send('Critical server error.');
	}
}

export default errorHandler;
