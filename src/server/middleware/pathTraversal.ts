// src/server/middleware/pathTraversal.ts

import type { Request, Response, NextFunction } from 'express';

/**
 * Path Traversal Protection, and error protection from malformed URLs.
 * Blocks requests whose URL tries to escape the intended directory (e.g. encoded `..` sequences).
 * @param req - The request object
 * @param res - The response object
 * @param next - The function to call, when finished, to continue the middleware waterfall.
 */
const pathTraversal = (req: Request, res: Response, next: NextFunction): void => {
	try {
		const decoded = decodeURIComponent(req.url);

		// Check 1: Raw encoded patterns (before decoding)
		const encodedPatterns = /(%2e%2e|%252e|%%32%65)/gi;
		if (encodedPatterns.test(req.url)) {
			// console.warn('Blocked traversal:', req.url);
			// console.warn('Decoded URL:', decoded);
			res.status(403).send('Forbidden');
			return;
		}

		// Check 2: Decoded path segments
		const segments = decoded.split(/[\\/]/);
		if (segments.includes('..')) {
			// Console warn both the decoded and the original URL
			// console.warn('Blocked traversal:', req.url);
			// console.warn('Decoded URL:', decoded);
			res.status(403).send('Forbidden');
			return;
		}

		next();
	} catch (_err) {
		// console.warn('Blocked invalid URL encoding:', req.url);
		res.status(400).send('Invalid URL encoding');
	}
};

export default pathTraversal;
