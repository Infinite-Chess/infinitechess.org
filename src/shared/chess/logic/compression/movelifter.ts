// src/shared/chess/logic/compression/movelifter.ts

/**
 * Maps moves on a compressed position back onto the original board. A capture lands on its victim,
 * and a short move keeps its offset. A long slide lands in the same gap between the lines crossing
 * its path, at the same offset from a line it lands near. Every landing must then relate to every
 * line as the compressed one does: the same offset within the arbitrary distance, the same side
 * beyond it. A line is lifted up to its first move that can't be.
 */

import type { LineForm } from './lineforms.js';
import type { MoveCoords } from '../icn/icnmoves.js';
import type { Coords, CoordsKey } from '../../../util/coordutil.js';

import bimath from '../../../util/math/bimath.js';
import coordutil from '../../../util/coordutil.js';
import typeutil, { rawTypes as r } from '../../util/typeutil.js';

import lineforms from './lineforms.js';

// Types -----------------------------------------------------------------------

/** A piece, where it stands on the original board and on the compressed one. Never mutated. */
interface LiftPiece {
	readonly type: number;
	readonly original: Coords;
	readonly compressed: Coords;
}

/** A lone line (promotion rank or border edge) landings are also checked against. */
export interface LiftLine {
	form: number;
	original: bigint;
	compressed: bigint;
}

/** The pieces in play, keyed by their compressed square. */
export type LiftBoard = Map<CoordsKey, LiftPiece>;

/** A square's value under each form, exactly and as a double for {@link isApproxFar}. */
interface FormValues {
	exact: bigint[];
	approx: Float64Array;
}

/** What every lift on one compressed position checks against. */
interface LiftContext {
	forms: LineForm[];
	lines: LiftLine[];
	arbitraryDistance: bigint;
	/** The compression's residue modulus. */
	modulus: bigint;
	/** Each piece's values on both boards, computed once per piece. */
	pieceValues: WeakMap<LiftPiece, { original: FormValues; compressed: FormValues }>;
}

/**
 * A line crossing a slide's path `original / along` steps from the slider, `compressed / along`
 * when compressed. Both are worked out exactly only for the few crossings `steps` can't settle.
 */
interface PathCrossing {
	/** The line's value less the slider's, under the line's form, on each board. */
	original: [line: bigint, slider: bigint];
	compressed: [line: bigint, slider: bigint];
	sign: bigint;
	along: bigint;
	/** How many steps from the slider it crosses on the compressed board, as a double. */
	steps: number;
	/** How far {@link PathCrossing.steps} may be off by rounding. */
	error: number;
}

// Constants -------------------------------------------------------------------

/** Bounds a double's rounding error relative to the values compared, with ample margin. */
const APPROX_ERROR = 2 ** -50;

// Functions -------------------------------------------------------------------

/** The context for lifting lines on a position compressed under `forms`, with its lone lines. */
function createContext(
	forms: LineForm[],
	lines: LiftLine[],
	arbitraryDistance: bigint,
	modulus: bigint,
): LiftContext {
	return { forms, lines, arbitraryDistance, modulus, pieceValues: new WeakMap() };
}

/** The longest prefix of a line of moves, as moves on the original board. */
function liftLine(context: LiftContext, board: LiftBoard, moves: MoveCoords[]): MoveCoords[] {
	const lineBoard = new Map(board);
	const lifted: MoveCoords[] = [];
	for (const move of moves) {
		const liftedMove = liftMove(context, lineBoard, move);
		if (liftedMove === undefined) break;
		lifted.push(liftedMove);
	}
	return lifted;
}

/**
 * Lifts one move and plays it on `board`, or returns undefined if it can't be mapped faithfully.
 */
