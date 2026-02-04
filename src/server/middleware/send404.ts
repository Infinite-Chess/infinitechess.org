// src/server/middleware/send404.ts

import type { Request, Response } from 'express';

import path from 'path';
import { fileURLToPath } from 'node:url';

import { getLanguageToServe, getTranslationForReq } from '../utility/translate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function send404(req: Request, res: Response): void {
	res.status(404);
	if (req.accepts('html')) {
		res.sendFile(
			path.join(
				__dirname,
				'../../../dist/client/views',
				getLanguageToServe(req),
				'errors/404.html',
			),
		);
	} else if (req.accepts('json')) {
		res.json({ error: getTranslationForReq('server.javascript.ws-not_found', req) });
	} else {
		res.type('txt').send(getTranslationForReq('server.javascript.ws-not_found', req));
	}
}

export default send404;
