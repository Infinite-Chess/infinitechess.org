// src/server/api/SeekPreviewAPI.ts

/**
 * HTTP API handler for lobby seek position previews.
 * Returns the ICN of a custom (non-preset) seek so clients can render hover tooltips.
 * CloudSave seeks are resolved to plain ICN at creation time, so only 'icn'-kind seeks are served.
 */

import type { Request, Response } from 'express';

import { IDLengthOfInvites, getInviteAndIndexByID } from '../game/invitesmanager/invitesmanager.js';

function getSeekPreview(req: Request, res: Response): void {
	const seekId = req.params['seekId'];

	// Validate the seek ID format: Base36 alphanumeric, fixed length
	if (
		seekId === undefined ||
		seekId.length !== IDLengthOfInvites ||
		!/^[0-9a-z]+$/.test(seekId)
	) {
		res.status(400).end();
		return;
	}

	const result = getInviteAndIndexByID(seekId);
	if (result === undefined) {
		res.status(404).end();
		return;
	}

	const { seek } = result;

	if (seek.variant.kind !== 'icn') {
		// Preset seeks don't have a custom ICN to preview
		res.status(404).end();
		return;
	}

	res.json({ icn: seek.variant.content });
}

export { getSeekPreview };
