// src/server/middleware/send404.ts

import type { Request, Response } from 'express';

import { getErrorPageContext } from '../utility/renderContext.js';
import { getScriptTranslationsForReq } from '../config/componentTranslationLoader.js';

function send404(req: Request, res: Response): void {
	res.status(404);
	if (req.accepts('html')) {
		res.render('error.njk', getErrorPageContext(req, 404));
	} else if (req.accepts('json')) {
		res.json({ message: getScriptTranslationsForReq('responses', req).errors.not_found });
	} else {
		res.type('txt').send(getScriptTranslationsForReq('responses', req).errors.not_found);
	}
}

export default send404;
