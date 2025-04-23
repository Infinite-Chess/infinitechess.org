
/**
 * This script takes an ICN, or a compressed abridged gamefile, and constructs a full gamefile from them.
 */


import icnconverter from '../../chess/logic/icn/icnconverter.js';
// @ts-ignore
import gamefile from '../../chess/logic/gamefile.js';

import type { VariantOptions } from './gameslot.js';
import type { MetaData } from '../../chess/util/metadata.js';
import type { _Move_In, LongFormatIn } from '../../chess/logic/icn/icnconverter.js';
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

/** The game JSON format the formatconvert returns from ShortToLong_Format(). */
interface FormatConverterLong {
	metadata: MetaData,
	startingPosition: Map<CoordsKey, number>,
	/** A position in ICN notation (e.g. `"P1,2+|P2,2+|..."`) */
	shortposition?: string,
	fullMove: number,
	/** DOES NOT CONTAIN moveRule!!!! */
	gameRules: GameRules,
	moves: string[],
	// The 3 global game states
	specialRights: Set<CoordsKey>,
	moveRuleState?: number,
	enpassant?: Coords,
}

/**
 * Converts an ICN directly to a gamefile.
 * Throws an error in these cases:
 * * Invalid format or enpassant square
 * * Game contains an illegal move
 */
function ICNToGamefile(ICN: string): gamefile {
	const longformat: FormatConverterLong = icnconverter.ShortToLong_Format(ICN);

	const variantOptions: VariantOptions = {
		fullMove: longformat.fullMove,
		startingPosition: longformat.startingPosition,
		state_global: {
			specialRights: longformat.specialRights,
			// ACTUALLY, WE SHOULD NEVER expect an enpassant property in the starting position of ANY game log! No variant starts with enpassant possible.
			// enpassant: longformat.enpassant,
			moveRuleState: longformat.moveRuleState,
		},
		gameRules: longformat.gameRules
	};

	// If the variant has been translated, the variant metadata needs to be converted from language-specific to internal game code else keep it the same
	// EXPECT THE ICN'S Variant metadata to be the variant code!
	longformat.metadata.Variant = convertVariantFromSpokenLanguageToCode(longformat.metadata.Variant) || longformat.metadata.Variant;

	/**
	 * This automatically forwards all moves to the front of the game.
	 * It will throw an Error if there's any move with a startCoords that doesn't have any piece on it!
	 * Some illegal moves may pass, but those aren't what we care about. We care about crashing moves!
	 */
	return new gamefile(longformat.metadata, { moves: longformat.moves, variantOptions });
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