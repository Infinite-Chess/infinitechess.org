// src/shared/chess/logic/compression/gamecompression.ts

/**
 * Brings a game's coordinates within a bound, and maps moves on the compressed game back. A game
 * already within it passes through untouched. One further out is compressed
 * ({@link positioncompressor}) together with its move history, so its repetitions still register.
 */

import type { LineForm } from './lineforms.js';
import type { Slider } from './paths.js';
import type { Movesets } from '../movesets.js';
import type { Vec2Key } from '../../../util/math/vectors.js';
import type { RawType } from '../../util/typeutil.js';
import type { CompressionPoint } from './clustering.js';
import type { Coords, CoordsKey } from '../../../util/coordutil.js';
import type { LiftBoard, LiftLine } from './movelifter.js';
import type { CompressionOptions } from './positioncompressor.js';
import type { MoveCoords, MoveParsed } from '../icn/icnmoves.js';
import type { LongFormatIn, LongFormatOut } from '../icn/icnconverter.js';

import bimath from '../../../util/math/bimath.js';
import vectors from '../../../util/math/vectors.js';
import icnmoves from '../icn/icnmoves.js';
import coordutil from '../../../util/coordutil.js';
import typeutil, { players as p } from '../../util/typeutil.js';

import lineforms from './lineforms.js';
import movelifter from './movelifter.js';
import positioncompressor from './positioncompressor.js';

// Types -----------------------------------------------------------------------

/** A game within the bound, and how to map its moves back onto the original. */
interface CompressedGame {
	longform: LongFormatIn;
	/**
	 * Maps a line of moves from the compressed game's position onto the original, cut at its first
	 * move that can't be.
	 */
	liftLine: (moves: MoveCoords[]) => MoveCoords[];
}

/** A game's start position: each square's piece type. */
type Position = ReadonlyMap<CoordsKey, number>;

/** The points a compression keeps, and where each square and line sits among them. */
interface PointSet {
	points: CompressionPoint[];
	/** How many leading points the position's lines pass through (see {@link collectPoints}). */
	lineCount: number;
	squares: Map<CoordsKey, number>;
	lines: Map<string, number>;
}

// Functions -------------------------------------------------------------------

/**
 * The game within ±`options.bound`, or undefined when it can't be compressed faithfully, as when
 * its ICN leaves the position to its variant.
 * @param movesets - How the game's pieces move.
 */
function compress(
	longform: LongFormatOut,
	movesets: Movesets,
	options: CompressionOptions,
): CompressedGame | undefined {
	const { position } = longform;
	if (!position) return undefined;
	if (isWithin(longform, position, options.bound))
		return { longform, liftLine: (moves) => moves };

	const current = afterMoves(longform, position);
	const rawTypes = new Set<RawType>(longform.gameRules.promotion?.pieces);
	for (const type of position.values()) rawTypes.add(typeutil.getRawType(type));
	const forms = formsFor(movesets, rawTypes);
	if (readsExactDistances(movesets, rawTypes, forms, options.arbitraryDistance)) return undefined; // prettier-ignore
	const pointSet = collectPoints(longform, position, current, forms);
	const compressed = positioncompressor.compress(
		{
			points: pointSet.points,
			lineCount: pointSet.lineCount,
			forms,
			sliders: findSliders(movesets, current, pointSet, forms),
		},
		options,
	);
	if (!compressed) return undefined;

	const toCompressed = (coords: Coords): Coords => compressed[pointSet.squares.get(coordutil.getKeyFromCoords(coords))!]!; // prettier-ignore
	const lineValue = (form: number, value: bigint): bigint => lineforms.value(forms[form]!, compressed[pointSet.lines.get(`${form}:${value}`)!]!); // prettier-ignore
	const lines: LiftLine[] = [...pointSet.lines.values()].map((point) => {
		const form = pointSet.points[point]!.line!.form;
		return { form, original: lineforms.value(forms[form]!, pointSet.points[point]!.coords), compressed: lineforms.value(forms[form]!, compressed[point]!) }; // prettier-ignore
	});
	const context = movelifter.createContext(forms, lines, options.arbitraryDistance, lineforms.residueModulus(forms, options.grid)); // prettier-ignore
	const board: LiftBoard = new Map();
	for (const piece of current.values()) {
		const square = toCompressed(piece.original);
		board.set(coordutil.getKeyFromCoords(square), { ...piece, compressed: square });
	}
	return {
		longform: rebuild(longform, position, forms, toCompressed, lineValue),
		liftLine: (moves) => movelifter.liftLine(context, board, moves),
	};
}

