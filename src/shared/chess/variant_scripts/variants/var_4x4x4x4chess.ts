// src/shared/chess/variant_scripts/variants/var_4x4x4x4chess.ts

/**
 * "4x4x4x4 Chess" 4D variant.
 */

import type { Movesets } from '../../logic/movesets';
import type { CoordsKey } from '../../util/coordutil';
import type { GameRuleModifications } from '../variantutil';
import type { RawType, RawTypeGroup } from '../../util/typeutil';
import type { SpecialMoveFunction, SpecialVicinity } from '../../logic/specialmove';

import gen4DPosition from '../gen4DPosition';
import fourdimensionalmoves from '../../logic/fourdimensionalmoves';
import fourdimensionalloader from '../fourdimensionalloader';
import { players as p, rawTypes as r } from '../../util/typeutil';

export function getPosition(): { position: Map<CoordsKey, number> } {
	return {
		position: gen4DPosition.gen(4n, 4n, 5n, {
			'0,0': 'P1,2|P2,2|P3,2|P4,2|R1,1|N2,1|N3,1|R4,1',
			'1,0': 'P1,2|P2,2|P3,2|P4,2|P1,1|P2,1|P3,1|P4,1',
			'2,0': 'P1,2|P2,2|P3,2|P4,2|B1,1|K2,1|Q3,1|B4,1',
			'3,0': 'P1,2|P2,2|P3,2|P4,2|R1,1|N2,1|N3,1|R4,1',
			'0,3': 'p1,3|p2,3|p3,3|p4,3|r1,4|n2,4|n3,4|r4,4',
			'1,3': 'p1,3|p2,3|p3,3|p4,3|b1,4|q2,4|k3,4|b4,4',
			'2,3': 'p1,3|p2,3|p3,3|p4,3|p1,4|p2,4|p3,4|p4,4',
			'3,3': 'p1,3|p2,3|p3,3|p4,3|r1,4|n2,4|n3,4|r4,4',
		}),
	};
}

export function gameruleModifications(): GameRuleModifications {
	return {
		promotionRanks: { [p.WHITE]: [19n], [p.BLACK]: [1n] },
	};
}

export const worldBorderDist = 0n;

export function getGeneratorRules(): { pawnDoublePush: boolean; castleWith?: RawType } {
	return { pawnDoublePush: true };
}

export function genMovesetModifications(): Movesets {
	return fourdimensionalloader.gen4DMoveset(4n, 4n, 5n, false, true);
}

export function getSpecialMoves(): RawTypeGroup<SpecialMoveFunction> {
	return { [r.PAWN]: fourdimensionalmoves.doFourDimensionalPawnMove };
}

export function getSpecialVicinity(): SpecialVicinity {
	return {
		[r.PAWN]: fourdimensionalloader.getPawnVicinity(5n, true),
		[r.KNIGHT]: fourdimensionalloader.getKnightVicinity(5n),
		[r.KING]: fourdimensionalloader.getKingVicinity(5n, false),
	};
}
