
/**
 * This script keeps track of the echoes. We are expecting from recent websocket out messages.
 * 
 * Typically, if we don't receive an echo within five seconds,
 * we expect the connection to have been lost, and we close the websocket.
 */


// Variables ---------------------------------------------------------------------------

/**
 * 
 * An object containing the timeout ID's for the timers that auto terminate
 * websockets if we never hear an echo back: `{ messageID: timeoutID }`
 */
const echoTimers: { [messageID: number]: NodeJS.Timeout} = {};


/**
 * The time, after which we don't hear an expected echo from a websocket,
 * in which it be assumed disconnected, and auto terminated, in milliseconds.
*/
const timeToWaitForEchoMillis: number = 5000; // 5 seconds until we assume we've disconnected!


function deleteEchoForMessageID(messageID: number) {
	delete echoTimers[messageID];
}


export {
	deleteEchoForMessageID
};