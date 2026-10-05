// src/client/scripts/esm/views/icnvalidator/movefingerprint.ts

/**
 * Hashes the site's legal moves at one position, plus that position's game conclusion
 * (checkmate, stalemate…). Summed across a whole run, the hashes form a fingerprint
 * that changes if any legal move or conclusion anywhere changes, whatever order the
 * positions, pieces and moves are visited in. Its blind spots: a rose's route (only its
 * length counts), and a slide square excluded within its limits (a Huygen's non-prime,
 * a pin) further than {@link SLIDE_WINDOW} from its piece.
 */

import type { Vec2Key } from '../../../../../shared/util/math/vectors.js';
import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { LegalMoves } from '../../../../../shared/chess/logic/legalmoves.js';
import type { CoordsTagged } from '../../../../../shared/chess/logic/movepiece.js';
import type { Coords, CoordsKey } from '../../../../../shared/util/coordutil.js';

import vectors from '../../../../../shared/util/math/vectors.js';
import jsonutil from '../../../../../shared/util/jsonutil.js';
import moveutil from '../../../../../shared/chess/logic/moveutil.js';
import checkmate from '../../../../../shared/chess/logic/checkmate.js';
import coordutil from '../../../../../shared/util/coordutil.js';
import legalmoves from '../../../../../shared/chess/logic/legalmoves.js';

// Constants -------------------------------------------------------------------

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** How many squares along each slide, either side of its piece, are tested one by one. */
const SLIDE_WINDOW = 16n;

// Position Hashing ------------------------------------------------------------

/**
 * The hash of the viewed position's legal moves and game conclusion.
 * @param siteMoves - The side to move's legal moves, keyed by each piece's square.
 */
function hashPosition(gamefile: GameFile, siteMoves: Map<CoordsKey, LegalMoves>): number {
	let sum = hash(JSON.stringify(checkmate.detect(gamefile) ?? null));
	for (const [from, legal] of siteMoves) {
		for (const coords of legal.individual) {
			sum += hash(`${from}>${coordutil.getKeyFromCoords(coords)} ${getTagsText(coords)}`);
		}
		sum += hashSlides(gamefile, from, legal);
	}
	return sum >>> 0;
}

/** A move's special tags as text, or '' when it has none. */
function getTagsText(coords: CoordsTagged): string {
	if (!moveutil.SPECIAL_TAGS.some((tag) => coords[tag] !== undefined)) return '';
	const tags = moveutil.SPECIAL_TAGS.map((tag) =>
		// A rose's route between equal candidates is random (specialdetect.roses), only its length isn't
		tag === 'path' ? coords.path?.length : coords[tag],
	);
	return JSON.stringify(tags, jsonutil.stringifyReplacer);
}

/**
 * The hash of a piece's slide limits, and of each square
 * within {@link SLIDE_WINDOW} the limits include but isn't legal.
 */
function hashSlides(gamefile: GameFile, from: CoordsKey, legal: LegalMoves): number {
	// Only a custom ignore function (which makes a moveset colinear) or a brute
	// slide can exclude a square within the limits; anything else spares the tests.
	const canExclude = legal.colinear || legal.brute === true;
	const start = coordutil.getCoordsFromKey(from);
	let sum = 0;
	for (const [direction, [low, high]] of Object.entries(legal.sliding)) {
		sum += hash(`${from}|${direction}|${low}|${high}|${legal.brute === true}`);
		if (!canExclude) continue;
		const [dx, dy] = vectors.getVec2FromKey(direction as Vec2Key);
		for (let step = -SLIDE_WINDOW; step <= SLIDE_WINDOW; step++) {
			if (step === 0n || (low !== null && step < low) || (high !== null && step > high))
				continue;
			const end: Coords = [start[0] + dx * step, start[1] + dy * step];
			if (!legalmoves.checkIfMoveLegal(gamefile, legal, start, end, gamefile.whosTurn))
				sum += hash(`${from}|excluded ${coordutil.getKeyFromCoords(end)}`);
		}
	}
	return sum;
}

/** The 32-bit FNV-1a hash of a string. */
function hash(text: string): number {
	let h = FNV_OFFSET_BASIS;
	for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), FNV_PRIME);
	return h >>> 0;
}

// Exports ---------------------------------------------------------------------

export default {
	// Position Hashing
	hashPosition,
};
