
/*
 * This script routes all incoming websocket messages
 * with the "invites" route to where they need to go.
 * 
 * The script that actually keeps track of our open
 * invites is invitesmanager
 */


import wsutility from '../../socket/socketUtility.js';

import { createInvite } from './createinvite.js';
import { cancelInvite } from './cancelinvite.js';
import { acceptInvite } from './acceptinvite.js';


function handleInviteRoute(ws, data) { // data: { route, action, value, id }
	// What is their action? Create invite? Cancel invite? Accept invite?

	switch (data.action) {
		case "createinvite":
			createInvite(ws, data.value, data.id);
			break;
		case "cancelinvite":
			cancelInvite(ws, data.value, data.id);
			break;
		case "acceptinvite":
			acceptInvite(ws, data.value, data.id);
			break;
		default:
			console.log(`Client sent unknown action "${data.action}" for invites route! Metadata: ${wsutility.stringifySocketMetadata(ws)}`);
			console.log(`Data: ${JSON.stringify(data)}`);
			return;
	}
}


export {
	handleInviteRoute
};