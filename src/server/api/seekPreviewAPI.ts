// src/server/api/seekPreviewAPI.ts

/**
 * HTTP API handler for lobby seek position previews.
 * Returns the ICN of a custom (non-preset) seek so clients can render hover tooltips.
 */

import type { Request, Response } from 'express';

import activeSeeks from '../game/seeksmanager/activeSeeks.js';
import gamesManager from '../database/gamesManager.js';

/** `GET /api/seek-preview/:id` — returns `{ icn }` of a custom (ICN) seek for hover previews. */
function get(req: Request, res: Response): void {
	const id = gamesManager.decodeID(req.params['id']!);
	if (id === undefined) {
		res.status(400).send('Invalid seek ID format.');
		return;
	}

	const seek = activeSeeks.getByID(id);
	if (seek === undefined) {
		res.status(404).send('Seek not found.');
		return;
	}

	if (seek.variant.kind !== 'custom') {
		// Preset seeks don't have a custom ICN to preview
		res.status(400).send('Only custom ICN seeks have previews.');
		return;
	}

	res.json({ icn: seek.variant.position });
}

// Exports ---------------------------------------------------------------------

export default { get };
