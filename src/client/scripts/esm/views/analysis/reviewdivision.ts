// src/client/scripts/esm/views/analysis/reviewdivision.ts

/**
 * Game-phase divider (ported from lichess/scalachess's Divider). Replays a game
 * from its starting position and reports the opening/middlegame/endgame boundaries
 * as mainline position indices, which the review draws as phase markers on the eval
 * graph. Generalized from the fixed 8×8 board to arbitrary starting armies and
 * board dimensions.
 */

import type { MoveFull } from '../../../../../shared/chess/logic/movepiece.js';
import type { CoordsKey } from '../../../../../shared/util/coordutil.js';
import type { Player, PlayerGroup, RawType } from '../../../../../shared/util/typeutil.js';

import math from '../../../../../shared/util/math/math.js';
import coordutil from '../../../../../shared/util/coordutil.js';
import boardchanges from '../../../../../shared/chess/logic/boardchanges.js';
import typeutil, { players as p, rawTypes as r } from '../../../../../shared/util/typeutil.js';

// Types -----------------------------------------------------------------------

/** Lila-style game-phase boundaries, expressed as position indices. */
export interface ReviewDivision {
	middle?: number;
	end?: number;
}

interface ProfilePiece {
	key: CoordsKey;
	type: number;
	raw: RawType;
}

interface PhaseProfile {
	/** Each player's officer starting squares (key → type), for detecting development. */
	sides: PlayerGroup<Map<CoordsKey, number>>;
	initialPieces: number;
	initialCombat: number;
	minimumMiddlePly: number;
}

// Division --------------------------------------------------------------------

/** Finds opening/middlegame/endgame boundaries from each replayed board position. */
function determine(initial: Map<CoordsKey, number> | undefined, moves: MoveFull[]): ReviewDivision {
	if (!initial?.size) return {};
	const position = new Map(initial);
	const homeRanks = getHomeRanks(position);
	const initialBackrank = backrankCounts(position, homeRanks);
	const profile = buildPhaseProfile(initial);
	if (!profile) return {};
	const initialMixedness = mixedness(position, homeRanks);
	let middle: number | undefined;
	let end: number | undefined;

	for (let index = 0; index <= moves.length; index++) {
		const metrics = phaseMetrics(position, profile);
		const enoughOpening = index >= profile.minimumMiddlePly;
		const mixednessGain = Math.max(0, mixedness(position, homeRanks) - initialMixedness);
		const developed =
			metrics.development >= 0.24 &&
			(metrics.captureRatio >= 0.04 || metrics.development >= 0.38);
		const setupDispersed =
			backrankSparse(position, homeRanks, initialBackrank) &&
			metrics.development >= 0.18 &&
			mixednessGain >= Math.max(30, profile.initialPieces * 0.75);
		const engaged =
			metrics.captureRatio >= metrics.captureTrigger || metrics.combatLoss >= 0.18;
		if (middle === undefined && enoughOpening && (developed || setupDispersed || engaged))
			middle = index;

		const endGap = Math.max(6, Math.round(profile.minimumMiddlePly / 2));
		if (
			middle !== undefined &&
			end === undefined &&
			index >= middle + endGap &&
			(metrics.combatRemaining <= 0.43 || metrics.piecesRemaining <= 0.35)
		)
			end = index;
		if (index < moves.length) boardchanges.runChanges_Position(position, moves[index]!.changes);
	}

	return { ...(middle !== undefined && { middle }), ...(end !== undefined && { end }) };
}

/** Calculates the variants home ranks. */
function getHomeRanks(position: Map<CoordsKey, number>): { white?: bigint; black?: bigint } {
	return {
		white: homeRank(position, p.WHITE),
		black: homeRank(position, p.BLACK),
	};
}

/**
 * Calculates the player's home rank: the y-rank holding the most non-pawn pieces.
 * Ties, and armies with no non-pawn pieces, resolve to the highest rank for white
 * and the lowest rank for black.
 */
