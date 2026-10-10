// src/client/scripts/esm/views/analysis/compression/movelifter.ts

/**
 * Maps the engine's moves on a compressed position back onto the original board. A capture lands
 * on its victim and a short move keeps its offset; a long slide lands as near every piece's line
 * as the compressed landing does. Each landing is then checked against every piece, so a line is
 * only ever shown up to its last faithfully mapped move.
 */

import type { LineForm } from './lineforms.js';
import type { Coords, CoordsKey } from '../../../../../../shared/util/coordutil.js';

import bimath from '../../../../../../shared/util/math/bimath.js';
import icnmoves from '../../../../../../shared/chess/logic/icn/icnmoves.js';
import coordutil from '../../../../../../shared/util/coordutil.js';
import typeutil, { rawTypes as r } from '../../../../../../shared/chess/util/typeutil.js';

import lineforms from './lineforms.js';
import enginehorizons from './enginehorizons.js';

// Types -----------------------------------------------------------------------

/** A piece, where it stands on the original board and on the compressed one. Never mutated. */
interface LiftPiece {
	readonly type: number;
	readonly original: Coords;
	readonly compressed: Coords;
}

/** A lone line (promotion rank, border edge) landings are also checked against. */
interface LiftLine {
	form: number;
	original: bigint;
	compressed: bigint;
}

/** The pieces in play, keyed by their compressed square. */
export type LiftBoard = Map<CoordsKey, LiftPiece>;

/** A square's value under each form, exactly and as a double for {@link isApproxNear}. */
interface FormValues {
	exact: bigint[];
	approx: Float64Array;
}

/** A square's values on each board. A slide still being placed has no original landing yet. */
interface SquareValues {
	original?: FormValues;
	compressed: FormValues;
}

/** What every lift on one compressed position checks against. */
interface LiftContext {
	forms: LineForm[];
	lines: LiftLine[];
	/** Each piece's values on both boards, computed once per piece. */
	pieceValues: WeakMap<LiftPiece, Required<SquareValues>>;
}

// Constants -------------------------------------------------------------------

const NEAR_LINE_SPAN = Number(enginehorizons.NEAR_LINE_SPAN);

/** Bounds a double's rounding error relative to the values compared, with ample margin. */
const APPROX_ERROR = 2 ** -50;

// Functions -------------------------------------------------------------------

/** The context for lifting lines on a position compressed under `forms`, with its lone lines. */
function createContext(forms: LineForm[], lines: LiftLine[]): LiftContext {
	return { forms, lines, pieceValues: new WeakMap() };
}

/** The longest prefix of an engine line, as tokens on the original board. */
function liftLine(context: LiftContext, board: LiftBoard, tokens: string[]): string[] {
	const lineBoard = new Map(board);
	const lifted: string[] = [];
	for (const token of tokens) {
		const liftedToken = liftMove(context, lineBoard, token);
		if (liftedToken === undefined) break;
		lifted.push(liftedToken);
	}
	return lifted;
}

/** Lifts one move and plays it on `board`, or returns undefined if it can't be mapped faithfully. */
function liftMove(context: LiftContext, board: LiftBoard, token: string): string | undefined {
	const { startCoords, endCoords, promotion } = icnmoves.parseTokenMove(token);
	const piece = board.get(coordutil.getKeyFromCoords(startCoords));
	if (!piece) return undefined;
	const victim = board.get(coordutil.getKeyFromCoords(endCoords));
	const delta = coordutil.subtractCoords(endCoords, startCoords);
	const isShort = delta.every((d) => bimath.abs(d) <= enginehorizons.EXACT_SPAN);

	const endOriginal = victim
		? victim.original
		: isShort
			? coordutil.addCoords(piece.original, delta)
			: slideLanding(context, board, piece, delta);
	if (!endOriginal || !keepsRelations(context, board, piece, victim, endOriginal, endCoords)) return undefined; // prettier-ignore

	play(board, startCoords, endCoords, endOriginal, promotion);
	return icnmoves.getTokenFromMoveCoords({ startCoords: piece.original, endCoords: endOriginal, promotion }); // prettier-ignore
}

/**
 * Where a long slide lands on the original board. A landing near some piece's line (a crossing,
 * or a wiggle off one) is pinned to the same offset from it, which compression keeps; a landing
 * near no line keeps the compressed distance.
 */
