// src/server/game/featured/featuredSelection.unit.test.ts

/**
 * Pins the featured-games policy: scoring, the stale curve, the finished-game hold,
 * and the slot rules — boards never re-sort, and only a way-better game displaces one.
 */

import type { Contender } from './featuredSelection.js';

import { describe, it, expect } from 'vitest';

import clockutil from '../../../shared/chess/util/clockutil.js';

import featuredSelection from './featuredSelection.js';

/** A fresh, unconcluded contender with the given score. */
function contender(id: number, score: number, overrides: Partial<Contender> = {}): Contender {
	return { id, score, moveCount: 0, stale: false, released: false, ...overrides };
}

/** Slots filled to capacity, whatever it is, with distinct scores, best first. */
function fullSlots(): Contender[] {
	const waiting = Array.from({ length: 50 }, (_, i) => contender(i, 1000 + i));
	const ids = featuredSelection.select([], waiting);
	return ids.map((id) => waiting[id]!);
}

describe('score', () => {
	it('averages the seats', () => {
		expect(featuredSelection.score([1000, 2000])).toBe(featuredSelection.score([1500]));
	});
	it('scores every guest the same', () => {
		expect(featuredSelection.score([undefined, undefined])).toBe(featuredSelection.score([undefined])); // prettier-ignore
	});
});

describe('staleLimitMs', () => {
	it('never shortens for a longer time control', () => {
		const clocks = ['60+0', '180+2', '480+3', '900+5', '1800+0', '3600+60'] as const;
		const limits = clocks.map((c) => featuredSelection.staleLimitMs(c));
		for (let i = 1; i < limits.length; i++)
			expect(limits[i]).toBeGreaterThanOrEqual(limits[i - 1]!);
	});
	it('stops growing past some length', () => {
		expect(featuredSelection.staleLimitMs('3600000+0')).toBe(featuredSelection.staleLimitMs('7200000+0')); // prettier-ignore
	});
	it('gives an untimed game the default time control', () => {
		expect(featuredSelection.staleLimitMs('-')).toBe(featuredSelection.staleLimitMs(clockutil.DEFAULT_TIME_CONTROL)); // prettier-ignore
	});
});

describe('releaseTime', () => {
	const checkmate = { victor: 1, condition: 'checkmate' } as const;
	it('releases an aborted game the moment it ends', () => {
		expect(featuredSelection.releaseTime({ condition: 'aborted' }, 50_000)).toBe(50_000);
	});
	it('holds a finished game past its end', () => {
		expect(featuredSelection.releaseTime(checkmate, 50_000)).toBeGreaterThan(50_000);
	});
});

describe('select', () => {
	it('fills empty slots best first', () => {
		expect(featuredSelection.select([], [contender(1, 1500), contender(2, 1800)])).toEqual([
			2, 1,
		]);
	});
	it('breaks a tie with the fewest moves', () => {
		const waiting = [
			contender(1, 1500, { moveCount: 9 }),
			contender(2, 1500, { moveCount: 3 }),
		];
		expect(featuredSelection.select([], waiting)).toEqual([2, 1]);
	});
	it('never makes a stale game a candidate', () => {
		const waiting = [contender(1, 2000, { stale: true }), contender(2, 1500)];
		expect(featuredSelection.select([], waiting)).toEqual([2]);
	});
	it('replaces a stale board in place', () => {
		const shown = [contender(1, 1500, { stale: true }), contender(2, 1500)];
		expect(featuredSelection.select(shown, [contender(3, 1400)])).toEqual([3, 2]);
	});
	it('keeps a stale board when nothing is waiting', () => {
		expect(featuredSelection.select([contender(1, 1500, { stale: true })], [])).toEqual([1]);
	});
	it('refills a released board in place', () => {
		const shown = [contender(1, 1500, { released: true }), contender(2, 1500)];
		expect(featuredSelection.select(shown, [contender(3, 1400)])).toEqual([3, 2]);
	});
	it('closes up a released board nothing refills', () => {
		const shown = [contender(1, 1500, { released: true }), contender(2, 1500)];
		expect(featuredSelection.select(shown, [])).toEqual([2]);
	});
	it('appends a newcomer on the right while there is room', () => {
		const shown = [contender(1, 1400)];
		expect(featuredSelection.select(shown, [contender(2, 1900)])).toEqual([1, 2]);
	});
	it('keeps full slots for a game only slightly better than the lowest', () => {
		const shown = fullSlots();
		const lowest = shown.at(-1)!;
		const ids = featuredSelection.select(shown, [contender(-1, lowest.score + 1)]);
		expect(ids).toEqual(shown.map((c) => c.id));
	});
	it('displaces the lowest board in place for a far better game', () => {
		const shown = fullSlots();
		const ids = featuredSelection.select(shown, [contender(-1, 100_000)]);
		expect(ids).toEqual([...shown.slice(0, -1).map((c) => c.id), -1]);
	});
});
