// src/server/game/invitesmanager/createinvite.ts

/**
 * This script handles invite creation, making sure that the invites have valid properties.
 */

import type { CustomWebSocket } from '../../socket/socketUtility.js';

import * as z from 'zod';

import uuid from '../../../shared/util/uuid.js';
import metadatautil from '../../../shared/chess/util/metadatautil.js';
import { players as p } from '../../../shared/chess/util/typeutil.js';
import {
	Leaderboards,
	VariantLeaderboards,
} from '../../../shared/chess/variants/validleaderboard.js';
import {
	VariantGroupSchema,
	type Rating,
	type ServerUsernameContainer,
} from '../../../shared/types.js';

import timecontrol from '../timecontrol.js';
import { AuthSeek } from './inviteutility.js';
import { getTranslation } from '../../utility/translate.js';
import { isSocketInAnActiveGame } from '../gamemanager/activeplayers.js';
import { getEloOfPlayerInLeaderboard } from '../../database/leaderboardsManager.js';
import { sendNotify, sendSocketMessage } from '../../socket/sendSocketMessage.js';
import {
	existingInviteHasID,
	userHasInvite,
	addInvite,
	IDLengthOfInvites,
} from './invitesmanager.js';

export type CreateInviteMessage = z.infer<typeof createinviteschem>;
/** The zod schema for validating the contents of the createinvite message. */
const createinviteschem = z
	.strictObject({
		tag: z.string().length(8),
		variant: z.strictObject({
			group: VariantGroupSchema,
			name: z.string(),
		}),
		// `${number}+${number}` | '-'
		time: z
			.union([z.templateLiteral([z.number(), '+', z.number()]), z.literal('-')])
			.refine((c) => timecontrol.isValid(c), { error: 'Invalid clock value.' }),
		color: z.literal([p.WHITE, p.BLACK, null]),
		mode: z.enum(['casual', 'rated']),
	})
	.refine(
		(val) => {
			// Additional refinements for cross-property validation
			if (val.mode === 'rated') {
				// Rated game validation...
				if (!(val.variant.name in VariantLeaderboards)) return false; // Invalid group & variant name for a rated game.
				if (val.time === '-') return false; // Invalid clock for a rated game.
				if (val.color !== null) return false; // Specific colors aren't allowed for *public* rated games
			}
			return true; // Casual games can have any properties.
		},
		{ error: 'Invalid invite parameters for a rated game.' },
	);

/**
 * Creates a new invite from their websocket message.
 * @param ws - Their socket
 * @param messageContents - The incoming socket message that SHOULD contain the invite properties!
 * @param replyto - The incoming websocket message ID, to include in the reply
 */
function createInvite(
	ws: CustomWebSocket,
	messageContents: CreateInviteMessage,
	replyto?: number,
): void {
	// invite: { id, owner, variant, clock, color, rated, publicity }
	if (isSocketInAnActiveGame(ws))
		return sendNotify(ws, 'server.javascript.ws-already_in_game', { replyto }); // Can't create invite because they are already in a game

	// Make sure they don't already have an existing invite
	if (userHasInvite(ws)) {
		sendSocketMessage(
			ws,
			'general',
			'printerror',
			"Can't create an invite when you have one already.",
			replyto,
		);
		console.error("Player already has existing invite, can't create another!");
		return;
	}

	const invite = getInviteFromWebsocketMessageContents(ws, messageContents, replyto);
	if (!invite) return; // Message contained invalid invite parameters. Error already sent to the client.

	// Invite has all legal parameters!

	// Check if user tries creating a rated game despite not being allowed to
	if (invite.mode === 'rated' && !(ws.metadata.memberInfo.signedIn && ws.metadata.verified)) {
		const message = getTranslation(
			'server.javascript.ws-rated_invite_verification_needed',
			ws.metadata.cookies?.i18next,
		);
		return sendSocketMessage(ws, 'general', 'notify', message, replyto);
	}

	// Create the invite now ...

	addInvite(ws, invite, replyto);
}

/**
 * Makes sure the socket message is an object, and strips it of all non-variant related properties.
 * STILL DO EXPLOIT checks on the specific invite values after this!!
 * @param ws
 * @param messageContents - The incoming websocket message contents (separate from route and action)
 * @param replyto - The incoming websocket message ID, to include in the reply
 * @returns The Invite object, or void it the message contents were invalid.
 */
function getInviteFromWebsocketMessageContents(
	ws: CustomWebSocket,
	messageContents: CreateInviteMessage,
	replyto?: number,
): AuthSeek | void {
	// Verify their invite contains the required properties...

	// Is it an object? (This may pass if it is an array, but arrays won't crash when accessing property names, so it doesn't matter. It will be rejected because it doesn't have the required properties.)
	// We have to separately check for null because JAVASCRIPT has a bug where  typeof null => 'object'
	if (typeof messageContents !== 'object' || messageContents === null)
		return sendSocketMessage(
			ws,
			'general',
			'printerror',
			'Cannot create invite when incoming socket message body is not an object!',
			replyto,
		);

	/**
	 * What properties should the invite have from the incoming socket message?
	 * variant
	 * clock
	 * color
	 * rated
	 * publicity
	 * tag
	 *
	 * We further need to manually add the properties:
	 * id
	 * owner
	 * usernamecontainer
	 */

	let id: string;
	do {
		id = uuid.generateID_Base36(IDLengthOfInvites);
	} while (existingInviteHasID(id));

	const owner = ws.metadata.memberInfo;

	let rating: Rating | undefined;
	if (ws.metadata.memberInfo.signedIn) {
		// Fallback to the elo on the INFINITY leaderboard, if the variant does not have a leaderboard.
		const leaderboardId =
			VariantLeaderboards[messageContents.variant.name] ?? Leaderboards.INFINITY;
		rating = getEloOfPlayerInLeaderboard(ws.metadata.memberInfo.user_id, leaderboardId);
	}

	const player: ServerUsernameContainer = {
		type: owner.signedIn ? 'player' : 'guest',
		username: owner.signedIn ? owner.username : metadatautil.GUEST_NAME_ICN_METADATA,
		rating,
	};

	return {
		id,
		owner,
		player,
		variant: messageContents.variant,
		time: messageContents.time,
		mode: messageContents.mode,
		color: messageContents.color,
		tag: messageContents.tag,
	};
}

export { createInvite, createinviteschem };
