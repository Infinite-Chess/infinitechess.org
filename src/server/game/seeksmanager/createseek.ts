// src/server/game/seeksmanager/createseek.ts

/**
 * Handles the `createseek` lobby action: validating a client's proposed terms
 * — variant, position, time control — before their seek is offered to the lobby.
 *
 * The gatekeeper for what may be played: a custom ICN position is parsed and judged
 * here, for engine games too. Accepted seeks are handed to `activeseeks.ts`.
 */

import type { AuthSeek } from './seekutility.js';
import type { SeekVariant } from '../../../shared/chess/variants/variantselection.js';
import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { MetaData, Rating } from '../../../shared/chess/util/metadatautil.js';
import type { CreateSeekMessage } from '../../../shared/serverbound.js';

import uuid from '../../../shared/util/uuid.js';
import icnimport from '../../../shared/chess/logic/icn/icnimport.js';
import variantcache from '../../../shared/chess/variants/variantcache.js';
import icnconverter from '../../../shared/chess/logic/icn/icnconverter.js';
import metadatautil from '../../../shared/chess/util/metadatautil.js';
import variantreader from '../../../shared/chess/logic/variantreader.js';
import gameformulator from '../../../shared/chess/game/gameformulator.js';
import variantregistry from '../../../shared/chess/variants/variantregistry.js';
import { SEEK_ID_LENGTH } from '../../../shared/domain.js';
import { MAX_SERVER_VALIDATABLE_POSITION_LENGTH } from '../../../shared/chess/variants/servervalidation.js';
import {
	Leaderboards,
	getLeaderboardOfVariant,
} from '../../../shared/chess/variants/validleaderboard.js';
import {
	PositionRejection,
	validatePosition,
	localizeRejection,
	getPlayabilityRejection,
} from '../../../shared/chess/game/positionvalidation.js';

import socketsend from '../../socket/socketSend.js';
import activeseeks from './activeseeks.js';
import activeplayers from '../gamemanager/activeplayers.js';
import memberinfoutil from '../../utility/memberinfoutil.js';
import leaderboardsManager from '../../database/leaderboardsManager.js';

// Functions -------------------------------------------------------------------------------------

/**
 * Creates a new seek from their websocket message.
 * @param ws - Their socket
 * @param messageContents - The incoming socket message that SHOULD contain the seek properties!
 */
function create(ws: CustomWebSocket, messageContents: CreateSeekMessage): void {
	if (activeplayers.hasSocket(ws)) {
		// Can't create seek because they are already in a game
		return socketsend.send(ws, 'general', 'notify', ws.t.responses.seeks.already_in_game);
	}

	// Reject rated seeks from signed-out users
	if (messageContents.mode === 'rated' && !ws.metadata.memberInfo.signedIn) {
		socketsend.send(ws, 'general', 'notify', ws.t.responses.seeks.rated_requires_signin);
		return;
	}

	try {
		const seek = getSeekFromWebsocketMessageContents(ws, messageContents);
		if (!seek) return; // Message contained invalid seek parameters. Error already sent to the client.

		// Replace any existing seek this user owns — the subsequent add() broadcasts the new state.
		activeseeks.deleteOfUser(ws.metadata.memberInfo, { dontBroadcast: true });

		activeseeks.add(seek);
	} catch {
		// DB error (already logged)
		socketsend.send(ws, 'general', 'notifyerror', ws.t.responses.errors.server_error);
	}
}

/**
 * Builds an {@link AuthSeek} from the client's createseek message, validating its position.
 * Returns `void` after sending an error to the client if any check fails.
 * @throws If a database error occurs (from {@link leaderboardsManager.getEloOfPlayer}).
 */
