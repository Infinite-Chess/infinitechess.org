// src/client/scripts/esm/game/chess/enginecards/hydrochess_card.ts

import type { VariantOptions } from '../../../../../../shared/chess/logic/initvariant';
import type { OrganizedPieces } from '../../../../../../shared/chess/logic/organizedpieces';

import bimath from '../../../../../../shared/util/math/bimath';
import boardutil from '../../../../../../shared/chess/util/boardutil';
import typeutil, {
	Player,
	rawTypes,
	RawType,
	PlayerGroup,
	players,
} from '../../../../../../shared/chess/util/typeutil';

type SupportedResult = { supported: true } | { supported: false; reason: string };

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

/**
 * Determines whether the given position is supported by the engine.
 * If it's not, and we play a game with it anyway, the engine may crash.
 * @param variantOptions - The variant options including position and game rules
 * @param organizedPieces - Optional organized pieces for O(1) piece counting. If not provided, falls back to O(n) counting from position Map.
 */
function isPositionSupported(
	variantOptions: VariantOptions,
	organizedPieces?: OrganizedPieces,
): SupportedResult {
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
	const cap = 1_000_000_000_000_000_000n; // About 10% the max, for cushion
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
	let nonNeutralCount: number;

	if (organizedPieces) {
		// O(1) when using organized pieces - iterates only through type ranges, not individual pieces
		nonNeutralCount = boardutil.getPieceCountOfGame(organizedPieces, {
			ignoreColors: new Set([players.NEUTRAL]),
		});
	} else {
		// O(n) fallback when organized pieces not available
		nonNeutralCount = 0;
		for (const type of variantOptions.position.values()) {
			const color = typeutil.getColorFromType(type);
			if (color !== players.NEUTRAL) nonNeutralCount++;
		}
	}

	if (nonNeutralCount > maxPieces) {
		return {
			supported: false,
			reason: `Too many pieces: ${nonNeutralCount} (max ${maxPieces}).`,
		};
	}

	// 5. Only suppported pieces may be present.
	const supportedPieces: RawType[] = [
		rawTypes.VOID,
		rawTypes.OBSTACLE,
		rawTypes.KING,
		rawTypes.GIRAFFE,
		rawTypes.CAMEL,
		rawTypes.ZEBRA,
		rawTypes.KNIGHTRIDER,
		rawTypes.AMAZON,
		rawTypes.QUEEN,
		// rawTypes.ROYALQUEEN, // Not extensively tested
		rawTypes.HAWK,
		rawTypes.CHANCELLOR,
		rawTypes.ARCHBISHOP,
		rawTypes.CENTAUR,
		rawTypes.ROYALCENTAUR,
		rawTypes.ROSE,
		rawTypes.KNIGHT,
		rawTypes.GUARD,
		rawTypes.HUYGEN,
		rawTypes.ROOK,
		rawTypes.BISHOP,
		rawTypes.PAWN,
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

export default { SUPPORTED_VARIANTS, isPositionSupported };
