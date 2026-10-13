// src/shared/chess/logic/compression/gamecompression.unit.test.ts

/**
 * Tests for game compression: every legal move on a compressed game, by the site's own rules, lifts
 * to a legal move on the original whose landing relates to every line as the compressed one does.
 */

import type { Coords } from '../../../util/coordutil.js';
import type { GameFile } from '../gamefile.js';
import type { LineForm } from './lineforms.js';
import type { MoveCoords } from '../icn/icnmoves.js';
import type { LiftBoard } from './movelifter.js';
import type { LongFormatOut } from '../icn/icnconverter.js';

import { describe, it, expect } from 'vitest';

import vectors from '../../../util/math/vectors.js';
import gamefile from '../gamefile.js';
import boardutil from '../boardutil.js';
import coordutil from '../../../util/coordutil.js';
import icnimport from '../icn/icnimport.js';
import legalmoves from '../legalmoves.js';
import icnconverter from '../icn/icnconverter.js';
import movepiece from '../movepiece.js';
import movevalidation from '../movevalidation.js';
import typeutil, { rawTypes as r } from '../../util/typeutil.js';

import lineforms from './lineforms.js';
import movelifter from './movelifter.js';
import gamecompression from './gamecompression.js';

// Constants -------------------------------------------------------------------

const ARBITRARY_DISTANCE = 2n ** 14n;
const OPTIONS = { arbitraryDistance: ARBITRARY_DISTANCE, bound: 2n ** 54n, grid: 1n };

// Helpers ---------------------------------------------------------------------

/** The game an ICN describes, its moves validated. */
function gameOf(longform: LongFormatOut): GameFile {
	const variantOptions = icnimport.variantOptionsFromLongFormat(longform);
	const moves = icnimport.movePacketsFromParsed(longform.moves ?? []);
	return gamefile.initGameFile('-', 0, undefined, { variantOptions, moves }, true);
}

/** An ICN's game, its compression, and the compressed game. */
function compress(icn: string): {
	original: GameFile;
	compressed: ReturnType<typeof gamecompression.compress>;
	board: GameFile | undefined;
	longform: LongFormatOut;
} {
	const longform = icnconverter.ShortToLong_Format(icn);
	const original = gameOf(longform);
	const compressed = gamecompression.compress(longform, original.pieceMovesets, OPTIONS);
	const board = compressed && gameOf(icnconverter.ShortToLong_Format(icnconverter.LongToShort_Format(compressed.longform, icnconverter.COMPACT_FORMAT_OPTIONS))); // prettier-ignore
	return { original, compressed, board, longform };
}

/** A seeded [0, 1) generator. */
function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
	};
}

/** A random position: an army near the origin and a few pieces up to 10^60 squares out. */
function randomIcn(random: () => number, kind: 'aligned' | 'scattered' | 'knightriders'): string {
	const int = (low: number, high: number): number =>
		low + Math.floor(random() * (high - low + 1));
	const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]!;
	const types = ['Q', 'q', 'R', 'r', 'B', 'b', 'AM', 'am', 'CH', 'ch', 'AR', 'ar', 'N', 'n', 'P', 'p', ...(kind === 'knightriders' ? ['NR', 'nr'] : [])]; // prettier-ignore
	const far = (): bigint => BigInt(int(1, 9)) * 10n ** BigInt(int(4, 60)) + BigInt(int(-20, 20));
	const sign = (): bigint => (random() < 0.5 ? -1n : 1n);
	const pieces: [string, bigint, bigint][] = [['K', 0n, 0n], ['k', BigInt(int(-6, 6)), BigInt(int(3, 9))]]; // prettier-ignore
	for (let i = int(2, 8); i > 0; i--) pieces.push([pick(types), BigInt(int(-8, 8)), BigInt(int(-8, 8))]); // prettier-ignore
	for (let i = int(1, 5); i > 0; i--) {
		if (kind === 'scattered') {
			pieces.push([pick(types), far() * sign(), far() * sign()]);
			continue;
		}
		const [, x, y] = pick(pieces);
		const [dx, dy] = pick([
			[1n, 0n],
			[0n, 1n],
			[1n, 1n],
			[1n, -1n],
		] as Coords[]);
		const d = far() * sign();
		pieces.push([pick(types), x + d * dx, y + d * dy + (random() < 0.3 ? BigInt(int(-3, 3)) : 0n)]); // prettier-ignore
	}
	const seen = new Set<string>();
	const unique = pieces.filter(([, x, y]) => !seen.has(`${x},${y}`) && seen.add(`${x},${y}`));
	const promotion = random() < 0.5 ? `(${int(8, 12)}|-${int(8, 12)}) ` : '';
	return `${random() < 0.5 ? 'w' : 'b'} 0/100 1 ${promotion}${unique.map(([t, x, y]) => `${t}${x},${y}`).join('|')}`; // prettier-ignore
}

