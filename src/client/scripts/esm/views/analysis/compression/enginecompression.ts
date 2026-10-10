// src/client/scripts/esm/views/analysis/compression/enginecompression.ts

/**
 * Brings an engine-bound ICN within the engine's i64 coordinates, and maps the engine's lines
 * back. An ICN already in range passes through untouched. One further out is compressed
 * ({@link positioncompressor}) together with its move history, so repetitions still register.
 */

import type { Slider } from './crossings.js';
import type { Vec2Key } from '../../../../../../shared/util/math/vectors.js';
import type { RawType } from '../../../../../../shared/chess/util/typeutil.js';
import type { LineForm } from './lineforms.js';
import type { LiftBoard } from './movelifter.js';
import type { MoveParsed } from '../../../../../../shared/chess/logic/icn/icnmoves.js';
import type { CompressionPoint } from './clustering.js';
import type { Coords, CoordsKey } from '../../../../../../shared/util/coordutil.js';
import type { LongFormatIn, LongFormatOut } from '../../../../../../shared/chess/logic/icn/icnconverter.js'; // prettier-ignore

import bimath from '../../../../../../shared/util/math/bimath.js';
import vectors from '../../../../../../shared/util/math/vectors.js';
import typeutil from '../../../../../../shared/chess/util/typeutil.js';
import icnmoves from '../../../../../../shared/chess/logic/icn/icnmoves.js';
import movesets from '../../../../../../shared/chess/logic/movesets.js';
import coordutil from '../../../../../../shared/util/coordutil.js';
import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter.js';

import lineforms from './lineforms.js';
import movelifter from './movelifter.js';
import positioncompressor from './positioncompressor.js';

// Types -----------------------------------------------------------------------

/** A position as the engine receives it. */
export interface EnginePosition {
	icn: string;
	/** Maps an engine line from this position onto the original board, cut at its first move that can't be. */
	liftLine: (tokens: string[]) => string[];
}

/** The points a compression keeps, and where each square and line sits among them. */
interface PointSet {
	points: CompressionPoint[];
	squares: Map<CoordsKey, number>;
	lines: Map<string, number>;
}

// Constants -------------------------------------------------------------------

/** The engine plays every piece by its default moveset. */
const MOVESETS = movesets.getPieceDefaultMovesets();

/** Files, ranks and both diagonals, which the engine's evaluation reads whatever the pieces. */
const BASE_VECTORS: Vec2Key[] = ['0,1', '1,0', '1,1', '1,-1'];

// Functions -------------------------------------------------------------------

/**
 * The position `icn` describes, within the engine's ±`limit` coordinates,
 * or undefined when it can't be compressed faithfully.
 */
function prepare(icn: string, limit: bigint): EnginePosition | undefined {
	const longform = icnconverter.ShortToLong_Format(icn);
	if (!longform.position || isWithin(longform, limit))
		return { icn, liftLine: (tokens) => tokens };

	const current = afterMoves(longform);
	const rawTypes = new Set<RawType>(longform.gameRules.promotion?.pieces);
	for (const type of longform.position.values()) rawTypes.add(typeutil.getRawType(type));
	for (const piece of current.values()) rawTypes.add(typeutil.getRawType(piece.type));
	const forms = formsFor(rawTypes);
	const pointSet = collectPoints(longform, forms, limit);
	const compressed = positioncompressor.compress(
		{
			points: pointSet.points,
			forms,
			sliders: findSliders(current, pointSet, forms),
			readsExactDistances: [...rawTypes].some((type) => MOVESETS[type]?.blocking || MOVESETS[type]?.ignore), // prettier-ignore
		},
		limit,
	);
	if (!compressed) return undefined;

	const toCompressed = (coords: Coords): Coords => compressed[pointSet.squares.get(coordutil.getKeyFromCoords(coords))!]!; // prettier-ignore
	/** A line never collected (a border edge clamped to the limit) stays where it is. */
	const lineValue = (form: number, value: bigint): bigint => {
		const point = pointSet.lines.get(`${form}:${value}`);
		return point === undefined ? value : lineforms.value(forms[form]!, compressed[point]!);
	};
	const compressedIcn = icnconverter.LongToShort_Format(rebuild(longform, forms, toCompressed, lineValue), icnconverter.COMPACT_FORMAT_OPTIONS); // prettier-ignore

	const lines = [...pointSet.lines.values()].map((p) => {
		const form = pointSet.points[p]!.line!.form;
		return { form, original: lineforms.value(forms[form]!, pointSet.points[p]!.coords), compressed: lineforms.value(forms[form]!, compressed[p]!) }; // prettier-ignore
	});
	const context = movelifter.createContext(forms, lines);
	const board: LiftBoard = new Map();
	for (const piece of current.values()) {
		const compressedSquare = toCompressed(piece.original);
		board.set(coordutil.getKeyFromCoords(compressedSquare), {
			...piece,
			compressed: compressedSquare,
		});
	}
	return {
		icn: compressedIcn,
		liftLine: (tokens) => movelifter.liftLine(context, board, tokens),
	};
}

