// src/server/middleware/noStoreRenderedHtml.ts

import type { NextFunction, Request, Response } from 'express';

/**
 * Ensures every SSR HTML render carries a no-store policy.
 * This wraps Express's res.render once per request, so all render call-sites inherit it.
 */
function noStoreRenderedHtml(_req: Request, res: Response, next: NextFunction): void {
	const originalRender = res.render.bind(res);
	res.render = (...args: Parameters<Response['render']>) => {
		res.setHeader('Cache-Control', 'no-store');
		return originalRender(...args);
	};
	next();
}

export default noStoreRenderedHtml;
