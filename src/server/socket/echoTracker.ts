
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
const echoTimers: { [messageID: number]: NodeJS.Timeout | number } = {};

/**
 * The time, after which we don't hear an expected echo from a websocket,
 * in which it be assumed disconnected, and auto terminated, in milliseconds.
 */
const timeToWaitForEchoMillis: number = 5000; // 5 seconds until we assume we've disconnected!


// Functions ---------------------------------------------------------------------------


function addTimeoutToEchoTimers(messageID: number, timeout: NodeJS.Timeout | number) {
	echoTimers[messageID] = timeout;
}

/**
 * Cancel the timer that will close the socket when we don't hear an expected echo from a sent socket message.
 * If there was no timer, this will return false, meaning it was an invalid echo.
 */
function deleteEchoTimerForMessageID(messageIDEchoIsFor: number): boolean {
	const timeout: NodeJS.Timeout | number | undefined = echoTimers[messageIDEchoIsFor];
	if (timeout === undefined) return false; // Invalid echo (message ID wasn't from any recently sent socket message)

	clearTimeout(timeout);
	delete echoTimers[messageIDEchoIsFor];

	return true; // Valid echo
}



export {
	addTimeoutToEchoTimers,
	deleteEchoTimerForMessageID,
	timeToWaitForEchoMillis,
};