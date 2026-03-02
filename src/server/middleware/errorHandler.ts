// src/server/middleware/errorHandler.ts

import type { Request, Response } from 'express';

import { logEventsAndPrint } from './logEvents.js';
import { getTranslationForReq } from '../utility/translate.js';

function errorHandler(err: Error, req: Request, res: Response, _next: Function): void {
	try {
		const errMessage = `${err.stack}`;
		logEventsAndPrint(errMessage, 'errLog.txt');

		// This sends back to the browser the error, instead of the ENTIRE stack which is PRIVATE.
		const messageForClient = getTranslationForReq('server.javascript.ws-server_error', req);
		res.status(500).send(messageForClient); // 500: Server error
	} catch (error: unknown) {
		// Last line of defense if an error occurs in the middleware error catcher
		const errMessage = error instanceof Error ? error.stack : String(error);
		console.error('Critical error in errorHandler middleware:', errMessage);
		res.status(500).send('Critical server error.');
	}
}

export default errorHandler;
