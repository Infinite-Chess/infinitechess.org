// src/shared/chess/logic/castlingutil.ts

/**
 * Pure predicates for castling-pair validity,
 * so that the structural rules for castling live in exactly one place.
 */

import type { Coords } from '../util/coordutil.js';

import bimath from '../../util/math/bimath.js';
import typeutil from '../util/typeutil.js';
import { rawTypes as r } from '../util/typeutil.js';

// Constants ---------------------------------------------------------------------------

/** The minimum horizontal distance required between two pieces for castling. */
const MIN_DISTANCE = 3n;

// Functions ---------------------------------------------------------------------------

/**
 * Whether two pieces form a structurally valid castling pair,
 * based on piece types and coordinates alone.
 * Does NOT check whether either piece currently has special rights.
 *
 * Requirements:
 * - Same player
 * - Neither is a pawn
 * - Exactly one is a jumping royal (the castling "trigger", e.g. King); the other is the partner
 * - At least {@link MIN_DISTANCE} squares apart horizontally
 */
function isValidPair(aCoords: Coords, aType: number, bCoords: Coords, bType: number): boolean {
	const [aRaw, aPlayer] = typeutil.splitType(aType);
	const [bRaw, bPlayer] = typeutil.splitType(bType);

	if (aPlayer !== bPlayer) return false; // Must be the same player color
	if (aRaw === r.PAWN || bRaw === r.PAWN) return false; // Pawns cannot castle

	// Exactly one must be a jumping royal (the trigger); the other is the partner
	const aIsTrigger = typeutil.jumpingRoyals.includes(aRaw);
	const bIsTrigger = typeutil.jumpingRoyals.includes(bRaw);
	if (aIsTrigger === bIsTrigger) return false; // Must be opposite roles

	// Must be at least the minimum distance apart horizontally
	return bimath.abs(aCoords[0] - bCoords[0]) >= MIN_DISTANCE;
}

export default { MIN_DISTANCE, isValidPair };
