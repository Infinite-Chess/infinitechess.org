
/**
 * This script takes an ICN, or a compressed abridged gamefile, and constructs a full gamefile from them.
 */


import icnconverter from '../../chess/logic/icn/icnconverter.js';
// @ts-ignore
import gamefile from '../../chess/logic/gamefile.js';

import type { VariantOptions } from './gameslot.js';
import type { MetaData } from '../../chess/util/metadata.js';
import type { _Move_In, LongFormatIn, LongFormatOut } from '../../chess/logic/icn/icnconverter.js';
// @ts-ignore
import type { GameRules } from '../../chess/variants/gamerules.js';


/**
 * Formulates a whole gamefile from a smaller simpler abridged one.
 * @param longformIn - The return value of gamecompressor.compressGamefile()
 */
function formulateGame(longformIn: LongFormatIn) {

	/** String array of the moves in their most compact notation (e.g. "4,7>4,8Q") */
	const moves: string[] = longformIn.moves?.map((m: _Move_In) => m.compact) ?? [];

	const variantOptions: VariantOptions = {
		fullMove: longformIn.fullMove,
		gameRules: longformIn.gameRules,
		startingPosition: longformIn.position,
		state_global: longformIn.state_global,
	};

	return new gamefile(longformIn.metadata, { moves, variantOptions });
}

/**
 * Converts an ICN directly to a gamefile.
 * Throws an error in these cases:
 * * Invalid format or enpassant square
 * * Game contains an illegal move
 */
function ICNToGamefile(ICN: string): gamefile {
	const longformOut: LongFormatOut = icnconverter.ShortToLong_Format(ICN);

	const variantOptions: VariantOptions = {
		gameRules: longformOut.gameRules,
		fullMove: longformOut.fullMove,
		startingPosition: longformOut.position,
		state_global: longformOut.state_global,
	};

	// If the variant has been translated, the variant metadata needs to be converted from language-specific to internal game code else keep it the same
	// EXPECT THE ICN'S Variant metadata to be the variant code!
	longformOut.metadata.Variant = convertVariantFromSpokenLanguageToCode(longformOut.metadata.Variant) || longformOut.metadata.Variant;

	// TEMPORARY: Convert he LongFormatOut's moves into the gamefile's constructor's move's format's form's form for fo
	const moves: string[] = longformOut.moves?.map(m => m.compact) ?? [];

	/**
	 * This automatically forwards all moves to the front of the game.
	 * It will throw an Error if there's any move with a startCoords that doesn't have any piece on it!
	 * Some illegal moves may pass, but those aren't what we care about. We care about crashing moves!
	 */
	return new gamefile(longformOut.metadata, { moves, variantOptions });
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

export type {
	FormatConverterLong
};