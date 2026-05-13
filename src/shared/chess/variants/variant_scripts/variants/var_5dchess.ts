// src/shared/chess/variants/variant_scripts/variants/var_5dchess.ts

/**
 * "5D Chess" 4D variant.
 */

import type { Movesets } from '../../../logic/movesets';
import type { CoordsKey } from '../../../util/coordutil';
import type { GameRuleModifications } from '../variantutil';
import type { RawType, RawTypeGroup } from '../../../util/typeutil';
import type { SpecialMoveFunction, SpecialVicinity } from '../../../logic/specialmove';

import gen4DPosition from '../gen4DPosition';
import fourdimensionalmoves from '../../../logic/fourdimensionalmoves';
import fourdimensionalloader from '../fourdimensionalloader';
import { CLASSICAL_POSITION_STRING } from '../classicalPositionString';
import { players as p, rawTypes as r } from '../../../util/typeutil';

export function getPosition(): { position: Map<CoordsKey, number> } {
	return { position: gen4DPosition.gen(8n, 8n, 9n, CLASSICAL_POSITION_STRING) };
}

export function gameruleModifications(): GameRuleModifications {
	return {
		winConditions: { [p.WHITE]: ['royalcapture'], [p.BLACK]: ['royalcapture'] },
		promotion: {
			ranks: {
				[p.WHITE]: [8n, 17n, 26n, 35n, 44n, 53n, 62n, 71n],
				[p.BLACK]: [1n, 10n, 19n, 28n, 37n, 46n, 55n, 64n],
			},
		},
	};
}

export const worldBorderDist = 0n;

export function getGeneratorRules(): { pawnDoublePush: boolean; castleWith?: RawType } {
	return { pawnDoublePush: true, castleWith: r.ROOK };
}

export function genMovesetModifications(): Movesets {
	return fourdimensionalloader.gen4DMoveset(8n, 8n, 9n, true, false);
}

export function getSpecialMoves(): RawTypeGroup<SpecialMoveFunction> {
	return { [r.PAWN]: fourdimensionalmoves.doFourDimensionalPawnMove };
}

export function getSpecialVicinity(): SpecialVicinity {
	return {
		[r.PAWN]: fourdimensionalloader.getPawnVicinity(9n, false),
		[r.KNIGHT]: fourdimensionalloader.getKnightVicinity(9n),
		[r.KING]: fourdimensionalloader.getKingVicinity(9n, true),
	};
}
