// src/server/api/analysisReportAPI.ts

/**
 * API endpoint the analysis page reports when its engine displayed which positions, for
 * engine-assistance detection. Validates the report at the trust boundary and hands it, with
 * who sent it, to `analysisMatcher.ts`.
 */

import type { Request, Response } from 'express';

import * as z from 'zod';

import gamelimits from '../../shared/chess/util/gamelimits.js';
import positionkey from '../../shared/chess/logic/positionkey.js';

import ip from '../utility/ip.js';
import zodLogger from '../utility/zodLogger.js';
import analysisMatcher from '../game/cheatdetection/analysisMatcher.js';

// Zod Schemas -----------------------------------------------------------------

/** Schema for validating the body of POST /api/analysis-report. */
const ReportBodySchema = z.strictObject({
	episodes: z
		.array(
			z
				.strictObject({
					key: z.string().regex(positionkey.PATTERN),
					fromAgeMs: z.int().min(0),
					toAgeMs: z.int().min(0),
				})
				.refine((s) => s.toAgeMs <= s.fromAgeMs, { error: 'A display ends after it begins.' }), // prettier-ignore
		)
		.min(1)
		.max(gamelimits.MAX_REPORTED_EPISODES),
});

// API Endpoints ---------------------------------------------------------------

/**
 * `POST /api/analysis-report` — positions the analysis page's engine displayed, and when.
 * Body: `{ episodes: [{ key, fromAgeMs, toAgeMs }] }` (`toAgeMs` 0: still displayed). Who
 * displayed them, the server derives.
 */
function post(req: Request, res: Response): void {
	const receivedAt = Date.now();
	const parseResult = ReportBodySchema.safeParse(req.body);
	if (!parseResult.success) {
		// Unlocalized: our client only ever sends a well-formed report.
		res.status(400).json({ message: 'The request was invalid.' });
		zodLogger.log(req.body, parseResult.error, 'Invalid analysis report body.');
		return;
	}
	const clientIP = ip.get(req);
	if (clientIP === undefined) {
		res.status(400).json({ message: 'Unable to identify IP address' });
		return;
	}

	try {
		analysisMatcher.report({ memberInfo: req.memberInfo!, ip: clientIP }, parseResult.data.episodes, receivedAt); // prettier-ignore
	} catch {
		res.sendStatus(500); // Already logged.
		return;
	}
	res.sendStatus(204);
}

// Exports ---------------------------------------------------------------------

export default { post };
