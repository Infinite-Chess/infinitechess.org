// src/client/scripts/esm/game/chess/enginecards/hydrochess_card.ts

import type { VariantOptions } from '../../../../../../shared/chess/logic/initvariant';

import bimath from '../../../../../../shared/util/math/bimath';
import typeutil, {
	Player,
	RawType,
	PlayerGroup,
	rawTypes as r,
	players as p,
} from '../../../../../../shared/chess/util/typeutil';

type SupportedResult = { supported: true } | { supported: false; reason: string };

// Constants -------------------------------------------------------------

/** Maximum signed 64-bit integer value (2^63 - 1). Used in Rust. */
const I64_MAX = 2n ** 63n - 1n;

const SUPPORTED_VARIANTS = new Set([
	'Classical',
	'Confined_Classical',
	'Classical_Plus',
	'Core',
	'CoaIP',
	'CoaIP_HO',
	'CoaIP_RO',
	'CoaIP_NO',
	'Palace',
	'Pawndard',
	'Standarch',
	'Space_Classic',
	'Space',
	'Abundance',
	'Pawn_Horde',
	'Knightline',
	'Obstocean',
	'Chess',
	'Omega',
]);

// Functions -------------------------------------------------------------

/**
 * Determines whether the given position is supported by the engine.
 * If it's not, and we play a game with it anyway, the engine may crash.
 */
function isPositionSupported(variantOptions: VariantOptions): SupportedResult {
	// 1. Any win condition that is not checkmate, royalcapture, allroyalscaptured, or allpiecescaptured is unsupported.
	const supportedWinConditions = [
		'checkmate',
		'royalcapture',
		'allroyalscaptured',
		'allpiecescaptured',
	];
	const usedWinConditions: string[] = Object.values(
		variantOptions.gameRules.winConditions,
	).flat();
	for (const winCondition of usedWinConditions) {
		if (!supportedWinConditions.includes(winCondition))
			return { supported: false, reason: `Unsupported win condition: ${winCondition}.` };
	}

	// 2. World border larger than i64 is unsupported.
	const cap = I64_MAX - 1000n; // Small cushion
	if (
		!variantOptions.gameRules.worldBorder ||
		Object.values(variantOptions.gameRules.worldBorder).some(
			(dist) => dist === null || bimath.abs(dist) > cap,
		)
	) {
		return {
			supported: false,
			reason: `World border exceeds limit.`,
		};
	}

	// 3. Maximum of one promotion line per player.
	if (variantOptions.gameRules.promotionRanks) {
		for (const playerRanks of Object.values(variantOptions.gameRules.promotionRanks)) {
			if (playerRanks.length > 1) {
				return {
					supported: false,
					reason: `Multiple promotion lines per player.`,
				};
			}
		}
	}

	// 4. Not too many pieces in total, excluding neutral pieces (voids/obstacles).
	const maxPieces = 200;
	let nonNeutralCount = 0;
	for (const type of variantOptions.position.values()) {
		const color = typeutil.getColorFromType(type);
		if (color !== p.NEUTRAL) nonNeutralCount++;
	}
	if (nonNeutralCount > maxPieces) {
		return {
			supported: false,
			reason: `Too many pieces: ${nonNeutralCount} (max ${maxPieces}).`,
		};
	}

	// 5. Only suppported pieces may be present.
	const supportedPieces: RawType[] = [
		r.VOID,
		r.OBSTACLE,
		r.KING,
		r.GIRAFFE,
		r.CAMEL,
		r.ZEBRA,
		r.KNIGHTRIDER,
		r.AMAZON,
		r.QUEEN,
		// rawTypes.ROYALQUEEN, // Not extensively tested
		r.HAWK,
		r.CHANCELLOR,
		r.ARCHBISHOP,
		r.CENTAUR,
		r.ROYALCENTAUR,
		r.ROSE,
		r.KNIGHT,
		r.GUARD,
		r.HUYGEN,
		r.ROOK,
		r.BISHOP,
		r.PAWN,
	];
	for (const type of variantOptions.position.values()) {
		const rawType = typeutil.getRawType(type);
		if (!supportedPieces.includes(rawType)) {
			return {
				supported: false,
				reason: `Unsupported piece type: ${typeutil.getRawTypeStr(rawType)}.`,
			};
		}
	}

	// 6. Maximum of 1 royal per side.
	const royalsCountByPlayer: PlayerGroup<number> = {};
	for (const type of variantOptions.position.values()) {
		const rawType = typeutil.getRawType(type);
		if (!typeutil.royals.includes(rawType)) continue; // Not a royal piece.

		const player: Player = typeutil.getColorFromType(type);
		royalsCountByPlayer[player] = (royalsCountByPlayer[player] || 0) + 1;
		if (royalsCountByPlayer[player] > 1) {
			return {
				supported: false,
				reason: `Multiple royal pieces per player.`,
			};
		}
	}

	return { supported: true };
}

export default {
	// Constants
	I64_MAX,
	SUPPORTED_VARIANTS,
	// Functions
	isPositionSupported,
};
