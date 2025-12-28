// src/server/game/invitesmanager/acceptinvite.ts

/**
 * This script handles invite acceptance,
 * creating a new game if successful.
 */

import * as z from 'zod';

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
import {
	getInviteAndIndexByID,
	deleteInviteByIndex,
	deleteUsersExistingInvite,
	findSocketFromOwner,
	onPublicInvitesChange,
	IDLengthOfInvites,
} from './invitesmanager.js';
import gameutility from '../gamemanager/gameutility.js';
import { isSocketInAnActiveGame } from '../gamemanager/activeplayers.js';
import { sendNotify, sendSocketMessage } from '../../socket/sendSocketMessage.js';

import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';
import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';

/** The zod schema for validating the contents of the acceptinvite message. */
const acceptinviteschem = z.strictObject({
	id: z.string().length(IDLengthOfInvites),
	isPrivate: z.boolean(),
});

type AcceptInviteMessage = z.infer<typeof acceptinviteschem>;

/**
 * Attempts to accept an invite of given id.
 * @param ws - The socket performing this action
 * @param messageContents - The incoming socket message that SHOULD look like: `{ id, isPrivate }`
 * @param replyto - The ID of the incoming socket message. This is used for the `replyto` property on our response.
 */
function acceptInvite(
	ws: CustomWebSocket,
	messageContents: AcceptInviteMessage,
	replyto?: number,
): void {
	// { id, isPrivate }
	if (isSocketInAnActiveGame(ws))
		return sendNotify(ws, 'server.javascript.ws-already_in_game', { replyto });

	// Does the invite still exist?
	const inviteAndIndex = getInviteAndIndexByID(messageContents.id); // { invite, index }
	if (!inviteAndIndex)
		return informThemGameAborted(ws, messageContents.isPrivate, messageContents.id, replyto);

	const { invite, index } = inviteAndIndex;

	const user = ws.metadata.memberInfo;

	// Make sure they are not accepting their own.
	if (memberInfoEq(user, invite.owner)) {
		sendSocketMessage(ws, 'general', 'printerror', 'Cannot accept your own invite!', replyto);
		console.error(
			`Player tried to accept their own invite! Socket: ${socketUtility.stringifySocketMetadata(ws)}`,
		);
		return;
	}

	// Make sure it's legal for them to accept. (Not legal if they are a guest or unverified, and the invite is RATED)
	if (invite.rated === 'rated' && !(user.signedIn && ws.metadata.verified)) {
		return sendSocketMessage(
			ws,
			'general',
			'notify',
			getTranslation(
				'server.javascript.ws-rated_invite_verification_needed',
				ws.metadata.cookies?.i18next,
			),
			replyto,
		);
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

	// Assign each player a color based on their invite info. Add their socket just encase
	const assignments: PlayerGroup<{ identifier: AuthMemberInfo; socket?: CustomWebSocket }> = {};
	let invite_acceptor: Player | undefined;
	for (const [strcolor, identifier] of Object.entries(
		gameutility.assignWhiteBlackPlayersFromInvite(
			invite.color,
			invite.owner,
			ws.metadata.memberInfo,
		),
	)) {
		const player = Number(strcolor) as Player;
		const is_invite_acceptor = memberInfoEq(identifier, player2Socket.metadata.memberInfo);
		if (is_invite_acceptor) invite_acceptor = player;
		assignments[player] = {
			identifier,
			socket: is_invite_acceptor ? player2Socket : player1Socket,
		};
	}

	if (invite_acceptor === undefined)
		throw Error("Invite accpetor doesn't exist on accepted 2 player invite");

	createGame(invite, assignments, invite_acceptor, replyto);

	// Unsubscribe them both from the invites subscription list.
	if (player1Socket) removeSocketFromInvitesSubs(player1Socket); // Could be undefined occasionally
	removeSocketFromInvitesSubs(player2Socket);

	// Broadcast the invites list change after creating the game,
	// because the new game ups the game count.
	if (hadPublicInvite)
		onPublicInvitesChange(); // Broadcast to all invites list subscribers!
	else broadcastGameCountToInviteSubs();
}

/**
 * Called when a player clicks to accept an invite that gets deleted right before.
 * This tells them the game was aborted, or that the code
 * was invalid, if they entered a private invite code.
 * @param replyto - The ID of the incoming socket message. This is used for the `replyto` property on our response.
 */
function informThemGameAborted(
	ws: CustomWebSocket,
	isPrivate: boolean,
	inviteID: string,
	replyto?: number,
): void {
	const errString = isPrivate
		? 'server.javascript.ws-invalid_code'
		: 'server.javascript.ws-game_aborted';
	if (isPrivate)
		console.log(
			`User entered incorrect invite code! Code: ${inviteID}   Socket: ${socketUtility.stringifySocketMetadata(ws)}`,
		);
	return sendNotify(ws, errString, { replyto });
}

export { acceptInvite, acceptinviteschem };
