// src/client/scripts/esm/util/indexeddb.test.ts

/**
 * Functional tests for the IndexedDB storage module using a simulated IDB.
 * Uses fake-indexeddb and the module's resetDBInstance() for isolation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

import indexeddb from './IndexedDB.js';

beforeEach(() => {
	// Fresh fake IndexedDB and key range per test
	(globalThis as any).indexedDB = new IDBFactory();
	(globalThis as any).IDBKeyRange = IDBKeyRange;
	// Ensure module will open a brand-new DB for this test
	indexeddb.resetDBInstance();
});

describe('IndexedDB storage functional behavior', () => {
	it('getAllKeys returns [] initially', async () => {
		expect(await indexeddb.getAllKeys()).toEqual([]);
	});

	it('saves and loads an item', async () => {
		await indexeddb.saveItem('pos:1', { fen: 'start' });
		const value = await indexeddb.loadItem<{ fen: string }>('pos:1');
		expect(value).toEqual({ fen: 'start' });
	});

	it('overwrites an existing item with the same key', async () => {
		await indexeddb.saveItem('k', 'one');
		await indexeddb.saveItem('k', 'two');
		const value = await indexeddb.loadItem<string>('k');
		expect(value).toBe('two');
	});

	it('returns undefined for a missing key', async () => {
		const value = await indexeddb.loadItem('missing');
		expect(value).toBeUndefined();
	});

	it('deletes an item', async () => {
		await indexeddb.saveItem('x', 123);
		await indexeddb.deleteItem('x');
		const value = await indexeddb.loadItem('x');
		expect(value).toBeUndefined();
	});

	it('delete of a missing key resolves (no error)', async () => {
		await expect(indexeddb.deleteItem('nope')).resolves.toBeUndefined();
	});

	it('getAllKeys returns the current keys only', async () => {
		await indexeddb.saveItem('a', 1);
		await indexeddb.saveItem('b', 2);
		await indexeddb.deleteItem('a');
		const keys = await indexeddb.getAllKeys();
		expect(keys.sort()).toEqual(['b']);
	});

	it('eraseAll clears all items', async () => {
		await indexeddb.saveItem('a', 1);
		await indexeddb.saveItem('b', 2);
		await indexeddb.eraseAll();
		expect(await indexeddb.getAllKeys()).toEqual([]);
	});

	it('handles concurrent writes and reads', async () => {
		const writes = Array.from({ length: 50 }, (_, i) => indexeddb.saveItem(`k${i}`, { v: i }));
		await Promise.all(writes);

		const keys = await indexeddb.getAllKeys();
		const numericSorted = [...keys].sort(
			(a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10),
		);
		expect(numericSorted).toEqual(Array.from({ length: 50 }, (_, i) => `k${i}`));

		const reads = await Promise.all([
			indexeddb.loadItem('k0'),
			indexeddb.loadItem('k25'),
			indexeddb.loadItem('k49'),
		]);
		expect(reads).toEqual([{ v: 0 }, { v: 25 }, { v: 49 }]);
	});

	it('resetDBInstance causes a fresh database (previous keys gone)', async () => {
		await indexeddb.saveItem('temp', 42);
		expect(await indexeddb.getAllKeys()).toEqual(['temp']);

		// Simulate a fresh environment
		indexeddb.resetDBInstance();
		(globalThis as any).indexedDB = new IDBFactory();
		(globalThis as any).IDBKeyRange = IDBKeyRange;

		// New open should yield empty store
		expect(await indexeddb.getAllKeys()).toEqual([]);
	});

	it('saves an item with custom expiry time', async () => {
		const expiryMillis = 10000; // 10 seconds
		await indexeddb.saveItem('k', 'value', expiryMillis);
		const value = await indexeddb.loadItem<string>('k');
		expect(value).toBe('value');
	});

	it('auto-deletes expired items on load', async () => {
		const shortExpiry = 1; // 1 millisecond
		await indexeddb.saveItem('expiring', 'test', shortExpiry);

		// Wait for expiry
		await new Promise((resolve) => setTimeout(resolve, 10));

		// loadItem should delete the expired item and return undefined
		const value = await indexeddb.loadItem('expiring');
		expect(value).toBeUndefined();

		// Key should be deleted
		const keys = await indexeddb.getAllKeys();
		expect(keys).not.toContain('expiring');
	});

	it('eraseExpiredItems removes only expired items', async () => {
		const shortExpiry = 1; // 1 millisecond
		const longExpiry = 60000; // 60 seconds

		await indexeddb.saveItem('expired1', 'test1', shortExpiry);
		await indexeddb.saveItem('expired2', 'test2', shortExpiry);
		await indexeddb.saveItem('valid', 'test3', longExpiry);

		// Wait for short-lived items to expire
		await new Promise((resolve) => setTimeout(resolve, 10));

		await indexeddb.eraseExpiredItems();

		const keys = await indexeddb.getAllKeys();
		expect(keys).toEqual(['valid']);

		const validValue = await indexeddb.loadItem('valid');
		expect(validValue).toBe('test3');
	});

	it('handles items saved without expiry (old format)', async () => {
		// First save an item normally to ensure DB is initialized
		await indexeddb.saveItem('temp', 'temp');

		// Manually save an item in the old format (without expiry) by directly accessing IDB
		await new Promise<void>((resolve, reject) => {
			const request = (globalThis as any).indexedDB.open(
				indexeddb.DB_NAME,
				indexeddb.DB_VERSION,
			);
			request.onsuccess = () => {
				const db = request.result;
				const tx = db.transaction([indexeddb.STORE_NAME], 'readwrite');
				const store = tx.objectStore(indexeddb.STORE_NAME);
				// Save old format: just the value, no wrapper object
				store.put('old-value', 'old-key');
				tx.oncomplete = () => {
					db.close();
					resolve();
				};
				tx.onerror = () => reject(tx.error);
			};
			request.onerror = () => reject(request.error);
		});

		// Reset to get fresh connection
		indexeddb.resetDBInstance();

		// loadItem should delete the old format item and return undefined
		const value = await indexeddb.loadItem('old-key');
		expect(value).toBeUndefined();

		// Verify it was deleted
		const keys = await indexeddb.getAllKeys();
		expect(keys).not.toContain('old-key');
	});
});
