// src/server/game/invitesmanager/createinvite.ts

/**
 * This script handles invite creation, making sure that the invites have valid properties.
 */

import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { Rating, ServerUsernameContainer } from '../../../shared/types.js';

import * as z from 'zod';

import uuid from '../../../shared/util/uuid.js';
import clockutil from '../../../shared/chess/util/clockutil.js';
import metadatautil from '../../../shared/chess/util/metadatautil.js';
import { players as p } from '../../../shared/chess/util/typeutil.js';
import { isRatedAllowed } from '../../../shared/chess/variants/servervalidation.js';
import {
	Leaderboards,
	VariantLeaderboards,
} from '../../../shared/chess/variants/validleaderboard.js';
import {
	InviteVariantSchema,
	InviteModifierSchema,
	TimeControlSchema,
	GameModeSchema,
} from '../../../shared/types.js';

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

// Schemas ---------------------------------------------------------------------------

export type CreateInviteMessage = z.infer<typeof createinviteschem>;
/** The zod schema for validating the contents of the createinvite message. */
const createinviteschem = z
	.strictObject({
		tag: z.string().length(8),
		variant: InviteVariantSchema,
		time: TimeControlSchema.refine((c) => clockutil.isTimedControlValid(c), {
			error: 'Invalid clock value.',
		}),
		color: z.literal([p.WHITE, p.BLACK, null]),
		mode: GameModeSchema,
		modifiers: z.array(InviteModifierSchema).max(InviteModifierSchema.options.length),
	})
	.refine(
		(val) =>
			val.mode !== 'rated' || isRatedAllowed(val.variant, val.time, val.color, val.modifiers),
		{ error: 'Invalid invite parameters for a rated game.' },
	);

// Functions -------------------------------------------------------------------------

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
	// invite: { id, owner, variant, clock, color, rated }
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
	// cloudSave seeks require the user to be signed in (cloud saves belong to an account).
	if (invite.variant.kind === 'cloudSave' && !ws.metadata.memberInfo.signedIn) {
		return sendSocketMessage(
			ws,
			'general',
			'notify',
			'Must be signed in to create a seek from a cloud save.',
			replyto,
		);
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

	let id: string;
	do {
		id = uuid.generateID_Base36(IDLengthOfInvites);
	} while (existingInviteHasID(id));

	const owner = ws.metadata.memberInfo;

	let rating: Rating | undefined;
	if (ws.metadata.memberInfo.signedIn) {
		// Fallback to the elo on the INFINITY leaderboard, if the variant does not have a leaderboard.
		const leaderboardId =
			messageContents.variant.kind === 'preset'
				? (VariantLeaderboards[messageContents.variant.code] ?? Leaderboards.INFINITY)
				: Leaderboards.INFINITY;
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
		modifiers: messageContents.modifiers,
		tag: messageContents.tag,
	};
}

export { createInvite, createinviteschem };
