// src/server/socket/echoTracker.ts

/**
 * This script keeps track of the echos we are expecting from recent websocket-out messages.
 *
 * Typically, if we don't receive an echo within five seconds,
 * we think the connection was lost, so we terminate the websocket.
 */

// Variables ---------------------------------------------------------------------------

/**
 *
 * An object containing the timeout ID's for the timers that auto terminate
 * websockets if we never hear an echo back: `{ messageID: timeoutID }`
 */
const echoTimers: { [messageID: number]: NodeJS.Timeout } = {};

// Functions ---------------------------------------------------------------------------

function addTimeoutToEchoTimers(messageID: number, timeout: NodeJS.Timeout): void {
	echoTimers[messageID] = timeout;
}

/**
 * Cancel the timer that will close the socket when we don't hear an expected echo from a sent socket message.
 * If there was no timer, this will return false, meaning it was an invalid echo.
 */
function deleteEchoTimerForMessageID(messageIDEchoIsFor: number): void {
	const timeout = echoTimers[messageIDEchoIsFor];
	// An invalid echo can occasionally happen when the echo arrives after timeToWaitForEchoMillis has elapsed —
	// the timeout has already fired, the socket was already closed, and the echo timer was already deleted.
	if (timeout === undefined) return;

	clearTimeout(timeout);
	delete echoTimers[messageIDEchoIsFor];
}

export { addTimeoutToEchoTimers, deleteEchoTimerForMessageID };
