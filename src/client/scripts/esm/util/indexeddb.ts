// src/client/scripts/esm/util/indexeddb.ts

/**
 * This script handles reading, saving, and deleting browser IndexedDB data.
 *
 * IndexedDB provides persistent large-scale storage beyond localStorage's limitations.
 */

import jsutil from '../../../../shared/util/jsutil.js';

/** An entry in IndexedDB storage */
interface Entry {
	/** The actual value of the entry */
	value: any;
	/** The timestamp the entry will become stale, at which point it should be deleted. */
	expires: number;
}

const DB_NAME = 'infinitechess';
const DB_VERSION = 1;
const STORE_NAME = 'entries';

/** For debugging. This prints to the console all save and delete operations. */
const printSavesAndDeletes = false;

const defaultExpiryTimeMillis = 1000 * 60 * 60 * 24; // 24 hours

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

// Do this on load every time
eraseExpiredItems();

/**
 * Initializes the IndexedDB database.
 * Returns a promise that resolves to the database instance.
 */
function initDB(): Promise<IDBDatabase> {
	if (dbInstance) return Promise.resolve(dbInstance);
	if (dbInitPromise) return dbInitPromise;

	dbInitPromise = new Promise((resolve, reject) => {
		// Check if IndexedDB is available
		const idb = (globalThis as any).indexedDB;
		if (!idb) {
			reject(new Error('IndexedDB is not supported in this browser'));
			return;
		}

		const request = idb.open(DB_NAME, DB_VERSION);

		request.onblocked = () => {
			console.warn('IndexedDB upgrade blocked: another tab/session holds the DB open');
		};

		request.onerror = () => {
			dbInitPromise = null; // Allow future calls to retry opening the DB
			reject(new Error('Failed to open IndexedDB database'));
		};

		request.onsuccess = () => {
			dbInstance = request.result;
			if (dbInstance) {
				dbInstance.onversionchange = () => dbInstance?.close();
				resolve(dbInstance);
			} else {
				reject(new Error('Failed to initialize IndexedDB database'));
			}
		};

		request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
			const db = (event.target as IDBOpenDBRequest).result;

			// Create object store if it doesn't exist
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME);
			}
		};
	});

	return dbInitPromise;
}

/** Run a readonly transaction and return the request result. */
async function withRead<T>(op: (_store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	const db = await initDB();
	return new Promise<T>((resolve, reject) => {
		// Open a readonly transaction on the object store
		const tx = db.transaction([STORE_NAME], 'readonly');
		const store = tx.objectStore(STORE_NAME);
		// Execute caller-provided operation (e.g., store.get(key))
		const req = op(store);

		req.onsuccess = () => resolve(req.result as T);
		// Reject on transaction or request errors
		tx.onerror = () => reject(tx.error || new Error('Transaction error'));
		req.onerror = () => reject(req.error || new Error('Request error'));
	});
}

/** Run a readwrite transaction. Resolves when the transaction completes. */
async function withWrite<R>(op: (_store: IDBObjectStore) => IDBRequest<R>): Promise<void> {
	const db = await initDB();
	return new Promise<void>((resolve, reject) => {
		// Open a readwrite transaction to modify data
		const tx = db.transaction([STORE_NAME], 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		// Execute caller-provided operation (e.g., store.put(...), store.delete(...))
		const req = op(store);

		// Resolve only after the entire transaction finishes
		tx.oncomplete = () => resolve();
		// Reject on transaction or request errors
		tx.onerror = () => reject(tx.error || new Error('Transaction error'));
		req.onerror = () => reject(req.error || new Error('Request error'));
	});
}

/**
 * Saves an item in browser IndexedDB storage
 * @param key - The key-name to give this entry.
 * @param value - What to save
 * @param [expiryMillis] How long until this entry should be auto-deleted for being stale
 * @returns A promise that resolves when the item is saved
 */
async function saveItem<T>(
	key: string,
	value: T,
	expiryMillis: number = defaultExpiryTimeMillis,
): Promise<void> {
	if (printSavesAndDeletes) console.log(`Saving key to IndexedDB: ${key}`);
	const timeExpires = Date.now() + expiryMillis;
	const save: Entry = { value, expires: timeExpires };
	return withWrite((store) => store.put(save, key));
}

/**
 * Loads an item from browser IndexedDB storage
 * @param key - The name/key of the item in storage
 * @returns A promise that resolves to the entry value, or undefined if not found
 */
async function loadItem<T>(key: string): Promise<T | undefined> {
	const save = await withRead<Entry | undefined>((store) => store.get(key));
	if (save === undefined) return undefined;

	// Check if the item is in the expected format
	if (save.expires === undefined) {
		console.log(
			`IndexedDB item was in an old format. Deleting it! Key: ${key}, Value: ${JSON.stringify(save, jsutil.stringifyReplacer)}`,
		);
		await deleteItem(key);
		return undefined;
	}

	// Check if the item has expired
	if (hasItemExpired(save)) {
		await deleteItem(key);
		return undefined;
	}

	// Not expired...
	return save.value as T;
}

/**
 * Deletes an item from browser IndexedDB storage
 * @param key The name/key of the item in storage
 * @returns A promise that resolves when the item is deleted
 */
async function deleteItem(key: string): Promise<void> {
	if (printSavesAndDeletes) console.log(`Deleting IndexedDB item with key '${key}!'`);
	return withWrite((store) => store.delete(key));
}

/**
 * Checks if an entry has expired
 * @param save - The entry to check
 * @returns True if the entry has expired
 */
function hasItemExpired(save: Entry): boolean {
	return Date.now() >= save.expires;
}

/**
 * Erases all expired items from IndexedDB storage
 * @returns A promise that resolves when all expired items are deleted
 */
async function eraseExpiredItems(): Promise<void> {
	try {
		const keys = await getAllKeys();

		// Load each item, which will auto-delete expired items
		await Promise.all(keys.map((key) => loadItem(key)));
	} catch (_error) {
		// Silently fail if IndexedDB is not available during initialization
		// This can happen during the initial page load before IndexedDB is ready
	}
}

/**
 * Gets all keys present in the IndexedDB storage
 * @returns A promise that resolves to an array of all keys
 */
async function getAllKeys(): Promise<string[]> {
	const keys = await withRead<IDBValidKey[]>((store) => store.getAllKeys());
	return keys as string[];
}

/**
 * Erases all items from IndexedDB storage
 * @returns A promise that resolves when all items are deleted
 */
async function eraseAll(): Promise<void> {
	return withWrite((store) => store.clear());
}

/** Reset the cached DB instance (close if open) so the next call to initDB() re-initializes. */
function resetDBInstance(): void {
	// Close the existing database connection if it’s open (ignore any close errors)
	try {
		dbInstance?.close();
	} catch {
		// Ignore
	}
	// Null out cached references so initDB() will run fresh
	dbInstance = null;
	dbInitPromise = null;
}

export default {
	saveItem,
	loadItem,
	deleteItem,
	getAllKeys,
	eraseExpiredItems,
	eraseAll,
	resetDBInstance,
};
