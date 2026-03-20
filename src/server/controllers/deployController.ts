// src/server/controllers/deployController.ts

/**
 * Handles server lifecycle endpoints called by the GitHub Actions deploy workflow.
 *
 * All endpoints in this file are authenticated via the X-Restart-Secret header,
 * which must match the RESTART_SECRET environment variable.
 */

import type { Request, Response } from 'express';

import { performBackup } from '../database/backupManager.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';

/**
 * POST /api/prepare-restart
 *
 * Called by the GitHub Actions deploy workflow before `pm2 reload`.
 * The runner must wait for HTTP 200 before proceeding so all pre-deploy work
 * (currently: DB backup) completes before the process is reloaded.
 */
async function handlePrepareRestart(req: Request, res: Response): Promise<void> {
	const secret = process.env['RESTART_SECRET'];
	if (!secret) {
		logEventsAndPrint(
			'POST /api/prepare-restart called but RESTART_SECRET is not set.',
			'errLog.txt',
		);
		res.status(500).send('Endpoint is not configured.');
		return;
	}

	if (req.headers['x-restart-secret'] !== secret) {
		res.status(403).send('Forbidden.');
		return;
	}

	// TODO: If warning_seconds > 0, broadcast a countdown warning to all connected clients here.

	try {
		await performBackup();
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Pre-deploy DB backup failed: ${message}`, 'errLog.txt');
		res.status(500).send('Pre-deploy backup failed.');
		return;
	}

	res.status(200).send('Ready for restart.');
}

export { handlePrepareRestart };
