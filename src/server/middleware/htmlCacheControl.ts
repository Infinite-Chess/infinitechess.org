// src/server/middleware/htmlCacheControl.ts

/**
 * Makes every SSR HTML render carry `Cache-Control: no-cache`, forcing the browser to
 * revalidate with the server before reuse (so pages are never served stale) while still
 * allowing bfcache, which restores JS state on back/forward. Wraps res.render once per
 * request, so all render call-sites inherit it.
 */

import type { NextFunction, Request, Response } from 'express';

function htmlCacheControl(_req: Request, res: Response, next: NextFunction): void {
	const originalRender = res.render.bind(res);
	res.render = (...args: Parameters<Response['render']>) => {
		res.setHeader('Cache-Control', 'no-cache');
		return originalRender(...args);
	};
	next();
}

export default htmlCacheControl;
