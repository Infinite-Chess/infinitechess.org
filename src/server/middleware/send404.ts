// src/server/middleware/send404.ts

/**
 * Sends the 404 response: the localized SSR error page for
 * browser navigations, JSON or plain text for everyone else.
 */

import type { Request, Response } from 'express';

import respondError from './respondError.js';
import renderErrorPage from './renderErrorPage.js';

function send404(req: Request, res: Response): void {
	res.status(404);
	respondError.send(req, res, req.t.responses.errors.not_found, () =>
		renderErrorPage.render(req, res, 404),
	);
}

export default send404;
