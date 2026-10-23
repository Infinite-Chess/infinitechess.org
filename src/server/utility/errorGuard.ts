// src/server/utility/errorGuard.ts

/**
 * This module contains methods for safely executing functions,
 * catching any errors that may occur, logging them to the error log.
 */

import jsutil from '../../shared/util/jsutil.js';

import logEvents from './logEvents.js';

/**
 * Executes a callback function and catches any errors that occur.
 * @param callback - The function to execute safely.
 * @param errorMessage - A custom error message to log if an error occurs.
 * @returns true if the callback executed without error.
 */
function executeSafely(callback: () => void, errorMessage: string): boolean {
	try {
		callback();
	} catch (e) {
		logEvents.addAndPrint(`${errorMessage}\n${jsutil.getErrorStack(e)}`, 'errLog');
		return false;
	}
	return true;
}

export default { executeSafely };
