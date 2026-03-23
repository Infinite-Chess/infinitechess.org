// src/server/game/invitesmanager/createinvite.ts

/**
 * This script handles invite creation, making sure that the invites have valid properties.
 */

import type { Invite } from './inviteutility.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { Rating, ServerUsernameContainer } from '../../../shared/types.js';

import * as z from 'zod';

import uuid from '../../../shared/util/uuid.js';
import metadatautil from '../../../shared/chess/util/metadatautil.js';
import { variantCodes } from '../../../shared/chess/variants/variant.js';
import { players as p } from '../../../shared/chess/util/typeutil.js';
import {
	Leaderboards,
	VariantLeaderboards,
} from '../../../shared/chess/variants/validleaderboard.js';

import timecontrol from '../timecontrol.js';
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

/** The zod schema for validating the contents of the createinvite message. */
const createinviteschem = z
	.strictObject({
		variant: z.enum(variantCodes),
		// `${number}+${number}` | '-'
		clock: z
			.union([z.templateLiteral([z.number(), '+', z.number()]), z.literal('-')])
			.refine((c) => timecontrol.isValid(c), { error: 'Invalid clock value.' }),
		color: z.literal([p.WHITE, p.BLACK, null]),
		publicity: z.enum(['public', 'private']),
		rated: z.enum(['casual', 'rated']),
		tag: z.string().length(8),
	})
	.refine(
		(val) => {
			// Additional refinements for cross-property validation
			if (val.rated === 'rated') {
				// Rated game validation...
				if (!(val.variant in VariantLeaderboards)) return false; // Invalid variant for a rated game.
				if (val.clock === '-') return false; // Invalid clock for a rated game.
				if (val.color !== null && val.publicity !== 'private') return false; // Specific colors are only allowed if the rated game is also private.
			}
			return true; // Casual games can have any properties.
		},
		{ error: 'Invalid invite parameters for a rated game.' },
	);

type CreateInviteMessage = z.infer<typeof createinviteschem>;

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
	if (invite.rated === 'rated' && !(ws.metadata.memberInfo.signedIn && ws.metadata.verified)) {
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
): Invite | void {
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
		const leaderboardId = VariantLeaderboards[messageContents.variant] ?? Leaderboards.INFINITY;
		rating = getEloOfPlayerInLeaderboard(ws.metadata.memberInfo.user_id, leaderboardId);
	}

	const usernamecontainer: ServerUsernameContainer = {
		type: owner.signedIn ? 'player' : 'guest',
		username: owner.signedIn ? owner.username : metadatautil.GUEST_NAME_ICN_METADATA,
		rating,
	};

	return {
		id,
		owner,
		usernamecontainer,
		variant: messageContents.variant,
		clock: messageContents.clock,
		rated: messageContents.rated,
		color: messageContents.color,
		tag: messageContents.tag,
		publicity: messageContents.publicity,
	};
}

export { createInvite, createinviteschem };
