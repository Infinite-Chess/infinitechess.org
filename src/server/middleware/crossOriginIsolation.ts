// src/server/middleware/crossOriginIsolation.ts

import { NextFunction, Request, Response } from 'express';

/**
 * Marks a response cross-origin isolated (COOP + COEP), which is what unlocks
 * `SharedArrayBuffer` — required by the multi-threaded (Lazy SMP) analysis engine build.
 *
 * Applied ONLY to the analysis page, not site-wide: `require-corp` would block cross-origin
 * subresources that don't send CORP (Turnstile, YouTube embeds, the analytics beacon) on other
 * pages. The analysis page's engine assets (worker, wasm, rayon snippet workers) are all
 * same-origin, so they're allowed without extra CORP headers.
 */
function crossOriginIsolation(_req: Request, res: Response, next: NextFunction): void {
	res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
	res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
	next();
}

export default crossOriginIsolation;
