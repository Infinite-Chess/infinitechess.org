// src/server/api/SeekPreviewAPI.ts

/**
 * HTTP API handler for lobby seek position previews.
 * Returns the ICN of a custom (non-preset) seek so clients can render hover tooltips.
 */

import type { Request, Response } from 'express';

import { SeekIdSchema } from '../../shared/types.js';

import { getInviteAndIndexByID } from '../game/invitesmanager/lobbymanager.js';

function getSeekPreview(req: Request, res: Response): void {
	const seekId = req.params['seekId']!;

	if (!SeekIdSchema.safeParse(seekId).success) {
		res.status(400).send('Invalid seek ID format.');
		return;
	}

	const result = getInviteAndIndexByID(seekId);
	if (result === undefined) {
		res.status(404).send('Seek not found.');
		return;
	}

	const { seek } = result;

	if (seek.variant.kind !== 'icn') {
		// Preset seeks don't have a custom ICN to preview
		res.status(400).send('Only custom ICN seeks have previews.');
		return;
	}

	res.json({ icn: seek.variant.content });
}

export { getSeekPreview };