function getSeekFromWebsocketMessageContents(
	ws: CustomWebSocket,
	messageContents: CreateSeekMessage,
): AuthSeek | void {
	// Verify their seek contains the required properties...

	let id: string;
	do {
		id = uuid.generateID_Base36(SEEK_ID_LENGTH);
	} while (activeseeks.hasID(id));

	const owner = ws.metadata.memberInfo;

	let rating: Rating | undefined;
	if (ws.metadata.memberInfo.signedIn) {
		// Fallback to the elo on the INFINITY leaderboard, if the variant does not have a leaderboard.
		const leaderboardId =
			getLeaderboardOfVariant(messageContents.variant) ?? Leaderboards.INFINITY;
		rating = leaderboardsManager.getEloOfPlayer(ws.metadata.memberInfo.user_id, leaderboardId);
	}

	const player = memberinfoutil.buildServerUsernameContainer(owner, rating);

	// Invalid variant; error already sent to the client.
	if (!validateVariant(ws, messageContents.variant, false)) return;

	return {
		id,
		owner,
		player,
		variant: messageContents.variant,
		time: messageContents.time,
		mode: messageContents.mode,
		color: messageContents.color,
		modifiers: messageContents.modifiers,
	};
}

/**
 * Whether a seek/engine-game variant may be played: a custom position must be legal and playable.
 * Sends the client an error on failure. Shared by seek creation and engine-game creation.
 * @param engineGame - Whether the engine will be the opponent. Its position is then judged on
 * the engine's board, and additionally on whether the engine can play it at all.
 */
function validateVariant(ws: CustomWebSocket, variant: SeekVariant, engineGame: boolean): boolean {
	if (variant.kind !== 'custom') return true;
	const rejection = validateIcnSeekContent(variant.position, engineGame);
	if (rejection === null) return true;
	socketsend.send(ws, 'general', 'notify', localizeRejection(ws.t, rejection));
	return false;
}

/**
 * Parses an ICN seek's content and runs the position legality and playability checks.
 * @param engineGame - See {@link validateVariant}.
 * @returns `null` if the ICN may be played, or the {@link PositionRejection} refusing it.
 */
function validateIcnSeekContent(content: string, engineGame: boolean): PositionRejection | null {
	// Cheap pre-filter that bounds the parsing work. validatePosition re-checks below.
	if (content.length > MAX_SERVER_VALIDATABLE_POSITION_LENGTH) {
		return { kind: 'position', code: 'position_too_large' };
	}
	let longFormat;
	try {
		longFormat = icnconverter.ShortToLong_Format(content);
	} catch {
		return { kind: 'position', code: 'invalid_icn' };
	}
	const metadataRejection = validateSeekMetadata(longFormat.metadata);
	if (metadataRejection !== null) return metadataRejection;
	if (longFormat.position === undefined || longFormat.state_global.specialRights === undefined) {
		return { kind: 'position', code: 'icn_missing_position' };
	}
	// A behaving client should always flatten their moves into a single position before seeking.
	if (longFormat.moves && longFormat.moves.length > 0) {
		return { kind: 'position', code: 'icn_contains_moves' };
	}
	const variantOptions = icnimport.variantOptionsFromLongFormat(longFormat, { fullMove: 1 });
	const positionError = validatePosition(variantOptions, content); // Re-checks position length. Intended, this isn't a pre-check.
	if (positionError !== null) return { kind: 'position', code: positionError };

	// Legal, but the game still has to be playable from here. Built on the board the real game
	// gets — the ICN's own world border, which an engine game must carry — then discarded.
	const constructed = gameformulator.constructPosition(variantOptions);
	return getPlayabilityRejection(constructed, { seek: true, engine: engineGame });
}

/**
 * Validates a custom seek ICN's metadata: only the source-variant tags may be present — everything
 * else is rejected, since the seek's ICN is served verbatim to lobby viewers by the seek-preview
 * endpoint. Any variant they declare must also be a real one that doesn't move its pieces
 * differently: a seek carries only a position + gamerules, so a variant with custom piece
 * movement (4D) would not play as the name it declares promises.
 */
function validateSeekMetadata(metadata: MetaData): PositionRejection | null {
	const permitted: readonly string[] = metadatautil.SOURCE_VARIANT_METADATA;
	if (Object.keys(metadata).some((key) => !permitted.includes(key)))
		return { kind: 'position', code: 'invalid_icn' };
	if (metadata.Variant === undefined) return null;
	const code = variantregistry.resolveVariantCode(metadata.Variant);
	if (code === undefined) return { kind: 'position', code: 'invalid_icn' };
	// Every variant module is preloaded at server startup.
	if (variantreader.hasCustomMovement(variantcache.getModule(code))) {
		return { kind: 'position', code: 'no_4d_movement' };
	}
	return null;
}

// Exports ---------------------------------------------------------------------------------------

export default {
	create,
	validateVariant,
};