/** Whether every coordinate the ICN carries lies within ±`limit`. Its world border is already clamped. */
function isWithin(longform: LongFormatOut, limit: bigint): boolean {
	const within = (v: bigint): boolean => bimath.abs(v) <= limit;
	const squares: Coords[] = [...longform.position!.keys()].map((key) =>
		coordutil.getCoordsFromKey(key),
	);
	for (const move of longform.moves ?? []) squares.push(move.startCoords, move.endCoords);
	if (longform.state_global.enpassant) squares.push(longform.state_global.enpassant.square);
	const ranks = Object.values(longform.gameRules.promotion?.ranks ?? {}).flat();
	return squares.every((square) => square.every(within)) && ranks.every(within);
}

/**
 * The position after the ICN's moves, the board the engine searches from. Compressed squares
 * aren't known yet, so each piece stands on its original square on both of {@link movelifter.play}'s boards.
 */
function afterMoves(longform: LongFormatOut): LiftBoard {
	const board: LiftBoard = new Map();
	for (const [key, type] of longform.position!) {
		const square = coordutil.getCoordsFromKey(key);
		board.set(key, { type, original: square, compressed: square });
	}
	for (const move of longform.moves ?? []) movelifter.play(board, move.startCoords, move.endCoords, move.endCoords, move.promotion); // prettier-ignore
	return board;
}

/** The base forms, then every further one a present piece slides along. */
function formsFor(rawTypes: Set<RawType>): LineForm[] {
	const forms: LineForm[] = [];
	const vectorKeys = [...BASE_VECTORS, ...[...rawTypes].flatMap((type) => Object.keys(MOVESETS[type]?.sliding ?? {}) as Vec2Key[])]; // prettier-ignore
	for (const key of vectorKeys) {
		const form = lineforms.fromVector(vectors.getVec2FromKey(key));
		if (!forms.some((f) => f.a === form.a && f.b === form.b)) forms.push(form);
	}
	return forms;
}

/**
 * Every square the position and its move history touch, plus each real world-border edge and
 * promotion rank as a lone line. A border edge at `limit` was clamped there, so it stands for none.
 */
function collectPoints(longform: LongFormatOut, forms: LineForm[], limit: bigint): PointSet {
	const pointSet: PointSet = { points: [], squares: new Map(), lines: new Map() };
	const addSquare = (coords: Coords): void => {
		const key = coordutil.getKeyFromCoords(coords);
		if (pointSet.squares.has(key)) return;
		pointSet.squares.set(key, pointSet.points.length);
		pointSet.points.push({ coords });
	};
	const addLine = (form: number, value: bigint, boundary: boolean): void => {
		const key = `${form}:${value}`;
		if (pointSet.lines.has(key)) return;
		pointSet.lines.set(key, pointSet.points.length);
		pointSet.points.push({
			coords: forms[form]!.a === 0n ? [0n, value] : [value, 0n],
			line: { form, boundary },
		});
	};

	for (const key of longform.position!.keys()) addSquare(coordutil.getCoordsFromKey(key));
	for (const move of longform.moves ?? []) {
		addSquare(move.startCoords);
		addSquare(move.endCoords);
	}
	const enpassant = longform.state_global.enpassant;
	if (enpassant) {
		addSquare(enpassant.square);
		addSquare(enpassant.pawn);
	}
	const [fileForm, rankForm] = [formIndex(forms, 0n), formIndex(forms, 1n)];
	const border = longform.gameRules.worldBorder;
	for (const [edge, form] of [
		[border?.left, fileForm],
		[border?.right, fileForm],
		[border?.bottom, rankForm],
		[border?.top, rankForm],
	] as const) {
		if (edge !== undefined && edge !== null && bimath.abs(edge) < limit)
			addLine(form, edge, true);
	}
	for (const rank of Object.values(longform.gameRules.promotion?.ranks ?? {}).flat()) addLine(rankForm, rank, false); // prettier-ignore
	return pointSet;
}

/** The index of the file form (`a` = 1, `b` = 0) or rank form (`a` = 0, `b` = 1), by its `b`. */
function formIndex(forms: LineForm[], b: bigint): number {
	return forms.findIndex((form) => form.b === b && form.a === 1n - b);
}

/** Every piece that slides, with the forms of the lines it slides along. */
function findSliders(current: LiftBoard, pointSet: PointSet, forms: LineForm[]): Slider[] {
	const sliders: Slider[] = [];
	for (const piece of current.values()) {
		const sliding = MOVESETS[typeutil.getRawType(piece.type)]?.sliding;
		if (!sliding) continue;
		const slideForms = (Object.keys(sliding) as Vec2Key[]).map((vectorKey) => {
			const form = lineforms.fromVector(vectors.getVec2FromKey(vectorKey));
			return forms.findIndex((f) => f.a === form.a && f.b === form.b);
		});
		sliders.push({
			point: pointSet.squares.get(coordutil.getKeyFromCoords(piece.original))!,
			forms: slideForms,
		});
	}
	return sliders;
}

/** The longform with every coordinate compressed. */
function rebuild(
	longform: LongFormatOut,
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
		position: new Map([...longform.position!].map(([key, type]) => [compressKey(key), type])),
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
	prepare,
};