function liftMove(
	context: LiftContext,
	board: LiftBoard,
	move: MoveCoords,
): MoveCoords | undefined {
	const { startCoords, endCoords, promotion } = move;
	const piece = board.get(coordutil.getKeyFromCoords(startCoords));
	if (!piece) return undefined;
	const victim = board.get(coordutil.getKeyFromCoords(endCoords));
	const delta = coordutil.subtractCoords(endCoords, startCoords);
	const isShort = context.forms.every((form) => bimath.abs(lineforms.value(form, delta)) <= context.arbitraryDistance); // prettier-ignore

	const candidates = victim
		? [victim.original]
		: isShort
			? [coordutil.addCoords(piece.original, delta)]
			: slideLandings(context, board, piece, delta);
	const endOriginal = candidates.find((candidate) => keepsRelations(context, board, piece, victim, candidate, endCoords)); // prettier-ignore
	if (!endOriginal) return undefined;

	play(board, startCoords, endCoords, endOriginal, promotion);
	const lifted: MoveCoords = { startCoords: piece.original, endCoords: endOriginal };
	if (promotion !== undefined) lifted.promotion = promotion;
	return lifted;
}

/**
 * Where a long slide may land on the original board, to be tried in turn. Near a line, at the same
 * offset from it. Otherwise between the same two lines crossing its path: as far past the line
 * before it, as far short of the line after it, or between them beyond the arbitrary distance.
 */
function slideLandings(
	context: LiftContext,
	board: LiftBoard,
	piece: LiftPiece,
	delta: Coords,
): Coords[] {
	const steps = bimath.GCD(delta[0], delta[1]);
	const direction: Coords = [delta[0] / steps, delta[1] / steps];
	const at = (t: bigint): Coords => [piece.original[0] + t * direction[0], piece.original[1] + t * direction[1]]; // prettier-ignore
	const crossings = pathCrossings(context, board, piece, direction);
	/** The landing as far from `crossing` as on the compressed board, if that's a whole square. */
	const keepingOffset = (crossing: PathCrossing): bigint | undefined => {
		const shift = exactly(crossing, 'original') - exactly(crossing, 'compressed');
		return shift % crossing.along === 0n ? steps + shift / crossing.along : undefined;
	};

	const reach = Number(context.arbitraryDistance);
	const near = crossings.find((crossing) => Math.abs(Number(steps) - crossing.steps) * Number(crossing.along) <= reach + crossing.error * Number(crossing.along) && bimath.abs(steps * crossing.along - exactly(crossing, 'compressed')) <= context.arbitraryDistance); // prettier-ignore
	const before = nearest(crossings, steps, -1n);
	const after = nearest(crossings, steps, 1n);
	const landings = near
		? [keepingOffset(near)]
		: [before, after].map((crossing) => (crossing ? keepingOffset(crossing) : steps));
	if (!near && before && after) landings.push(justPast(context, before, steps));
	return landings.filter((t) => t !== undefined).map((t) => at(t));
}

/**
 * The first landing past `before` beyond the arbitrary distance, on the same residue as `steps`.
 * Compression keeps a gap with a landing far from both ends wide enough to hold it far from both.
 */
function justPast(context: LiftContext, before: PathCrossing, steps: bigint): bigint {
	const low =
		ceilDivide(exactly(before, 'original'), before.along) + context.arbitraryDistance + 1n;
	return low + bimath.posMod(steps - low, context.modulus);
}

/** Every other piece's and lone line's line crossing the path along `direction` from `piece`. */
function pathCrossings(
	context: LiftContext,
	board: LiftBoard,
	piece: LiftPiece,
	direction: Coords,
): PathCrossing[] {
	const crossings: PathCrossing[] = [];
	const start = valuesOf(context, piece);
	const alongs = context.forms.map((form) => lineforms.value(form, direction));
	const add = (f: number, original: bigint, compressed: bigint, approx: number): void => {
		const along = alongs[f]!;
		if (along === 0n) return;
		const sign = along > 0n ? 1n : -1n;
		const startApprox = start.compressed.approx[f]!;
		crossings.push({
			original: [original, start.original.exact[f]!],
			compressed: [compressed, start.compressed.exact[f]!],
			sign,
			along: sign * along,
			steps: (Number(sign) * (approx - startApprox)) / Number(sign * along),
			error: (Math.abs(approx) + Math.abs(startApprox)) * APPROX_ERROR + 1,
		});
	};
	for (const other of board.values()) {
		if (other === piece) continue;
		const values = valuesOf(context, other);
		context.forms.forEach((_, f) => add(f, values.original.exact[f]!, values.compressed.exact[f]!, values.compressed.approx[f]!)); // prettier-ignore
	}
	for (const line of context.lines) add(line.form, line.original, line.compressed, Number(line.compressed)); // prettier-ignore
	return crossings;
}

