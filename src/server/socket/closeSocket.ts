
/**
 * This script terminates websockets.
 */


import { removeConnectionFromConnectionLists, unsubSocketFromAllSubs } from "./socketManager";
import wsutil from "../../client/scripts/esm/util/wsutil";


// Type Definitions ---------------------------------------------------------------------------


import type { CustomWebSocket } from "../game/wsutility";
import { cancelRenewConnectionTimer } from "./sendSocketMessage";
import { deleteEchoTimerForMessageID } from "./echoTracker";


// Functions ---------------------------------------------------------------------------


function onclose(ws: CustomWebSocket, code: number, reason: string) {
	reason = reason.toString();

	// Delete connection from object.
	removeConnectionFromConnectionLists(ws, code, reason);

	// What if the code is 1000, and reason is "Connection closed by client"?
	// I then immediately want to delete their invite.
	// But what other reasons could it close... ?
	// Code 1006, Message "" is just a network failure.

	// True if client had no power over the closure,
	// DON'T COUNT this as a disconnection!
	// They would want to keep their invite, AND remain in their game!
	const closureNotByChoice = wsutil.wasSocketClosureNotByTheirChoice(code, reason);

	// Unsubscribe them from all. NO LIST. It doesn't matter if they want to keep their invite or remain
	// connected to their game, without a websocket to send updates to, there's no point in any SUBSCRIPTION service!
	// Unsubbing them from their game will start their auto-resignation timer.
	unsubSocketFromAllSubs(ws, closureNotByChoice);

	cancelRenewConnectionTimer(ws);

	if (reason === 'No echo heard') console.log(`Socket closed from no echo heard. ${wsutility.stringifySocketMetadata(ws)}`);
}


function closeWebSocketConnection(ws: CustomWebSocket, code: number, message: string, messageID?: number) {
	if (messageID !== undefined) deleteEchoTimerForMessageID(messageID); // Timer is just now ringing. Delete the timer from the echoTimers list, so it doesn't fill up!

	//console.log(`Closing web socket connection.. Code ${code}. Message "${message}"`)
	const readyStateClosed = ws.readyState === WebSocket.CLOSED;
	if (readyStateClosed && message === "Connection expired") return console.log(`Web socket already closed! This function should not have been run. Code ${code}. Message ${message}`);
	else if (readyStateClosed) return;
	ws.close(code, message);
}



export {
	onclose,
	closeWebSocketConnection,
}