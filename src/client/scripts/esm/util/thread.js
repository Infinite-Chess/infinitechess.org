
/**
 * This script contains a sleep method for the javascript thread.
 * 
 * Javascript is single-threated, when we sleep, we don't actually
 * sleep the thread, but we delay the execution of the current function,
 * to allow other functions on the call stack to be executed before we continue.
 * 
 * ZERO dependancies
 */

/**
 * Pauses the current function execution for the given amount of time, allowing
 * other functions in the call stack to execute before it resumes.
 * 
 * This function returns a promise that resolves after the specified number of milliseconds.
 * @param {number} ms - The number of milliseconds to sleep before continuing execution.
 * @returns {Promise<void>} A promise that resolves after the specified delay.
 */
function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
	sleep
};