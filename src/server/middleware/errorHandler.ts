// src/server/middleware/errorHandler.ts

import type { Request, Response } from 'express';

import { logEventsAndPrint } from './logEvents.js';
import { getTranslationForReq } from '../utility/translate.js';

function errorHandler(err: Error, req: Request, res: Response, _next: Function): void {
	// Catches errors from for example the body parser, which can throw if the body is too large.
	// This needs to be handled itself, as i18next was never defined.
	if ('status' in err) {
		const status = (err as Error & { status: number }).status;
		if (status >= 400 && status < 500) {
			res.status(status).json({ error: err.message || 'Bad request' });
			return;
		}
	}

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
		const errMessage = `Error caught by the express error-handling middleware (${req.method} ${req.originalUrl}):\n${err.stack}`;
		logEventsAndPrint(errMessage, 'errLog.txt');

		// This sends back to the browser the error, instead of the ENTIRE stack which is PRIVATE.
		const messageForClient = getTranslationForReq('server.javascript.ws-server_error', req);
		res.status(500).send(messageForClient); // 500: Server error
	} catch (error: unknown) {
		// Last line of defense if an error occurs in the middleware error catcher
		const errMessage = error instanceof Error ? error.stack : String(error);
		console.error('Critical error in errorHandler middleware:', errMessage);
		res.status(500).send('Critical server error.');
	}
}

export default errorHandler;
