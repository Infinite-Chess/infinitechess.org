// src/server/api/SeekPreviewAPI.ts

/**
 * HTTP API handler for lobby seek position previews.
 * Returns the ICN of a custom (non-preset) seek so clients can render hover tooltips.
 */

import type { Request, Response } from 'express';

import { SeekIdSchema } from '../../shared/domain.js';

import lobbymanager from '../game/seeksmanager/lobbymanager.js';

/** `GET /api/seek-preview/:seekId` — returns `{ icn }` of a custom (ICN) lobby seek for hover previews. */
function getSeekPreview(req: Request, res: Response): void {
	const seekId = req.params['seekId']!;

	if (!SeekIdSchema.safeParse(seekId).success) {
		res.status(400).send('Invalid seek ID format.');
		return;
	}

	const result = lobbymanager.getSeekAndIndexByID(seekId);
	if (result === undefined) {
		res.status(404).send('Seek not found.');
		return;
	}

	const { seek } = result;

	if (seek.variant.kind !== 'custom') {
		// Preset seeks don't have a custom ICN to preview
		res.status(400).send('Only custom ICN seeks have previews.');
		return;
	}

	res.json({ icn: seek.variant.position });
}

export { getSeekPreview };
