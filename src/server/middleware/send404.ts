// src/server/middleware/send404.ts

import type { Request, Response } from 'express';

import { getTranslationForReq } from '../utility/translate.js';
import { getBaseRenderContext } from '../utility/baseRenderContext.js';

function send404(req: Request, res: Response): void {
	res.status(404);
	if (req.accepts('html')) {
		res.render('errors/404.njk', getBaseRenderContext(req));
	} else if (req.accepts('json')) {
		res.json({ message: getTranslationForReq('server.javascript.ws-not_found', req) });
	} else {
		res.type('txt').send(getTranslationForReq('server.javascript.ws-not_found', req));
	}
}

export default send404;
