// src/server/controllers/deployController.ts

/**
 * Handles server lifecycle endpoints called by the GitHub Actions deploy workflow.
 *
 * All endpoints in this file are authenticated via the X-Restart-Secret header,
 * which must match the RESTART_SECRET environment variable.
 */

import type { Request, Response } from 'express';

import jsutil from '../../shared/util/jsutil.js';

import logEvents from '../utility/logEvents.js';
import backupManager from '../database/backupManager.js';

/**
 * `POST /api/prepare-restart` — called by the GitHub Actions deploy workflow before `pm2 reload`.
 * Runs all pre-deploy work (currently a DB backup) and only returns 200 once it's safe to reload.
 */
async function handlePrepareRestart(req: Request, res: Response): Promise<void> {
	const secret = process.env['RESTART_SECRET'];
	if (!secret) {
		logEvents.addAndPrint(
			'POST /api/prepare-restart called but RESTART_SECRET is not set.',
			'errLog',
		);
		res.status(500).send('Endpoint is not configured.');
		return;
	}

	if (req.headers['x-restart-secret'] !== secret) {
		res.status(403).send('Forbidden.');
		return;
	}

	try {
		await backupManager.perform();
	} catch (error: unknown) {
		const message = jsutil.getErrorMessage(error);
		logEvents.addAndPrint(`Pre-deploy DB backup failed: ${message}`, 'errLog');
		res.status(500).send('Pre-deploy backup failed.');
		return;
	}

	res.status(200).send('Ready for restart.');
}

// Exports ---------------------------------------------------------------------

export default { handlePrepareRestart };
