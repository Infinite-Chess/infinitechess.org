// src/server/api/seekPreviewAPI.ts

/**
 * HTTP API handler for lobby seek position previews.
 * Returns the ICN of a custom (non-preset) seek so clients can render hover tooltips.
 */

import type { Request, Response } from 'express';

import activeSeeks from '../game/seeksmanager/activeSeeks.js';

/** `GET /api/seek-preview/:seekId` — returns `{ icn }` of a custom (ICN) lobby seek for hover previews. */
function get(req: Request, res: Response): void {
	const seekId = req.params['seekId']!;

	// No shape check: an id is only compared for equality, so a malformed one 404s below.
	const seek = activeSeeks.getByID(seekId);
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