/**
 * The crossing nearest `steps` on the compressed board, before it (`side` -1) or after (1). Doubles
 * rule out all but the crossings rounding could make nearest, which are compared exactly.
 */
function nearest(crossings: PathCrossing[], steps: bigint, side: bigint): PathCrossing | undefined {
	const [target, direction] = [Number(steps), Number(side)];
	let closest = Infinity;
	for (const crossing of crossings) {
		const distance = direction * (crossing.steps - target);
		if (distance > -crossing.error) closest = Math.min(closest, distance + crossing.error);
	}
	let best: PathCrossing | undefined;
	for (const crossing of crossings) {
		const distance = direction * (crossing.steps - target);
		if (distance + crossing.error <= -crossing.error || distance - crossing.error > closest) continue; // prettier-ignore
		if (side * (exactly(crossing, 'compressed') - steps * crossing.along) <= 0n) continue;
		if (!best || side * (exactly(crossing, 'compressed') * best.along - exactly(best, 'compressed') * crossing.along) < 0n) best = crossing; // prettier-ignore
	}
	return best;
}

/** A crossing's steps from the slider on one board, times its `along`. */
function exactly(crossing: PathCrossing, board: 'original' | 'compressed'): bigint {
	const [line, slider] = crossing[board];
	return crossing.sign * (line - slider);
}

/** `numerator / denominator` rounded up, for a positive denominator. */
function ceilDivide(numerator: bigint, denominator: bigint): bigint {
	return (numerator + bimath.posMod(-numerator, denominator)) / denominator;
}

/**
 * Whether the original landing relates to every other piece's and lone line's line, under every
 * form, as the compressed one does: at the same offset where either lies within the arbitrary
 * distance of it, on the same side otherwise.
 */
function keepsRelations(
	context: LiftContext,
	board: LiftBoard,
	mover: LiftPiece,
	victim: LiftPiece | undefined,
	endOriginal: Coords,
	endCompressed: Coords,
): boolean {
	const original = formValues(context.forms, endOriginal);
	const compressed = formValues(context.forms, endCompressed);
	// prettier-ignore
	const relates = (f: number, lineOriginal: bigint, lineCompressed: bigint, approxOriginal: number, approxCompressed: number): boolean => {
		if (isApproxFar(original.approx[f]!, approxOriginal, compressed.approx[f]!, approxCompressed, context.arbitraryDistance)) return true;
		const [offset, compressedOffset] = [original.exact[f]! - lineOriginal, compressed.exact[f]! - lineCompressed];
		const isNear = bimath.abs(offset) <= context.arbitraryDistance || bimath.abs(compressedOffset) <= context.arbitraryDistance;
		return isNear ? offset === compressedOffset : offset > 0n === compressedOffset > 0n;
	};
	for (const other of board.values()) {
		if (other === mover || other === victim) continue;
		const values = valuesOf(context, other);
		for (let f = 0; f < context.forms.length; f++) {
			if (!relates(f, values.original.exact[f]!, values.compressed.exact[f]!, values.original.approx[f]!, values.compressed.approx[f]!)) return false; // prettier-ignore
		}
	}
	return context.lines.every((line) => relates(line.form, line.original, line.compressed, Number(line.original), Number(line.compressed))); // prettier-ignore
}

