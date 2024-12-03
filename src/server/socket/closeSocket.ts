
/**
 * This script terminates websockets.
 */


import socketUtility from "./socketUtility.js";
import { removeConnectionFromConnectionLists, unsubSocketFromAllSubs } from "./socketManager.js";
// @ts-ignore
import wsutil from "../../client/scripts/esm/util/wsutil.js";


// Type Definitions ---------------------------------------------------------------------------


import type { CustomWebSocket } from "./socketUtility.js";


// Functions ---------------------------------------------------------------------------


function onclose(ws: CustomWebSocket, code: number, reason: Buffer) {
	const reasonString = reason.toString();

	// Delete connection from object.
	removeConnectionFromConnectionLists(ws, code, reasonString);

	// What if the code is 1000, and reason is "Connection closed by client"?
	// I then immediately want to delete their invite.
	// But what other reasons could it close... ?
	// Code 1006, Message "" is just a network failure.

	// True if client had no power over the closure,
	// DON'T COUNT this as a disconnection!
	// They would want to keep their invite, AND remain in their game!
	const closureNotByChoice = wsutil.wasSocketClosureNotByTheirChoice(code, reasonString);

	// Unsubscribe them from all. NO LIST. It doesn't matter if they want to keep their invite or remain
	// connected to their game, without a websocket to send updates to, there's no point in any SUBSCRIPTION service!
	// Unsubbing them from their game will start their auto-resignation timer.
	unsubSocketFromAllSubs(ws, closureNotByChoice);

	cancelRenewConnectionTimer(ws);

	if (reasonString === 'No echo heard') console.log(`Socket closed from no echo heard. ${socketUtility.stringifySocketMetadata(ws)}`);
}

function cancelRenewConnectionTimer(ws: CustomWebSocket) {
	clearTimeout(ws.metadata.renewConnectionTimeoutID);
	ws.metadata.renewConnectionTimeoutID = undefined;
}



export {
	onclose,
};