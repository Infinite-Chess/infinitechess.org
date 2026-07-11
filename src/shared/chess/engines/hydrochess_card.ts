// src/shared/chess/engines/hydrochess_card.ts

import type { VariantOptions } from '../logic/gamefile.js';

import bimath from '../../util/math/bimath.js';
import bounds from '../../util/math/bounds.js';
import coordutil from '../util/coordutil.js';
import typeutil, { RawType, rawTypes as r, players as p } from '../util/typeutil.js';

type SupportedResult = { supported: true } | { supported: false; reason: string };

// Constants -------------------------------------------------------------

/** Maximum signed 64-bit integer value (2^63 - 1). Used in Rust. */
const I64_MAX = 2n ** 63n - 1n;

/** The maximum world border distance the engine can handle. */
const BORDER_CAP = I64_MAX - 1000n; // Small cushion

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
	if (
		!variantOptions.gameRules.worldBorder ||
		Object.values(variantOptions.gameRules.worldBorder).some(
			(dist) => dist === null || bimath.abs(dist) > BORDER_CAP,
		)
	) {
		return {
			supported: false,
			reason: `World border exceeds limit.`,
		};
	}

	// 3. Boundary of all pieces is entirely contained within world border (no piece out of bounds)
	if (variantOptions.gameRules.worldBorder) {
		const allCoords = [...variantOptions.position.keys()].map((coordsKey) =>
			coordutil.getCoordsFromKey(coordsKey),
		);
		const piecesBox = bounds.getBoxFromCoordsList(allCoords);

		if (!bounds.boxContainsBox(variantOptions.gameRules.worldBorder, piecesBox))
			return {
				supported: false,
				reason: `Pieces are out of bounds.`,
			};
	}

	// 4. Maximum of one promotion line per player.
	if (variantOptions.gameRules.promotion) {
		for (const playerRanks of Object.values(variantOptions.gameRules.promotion.ranks)) {
			if (playerRanks.length > 1) {
				return {
					supported: false,
					reason: `Multiple promotion lines per player.`,
				};
			}
		}
	}

	// 5. Not too many pieces in total, excluding neutral pieces (voids/obstacles).
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

	// 6. Only suppported pieces may be present.
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

	return { supported: true };
}

/**
 * Sets a default world border on the position for an engine game, if it doesn't have one:
 * the pieces' bounding box padded by `worldBorderDist`, capped so no edge exceeds the
 * engine's safe coordinate range. MUTATES the variantOptions' gameRules.
 */
function setDefaultWorldBorder(variantOptions: VariantOptions, worldBorderDist: bigint): void {
	if (variantOptions.gameRules.worldBorder !== undefined) return; // Respect an explicit border.

	const allCoords = [...variantOptions.position.keys()].map((coordsKey) =>
		coordutil.getCoordsFromKey(coordsKey),
	);
	if (allCoords.length === 0) return; // Empty position; leave unset (illegal position anyway).
	const bb = bounds.getBoxFromCoordsList(allCoords);

	// How far can we extend in each direction before hitting the engine's coordinate cap?
	const availableHorz = bimath.min(bb.left + BORDER_CAP, BORDER_CAP - bb.right);
	const availableVert = bimath.min(bb.bottom + BORDER_CAP, BORDER_CAP - bb.top);
	const distHorz = bimath.min(worldBorderDist, availableHorz);
	const distVert = bimath.min(worldBorderDist, availableVert);

	variantOptions.gameRules.worldBorder = {
		left: bb.left - distHorz,
		right: bb.right + distHorz,
		bottom: bb.bottom - distVert,
		top: bb.top + distVert,
	};
}

export default {
	// Constants
	I64_MAX,
	BORDER_CAP,
	SUPPORTED_VARIANTS,
	// Functions
	isPositionSupported,
	setDefaultWorldBorder,
};
