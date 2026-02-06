// src/server/utility/errorguard.ts

/**
 * This module contains methods for safely executing functions,
 * catching any errors that may occur, logging them to the error log.
 */

import { logEventsAndPrint } from '../middleware/logevents.js';

/**
 * Executes a callback function with provided arguments and catches any errors that occur.
 * @param callback - The function to execute safely.
 * @param errorMessage - A custom error message to log if an error occurs.
 * @param args - Arguments to pass to the callback function.
 * @returns true if the callback executed without error.
 */
function executeSafely(callback: () => void, errorMessage: string): boolean {
	try {
		callback();
	} catch (e) {
		const stack = e instanceof Error ? e.stack : 'Exception is not of Error type!';
		const errText = `${errorMessage}\n${stack}`;
		logEventsAndPrint(errText, 'errLog.txt');
		return false; // Yes error
	}
	return true; // No error
}

/**
 * A variant of {@link executeSafely} that works with an async function.
 *
 * Executes a callback function with provided arguments and catches any errors that occur.
 * @param callback - The function to execute safely.
 * @param errorMessage - A custom error message to log if an error occurs.
 * @param args - Arguments to pass to the callback function.
 * @returns true if the callback executed without error.
 */
async function executeSafely_async(
	callback: () => Promise<void>,
	errorMessage: string,
): Promise<boolean> {
	try {
		await callback();
	} catch (e) {
		const stack = e instanceof Error ? e.stack : 'Exception is not of Error type!';
		const errText = `${errorMessage}\n${stack}`;
		await logEventsAndPrint(errText, 'errLog.txt');
		return false; // Yes error
	}
	return true; // No error
}

export { executeSafely, executeSafely_async };
