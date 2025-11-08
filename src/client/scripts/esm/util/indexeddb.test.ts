// @ts-nocheck
// src/client/scripts/esm/util/indexeddb.test.ts

/**
 * Functional tests for the IndexedDB storage module using a simulated IDB.
 * Uses fake-indexeddb and the module's resetDBInstance() for isolation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';

import indexeddb from './indexeddb.js';

beforeEach(() => {
	// Fresh fake IndexedDB and key range per test
	(globalThis as any).indexedDB = new FDBFactory();
	(globalThis as any).IDBKeyRange = FDBKeyRange;
	// Ensure module will open a brand-new DB for this test
	indexeddb.resetDBInstance();
});

describe('IndexedDB storage functional behavior', () => {
	it('getAllKeys returns [] initially', async() => {
		expect(await indexeddb.getAllKeys()).toEqual([]);
	});

	it('saves and loads an item', async() => {
		await indexeddb.saveItem('pos:1', { fen: 'start' });
		const value = await indexeddb.loadItem<{ fen: string }>('pos:1');
		expect(value).toEqual({ fen: 'start' });
	});

	it('overwrites an existing item with the same key', async() => {
		await indexeddb.saveItem('k', 'one');
		await indexeddb.saveItem('k', 'two');
		const value = await indexeddb.loadItem<string>('k');
		expect(value).toBe('two');
	});

	it('returns undefined for a missing key', async() => {
		const value = await indexeddb.loadItem('missing');
		expect(value).toBeUndefined();
	});

	it('deletes an item', async() => {
		await indexeddb.saveItem('x', 123);
		await indexeddb.deleteItem('x');
		const value = await indexeddb.loadItem('x');
		expect(value).toBeUndefined();
	});

	it('delete of a missing key resolves (no error)', async() => {
		await expect(indexeddb.deleteItem('nope')).resolves.toBeUndefined();
	});

	it('getAllKeys returns the current keys only', async() => {
		await indexeddb.saveItem('a', 1);
		await indexeddb.saveItem('b', 2);
		await indexeddb.deleteItem('a');
		const keys = await indexeddb.getAllKeys();
		expect(keys.sort()).toEqual(['b']);
	});

	it('eraseAll clears all items', async() => {
		await indexeddb.saveItem('a', 1);
		await indexeddb.saveItem('b', 2);
		await indexeddb.eraseAll();
		expect(await indexeddb.getAllKeys()).toEqual([]);
	});

	it('handles concurrent writes and reads', async() => {
		const writes = Array.from({ length: 50 }, (_, i) =>
			indexeddb.saveItem(`k${i}`, { v: i })
		);
		await Promise.all(writes);

		const keys = await indexeddb.getAllKeys();
		const numericSorted = [...keys].sort(
			(a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10)
		);
		expect(numericSorted).toEqual(
			Array.from({ length: 50 }, (_, i) => `k${i}`)
		);

		const reads = await Promise.all([
			indexeddb.loadItem('k0'),
			indexeddb.loadItem('k25'),
			indexeddb.loadItem('k49'),
		]);
		expect(reads).toEqual([{ v: 0 }, { v: 25 }, { v: 49 }]);
	});

	it('rejects with a clear error when IndexedDB is not supported', async() => {
		// Remove IndexedDB and reset instance so next init fails
		(globalThis as any).indexedDB = undefined;
		indexeddb.resetDBInstance();

		await expect(indexeddb.saveItem('a', 1))
			.rejects.toThrow('IndexedDB is not supported in this browser');

		await expect(indexeddb.loadItem('a'))
			.rejects.toThrow('IndexedDB is not supported in this browser');
	});

	it('resetDBInstance causes a fresh database (previous keys gone)', async() => {
		await indexeddb.saveItem('temp', 42);
		expect(await indexeddb.getAllKeys()).toEqual(['temp']);

		// Simulate a fresh environment
		indexeddb.resetDBInstance();
		(globalThis as any).indexedDB = new FDBFactory();
		(globalThis as any).IDBKeyRange = FDBKeyRange;

		// New open should yield empty store
		expect(await indexeddb.getAllKeys()).toEqual([]);
	});
});