function slideLanding(
	context: LiftContext,
	board: LiftBoard,
	piece: LiftPiece,
	delta: Coords,
): Coords | undefined {
	const steps = bimath.GCD(delta[0], delta[1]);
	const direction: Coords = [delta[0] / steps, delta[1] / steps];
	const landing: SquareValues = { compressed: formValues(context.forms, coordutil.addCoords(piece.compressed, delta)) }; // prettier-ignore
	const start = valuesOf(context, piece).original.exact;
	let pinned: bigint | undefined;
	const isConsistent = forEachNear(
		context,
		board,
		[piece],
		landing,
		(f, original, compressed) => {
			const along = lineforms.value(context.forms[f]!, direction);
			const compressedOffset = landing.compressed.exact[f]! - compressed;
			if (along === 0n || bimath.abs(compressedOffset) > enginehorizons.NEAR_LINE_SPAN)
				return true;
			const travel = compressedOffset - (start[f]! - original);
			if (travel % along !== 0n || (pinned !== undefined && pinned !== travel / along)) return false; // prettier-ignore
			pinned = travel / along;
			return true;
		},
	);
	const distance = pinned ?? steps;
	if (!isConsistent || distance <= 0n) return undefined;
	return [
		piece.original[0] + distance * direction[0],
		piece.original[1] + distance * direction[1],
	];
}

/**
 * Whether the original landing sits on the same residue, and as near every other piece's line as
 * the compressed one: nearness is all the engine reads of a landing far from where the piece left.
 */
function keepsRelations(
	context: LiftContext,
	board: LiftBoard,
	mover: LiftPiece,
	victim: LiftPiece | undefined,
	endOriginal: Coords,
	endCompressed: Coords,
): boolean {
	if (endCompressed.some((v, axis) => (v - endOriginal[axis]!) % lineforms.ORIGIN_GRID !== 0n)) return false; // prettier-ignore
	const landing: Required<SquareValues> = { original: formValues(context.forms, endOriginal), compressed: formValues(context.forms, endCompressed) }; // prettier-ignore
	return forEachNear(context, board, [mover, victim], landing, (f, original, compressed) => {
		const originalOffset = landing.original.exact[f]! - original;
		const compressedOffset = landing.compressed.exact[f]! - compressed;
		const isNear = bimath.abs(originalOffset) <= enginehorizons.NEAR_LINE_SPAN || bimath.abs(compressedOffset) <= enginehorizons.NEAR_LINE_SPAN; // prettier-ignore
		return !isNear || originalOffset === compressedOffset;
	});
}

/**
 * Visits every other piece's and lone line's exact values under each form where its line may pass
 * within the near-line span of `landing` on a board `landing` has, until `visit` returns false.
 * Doubles rule out the rest, so most pieces cost no bigint arithmetic.
 */
function forEachNear(
	context: LiftContext,
	board: LiftBoard,
	excluded: (LiftPiece | undefined)[],
	landing: SquareValues,
	visit: (form: number, original: bigint, compressed: bigint) => boolean,
): boolean {
	for (const other of board.values()) {
		if (excluded.includes(other)) continue;
		const { original, compressed } = valuesOf(context, other);
		for (let f = 0; f < context.forms.length; f++) {
			if (mayBeNear(landing, f, original.approx[f]!, compressed.approx[f]!) && !visit(f, original.exact[f]!, compressed.exact[f]!)) return false; // prettier-ignore
		}
	}
	for (const line of context.lines) {
		if (mayBeNear(landing, line.form, Number(line.original), Number(line.compressed)) && !visit(line.form, line.original, line.compressed)) return false; // prettier-ignore
	}
	return true;
}

/** Whether a line, by its values as doubles, may pass within the near-line span of `landing` under form `f`. */
function mayBeNear(
	landing: SquareValues,
	f: number,
	original: number,
	compressed: number,
): boolean {
	return isApproxNear(landing.compressed.approx[f]!, compressed) || (landing.original !== undefined && isApproxNear(landing.original.approx[f]!, original)); // prettier-ignore
}

/**
 * Whether two doubles may lie within the near-line span of each other, allowing for rounding.
 * Values beyond double range compare as NaN, which counts as near.
 */
function isApproxNear(a: number, b: number): boolean {
	return !(Math.abs(a - b) > NEAR_LINE_SPAN + (Math.abs(a) + Math.abs(b)) * APPROX_ERROR + 1);
}

/** A piece's values on both boards. */
function valuesOf(context: LiftContext, piece: LiftPiece): Required<SquareValues> {
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
 * capture, a promotion. A move from an empty square is skipped, as the engine's replay skips it.
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

/** Castling: the nearest piece beyond the royal along its rank lands just behind the royal's landing. */
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
