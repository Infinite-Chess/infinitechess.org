// src/server/api/chatReportAPI.ts

/**
 * API endpoint for reporting a game's chat.
 *
 * Turning the report into words is `chatReport.ts`'s job; this decodes the id,
 * runs the two checks at the trust boundary, and answers.
 */

import type { Request, Response } from 'express';

import * as z from 'zod';

import zodLogger from '../utility/zodLogger.js';
import chatReport from '../game/gamemanager/chatReport.js';
import gameManager from '../game/gamemanager/gameManager.js';
import gamesManager from '../database/gamesManager.js';
import chatEntriesManager from '../database/chatEntriesManager.js';

// Zod Schemas -----------------------------------------------------------------

/** Schema for validating the body of POST /api/game/:id/chat-report. */
const ReportBodySchema = z.strictObject({
	reason: z.enum(chatReport.REPORT_REASONS.map((r) => r.code)),
});

// API Endpoints ---------------------------------------------------------------

/**
 * `POST /api/game/:id/chat-report` — emails a report of the game's chat to Naviary.
 * Body: `{ reason }`. Everything else about the report the server derives.
 * @throws If a database error occurs.
 */
function submitReport(req: Request, res: Response): void {
	const game_id = gamesManager.decodeID(req.params['id']!);
	if (game_id === undefined) {
		// Unlocalized: only a hand-crafted request can carry a malformed id.
		res.status(400).send('Invalid game ID format.');
		return;
	}

	const parseResult = ReportBodySchema.safeParse(req.body);
	if (!parseResult.success) {
		// Unlocalized: the client only ever sends a code off the SSR'd menu.
		res.status(400).json({ message: 'The request was invalid.' });
		zodLogger.log(req.body, parseResult.error, 'Invalid chat report request body.');
		return;
	}

	const resolved = gameManager.produceStaticGameState(game_id);
	const reporterRole =
		resolved !== undefined
			? gameManager.resolveParticipantRole(game_id, resolved, req.memberInfo!)
			: undefined;

	// Both 403s unlocalized: the client reads their status and shows its own wording.
	if (resolved === undefined || reporterRole === undefined) {
		res.status(403).send('You were not a participant of this game.');
		return;
	}

	// Notices don't count: a game whose only entries are a draw offer or a
	// disconnect is still nothing to report.
	const entries = chatEntriesManager.getOfGame(game_id);
	if (!entries.some((entry) => entry.message !== null)) {
		res.status(403).send('This game has nothing to report.');
		return;
	}

	chatReport.submit({ game_id, reason: parseResult.data.reason, reporterRole, resolved, entries }); // prettier-ignore
	res.sendStatus(200);
}

// Exports ---------------------------------------------------------------------

export default { submitReport };