/** Whether every coordinate the game carries lies within ±`bound`. */
function isWithin(longform: LongFormatOut, position: Position, bound: bigint): boolean {
	const within = (v: bigint | null): boolean => v === null || bimath.abs(v) <= bound;
	const squares: Coords[] = [...position.keys()].map((key) => coordutil.getCoordsFromKey(key));
	for (const move of longform.moves ?? []) squares.push(move.startCoords, move.endCoords);
	if (longform.state_global.enpassant) squares.push(longform.state_global.enpassant.square);
	const border = longform.gameRules.worldBorder;
	const lines = [...Object.values(longform.gameRules.promotion?.ranks ?? {}).flat(), ...(border ? [border.left, border.right, border.bottom, border.top] : [])]; // prettier-ignore
	return squares.every((square) => square.every(within)) && lines.every(within);
}

/**
 * The position after the game's moves. Compressed squares aren't known yet, so each piece stands
 * on its original square on both of {@link movelifter.play}'s boards.
 */
function afterMoves(longform: LongFormatOut, position: Position): LiftBoard {
	const board: LiftBoard = new Map();
	for (const [key, type] of position) {
		const square = coordutil.getCoordsFromKey(key);
		board.set(key, { type, original: square, compressed: square });
	}
	for (const move of longform.moves ?? []) movelifter.play(board, move.startCoords, move.endCoords, move.endCoords, move.promotion); // prettier-ignore
	return board;
}

/** Files and ranks, then every further form a piece of the game slides along. */
function formsFor(movesets: Movesets, rawTypes: Set<RawType>): LineForm[] {
	const forms: LineForm[] = [];
	const vectorKeys = ['1,0', '0,1', ...[...rawTypes].flatMap((type) => Object.keys(movesets[type]?.sliding ?? {}))] as Vec2Key[]; // prettier-ignore
	for (const key of vectorKeys) {
		const form = lineforms.fromVector(vectors.getVec2FromKey(key));
		if (!forms.some((f) => f.a === form.a && f.b === form.b)) forms.push(form);
	}
	return forms;
}

/**
 * Whether a piece of the game reads an exact distance at any range, which no compression keeps:
 * a colinear mover (a Huygen's primes, a non-primitive slide), or a finite slide reaching past
 * the arbitrary distance.
 */
function readsExactDistances(
	movesets: Movesets,
	rawTypes: Set<RawType>,
	forms: readonly LineForm[],
	arbitraryDistance: bigint,
): boolean {
	return [...rawTypes].some((type) => {
		const moveset = movesets[type];
		if (!moveset) return false;
		if (moveset.colinear) return true;
		return Object.entries(moveset.sliding ?? {}).some(([key, limits]) => {
			const direction = vectors.getVec2FromKey(key as Vec2Key);
			const reach = forms.reduce((most, form) => bimath.max(most, bimath.abs(lineforms.value(form, direction))), 0n); // prettier-ignore
			return limits.some(
				(limit) => limit !== null && bimath.abs(limit) * reach > arbitraryDistance,
			);
		});
	});
}

/**
 * First the points whose lines the position holds: its pieces, and each world-border edge and
 * promotion rank as a lone line. Then the en passant squares, and the squares only the move
 * history touches.
 */
function collectPoints(
	longform: LongFormatOut,
	position: Position,
	current: LiftBoard,
	forms: LineForm[],
): PointSet {
	const pointSet: PointSet = { points: [], lineCount: 0, squares: new Map(), lines: new Map() };
	const addSquare = (coords: Coords): void => {
		const key = coordutil.getKeyFromCoords(coords);
		if (pointSet.squares.has(key)) return;
		pointSet.squares.set(key, pointSet.points.length);
		pointSet.points.push({ coords });
	};
	const addLine = (form: number, value: bigint): void => {
		const key = `${form}:${value}`;
		if (pointSet.lines.has(key)) return;
		pointSet.lines.set(key, pointSet.points.length);
		pointSet.points.push({ coords: forms[form]!.a === 0n ? [0n, value] : [value, 0n], line: { form } }); // prettier-ignore
	};

	for (const piece of current.values()) addSquare(piece.original);
	const [fileForm, rankForm] = [formIndex(forms, 0n), formIndex(forms, 1n)];
	const border = longform.gameRules.worldBorder;
	for (const [edge, form] of [
		[border?.left, fileForm],
		[border?.right, fileForm],
		[border?.bottom, rankForm],
		[border?.top, rankForm],
	] as const) {
		if (edge !== undefined && edge !== null) addLine(form, edge);
	}
	for (const rank of Object.values(longform.gameRules.promotion?.ranks ?? {}).flat()) addLine(rankForm, rank); // prettier-ignore
	pointSet.lineCount = pointSet.points.length;

	const enpassant = longform.state_global.enpassant;
	if (enpassant) {
		addSquare(enpassant.square);
		addSquare(enpassant.pawn);
	}
	for (const key of position.keys()) addSquare(coordutil.getCoordsFromKey(key));
	for (const move of longform.moves ?? []) {
		addSquare(move.startCoords);
		addSquare(move.endCoords);
	}
	return pointSet;
}

