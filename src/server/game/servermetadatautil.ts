// src/server/game/servermetadatautil.ts

/**
 * Server-side helpers for building ICN game metadata.
 */

import type { VariantCode } from '../../shared/chess/variants/variantdictionary.js';
import type { MetaData, TimeControl } from '../../shared/types.js';

import uuid from '../../shared/util/uuid.js';
import variant from '../../shared/chess/variants/variant.js';
import timeutil from '../../shared/util/timeutil.js';

// Types --------------------------------------------------------------------------

/** Per-player inputs for {@link buildGameMetadata}. */
export interface PlayerMetaInput {
	/** Display name — the player's username, or {@link GUEST_NAME_ICN_METADATA} for unauthenticated players. */
	name: string;
	/** User ID, present only for signed-in players. */
	id?: number;
	/** Already-formatted elo string (e.g. `'1434'` or `'1500?'`), present only for signed-in players. */
	elo?: string;
}

// Functions -----------------------------------------------------------------------

/**
 * Builds a {@link MetaData} object from the common game properties.
 * Metadata is always in English.
 * @param rated - Whether the game is rated.
 * @param variantCode - The variant code (NOT the English translation).
 * @param clock - The time-control string.
 * @param utcTimestamp - The epoch-ms timestamp used for the `UTCDate`/`UTCTime` fields.
 * @param white - Identity information for the White player.
 * @param black - Identity information for the Black player.
 */
function buildGameMetadata(
	rated: boolean,
	variantCode: VariantCode,
	clock: TimeControl,
	utcTimestamp: number,
	white: PlayerMetaInput,
	black: PlayerMetaInput,
): MetaData {
	const variantEnglishName = variant.getVariantName(variantCode);
	const RatedOrCasual = rated ? 'Rated' : 'Casual';
	const { UTCDate, UTCTime } = timeutil.convertTimestampToUTCDateUTCTime(utcTimestamp);

	const gameMetadata: MetaData = {
		Event: `${RatedOrCasual} ${variantEnglishName} infinite chess game`,
		Site: 'https://www.infinitechess.org/',
		Round: '-',
		Variant: variantEnglishName,
		White: white.name,
		Black: black.name,
		TimeControl: clock,
		UTCDate,
		UTCTime,
	};
	if (white.id !== undefined) {
		gameMetadata.WhiteID = uuid.base10ToBase62(white.id);
		if (white.elo !== undefined) gameMetadata.WhiteElo = white.elo;
	}
	if (black.id !== undefined) {
		gameMetadata.BlackID = uuid.base10ToBase62(black.id);
		if (black.elo !== undefined) gameMetadata.BlackElo = black.elo;
	}
	return gameMetadata;
}

// Exports -----------------------------------------------------------------------

export default {
	buildGameMetadata,
};
