

// Type Definitions ---------------------------------------------------------------------------


// @ts-ignore
import { userHasInvite } from "../game/invitesmanager/invitesmanager.js";
import { sendSocketMessage } from "./sendSocketMessage.js";
import type { CustomWebSocket } from "./socketUtility.js";



// Variables ---------------------------------------------------------------------------


/** After this much time of no messages sent we send a message,
 * expecting an echo, just to check if they are still connected. */
const timeOfInactivityToRenewConnection = 10000;


// Functions ---------------------------------------------------------------------------


/**
 * Reschedule the timer to send an empty message to the client
 * to verify they are still connected and responding.
 */
function rescheduleRenewConnection(ws: CustomWebSocket) {
	cancelRenewConnectionTimer(ws);
	// Only reset the timer if they are subscribed to a game,
	// or they have an open invite!
	if (ws.metadata.subscriptions.game === undefined && !userHasInvite(ws)) return;

	ws.metadata.renewConnectionTimeoutID = setTimeout(renewConnection, timeOfInactivityToRenewConnection, ws);
}

function cancelRenewConnectionTimer(ws: CustomWebSocket) {
	clearTimeout(ws.metadata.renewConnectionTimeoutID);
	ws.metadata.renewConnectionTimeoutID = undefined;
}


/**
 * Send an empty message to the client, expecting an echo
 * within five seconds to make sure they are still connected.
 */
function renewConnection(ws: CustomWebSocket) {
	sendSocketMessage(ws, 'general', 'renewconnection');
}



export {
	rescheduleRenewConnection,
	cancelRenewConnectionTimer,
};