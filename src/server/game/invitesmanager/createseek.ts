// src/server/game/invitesmanager/createseek.ts

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
import compression, { CompressionMode } from '../../../shared/util/compression.js';
import {
	Leaderboards,
	VariantLeaderboards,
} from '../../../shared/chess/variants/validleaderboard.js';
import {
	validatePosition,
	PositionErrorCode,
} from '../../../shared/chess/variants/positionvalidation.js';
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
import editorSavesManager from '../../database/editorSavesManager.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { isSocketInAnActiveGame } from '../gamemanager/activeplayers.js';
import { getScriptTranslationsForReq } from '../../config/componentTranslationLoader.js';
import { getEloOfPlayerInLeaderboard } from '../../database/leaderboardsManager.js';
import {
	existingInviteHasID,
	deleteUsersExistingInvite,
	addInvite,
	IDLengthOfInvites,
} from './lobbymanager.js';

// Types -------------------------------------------------------------------------------

/** Codes returned by {@link validateIcnSeekContent}; superset of {@link PositionErrorCode}. */
type IcnSeekErrorCode = PositionErrorCode | 'invalid_icn' | 'icn_missing_position';

// Schemas ---------------------------------------------------------------------------

export type CreateSeekMessage = z.infer<typeof createseekschem>;
/** The zod schema for validating the contents of the createseek message. */
const createseekschem = z
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
async function createSeek(ws: CustomWebSocket, messageContents: CreateSeekMessage): Promise<void> {
	// invite: { id, owner, variant, clock, color, rated }
	if (isSocketInAnActiveGame(ws)) {
		// Can't create invite because they are already in a game
		const t = getScriptTranslationsForReq('responses', ws);
		return sendSocketMessage(ws, 'general', 'notify', t.seeks.already_in_game);
	}

	// Reject rated seeks from unverified/signed-out users
	if (
		messageContents.mode === 'rated' &&
		!(ws.metadata.memberInfo.signedIn && ws.metadata.verified)
	) {
		const t = getScriptTranslationsForReq('responses', ws);
		sendSocketMessage(ws, 'general', 'notify', t.seeks.rated_requires_verified);
		return;
	}

	try {
		const invite = await getInviteFromWebsocketMessageContents(ws, messageContents);
		if (!invite) return; // Message contained invalid invite parameters. Error already sent to the client.

		// Replace any existing invite this user owns — the subsequent addInvite() broadcasts the new state.
		deleteUsersExistingInvite(ws.metadata.memberInfo, { broadCastNewInvites: false });

		addInvite(invite);
	} catch {
		// DB error (already logged)
		sendSocketMessage(
			ws,
			'general',
			'notifyerror',
			"Couldn't create seek. A server error occurred. Please try again.",
		);
	}
}

/**
 * Builds an {@link AuthSeek} from the client's createseek message, resolving
 * cloudSave variants to ICN and validating ICN positions for legality.
 * Returns `void` after sending an error to the client if any check fails.
 * @throws If a database error occurs (from {@link getEloOfPlayerInLeaderboard} or {@link editorSavesManager.getSavedPositionICN}).
 */
async function getInviteFromWebsocketMessageContents(
	ws: CustomWebSocket,
	messageContents: CreateSeekMessage,
): Promise<AuthSeek | void> {
	// Verify their invite contains the required properties...

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
			const t = getScriptTranslationsForReq('responses', ws);
			sendSocketMessage(ws, 'general', 'notifyerror', t.seeks.cloud_requires_sign_in);
			return;
		}
		const record = editorSavesManager.getSavedPositionICN(variant.name, owner.user_id);
		if (record === undefined) {
			const t = getScriptTranslationsForReq('responses', ws);
			return sendSocketMessage(ws, 'general', 'notifyerror', t.seeks.cloud_not_found);
		}
		// Skip decompression if the compressed payload is already too large to be a legal seek.
		if (record.icn.length > POSITION_STRING_THRESHOLD) {
			const message = localizePositionError('position_too_large', ws);
			return sendSocketMessage(ws, 'general', 'notify', message);
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
			const message = localizePositionError(illegalReason, ws);
			return sendSocketMessage(ws, 'general', 'notify', message);
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
 * @returns `null` if the ICN is legal, or an {@link IcnSeekErrorCode} describing the failure.
 */
function validateIcnSeekContent(content: string): IcnSeekErrorCode | null {
	let longFormat;
	try {
		longFormat = icnconverter.ShortToLong_Format(content);
	} catch {
		return 'invalid_icn';
	}
	if (longFormat.position === undefined || longFormat.state_global.specialRights === undefined) {
		return 'icn_missing_position';
	}
	const variantOptions = icnimport.variantOptionsFromLongFormat(longFormat, { fullMove: 1 });
	return validatePosition(variantOptions, content);
}

/** Localizes a position/ICN error code for the websocket's `notify` channel. */
function localizePositionError(code: IcnSeekErrorCode, ws: CustomWebSocket): string {
	const shared = getScriptTranslationsForReq('shared', ws);
	return shared.position_errors[code] ?? code;
}

export { createSeek, createseekschem };
