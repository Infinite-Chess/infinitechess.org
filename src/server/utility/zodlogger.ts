// src/server/utility/zodlogger.ts

/**
 * Logs malformed incoming messages — websocket messages, API requests, etc. —
 * with full details, for debugging validation failures.
 */

import * as z from 'zod';

import jsonutil from '../../shared/util/jsonutil.js';

import logEvents from './logEvents.js';

/**
 * A consistent way of logging all malformed incoming messages,
 * whether websocket message, API request, etc.
 * Puts all details in `zodLog.txt`, and a one-liner notifier in `errLog.txt` and in the console.
 * @param json - The pre-parsed JSON message that was malformed.
 * @param zodError - The ZodError from the zod result during validation.
 * @param contextMessage - Brief description of where this error occurred. e.g. "Received malformed websocket in-message."
 */
function log(json: unknown, zodError: z.ZodError, contextMessage: string): void {
	const treeifiedErrors = JSON.stringify(z.treeifyError(zodError), null, 2);
	const logText = `${contextMessage} - Message contents:
${jsonutil.ensureJSONString(json, 2)}

Zod treeified errors:
${treeifiedErrors}

===================================================================

	`;
	logEvents.add(logText, 'zodLog');
	logEvents.addAndPrint(`${contextMessage} - Check zodLog.txt for more details.`, 'errLog');
}

// Exports ------------------------------------------------------------------------------------

export default { log };
