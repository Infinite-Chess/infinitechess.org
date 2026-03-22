// src/client/scripts/esm/game/chess/clientmetadatautil.ts

/**
 * Client-side helpers for building and parsing ICN game metadata.
 */

import type { MetadataKey } from '../../../../../shared/chess/util/metadatautil.js';
import type { Condition, GameConclusion } from '../../../../../shared/chess/util/winconutil.js';
import type { MetaData, Rating, TimeControl } from '../../../../../shared/types.js';

import * as z from 'zod';

import timeutil from '../../../../../shared/util/timeutil.js';
import winconutil from '../../../../../shared/chess/util/winconutil.js';
import { players as p } from '../../../../../shared/chess/util/typeutil.js';

// Constants -----------------------------------------------------------------------

/**
 * The hardcoded English string used in ICN metadata to represent the human player
 * in engine and board-editor games. Metadata must always be in English.
 */
const YOU_NAME_ICN_METADATA = '(You)' as const;

// Functions -----------------------------------------------------------------------

/**
 * Resolves a timestamp (ms since epoch) from UTCDate and UTCTime metadata strings.
 * Falls back to the current time if UTCDate is not provided.
 * If UTCDate is provided but UTCTime is not, midnight (00:00:00) is assumed.
 */
function resolveTimestampFromMetadata(UTCDate?: string, UTCTime?: string): number {
	if (UTCDate !== undefined) {
		return timeutil.convertUTCDateUTCTimeToTimeStamp(UTCDate, UTCTime);
	}
	return Date.now();
}

/**
 * Builds a {@link MetaData} object for client-side games (local, engine, board editor).
 * Automatically populates `Site`, `Round`, `UTCDate`, and `UTCTime`.
 * @param event - The `Event` string describing the game.
 * @param timeControl - The time control string (e.g. `"600+5"`), or `"-"` for untimed.
 * @param utcTimestamp - The epoch-ms timestamp used for the `UTCDate`/`UTCTime` fields.
 */
function buildBaseGameMetadata(
	event: string,
	timeControl: TimeControl,
	utcTimestamp: number,
): MetaData {
	const { UTCDate, UTCTime } = timeutil.convertTimestampToUTCDateUTCTime(utcTimestamp);
	return {
		Event: event,
		Site: 'https://www.infinitechess.org/',
		Round: '-',
		TimeControl: timeControl,
		UTCDate,
		UTCTime,
	};
}

/**
 * Helper function that uses generics to link the metadata key to its value type.
 * Inside the function typescript doesn't error when we are transferring the property.
 */
function copyMetadataField<K extends MetadataKey>(
	target: MetaData,
	source: MetaData,
	key: K,
): void {
	// TS knows that target[key] and source[key] have the same type: MetaData[K]
	target[key] = source[key];
}

/** Calculates the game conclusion from the Result metadata and termination CODE. */
function getGameConclusionFromResultAndTermination(
	result: string,
	termination: Condition,
): GameConclusion {
	// prettier-ignore
	const victor =
		result === '1-0' ? p.WHITE :
		result === '0-1' ? p.BLACK :
		result === '1/2-1/2' ? null :
		result === '*' ? undefined :
		((): never => { throw Error(`Unsupported result (${result})!`); })();

	const gameConclusion: any = { condition: termination };
	// Only attach victor if it is defined
	if (victor !== undefined) gameConclusion.victor = victor;

	// Make sure it's type safe
	const parseResult = winconutil.gameConclusionSchema.safeParse(gameConclusion);
	if (!parseResult.success)
		throw new Error(
			`When parsing GameConclusion from metadata, condition "${termination}" and victor "${victor}" is an invalid combination. ZodError: ${z.prettifyError(parseResult.error)}`,
		);
	return parseResult.data;
}

/**
 * Parses the elo and confidence from WhiteElo/BlackElo metadata.
 * ONLY HAS AS MUCH PRECISION as what's in the metadata.
 * DOES NOT KNOW whether their current rating is now confident, if thir WhiteElo/BlackElo was not confident.
 */
function getRatingFromWhiteBlackElo(whiteBlackElo: string): Rating {
	const [elo, emptyStr] = whiteBlackElo.split('?'); // emptyStr will be '' if the '?' is present, otherwise it will be undefined.
	return {
		value: Number(elo),
		confident: emptyStr === undefined,
	};
}

// Exports -----------------------------------------------------------------------

export default {
	YOU_NAME_ICN_METADATA,
	resolveTimestampFromMetadata,
	buildBaseGameMetadata,
	copyMetadataField,
	getGameConclusionFromResultAndTermination,
	getRatingFromWhiteBlackElo,
};
