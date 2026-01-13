// src/server/socket/generalrouter.ts

/**
 * This script handles the incoming general websocket message route.
 */

import * as z from 'zod';

import { subToInvitesList, unsubFromInvitesList } from '../game/invitesmanager/invitesmanager.js';
import { unsubClientFromGameBySocket } from '../game/gamemanager/gamemanager.js';

import type { CustomWebSocket } from './socketUtility.js';

const validUnsubs = ['invites', 'game'] as const;

type ValidUnsub = (typeof validUnsubs)[number];

const GeneralSchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('sub'), value: z.literal(['invites']) }),
	z.strictObject({ action: z.literal('unsub'), value: z.literal(validUnsubs) }),
]);

type GeneralMessage = z.infer<typeof GeneralSchema>;

// Functions -------------------------------------------------------------------

// Route for this incoming message is "general". What is their action?
function routeGeneralMessage(ws: CustomWebSocket, message: GeneralMessage): void {
	// data: { route, action, value, id }
	// Route them according to their action
	switch (message.action) {
		case 'sub':
			handleSubbing(ws, message.value);
			break;
		case 'unsub':
			handleUnsubbing(ws, message.value);
			break;
		default:
			console.error(
				// @ts-ignore
				`UNKNOWN web socket action received in general route! "${message.action}"`,
			);
	}
}

// Actions -------------------------------------------------------------------

function handleSubbing(ws: CustomWebSocket, value: 'invites'): void {
	// What are they wanting to subscribe to for updates?
	switch (value) {
		case 'invites':
			// Subscribe them to the invites list
			subToInvitesList(ws);
			break;
		default:
			console.error(`UNKNOWN subscription list to subscribe client to! "${value}"`);
	}
}

// Set closureNotByChoice to true if you don't immediately want to disconnect them, but say after 5 seconds
function handleUnsubbing(ws: CustomWebSocket, key: ValidUnsub, closureNotByChoice?: boolean): void {
	// What are they wanting to unsubscribe from updates from?
	switch (key) {
		case 'invites':
			// Unsubscribe them from the invites list
			unsubFromInvitesList(ws, closureNotByChoice);
			break;
		case 'game':
			// If the unsub is not by choice (network interruption instead of closing tab), then we give them
			// a 5 second cushion before starting an auto-resignation timer
			unsubClientFromGameBySocket(ws, { unsubNotByChoice: closureNotByChoice });
			break;
		default:
			console.error(`UNKNOWN subscription list to unsubscribe client from! "${key}"`);
	}
}

// Exports ------------------------------------------------------------

export { routeGeneralMessage, handleUnsubbing, GeneralSchema };