/** The index of the file form (`a` = 1, `b` = 0) or rank form (`a` = 0, `b` = 1), by its `b`. */
function formIndex(forms: LineForm[], b: bigint): number {
	return forms.findIndex((form) => form.b === b && form.a === 1n - b);
}

/** Every slide of every piece that can move, along the line of its form. */
function findSliders(
	movesets: Movesets,
	current: LiftBoard,
	pointSet: PointSet,
	forms: LineForm[],
): Slider[] {
	const sliders: Slider[] = [];
	for (const piece of current.values()) {
		const [rawType, player] = typeutil.splitType(piece.type);
		if (player === p.NEUTRAL) continue;
		const point = pointSet.squares.get(coordutil.getKeyFromCoords(piece.original))!;
		for (const [key, limits] of Object.entries(movesets[rawType]?.sliding ?? {})) {
			const form = lineforms.fromVector(vectors.getVec2FromKey(key as Vec2Key));
			sliders.push({ point, form: forms.findIndex((f) => f.a === form.a && f.b === form.b), limits }); // prettier-ignore
		}
	}
	return sliders;
}

/** The longform with every coordinate compressed. */
function rebuild(
	longform: LongFormatOut,
	position: Position,
	forms: LineForm[],
	toCompressed: (coords: Coords) => Coords,
	lineValue: (form: number, value: bigint) => bigint,
): LongFormatIn {
	const compressKey = (key: CoordsKey): CoordsKey => coordutil.getKeyFromCoords(toCompressed(coordutil.getCoordsFromKey(key))); // prettier-ignore
	const [fileForm, rankForm] = [formIndex(forms, 0n), formIndex(forms, 1n)];
	const { gameRules, state_global } = longform;
	const edge = (value: bigint | null, form: number): bigint | null => (value === null ? null : lineValue(form, value)); // prettier-ignore

	const rebuilt: LongFormatIn = {
		metadata: longform.metadata,
		gameRules: { ...gameRules },
		fullMove: longform.fullMove,
		position: new Map([...position].map(([key, type]) => [compressKey(key), type])),
		state_global: { ...state_global, specialRights: new Set([...(state_global.specialRights ?? [])].map(compressKey)) }, // prettier-ignore
		moves: (longform.moves ?? []).map((move) => compressMove(move, toCompressed)),
	};
	if (gameRules.promotion) {
		const ranks = Object.fromEntries(Object.entries(gameRules.promotion.ranks).map(([player, playerRanks]) => [player, playerRanks.map((rank) => lineValue(rankForm, rank))])); // prettier-ignore
		rebuilt.gameRules.promotion = { ...gameRules.promotion, ranks };
	}
	if (gameRules.worldBorder) {
		const { left, right, bottom, top } = gameRules.worldBorder;
		rebuilt.gameRules.worldBorder = { left: edge(left, fileForm), right: edge(right, fileForm), bottom: edge(bottom, rankForm), top: edge(top, rankForm) }; // prettier-ignore
	}
	if (state_global.enpassant) {
		rebuilt.state_global.enpassant = { square: toCompressed(state_global.enpassant.square), pawn: toCompressed(state_global.enpassant.pawn) }; // prettier-ignore
	}
	return rebuilt;
}

/** The move with both squares compressed. */
function compressMove(move: MoveParsed, toCompressed: (coords: Coords) => Coords): MoveParsed {
	const compressed: MoveParsed = { startCoords: toCompressed(move.startCoords), endCoords: toCompressed(move.endCoords), token: '' }; // prettier-ignore
	if (move.promotion !== undefined) compressed.promotion = move.promotion;
	compressed.token = icnmoves.getTokenFromMoveCoords(compressed);
	return compressed;
}

// Exports ---------------------------------------------------------------------

export default {
	compress,
};