/** Each piece on both boards: the two longforms list the start position and moves in step. */
function pairPieces(longform: LongFormatOut, compressedLongform: LongFormatOut): LiftBoard {
	const pairs: LiftBoard = new Map();
	const starts = [...longform.position!.keys()];
	[...compressedLongform.position!].forEach(([key, type], i) => {
		pairs.set(key, { type, original: coordutil.getCoordsFromKey(starts[i]!), compressed: coordutil.getCoordsFromKey(key) }); // prettier-ignore
	});
	(compressedLongform.moves ?? []).forEach((move, i) => movelifter.play(pairs, move.startCoords, move.endCoords, longform.moves![i]!.endCoords, move.promotion)); // prettier-ignore
	return pairs;
}

/** Files, ranks and every line a piece of the game slides along. */
function gameForms(game: GameFile): LineForm[] {
	const keys = new Set(['1,0', '0,1']);
	for (const moveset of Object.values(game.pieceMovesets)) for (const key of Object.keys(moveset?.sliding ?? {})) keys.add(key); // prettier-ignore
	return [...keys].map((key) => lineforms.fromVector(vectors.getVec2FromKey(key as `${bigint},${bigint}`))); // prettier-ignore
}

/**
 * Every legal move of the side to move on `board`: each jump, and each slide around and between
 * every line crossing its path, at and around the arbitrary distance from each, and far beyond.
 */
function sampleLegalMoves(board: GameFile, forms: LineForm[]): MoveCoords[] {
	const moves: MoveCoords[] = [];
	const squares = boardutil.getCoordsOfAllPieces(board.pieces);
	const offsets = [0n, 1n, -1n, 2n, -2n, ARBITRARY_DISTANCE, -ARBITRARY_DISTANCE, ARBITRARY_DISTANCE + 1n, -ARBITRARY_DISTANCE - 1n]; // prettier-ignore
	for (const piece of boardutil.iteratePiecesOfColor(board.pieces, board.whosTurn)) {
		const legal = legalmoves.calculateAll(board, piece);
		const targets: Coords[] = [...legal.individual];
		for (const key of Object.keys(legal.sliding)) {
			const direction = vectors.getVec2FromKey(key as `${bigint},${bigint}`);
			const steps = new Set<bigint>([
				1n,
				-1n,
				10n ** 9n,
				-(10n ** 9n),
				2n ** 50n,
				-(2n ** 50n),
			]);
			const crossings = squares.flatMap((square) => forms.flatMap((form) => {
				const along = lineforms.value(form, direction);
				return along === 0n ? [] : [(lineforms.value(form, square) - lineforms.value(form, piece.coords)) / along]; // prettier-ignore
			})).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); // prettier-ignore
			crossings.forEach((t, i) => {
				for (const offset of offsets) steps.add(t + offset);
				if (i > 0) steps.add((crossings[i - 1]! + t) / 2n);
			});
			for (const t of steps) if (t !== 0n) targets.push([piece.coords[0] + t * direction[0], piece.coords[1] + t * direction[1]]); // prettier-ignore
		}
		for (const endCoords of targets) {
			const move: MoveCoords = { startCoords: piece.coords, endCoords };
			if (typeutil.getRawType(piece.type) === r.PAWN && board.gameRules.promotion?.ranks[board.whosTurn]?.includes(endCoords[1])) move.promotion = typeutil.buildType(r.QUEEN, board.whosTurn); // prettier-ignore
			if (movevalidation.validateMove(board, { ...move }).valid) moves.push(move);
		}
	}
	return moves;
}

/** Whether a landing relates to every other piece under every form on both boards alike. */
function keepsRelations(
	others: LiftBoard,
	forms: LineForm[],
	original: Coords,
	compressed: Coords,
): boolean {
	for (const piece of others.values()) {
		for (const form of forms) {
			const offset = lineforms.value(form, original) - lineforms.value(form, piece.original);
			const compressedOffset = lineforms.value(form, compressed) - lineforms.value(form, piece.compressed); // prettier-ignore
			const isNear = (offset < 0n ? -offset : offset) <= ARBITRARY_DISTANCE || (compressedOffset < 0n ? -compressedOffset : compressedOffset) <= ARBITRARY_DISTANCE; // prettier-ignore
			if (isNear ? offset !== compressedOffset : offset > 0n !== compressedOffset > 0n)
				return false;
		}
	}
	return true;
}

/**
 * Lifts every sampled legal move of a compressed game, expecting each legal with its relations
 * kept.
 */
function expectFaithfulLifts(icn: string): void {
	const { original, compressed, board, longform } = compress(icn);
	expect(compressed).toBeDefined();
	const forms = gameForms(original);
	const pairs = pairPieces(longform, icnconverter.ShortToLong_Format(icnconverter.LongToShort_Format(compressed!.longform, icnconverter.COMPACT_FORMAT_OPTIONS))); // prettier-ignore
	for (const move of sampleLegalMoves(board!, forms)) {
		const [lifted] = compressed!.liftLine([move]);
		expect(lifted, `${move.startCoords}>${move.endCoords} in ${icn}`).toBeDefined();
		expect(movevalidation.validateMove(original, { ...lifted! }).valid).toBe(true);
		const others = new Map([...pairs].filter(([, piece]) => !coordutil.areCoordsEqual(piece.compressed, move.startCoords) && !coordutil.areCoordsEqual(piece.compressed, move.endCoords))); // prettier-ignore
		expect(keepsRelations(others, forms, lifted!.endCoords, move.endCoords)).toBe(true);
	}
}