function homeRank(position: Map<CoordsKey, number>, color: Player): bigint | undefined {
	// Selects which extreme y wins ties and the pieceless fallback
	const bias = color === p.WHITE ? 1n : color === p.BLACK ? -1n : (() => { throw new Error(`Invalid color: ${color}`) })(); // prettier-ignore
	const counts = new Map<bigint, number>(); // rank -> non-pawn count
	let fallback: bigint | undefined;
	let best: bigint | undefined;
	let bestCount = 0;
	for (const [key, type] of position) {
		if (typeutil.getColorFromType(type) !== color) continue;
		const y = coordutil.getCoordsFromKey(key)[1];
		if (fallback === undefined || bias * (y - fallback) > 0n) fallback = y;
		if (typeutil.getRawType(type) === r.PAWN) continue;
		const count = (counts.get(y) ?? 0) + 1;
		counts.set(y, count);
		if (count > bestCount || (count === bestCount && bias * (y - best!) > 0n)) {
			best = y;
			bestCount = count;
		}
	}
	return best ?? fallback;
}

/** Non-pawn, non-royal material for the two chess players. */
function majorsAndMinors(position: Map<CoordsKey, number>): number {
	let count = 0;
	for (const type of position.values()) {
		const color = typeutil.getColorFromType(type);
		const raw = typeutil.getRawType(type);
		if (
			(color === p.WHITE || color === p.BLACK) &&
			raw !== r.PAWN &&
			!typeutil.royals.includes(raw)
		)
			count++;
	}
	return count;
}

/** Counts each player's pieces currently sitting on their home rank. */
function backrankCounts(
	position: Map<CoordsKey, number>,
	home: { white?: bigint; black?: bigint },
): { white: number; black: number } {
	let white = 0;
	let black = 0;
	for (const [key, type] of position) {
		const color = typeutil.getColorFromType(type);
		const y = coordutil.getCoordsFromKey(key)[1];
		if (color === p.WHITE && y === home.white) white++;
		if (color === p.BLACK && y === home.black) black++;
	}
	return { white, black };
}

/**
 * Sparse original home ranks indicate enough development to leave the opening:
 * true once over half of either player's starting home-rank pieces have left it.
 */
function backrankSparse(
	position: Map<CoordsKey, number>,
	home: { white?: bigint; black?: bigint },
	initial: { white: number; black: number },
): boolean {
	const current = backrankCounts(position, home);
	return current.white < initial.white / 2 || current.black < initial.black / 2;
}

/**
 * Scalaches's 2×2-region mixedness score, generalized from ranks 1–8 to the
 * players' detected home ranks. Empty regions are irrelevant, so only windows
 * touching an occupied square are enumerated.
 */
function mixedness(
	position: Map<CoordsKey, number>,
	home: { white?: bigint; black?: bigint },
): number {
	if (home.white === undefined || home.black === undefined || home.white === home.black) return 0;
	const regions = new Set<CoordsKey>();
	for (const key of position.keys()) {
		const [x, y] = coordutil.getCoordsFromKey(key);
		for (const dx of [-1n, 0n])
			for (const dy of [-1n, 0n]) regions.add(coordutil.getKeyFromCoords([x + dx, y + dy]));
	}

	let total = 0;
	for (const key of regions) {
		const [x, y] = coordutil.getCoordsFromKey(key);
		let white = 0;
		let black = 0;
		for (const dx of [0n, 1n]) {
			for (const dy of [0n, 1n]) {
				const type = position.get(coordutil.getKeyFromCoords([x + dx, y + dy]));
				if (type === undefined) continue;
				const color = typeutil.getColorFromType(type);
				if (color === p.WHITE) white++;
				else if (color === p.BLACK) black++;
			}
		}
		const rank = normalizedRegionRank(y, home.white, home.black);
		total += mixednessScore(rank, white, black);
	}
	return total;
}

function normalizedRegionRank(y: bigint, whiteHome: bigint, blackHome: bigint): number {
	const span = blackHome - whiteHome;
	const rank = Number(((y - whiteHome) * 7n) / span) + 1;
	return math.clamp(rank, 1, 7);
}

