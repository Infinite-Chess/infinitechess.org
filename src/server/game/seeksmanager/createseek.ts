// src/server/game/seeksmanager/createseek.ts

/**
 * This script handles seek creation, making sure that the seeks have valid properties.
 */

import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { Rating, SeekVariant, AuthSeekVariant } from '../../../shared/types.js';

import * as z from 'zod';

import uuid from '../../../shared/util/uuid.js';
import clockutil from '../../../shared/chess/util/clockutil.js';
import icnimport from '../../../shared/chess/logic/icn/icnimport.js';
import icnconverter from '../../../shared/chess/logic/icn/icnconverter.js';
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
	SeekVariantSchema,
	SeekModifierSchema,
	TimeControlSchema,
	GameModeSchema,
} from '../../../shared/types.js';

import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { getSavedPositionICN } from '../../database/editorSavesManager.js';
import { isSocketInAnActiveGame } from '../gamemanager/activeplayers.js';
import { getEloOfPlayerInLeaderboard } from '../../database/leaderboardsManager.js';
import { AuthSeek, buildServerUsernameContainer } from './seekutility.js';
import {
	existingSeekHasID,
	deleteUsersExistingSeek,
	addSeek,
	IDLengthOfSeeks,
} from './lobbymanager.js';

// Types -------------------------------------------------------------------------------

/** Codes returned by {@link validateIcnSeekContent}; superset of {@link PositionErrorCode}. */
type IcnSeekErrorCode =
	| PositionErrorCode
	| 'invalid_icn'
	| 'icn_missing_position'
	| 'icn_contains_moves';

// Schemas ---------------------------------------------------------------------------

export type CreateSeekMessage = z.infer<typeof createseekschem>;
/** The zod schema for validating the contents of the createseek message. */
const createseekschem = z
	.strictObject({
		tag: z.string().length(8),
		variant: SeekVariantSchema,
		time: TimeControlSchema.refine((c) => clockutil.isTimedControlValid(c), {
			error: 'Invalid clock value.',
		}),
		color: z.literal([p.WHITE, p.BLACK, null]),
		mode: GameModeSchema,
		modifiers: z.array(SeekModifierSchema).max(SeekModifierSchema.options.length),
	})
	.refine(
		(val) =>
			val.mode !== 'rated' || isRatedAllowed(val.variant, val.time, val.color, val.modifiers),
		{ error: 'Invalid seek parameters for a rated game.' },
	);

// Functions -------------------------------------------------------------------------

/**
 * Creates a new seek from their websocket message.
 * @param ws - Their socket
 * @param messageContents - The incoming socket message that SHOULD contain the seek properties!
 */
async function createSeek(ws: CustomWebSocket, messageContents: CreateSeekMessage): Promise<void> {
	if (isSocketInAnActiveGame(ws)) {
		// Can't create seek because they are already in a game
		return sendSocketMessage(ws, 'general', 'notify', ws.t.responses.seeks.already_in_game);
	}

	// Reject rated seeks from signed-out users
	if (messageContents.mode === 'rated' && !ws.metadata.memberInfo.signedIn) {
		sendSocketMessage(ws, 'general', 'notify', ws.t.responses.seeks.rated_requires_signin);
		return;
	}

	try {
		const seek = await getSeekFromWebsocketMessageContents(ws, messageContents);
		if (!seek) return; // Message contained invalid seek parameters. Error already sent to the client.

		// Replace any existing seek this user owns — the subsequent addSeek() broadcasts the new state.
		deleteUsersExistingSeek(ws.metadata.memberInfo, { broadCastNewSeeks: false });

		addSeek(seek);
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
 * @throws If a database error occurs (from {@link getEloOfPlayerInLeaderboard} or {@link getSavedPositionICN}).
 */
async function getSeekFromWebsocketMessageContents(
	ws: CustomWebSocket,
	messageContents: CreateSeekMessage,
): Promise<AuthSeek | void> {
	// Verify their seek contains the required properties...

	let id: string;
	do {
		id = uuid.generateID_Base36(IDLengthOfSeeks);
	} while (existingSeekHasID(id));

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

	const player = buildServerUsernameContainer(owner, rating);

	const variant = await resolveAndValidateVariant(ws, messageContents.variant);
	if (variant === null) return; // Invalid variant; error already sent to the client.

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
 * Resolves a seek/engine-game variant to a legal {@link AuthSeekVariant}: expands a cloudSave
 * to its stored ICN and validates a custom position's legality. Sends the client an error and
 * returns `null` on any failure. Shared by seek creation and engine-game creation.
 * @throws If a database error occurs.
 */
export async function resolveAndValidateVariant(
	ws: CustomWebSocket,
	variant: SeekVariant,
): Promise<AuthSeekVariant | null> {
	const owner = ws.metadata.memberInfo;

	// Resolve cloudSave variants to plain ICN.
	let resolved: AuthSeekVariant;
	if (variant.kind === 'cloudSave') {
		// cloudSave variants require the user to be signed in (cloud saves belong to an account).
		if (!owner.signedIn) {
			sendSocketMessage(ws, 'general', 'notifyerror', ws.t.responses.seeks.cloud_requires_sign_in); // prettier-ignore
			return null;
		}
		const record = getSavedPositionICN(variant.name, owner.user_id);
		if (record === undefined) {
			sendSocketMessage(ws, 'general', 'notifyerror', ws.t.responses.seeks.cloud_not_found);
			return null;
		}
		// Skip decompression if the compressed payload is already too large to be legal.
		if (record.icn.length > POSITION_STRING_THRESHOLD) {
			sendSocketMessage(ws, 'general', 'notify', localizePositionError('position_too_large', ws)); // prettier-ignore
			return null;
		}
		const position = await compression.decompressString(
			record.icn,
			record.compression as CompressionMode,
		);
		resolved = { kind: 'custom', position };
	} else {
		resolved = variant;
	}

	// Validate the resolved ICN's position is legal.
	if (resolved.kind === 'custom') {
		const illegalReason = validateIcnSeekContent(resolved.position);
		if (illegalReason !== null) {
			sendSocketMessage(ws, 'general', 'notify', localizePositionError(illegalReason, ws));
			return null;
		}
	}

	return resolved;
}

/**
 * Parses an ICN seek's content and runs position legality checks.
 * Also used by websocket engine-game creation.
 * @returns `null` if the ICN is legal, or an {@link IcnSeekErrorCode} describing the failure.
 */
export function validateIcnSeekContent(content: string): IcnSeekErrorCode | null {
	let longFormat;
	try {
		longFormat = icnconverter.ShortToLong_Format(content);
	} catch {
		return 'invalid_icn';
	}
	if (longFormat.position === undefined || longFormat.state_global.specialRights === undefined) {
		return 'icn_missing_position';
	}
	// A behaving client should always flatten their moves into a single position before seeking.
	if (longFormat.moves && longFormat.moves.length > 0) return 'icn_contains_moves';
	const variantOptions = icnimport.variantOptionsFromLongFormat(longFormat, { fullMove: 1 });
	return validatePosition(variantOptions, content);
}

/** Localizes a position/ICN error code for the websocket's `notify` channel. */
function localizePositionError(code: IcnSeekErrorCode, ws: CustomWebSocket): string {
	return ws.t.shared.position_errors[code] ?? code;
}

export { createSeek, createseekschem };
