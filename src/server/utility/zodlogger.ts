// src/server/utility/zodlogger.ts

/**
 * Logs malformed incoming messages — websocket messages, API requests, etc. —
 * with full details, for debugging validation failures.
 */

import * as z from 'zod';

import jsutil from '../../shared/util/jsutil.js';

import { logEvents, logEventsAndPrint } from './logEvents.js';

/**
 * A consistent way of logging all malformed incoming messages,
 * whether websocket message, API request, etc.
 * Puts all details in `zodLog.txt`, and a one-liner notifier in `errLog.txt` and in the console.
 * @param json - The pre-parsed JSON message that was malformed.
 * @param zodError - The ZodError from the zod result during validation.
 * @param contextMessage - Brief description of where this error occurred. e.g. "Received malformed websocket in-message."
 */
export function logZodError(json: unknown, zodError: z.ZodError, contextMessage: string): void {
	const treeifiedErrors = JSON.stringify(z.treeifyError(zodError), null, 2);
	const logText = `${contextMessage} - Message contents:
${jsutil.ensureJSONString(json, contextMessage, 2)}

Zod treeified errors:
${treeifiedErrors}

===================================================================

	`;
	logEvents(logText, 'zodLog');
	logEventsAndPrint(`${contextMessage} - Check zodLog.txt for more details.`, 'errLog');
}
