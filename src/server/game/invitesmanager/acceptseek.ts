// src/server/game/invitesmanager/acceptseek.ts

/**
 * This script handles invite acceptance,
 * creating a new game if successful.
 */

import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';

import * as z from 'zod';

import gameutility from '../gamemanager/gameutility.js';
import socketUtility from '../../socket/socketUtility.js';
import { createGame } from '../gamemanager/gamemanager.js';
import { memberInfoEq } from './inviteutility.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { isSocketInAnActiveGame } from '../gamemanager/activeplayers.js';
import { removeSocketFromLobbySubs } from './lobbysubscribers.js';
import { getScriptTranslationsForReq } from '../../config/componentTranslationLoader.js';
import {
	getInviteAndIndexByID,
	deleteInviteByIndex,
	deleteUsersExistingInvite,
	findSocketFromOwner,
	onPublicInvitesChange,
	IDLengthOfInvites,
} from './lobbymanager.js';

/** The zod schema for validating the contents of the acceptseek message. */
const acceptseekschem = z.string().length(IDLengthOfInvites);

type AcceptSeekMessage = z.infer<typeof acceptseekschem>;

/**
 * Attempts to accept a seek of given id.
 * @param ws - The socket performing this action
 * @param messageContents - The incoming socket message containing the seek id
 */
function acceptSeek(ws: CustomWebSocket, messageContents: AcceptSeekMessage): void {
	// { id, isPrivate }
	if (isSocketInAnActiveGame(ws)) {
		const t = getScriptTranslationsForReq('responses', ws);
		return sendSocketMessage(ws, 'general', 'notify', t.seeks.already_in_game);
	}

	// Does the invite still exist?
	const inviteAndIndex = getInviteAndIndexByID(messageContents);
	if (!inviteAndIndex) {
		const t = getScriptTranslationsForReq('responses', ws);
		sendSocketMessage(ws, 'general', 'notify', t.seeks.game_aborted);
		return;
	}

	const { seek, index } = inviteAndIndex;

	const user = ws.metadata.memberInfo;

	// Make sure they are not accepting their own.
	if (memberInfoEq(user, seek.owner)) {
		sendSocketMessage(ws, 'general', 'printerror', 'Cannot accept your own invite!');
		console.error(
			`Player tried to accept their own invite! Socket: ${socketUtility.stringifySocketMetadata(ws)}`,
		);
		return;
	}

	// Make sure it's legal for them to accept. (Not legal if they are a guest or unverified, and the invite is RATED)
	if (seek.mode === 'rated' && !(user.signedIn && ws.metadata.verified)) {
		const t = getScriptTranslationsForReq('responses', ws);
		return sendSocketMessage(ws, 'general', 'notify', t.seeks.rated_requires_verified);
	}

	// Accept the invite!

	let hadPublicInvite = false;
	// Delete the invite accepted.
	if (deleteInviteByIndex(seek, index, { dontBroadcast: true })) hadPublicInvite = true;
	// Delete their existing invites
	if (deleteUsersExistingInvite(user, { broadCastNewInvites: false })) hadPublicInvite = true;

	// Start the game! Notify both players and tell them they've been subscribed to a game!

	const player1Socket = findSocketFromOwner(seek.owner); // Could be undefined occasionally
	const player2Socket = ws;

	// Assign each player a color based on their invite info. Add their socket just encase
	const assignments: PlayerGroup<{ identifier: AuthMemberInfo; socket?: CustomWebSocket }> = {};
	let invite_accepter: Player | undefined;
	for (const [strcolor, identifier] of Object.entries(
		gameutility.assignWhiteBlackPlayersFromInvite(
			seek.color,
			seek.owner,
			ws.metadata.memberInfo,
		),
	)) {
		const player = Number(strcolor) as Player;
		const is_invite_accepter = memberInfoEq(identifier, player2Socket.metadata.memberInfo);
		if (is_invite_accepter) invite_accepter = player;
		assignments[player] = {
			identifier,
			socket: is_invite_accepter ? player2Socket : player1Socket,
		};
	}

	if (invite_accepter === undefined)
		throw Error("Invite accepter doesn't exist on accepted 2 player invite");

	createGame(seek, assignments);

	// Unsubscribe them both from the lobby.
	if (player1Socket) removeSocketFromLobbySubs(player1Socket); // Could be undefined occasionally
	removeSocketFromLobbySubs(player2Socket);

	// Broadcast the invites list change after creating the game,
	// because the new game ups the game count.
	if (hadPublicInvite) onPublicInvitesChange(); // Broadcast to all invites list subscribers!
}

export { acceptSeek, acceptseekschem };