/**
 * Whether, by their values as doubles, a landing lies beyond the arbitrary distance of a line on
 * both boards, on the same side, allowing for rounding. Values beyond double range never pass.
 */
function isApproxFar(
	landingOriginal: number,
	lineOriginal: number,
	landingCompressed: number,
	lineCompressed: number,
	arbitraryDistance: bigint,
): boolean {
	const margin = Number(arbitraryDistance) + 1;
	const [offset, compressedOffset] = [landingOriginal - lineOriginal, landingCompressed - lineCompressed]; // prettier-ignore
	const tolerance = margin + (Math.abs(landingOriginal) + Math.abs(lineOriginal)) * APPROX_ERROR;
	const compressedTolerance = margin + (Math.abs(landingCompressed) + Math.abs(lineCompressed)) * APPROX_ERROR; // prettier-ignore
	return (offset > tolerance && compressedOffset > compressedTolerance) || (offset < -tolerance && compressedOffset < -compressedTolerance); // prettier-ignore
}

/** A piece's values on both boards. */
function valuesOf(
	context: LiftContext,
	piece: LiftPiece,
): { original: FormValues; compressed: FormValues } {
	let values = context.pieceValues.get(piece);
	if (!values) {
		values = { original: formValues(context.forms, piece.original), compressed: formValues(context.forms, piece.compressed) }; // prettier-ignore
		context.pieceValues.set(piece, values);
	}
	return values;
}

/** The square's value under each form. */
function formValues(forms: LineForm[], coords: Coords): FormValues {
	const exact = forms.map((form) => lineforms.value(form, coords));
	return { exact, approx: Float64Array.from(exact, (value) => Number(value)) };
}

/**
 * Plays a move on both boards at once: the mover, its victim, a castling partner, an en passant
 * capture, a promotion. A move from an empty square is skipped.
 */
function play(
	board: LiftBoard,
	start: Coords,
	end: Coords,
	endOriginal: Coords,
	promotion?: number,
): void {
	const piece = board.get(coordutil.getKeyFromCoords(start));
	if (!piece) return;
	const endKey = coordutil.getKeyFromCoords(end);
	const isCapture = board.has(endKey);
	const [dx, dy] = coordutil.subtractCoords(end, start);
	const rawType = typeutil.getRawType(piece.type);

	if (
		!isCapture &&
		dy === 0n &&
		bimath.abs(dx) === 2n &&
		typeutil.jumpingRoyals.includes(rawType)
	) {
		movePartner(board, start, end, endOriginal, dx > 0n ? 1n : -1n);
	} else if (!isCapture && dx !== 0n && rawType === r.PAWN) {
		board.delete(coordutil.getKeyFromCoords([end[0], start[1]])); // En passant
	}
	board.delete(coordutil.getKeyFromCoords(start));
	board.set(endKey, { type: promotion ?? piece.type, original: endOriginal, compressed: end });
}

/**
 * Castling: the nearest piece beyond the royal along its rank lands just behind the royal's
 * landing.
 */
function movePartner(
	board: LiftBoard,
	start: Coords,
	end: Coords,
	endOriginal: Coords,
	step: bigint,
): void {
	let partner: LiftPiece | undefined;
	for (const piece of board.values()) {
		const [x, y] = piece.compressed;
		if (y !== start[1] || (x - start[0]) * step <= 0n) continue;
		if (!partner || (x - partner.compressed[0]) * step < 0n) partner = piece;
	}
	if (!partner) return;
	board.delete(coordutil.getKeyFromCoords(partner.compressed));
	const compressed: Coords = [end[0] - step, end[1]];
	board.set(coordutil.getKeyFromCoords(compressed), { ...partner, original: [endOriginal[0] - step, endOriginal[1]], compressed }); // prettier-ignore
}

// Exports ---------------------------------------------------------------------

export default {
	createContext,
	liftLine,
	play,
};
