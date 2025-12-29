// src/server/utility/zodlogger.ts

import * as z from 'zod';
import { logEvents, logEventsAndPrint } from '../middleware/logEvents.js';

/**
 * A consistent way of logging all malformed incoming messages,
 * whether websocket message, API request, etc.
 * Puts all details in `zodLog.txt`, and a one-liner notifier in `errLog.txt` and in the console.
 * @param json - The pre-parsed JSON message that was malformed.
 * @param zodError - The ZodError from the zod result during validation.
 * @param contextMessage - Brief description of where this error occurred. e.g. "Received malformed websocket in-message."
 */
export function logZodError(json: any, zodError: z.ZodError, contextMessage: string): void {
	const treeifiedErrors = JSON.stringify(z.treeifyError(zodError), null, 2);
	const logText = `${contextMessage} - Message contents:
${JSON.stringify(json, null, 2)}

Zod treeified errors:
${treeifiedErrors}

===================================================================

	`;

	logEvents(logText, 'zodLog.txt');
	logEventsAndPrint(
		`Received malformed json message. Check zodLog.txt for more details.`,
		'errLog.txt',
	);
}