/** Exact score table used by scalachess Divider for a 2×2 region. */
function mixednessScore(y: number, white: number, black: number): number {
	const key = `${white},${black}`;
	switch (key) {
		case '0,0':
			return 0;
		case '1,0':
			return 1 + (8 - y);
		case '2,0':
			return y > 2 ? 2 + (y - 2) : 0;
		case '3,0':
			return y > 1 ? 3 + (y - 1) : 0;
		case '4,0':
			return y > 1 ? 3 + (y - 1) : 0;
		case '0,1':
			return 1 + y;
		case '1,1':
			return 5 + Math.abs(4 - y);
		case '2,1':
			return 4 + (y - 1);
		case '3,1':
			return 5 + (y - 1);
		case '0,2':
			return y < 6 ? 2 + (6 - y) : 0;
		case '1,2':
			return 4 + (7 - y);
		case '2,2':
			return 7;
		case '0,3':
			return y < 7 ? 3 + (7 - y) : 0;
		case '1,3':
			return 5 + (7 - y);
		case '0,4':
			return y < 7 ? 3 + (7 - y) : 0;
		default:
			return 0;
	}
}

/** Builds phase thresholds and each army's development squares from the starting position. */
function buildPhaseProfile(initial: Map<CoordsKey, number>): PhaseProfile | undefined {
	const pieces = {
		[p.WHITE]: collectPlayerPieces(initial, p.WHITE),
		[p.BLACK]: collectPlayerPieces(initial, p.BLACK),
	} satisfies PlayerGroup<ProfilePiece[]>;
	if (pieces[p.WHITE].length === 0 || pieces[p.BLACK].length === 0) return undefined;

	const sides: PlayerGroup<Map<CoordsKey, number>> = {};
	for (const color of [p.WHITE, p.BLACK]) {
		const candidates = developmentCandidates(pieces[color]);
		sides[color] = new Map(candidates.map(({ key, type }) => [key, type]));
	}

	const initialPieces = pieces[p.WHITE].length + pieces[p.BLACK].length;
	return {
		sides,
		initialPieces,
		initialCombat: majorsAndMinors(initial),
		// Classical gets an eleven-ply opening floor. Huge and repeated-dimensional
		// setups receive up to twenty-four plies before a phase transition is possible.
		minimumMiddlePly: math.clamp(Math.round(Math.sqrt(initialPieces) * 2), 10, 24),
	};
}

function collectPlayerPieces(position: Map<CoordsKey, number>, color: Player): ProfilePiece[] {
	const pieces: ProfilePiece[] = [];
	for (const [key, type] of position) {
		if (typeutil.getColorFromType(type) !== color) continue;
		pieces.push({ key, type, raw: typeutil.getRawType(type) });
	}
	return pieces;
}

/** Pawn-only/horde armies fall back to all non-royal starting pieces. */
function developmentCandidates(pieces: ProfilePiece[]): ProfilePiece[] {
	const officers = pieces.filter(
		(piece) => piece.raw !== r.PAWN && !typeutil.royals.includes(piece.raw),
	);
	if (officers.length >= 2) return officers;
	return pieces.filter((piece) => !typeutil.royals.includes(piece.raw));
}

function phaseMetrics(
	position: Map<CoordsKey, number>,
	profile: PhaseProfile,
): {
	development: number;
	captureRatio: number;
	captureTrigger: number;
	combatLoss: number;
	combatRemaining: number;
	piecesRemaining: number;
} {
	let currentPieces = 0;
	for (const type of position.values()) {
		const color = typeutil.getColorFromType(type);
		if (color === p.WHITE || color === p.BLACK) currentPieces++;
	}

	let developed = 0;
	let developmentTotal = 0;
	for (const color of [p.WHITE, p.BLACK]) {
		for (const [key, type] of profile.sides[color]!) {
			developmentTotal++;
			if (position.get(key) !== type) developed++;
		}
	}

	const combat = majorsAndMinors(position);
	const captureRatio = 1 - currentPieces / profile.initialPieces;
	return {
		development: developmentTotal > 0 ? developed / developmentTotal : 0,
		captureRatio,
		captureTrigger: Math.max(0.08, 4 / profile.initialPieces),
		combatLoss: profile.initialCombat > 0 ? 1 - combat / profile.initialCombat : 0,
		combatRemaining: profile.initialCombat > 0 ? combat / profile.initialCombat : 1,
		piecesRemaining: currentPieces / profile.initialPieces,
	};
}

export default { determine };
