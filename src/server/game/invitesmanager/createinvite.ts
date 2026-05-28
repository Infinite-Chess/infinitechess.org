// src/server/game/invitesmanager/createinvite.ts

/**
 * This script handles invite creation, making sure that the invites have valid properties.
 */

import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { Rating, ServerUsernameContainer } from '../../../shared/types.js';

import * as z from 'zod';

import uuid from '../../../shared/util/uuid.js';
import clockutil from '../../../shared/chess/util/clockutil.js';
import icnimport from '../../../shared/chess/logic/icn/icnimport.js';
import icnconverter from '../../../shared/chess/logic/icn/icnconverter.js';
import metadatautil from '../../../shared/chess/util/metadatautil.js';
import { players as p } from '../../../shared/chess/util/typeutil.js';
import { validatePosition } from '../../../shared/chess/variants/positionvalidation.js';
import compression, { CompressionMode } from '../../../shared/util/compression.js';
import {
	Leaderboards,
	VariantLeaderboards,
} from '../../../shared/chess/variants/validleaderboard.js';
import {
	isRatedAllowed,
	POSITION_STRING_THRESHOLD,
} from '../../../shared/chess/variants/servervalidation.js';
import {
	InviteVariantSchema,
	InviteModifierSchema,
	TimeControlSchema,
	GameModeSchema,
} from '../../../shared/types.js';

import { AuthSeek } from './inviteutility.js';
import { getTranslation } from '../../utility/translate.js';
import editorSavesManager from '../../database/editorSavesManager.js';
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
 */
async function createInvite(
	ws: CustomWebSocket,
	messageContents: CreateInviteMessage,
): Promise<void> {
	// invite: { id, owner, variant, clock, color, rated }
	if (isSocketInAnActiveGame(ws)) return sendNotify(ws, 'server.javascript.ws-already_in_game'); // Can't create invite because they are already in a game

	// Make sure they don't already have an existing invite
	if (userHasInvite(ws)) {
		sendSocketMessage(
			ws,
			'general',
			'printerror',
			"Can't create an invite when you have one already.",
		);
		console.error("Player already has existing invite, can't create another!");
		return;
	}

	// Reject rated seeks from unverified/signed-out users
	if (
		messageContents.mode === 'rated' &&
		!(ws.metadata.memberInfo.signedIn && ws.metadata.verified)
	) {
		const message = getTranslation(
			'server.javascript.ws-rated_invite_verification_needed',
			ws.metadata.cookies?.i18next,
		);
		sendSocketMessage(ws, 'general', 'notify', message);
		return;
	}

	const invite = await getInviteFromWebsocketMessageContents(ws, messageContents);
	if (!invite) return; // Message contained invalid invite parameters. Error already sent to the client.

	addInvite(invite);
}

/**
 * Builds an {@link AuthSeek} from the client's createinvite message, resolving
 * cloudSave variants to ICN and validating ICN positions for legality.
 * Returns `void` after sending an error to the client if any check fails.
 */
async function getInviteFromWebsocketMessageContents(
	ws: CustomWebSocket,
	messageContents: CreateInviteMessage,
): Promise<AuthSeek | void> {
	// Verify their invite contains the required properties...

	// Is it an object? (This may pass if it is an array, but arrays won't crash when accessing property names, so it doesn't matter. It will be rejected because it doesn't have the required properties.)
	// We have to separately check for null because JAVASCRIPT has a bug where  typeof null => 'object'
	if (typeof messageContents !== 'object' || messageContents === null)
		return sendSocketMessage(
			ws,
			'general',
			'printerror',
			'Cannot create invite when incoming socket message body is not an object!',
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

	// Resolve cloudSave seeks to plain ICN
	let variant = messageContents.variant;
	if (variant.kind === 'cloudSave') {
		// cloudSave seeks require the user to be signed in (cloud saves belong to an account).
		if (!owner.signedIn) {
			sendSocketMessage(
				ws,
				'general',
				'notify',
				'Must be signed in to create a seek from a cloud save.',
			);
			return;
		}
		const record = editorSavesManager.getSavedPositionICN(variant.name, owner.user_id);
		if (record === undefined) {
			return sendSocketMessage(
				ws,
				'general',
				'notify',
				`Cloud save "${variant.name}" not found.`,
			);
		}
		// Skip decompression if the compressed payload is already too large to be a legal seek.
		if (record.icn.length > POSITION_STRING_THRESHOLD) {
			return sendSocketMessage(ws, 'general', 'notify', 'Position is too large.');
		}
		const content = await compression.decompressString(
			record.icn,
			record.compression as CompressionMode,
		);
		variant = { kind: 'icn', content };
	}

	// Validate the resolved ICN's position is legal
	if (variant.kind === 'icn') {
		const illegalReason = validateIcnSeekContent(variant.content);
		if (illegalReason !== null) {
			return sendSocketMessage(ws, 'general', 'notify', illegalReason);
		}
	}

	return {
		id,
		owner,
		player,
		variant,
		time: messageContents.time,
		mode: messageContents.mode,
		color: messageContents.color,
		modifiers: messageContents.modifiers,
		tag: messageContents.tag,
	};
}

/**
 * Parses an ICN seek's content and runs position legality checks.
 * @returns `null` if the ICN is legal, or a human-readable rejection reason.
 */
function validateIcnSeekContent(content: string): string | null {
	let longFormat;
	try {
		longFormat = icnconverter.ShortToLong_Format(content);
	} catch {
		return 'Invalid ICN.';
	}
	if (longFormat.position === undefined || longFormat.state_global.specialRights === undefined) {
		return 'ICN must include a position.';
	}
	const variantOptions = icnimport.variantOptionsFromLongFormat(longFormat, { fullMove: 1 });
	return validatePosition(variantOptions, content);
}

export { createInvite, createinviteschem };
