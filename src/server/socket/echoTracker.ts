
/**
 * This script keeps track of the echoes. We are expecting from recent websocket out messages.
 * 
 * Typically, if we don't receive an echo within five seconds,
 * we expect the connection to have been lost, and we close the websocket.
 */

// @ts-ignore
import { CustomWebSocket } from "../game/wsutility.js";
// @ts-ignore
import { closeWebSocketConnection } from "./closeSocket.js";


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


// Functions ---------------------------------------------------------------------------


function expectEchoForMessageID(ws: CustomWebSocket, messageID: number) {
	echoTimers[messageID] = setTimeout(closeWebSocketConnection, timeToWaitForEchoMillis, ws, 1014, "No echo heard", messageID); // Code 1014 is Bad Gateway
}

/**
 * Cancel the timer that will close the socket when we don't hear an expected echo from a sent socket message.
 * If there was no timer, this will return false meaning it was an invalid echo.
 */
function deleteEchoTimerForMessageID(messageIDEchoIsFor: any): boolean {
	if (typeof messageIDEchoIsFor !== 'number') return false; // Invalid echo (incoming socket message didn't include an echo ID)

	const timeout: NodeJS.Timeout | undefined = echoTimers[messageIDEchoIsFor];
	if (timeout === undefined) return false; // Invalid echo (message ID wasn't from any recently sent socket message)

	clearTimeout(timeout);
	delete echoTimers[messageIDEchoIsFor];
	return true; // Valid echo
}



export {
	expectEchoForMessageID,
	deleteEchoTimerForMessageID
};