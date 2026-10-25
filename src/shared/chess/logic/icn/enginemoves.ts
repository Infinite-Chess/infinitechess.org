// src/shared/chess/logic/icn/enginemoves.ts

/**
 * Reads the moves the engine hands back as the site's compact ICN tokens.
 */

import type { WasmMove } from '../../util/engineglue.js';
import type { Player, RawType } from '../../util/typeutil.js';

import icnposition from './icnposition.js';
import typeutil, { rawTypes as r } from '../../util/typeutil.js';

// Constants -------------------------------------------------------------------

/**
 * Apeiron's own single-letter piece codes (its `PieceType::to_str()`, src/board.rs), which
 * it uses for the `promotion` field of the moves it hands back. They are arbitrary engine
 * identifiers — not derivable from the site's abbreviations — so the mapping lives here,
 * while the abbreviations themselves stay owned by icnconverter's `PIECE_CODES`.
 */
const ENGINE_PROMOTION_RAWTYPES: Record<string, RawType> = {
	k: r.KING, p: r.PAWN, n: r.KNIGHT, b: r.BISHOP,
	r: r.ROOK, q: r.QUEEN, m: r.AMAZON, h: r.HAWK,
	c: r.CHANCELLOR, a: r.ARCHBISHOP, g: r.GUARD, l: r.CAMEL,
	i: r.GIRAFFE, z: r.ZEBRA, e: r.CENTAUR, y: r.ROYALQUEEN,
	d: r.ROYALCENTAUR, s: r.KNIGHTRIDER, u: r.HUYGEN, o: r.ROSE,
}; // prettier-ignore

// Functions -------------------------------------------------------------------

/** A move the engine handed back, as the site's compact ICN token, its promotion cased for `mover`. */
function toToken(move: WasmMove, mover: Player): string {
	const promotion = move.promotion ? `=${getPromotionAbbr(move.promotion, mover)}` : '';
	// Not icnmoves' getTokenFromParts: it would bring icnmoves into the ~7 KB analysis worker.
	return `${move.from}>${move.to}${promotion}`;
}

/**
 * Translates one of the engine's promotion codes into the site's ICN piece abbreviation, cased for `mover`.
 * @throws On an unknown code, which means {@link ENGINE_PROMOTION_RAWTYPES} has drifted
 * from the engine's piece list.
 */
function getPromotionAbbr(engineCode: string, mover: Player): string {
	const rawType = ENGINE_PROMOTION_RAWTYPES[engineCode.toLowerCase()];
	if (rawType === undefined) throw Error(`Unknown engine promotion code: (${engineCode})`);
	return icnposition.getAbbrFromType(typeutil.buildType(rawType, mover));
}

// Exports ---------------------------------------------------------------------

export default { toToken };
