
// src/server/game/invitesmanager/invitesrouter.ts

/*
 * This script routes all incoming websocket messages
 * with the "invites" route to where they need to go.
 */

import * as z from 'zod';

import { createInvite, createinviteschem } from './createinvite.js';
import { cancelInvite, cancelinviteschem } from './cancelinvite.js';
import { acceptInvite, acceptinviteschem } from './acceptinvite.js';

import type { CustomWebSocket } from '../../socket/socketUtility.js';


const InvitesSchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('createinvite'), value: createinviteschem }),
	z.strictObject({ action: z.literal('cancelinvite'), value: cancelinviteschem }),
	z.strictObject({ action: z.literal('acceptinvite'), value: acceptinviteschem })
]);
type InvitesMessage = z.infer<typeof InvitesSchema>;


/**
 * Routes all incoming websocket messages related to invites.
 * @param ws 
 * @param contents 
 * @param id - The id of the incoming message. This should be included in our response as the `replyto` property.
 * @returns 
 */
function routeInvitesMessage(ws: CustomWebSocket, contents: InvitesMessage, id: number): void { // data: { route, action, value, id }
	// Route them according to their action
	switch (contents.action) {
		case "createinvite":
			createInvite(ws, contents.value, id);
			break;
		case "cancelinvite":
			cancelInvite(ws, contents.value, id);
			break;
		case "acceptinvite":
			acceptInvite(ws, contents.value, id);
			break;
		default:
			// @ts-ignore
			console.error(`UNKNOWN web socket action received in invites route! "${contents.action}"`);
	}
}


export {
	routeInvitesMessage,

	InvitesSchema,
};

export type {
	
};