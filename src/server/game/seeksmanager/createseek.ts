// src/server/game/seeksmanager/createseek.ts

/**
 * This script handles seek creation, making sure that the seeks have valid properties.
 */

import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { CreateSeekMessage } from '../../../shared/serverbound.js';
import type { MetaData, Rating, SeekVariant, AuthSeekVariant } from '../../../shared/domain.js';

import uuid from '../../../shared/util/uuid.js';
import icnimport from '../../../shared/chess/logic/icn/icnimport.js';
import variantcache from '../../../shared/chess/variants/variantcache.js';
import icnconverter from '../../../shared/chess/logic/icn/icnconverter.js';
import variantreader from '../../../shared/chess/variants/variantreader.js';
import variantregistry from '../../../shared/chess/variants/variantregistry.js';
import { IDLengthOfSeeks } from '../../../shared/domain.js';
import { POSITION_STRING_THRESHOLD } from '../../../shared/chess/variants/servervalidation.js';
import compression, { CompressionMode } from '../../../shared/util/compression.js';
import {
	Leaderboards,
	VariantLeaderboards,
} from '../../../shared/chess/variants/validleaderboard.js';
import {
	validatePosition,
	PositionErrorCode,
} from '../../../shared/chess/variants/positionvalidation.js';

import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { getSavedPositionICN } from '../../database/editorSavesManager.js';
import { isSocketInAnActiveGame } from '../gamemanager/activeplayers.js';
import { getEloOfPlayerInLeaderboard } from '../../database/leaderboardsManager.js';
import { AuthSeek, buildServerUsernameContainer } from './seekutility.js';
import { existingSeekHasID, deleteUsersExistingSeek, addSeek } from './lobbymanager.js';

// Types -------------------------------------------------------------------------------

/** Codes returned by {@link validateIcnSeekContent}; superset of {@link PositionErrorCode}. */
type IcnSeekErrorCode =
	| PositionErrorCode
	| 'invalid_icn'
	| 'icn_missing_position'
	| 'icn_contains_moves'
	| 'no_4d_movement';

// Constants ---------------------------------------------------------------------------

/**
 * The only metadata a custom seek's ICN may carry: the tags declaring which variant, at which
 * revision of it, its position was sourced from. Everything else is rejected — the seek's ICN
 * is served verbatim to lobby viewers by the seek-preview endpoint.
 */
const PERMITTED_SEEK_METADATA: ReadonlySet<string> = new Set<keyof MetaData>([
	'Variant',
	'UTCDate',
	'UTCTime',
]);

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
 * @returns `null` if the ICN is legal, or an {@link IcnSeekErrorCode} describing the failure.
 */
function validateIcnSeekContent(content: string): IcnSeekErrorCode | null {
	let longFormat;
	try {
		longFormat = icnconverter.ShortToLong_Format(content);
	} catch {
		return 'invalid_icn';
	}
	const metadataError = validateSeekMetadata(longFormat.metadata);
	if (metadataError !== null) return metadataError;
	if (longFormat.position === undefined || longFormat.state_global.specialRights === undefined) {
		return 'icn_missing_position';
	}
	// A behaving client should always flatten their moves into a single position before seeking.
	if (longFormat.moves && longFormat.moves.length > 0) return 'icn_contains_moves';
	const variantOptions = icnimport.variantOptionsFromLongFormat(longFormat, { fullMove: 1 });
	return validatePosition(variantOptions, content);
}

/**
 * Validates a custom seek ICN's metadata: only the {@link PERMITTED_SEEK_METADATA} tags may be
 * present, and any variant they declare must be a real one that doesn't move its pieces
 * differently. A seek carries only a position + gamerules, so a variant with custom piece
 * movement (4D) would not play as the name it declares promises.
 */
function validateSeekMetadata(metadata: MetaData): IcnSeekErrorCode | null {
	if (Object.keys(metadata).some((key) => !PERMITTED_SEEK_METADATA.has(key)))
		return 'invalid_icn';
	if (metadata.Variant === undefined) return null;
	const code = variantregistry.resolveVariantCode(metadata.Variant);
	if (code === undefined) return 'invalid_icn';
	// Every variant module is preloaded at server startup.
	if (variantreader.hasCustomMovement(variantcache.getModule(code))) return 'no_4d_movement';
	return null;
}

/** Localizes a position/ICN error code for the websocket's `notify` channel. */
function localizePositionError(code: IcnSeekErrorCode, ws: CustomWebSocket): string {
	return ws.t.shared.position_errors[code] ?? code;
}

export { createSeek };