// Tests -----------------------------------------------------------------------

describe('gamecompression', () => {
	it('passes a game within the bound through untouched', () => {
		const longform = icnconverter.ShortToLong_Format('w K0,0|k5,5|Q3,3');
		const compressed = gamecompression.compress(
			longform,
			gameOf(longform).pieceMovesets,
			OPTIONS,
		);
		expect(compressed?.longform).toBe(longform);
	});

	it('refuses a game that leaves its position to its variant', () => {
		const longform = icnconverter.ShortToLong_Format('[Variant "Classical"] w');
		expect(gamecompression.compress(longform, {}, OPTIONS)).toBeUndefined();
	});

	it('refuses a game whose pieces read exact distances at any range', () => {
		const longform = icnconverter.ShortToLong_Format(`w K0,0|k5,5|HU3,${10n ** 30n}`);
		expect(gamecompression.compress(longform, gameOf(longform).pieceMovesets, OPTIONS)).toBeUndefined(); // prettier-ignore
	});

	it('keeps a slide on the same side of every line crossing its path', () => {
		const queenY = 10n ** 31n + 8n;
		const icn = `w 1/100 2 (8|1) P1,2+|P2,2+|P3,2+|P4,2+|P6,2+|P7,2+|P8,2+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|R1,1+|R8,1+|r1,8+|r8,8+|N2,1|N7,1|n2,8|n7,8|B3,1|B6,1|b3,8|b6,8|Q4,1|K5,1+|k5,8+|P5,3|q4,${queenY}`; // prettier-ignore
		const { original, compressed, board } = compress(icn);
		const queen = boardutil.getCoordsOfAllPieces(board!.pieces).find((square) => square[0] === 4n && square[1] > 8n)!; // prettier-ignore
		// Where the queen's falling diagonal meets the rook's rank, on each board.
		const [crossing, originalCrossing] = [queen[0] + queen[1] - 1n, 4n + queenY - 1n];
		// Halfway between the rook and the crossing, either side of it, and far past it.
		for (const offset of [(9n - crossing) / 2n, -1n, 1n, 10n ** 12n]) {
			const move: MoveCoords = { startCoords: [8n, 1n], endCoords: [crossing + offset, 1n] };
			expect(movevalidation.validateMove(board!, { ...move }).valid).toBe(true);
			const [lifted] = compressed!.liftLine([move]);
			expect(lifted!.endCoords[0] - originalCrossing > 0n).toBe(offset > 0n);
			if (offset === 1n || offset === -1n) expect(lifted!.endCoords[0]).toBe(originalCrossing + offset); // prettier-ignore
			expect(movevalidation.validateMove(original, { ...lifted! }).valid).toBe(true);
		}
	});

	for (const kind of ['aligned', 'scattered', 'knightriders'] as const) {
		it(`lifts every legal move faithfully, far pieces ${kind}`, () => {
			const random = seededRandom(kind.length);
			for (let run = 0; run < 6; run++) expectFaithfulLifts(randomIcn(random, kind));
		});
	}

	it('lifts every legal move faithfully after a move history', () => {
		expectFaithfulLifts(`w 0/100 1 K0,0|k3,7|R-4,2|q2,${10n ** 40n}|B5,${-(10n ** 25n)}|r${10n ** 33n},5 -4,2>-4,6|2,${10n ** 40n}>${10n ** 40n + 2n},${10n ** 40n}`); // prettier-ignore
	});

	it('lifts a line of moves up to its first that can not be, each legal in turn', () => {
		const random = seededRandom(7);
		for (let run = 0; run < 4; run++) {
			const { original, compressed, board } = compress(randomIcn(random, 'scattered'));
			const forms = gameForms(original);
			const line: MoveCoords[] = [];
			for (let ply = 0; ply < 6; ply++) {
				const moves = sampleLegalMoves(board!, forms);
				if (moves.length === 0) break;
				const move = moves[Math.floor(random() * moves.length)]!;
				line.push(move);
				const verdict = movevalidation.validateMove(board!, { ...move });
				if (!verdict.valid) throw Error('A sampled move must be legal.');
				movepiece.generateAndMakeMove(board!, verdict.tagged);
			}
			const lifted = compressed!.liftLine(line);
			expect(lifted.length).toBeGreaterThan(0);
			for (const move of lifted) {
				const verdict = movevalidation.validateMove(original, { ...move });
				expect(verdict.valid).toBe(true);
				if (verdict.valid) movepiece.generateAndMakeMove(original, verdict.tagged);
			}
		}
	}, 30_000);
});
