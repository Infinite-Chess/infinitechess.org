// src/server/middleware/send404.ts

import type { Request, Response } from 'express';

import { getErrorPageContext } from '../utility/renderContext.js';
import { getTranslationForReq } from '../utility/translate.js';

function send404(req: Request, res: Response): void {
	res.status(404);
	if (req.accepts('html')) {
		res.render('error.njk', getErrorPageContext(req, 404));
	} else if (req.accepts('json')) {
		res.json({ message: getTranslationForReq('server.javascript.ws-not_found', req) });
	} else {
		res.type('txt').send(getTranslationForReq('server.javascript.ws-not_found', req));
	}
}

export default send404;
