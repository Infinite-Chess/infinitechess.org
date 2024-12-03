
/**
 * This script terminates websockets.
 */


// @ts-ignore
import { removeConnectionFromConnectionLists, unsubSocketFromAllSubs } from "./socketManager.js";
// @ts-ignore
import wsutil from "../../client/scripts/esm/util/wsutil.js";
// @ts-ignore
import wsutility from "./socketUtility.js";
import { cancelRenewConnectionTimer } from './renewSocketConnection.js';


// Type Definitions ---------------------------------------------------------------------------


import type { CustomWebSocket } from "./socketUtility.js";


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



export {
	onclose,
};