
/**
 * This module contains methods for safely executing functions,
 * catching any errors that may occur, logging them to the error log.
 */

import { logEvents } from '../middleware/logEvents.mjs';


/**
 * Executes a callback function with provided arguments and catches any errors that occur.
 * @param {Function} callback - The function to execute safely.
 * @param {string} errorMessage - A custom error message to log if an error occurs.
 * @param {...any} args - Arguments to pass to the callback function.
 * @returns {boolean} true if the callback executed without error.
 */
function executeSafely(callback, errorMessage, ...args) {
    try {
        callback(...args);
    } catch (e) {
        const errText = `${errorMessage}\n${e.stack}`;
        logEvents(errText, 'errLog.txt', { print: true });
        return false; // Yes error
    }
    return true; // No error
}

/**
 * A variant of {@link executeSafely} that works with an async function.
 * 
 * Executes a callback function with provided arguments and catches any errors that occur.
 * @param {Function} callback - The function to execute safely.
 * @param {string} errorMessage - A custom error message to log if an error occurs.
 * @param {...any} args - Arguments to pass to the callback function.
 * @returns {Promise<boolean>} true if the callback executed without error.
 */
async function executeSafely_async(callback, errorMessage, ...args) {
    try {
        await callback(...args);
    } catch (e) {
        const errText = `${errorMessage}\n${e.stack}`;
        await logEvents(errText, 'errLog.txt', { print: true });
        return false; // Yes error
    }
    return true; // No error
}

export {
    executeSafely,
    executeSafely_async
};