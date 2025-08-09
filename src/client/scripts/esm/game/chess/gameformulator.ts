
/**
 * This script takes an ICN, or a compressed abridged gamefile, and constructs a full gamefile from them.
 */


import gamefile from '../../chess/logic/gamefile.js';
import icnconverter from '../../chess/logic/icn/icnconverter.js';
import variant from '../../chess/variants/variant.js';
import { CoordsKey } from '../../chess/util/coordutil.js';
import { ServerGameMoveMessage } from '../../../../../server/game/gamemanager/gameutility.js';

import type { FullGame } from '../../chess/logic/gamefile.js';
import type { VariantOptions } from '../../chess/logic/initvariant.js';
import type { _Move_In, LongFormatIn, LongFormatOut } from '../../chess/logic/icn/icnconverter.js';



/**
 * Formulates a whole gamefile from a smaller simpler abridged one.
 * @param longformIn - The return value of gamecompressor.compressGamefile()
 */
function formulateGame(longformIn: LongFormatIn): FullGame {

	if (longformIn.position === undefined || longformIn.state_global.specialRights === undefined) {
		throw Error('Invalid longformIn when formulating game: Missing position or special rights.');
	}

	/** String array of the moves in their most compact notation (e.g. "4,7>4,8Q") */
	const moves: ServerGameMoveMessage[] = longformIn.moves?.map((m: _Move_In) => {
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
		}
	};

	return gamefile.initFullGame(longformIn.metadata, {variantOptions, moves});
}

/**
 * Converts an ICN directly to a gamefile.
 * Throws an error in these cases:
 * * Invalid format or enpassant square
 * * Game contains an illegal move
 */
function ICNToGamefile(ICN: string): FullGame {
	const longformOut: LongFormatOut = icnconverter.ShortToLong_Format(ICN);

	let position: Map<CoordsKey, number>;
	let specialRights: Set<CoordsKey>;

	if (longformOut.position && longformOut.state_global.specialRights) {
		position = longformOut.position;
		specialRights = longformOut.state_global.specialRights;
	} else {
		({ position, specialRights } = variant.getStartingPositionOfVariant(longformOut.metadata));
	}

	const variantOptions: VariantOptions = {
		gameRules: longformOut.gameRules,
		fullMove: longformOut.fullMove,
		position,
		state_global: {
			specialRights,
			enpassant: longformOut.state_global.enpassant,
			moveRuleState: longformOut.state_global.moveRuleState,
		}
	};

	// If the variant has been translated, the variant metadata needs to be converted from language-specific to internal game code else keep it the same
	// EXPECT THE ICN'S Variant metadata to be the variant code!
	longformOut.metadata.Variant = convertVariantFromSpokenLanguageToCode(longformOut.metadata.Variant) || longformOut.metadata.Variant;

	// Convert the LongFormatOut's moves into the gamefile's constructor's moves form
	const moves: ServerGameMoveMessage[] = longformOut.moves?.map(m => {
		const move: ServerGameMoveMessage = { compact: m.compact };
		if (m.clockStamp !== undefined) move.clockStamp = m.clockStamp;
		// Potentially also transfer the pasted comments into the gamefile here in the future!
		// ...
		return move;
	}) ?? [];

	/**
	 * This automatically forwards all moves to the front of the game.
	 * It will throw an Error if there's any move with a startCoords that doesn't have any piece on it!
	 * Some illegal moves may pass, but those aren't what we care about. We care about crashing moves!
	 */
	return gamefile.initFullGame(longformOut.metadata, {variantOptions, moves});
}

function convertVariantFromSpokenLanguageToCode(Variant?: string) {
	// Iterate through all translations until we find one that matches this name
	for (const translationCode in translations) {
		if (translations[translationCode] === Variant) {
			return translationCode;
		}
	}
	// Else the variant is probably already the code!
	return Variant;
}

export default {
	formulateGame,
	ICNToGamefile,
	convertVariantFromSpokenLanguageToCode,
};