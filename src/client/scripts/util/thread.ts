// src/client/scripts/util/thread.ts

/**
 * Yields the single JavaScript thread: an async function awaiting a sleep
 * lets everything else queued run before it resumes.
 */

/**
 * Pauses the current async function for the given time, letting other work run meanwhile.
 * @param ms - The number of milliseconds to sleep before continuing execution.
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(() => resolve(), ms));
}

export default {
	sleep,
};
