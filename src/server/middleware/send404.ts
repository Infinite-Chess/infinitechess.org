// src/server/middleware/send404.ts

import type { Request, Response } from 'express';

import { getErrorPageContext } from '../utility/renderContext.js';

function send404(req: Request, res: Response): void {
	res.status(404);
	if (req.accepts('html') && req.get('Sec-Fetch-Mode') === 'navigate') {
		// Request accepts html AND is likely a browser, not a bot.
		res.render('error.njk', getErrorPageContext(req, 404));
	} else if (req.accepts('json')) {
		res.json({ message: req.t.responses.errors.not_found });
	} else {
		res.type('txt').send(req.t.responses.errors.not_found);
	}
}

export default send404;
