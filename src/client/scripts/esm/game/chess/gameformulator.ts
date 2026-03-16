// src/client/scripts/esm/game/chess/gameformulator.ts

/**
 * This script takes an ICN, or a compressed abridged gamefile, and constructs a full gamefile from them.
 */

import type { FullGame } from '../../../../../shared/chess/logic/gamefile.js';
import type { VariantOptions } from '../../../../../shared/chess/logic/initvariant.js';
import type { _Move_In, LongFormatIn } from '../../../../../shared/chess/logic/icn/icnconverter.js';

import variant from '../../../../../shared/chess/variants/variant.js';
import gamefile from '../../../../../shared/chess/logic/gamefile.js';
import metadatautil from '../../../../../shared/chess/util/metadatautil.js';

import { ServerGameMoveMessage } from '../../../../../server/game/gamemanager/gameutility.js';

/**
 * Formulates a whole gamefile from a smaller simpler abridged one.
 * @param longformIn - The return value of gamecompressor.compressGamefile()
 * @param validateMoves - Optional flag to validate move legality during formulation, throwing an error if any move is illegal.
 */
function formulateGame(longformIn: LongFormatIn, validateMoves?: true): FullGame {
	if (longformIn.position === undefined || longformIn.state_global.specialRights === undefined) {
		throw Error(
			'Invalid longformIn when formulating game: Missing position or special rights.',
		);
	}

	/** String array of the moves in their most compact notation (e.g. "4,7>4,8Q") */
	const moves: ServerGameMoveMessage[] =
		longformIn.moves?.map((m: _Move_In) => {
			const move = { compact: m.compact };
			if (m.compact) move.compact = m.compact;
			return move;
		}) ?? [];

	const variantOptions: VariantOptions = {
		fullMove: longformIn.fullMove,
		gameRules: longformIn.gameRules,
		position: longformIn.position!,
		state_global: {
			specialRights: longformIn.state_global.specialRights,
			enpassant: longformIn.state_global.enpassant,
			moveRuleState: longformIn.state_global.moveRuleState,
		},
	};

	const resolvedTimestamp = metadatautil.resolveTimestampFromMetadata(
		longformIn.metadata.UTCDate,
		longformIn.metadata.UTCTime,
	);
	const resolvedVariant = variant.resolveVariantCode(longformIn.metadata.Variant);

	return gamefile.initFullGame(
		longformIn.metadata,
		resolvedTimestamp,
		resolvedVariant,
		{ variantOptions, moves },
		validateMoves,
	);
}

export default {
	formulateGame,
};
