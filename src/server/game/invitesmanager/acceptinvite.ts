
// src/server/game/invitesmanager/acceptinvite.ts

/**
 * This script handles invite acceptance,
 * creating a new game if successful.
 */

// Custom imports
// @ts-ignore
import { getTranslation } from '../../utility/translate.js';
// @ts-ignore
import { removeSocketFromInvitesSubs } from './invitessubscribers.js';
// @ts-ignore
import { broadcastGameCountToInviteSubs } from '../gamemanager/gamecount.js'; 
import { memberInfoEq } from './inviteutility.js';
import socketUtility from '../../socket/socketUtility.js';
import { createGame } from '../gamemanager/gamemanager.js';
import { getInviteAndIndexByID, deleteInviteByIndex, deleteUsersExistingInvite, findSocketFromOwner, onPublicInvitesChange, IDLengthOfInvites } from './invitesmanager.js';
import { isSocketInAnActiveGame } from '../gamemanager/activeplayers.js';
import { sendNotify, sendSocketMessage } from '../../socket/sendSocketMessage.js';

import type { CustomWebSocket } from '../../socket/socketUtility.js';

interface AcceptInviteMessage {
	id: string
	isPrivate: boolean
}

/**
 * Attempts to accept an invite of given id.
 * @param ws - The socket performing this action
 * @param messageContents - The incoming socket message that SHOULD look like: `{ id, isPrivate }`
 * @param replyto - The ID of the incoming socket message. This is used for the `replyto` property on our response.
 */
function acceptInvite(ws: CustomWebSocket, messageContents: any, replyto: number) { // { id, isPrivate }

	if (isSocketInAnActiveGame(ws)) return sendNotify(ws, "server.javascript.ws-already_in_game", { replyto });

	if (!verifyMessageContents(messageContents)) return sendSocketMessage(ws, "general", "printerror", "Cannot cancel invite when incoming socket message body is in an invalid format!", replyto);
	const { id, isPrivate } = messageContents as AcceptInviteMessage;


	// Does the invite still exist?
	const inviteAndIndex = getInviteAndIndexByID(id); // { invite, index }
	if (!inviteAndIndex) return informThemGameAborted(ws, isPrivate, id, replyto);

	const { invite, index } = inviteAndIndex;

	const user = ws.metadata.memberInfo;

	// Make sure they are not accepting their own.
	if (memberInfoEq(user, invite.owner)) {
		sendSocketMessage(ws, "general", "printerror", "Cannot accept your own invite!", replyto);
		console.error(`Player tried to accept their own invite! Socket: ${socketUtility.stringifySocketMetadata(ws)}`);
		return;
	}

	// Make sure it's legal for them to accept. (Not legal if they are a guest or unverified, and the invite is RATED)
	if (invite.rated === 'rated' && !(user.signedIn && ws.metadata.verified)) {
		return sendSocketMessage(ws, "general", "notify", getTranslation("server.javascript.ws-rated_invite_verification_needed", ws.metadata.cookies?.i18next), replyto);
	}

	// Accept the invite!

	let hadPublicInvite = false;
	// Delete the invite accepted.
	if (deleteInviteByIndex(ws, invite, index, { dontBroadcast: true })) hadPublicInvite = true;
	// Delete their existing invites
	if (deleteUsersExistingInvite(user, { broadCastNewInvites: false })) hadPublicInvite = true;

	// Start the game! Notify both players and tell them they've been subscribed to a game!

	const player1Socket = findSocketFromOwner(invite.owner); // Could be undefined occasionally
	const player2Socket = ws;
	createGame(invite, player1Socket, player2Socket, replyto);

	// Unsubscribe them both from the invites subscription list.
	if (player1Socket) removeSocketFromInvitesSubs(player1Socket); // Could be undefined occasionally
	removeSocketFromInvitesSubs(player2Socket);

	// Broadcast the invites list change after creating the game,
	// because the new game ups the game count.
	if (hadPublicInvite) onPublicInvitesChange(); // Broadcast to all invites list subscribers!
	else broadcastGameCountToInviteSubs();
}

/**
 * Tests if the provided message contents/body is valid for canceling an invite.
 * @param messageContents - The body of the incoming websocket message. It should look like: `{ id, isPrivate }`
 * @returns true if the message contents is valid for the cancellation of an invite
 */
function verifyMessageContents(messageContents: any) {
	// Is it an object? (This may pass if it is an array, but arrays won't crash when accessing property names, so it doesn't matter. It will be rejected because it doesn't have the required properties.)
	// We have to separately check for null because JAVASCRIPT has a bug where  typeof null => 'object'
	if (typeof messageContents !== 'object' || messageContents === null) return false;

	/**
     * These are the properties it must contain:
     * id
     * isPrivate
     */

	if (typeof messageContents.id !== 'string' || messageContents.id.length !== IDLengthOfInvites) return false;
	if (typeof messageContents.isPrivate !== 'boolean') return false;

	return true;
}

/**
 * Called when a player clicks to accept an invite that gets deleted right before.
 * This tells them the game was aborted, or that the code
 * was invalid, if they entered a private invite code.
 * @param replyto - The ID of the incoming socket message. This is used for the `replyto` property on our response.
 */
function informThemGameAborted(ws: CustomWebSocket, isPrivate: boolean, inviteID: string, replyto: number) {
	const errString = isPrivate ? "server.javascript.ws-invalid_code" : "server.javascript.ws-game_aborted";
	if (isPrivate) console.log(`User entered incorrect invite code! Code: ${inviteID}   Socket: ${socketUtility.stringifySocketMetadata(ws)}`);
	return sendNotify(ws, errString, { replyto });
}


export {
	acceptInvite
};