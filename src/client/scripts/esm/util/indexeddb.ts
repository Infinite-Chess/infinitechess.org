/**
 * This script handles reading, saving, and deleting expired
 * browser IndexedDB data for us!
 * 
 * IndexedDB provides persistent large-scale storage beyond localStorage's limitations.
 * Without proper management, stored data would never expire or be deleted
 * (unless the user clears their browser data).
 */

import jsutil from "../../../../shared/util/jsutil.js";


/** An entry in IndexedDB storage */
interface Entry {
	/** The actual value of the entry */
	value: any,
	/** The timestamp the entry will become stale, at which point it should be deleted. */
	expires: number
}

/** For debugging. This prints to the console all save and delete operations. */
const printSavesAndDeletes = false;

const defaultExpiryTimeMillis = 1000 * 60 * 60 * 24; // 24 hours
// const defaultExpiryTimeMillis = 1000 * 20; // 20 seconds

const DB_NAME = 'infinitechess-storage';
const DB_VERSION = 1;
const STORE_NAME = 'entries';

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

/**
 * Initializes the IndexedDB database.
 * Returns a promise that resolves to the database instance.
 */
function initDB(): Promise<IDBDatabase> {
	if (dbInstance) return Promise.resolve(dbInstance);
	if (dbInitPromise) return dbInitPromise;

	dbInitPromise = new Promise((resolve, reject) => {
		// Check if IndexedDB is available
		const idb = typeof window !== 'undefined' ? window.indexedDB : (globalThis as any).indexedDB;
		if (!idb) {
			reject(new Error('IndexedDB is not supported in this browser'));
			return;
		}

		const request = idb.open(DB_NAME, DB_VERSION);

		request.onerror = () => {
			reject(new Error('Failed to open IndexedDB database'));
		};

		request.onsuccess = () => {
			dbInstance = request.result;
			// Erase expired items on database open (async, don't wait)
			eraseExpiredItems().catch(console.error);
			resolve(dbInstance);
		};

		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;
			
			// Create object store if it doesn't exist
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME);
			}
		};
	});

	return dbInitPromise;
}

/**
 * Saves an item in browser IndexedDB storage
 * @param key - The key-name to give this entry.
 * @param value - What to save
 * @param [expiryMillis] How long until this entry should be auto-deleted for being stale
 * @returns A promise that resolves when the item is saved
 */
async function saveItem(key: string, value: any, expiryMillis: number = defaultExpiryTimeMillis): Promise<void> {
	if (printSavesAndDeletes) console.log(`Saving key to IndexedDB: ${key}`);
	
	const db = await initDB();
	const timeExpires = Date.now() + expiryMillis;
	const save: Entry = { value, expires: timeExpires };

	return new Promise((resolve, reject) => {
		const transaction = db.transaction([STORE_NAME], 'readwrite');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.put(save, key);

		transaction.oncomplete = () => {
			resolve();
		};

		transaction.onerror = () => {
			reject(new Error(`Failed to save item with key: ${key}`));
		};

		request.onerror = () => {
			reject(new Error(`Failed to save item with key: ${key}`));
		};
	});
}

/**
 * Loads an item from browser IndexedDB storage
 * @param key - The name/key of the item in storage
 * @returns A promise that resolves to the entry value, or undefined if not found or expired
 */
async function loadItem(key: string): Promise<any> {
	const db = await initDB();

	return new Promise((resolve, reject) => {
		const transaction = db.transaction([STORE_NAME], 'readonly');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.get(key);

		request.onsuccess = () => {
			const save = request.result;
			
			if (!save) {
				resolve(undefined);
				return;
			}

			if (hasItemExpired(save)) {
				// Delete expired item asynchronously
				deleteItem(key).catch(console.error);
				resolve(undefined);
				return;
			}

			// Not expired...
			resolve(save.value);
		};

		transaction.onerror = () => {
			reject(new Error(`Failed to load item with key: ${key}`));
		};

		request.onerror = () => {
			reject(new Error(`Failed to load item with key: ${key}`));
		};
	});
}

/**
 * Deletes an item from browser IndexedDB storage
 * @param key The name/key of the item in storage
 * @returns A promise that resolves when the item is deleted
 */
async function deleteItem(key: string): Promise<void> {
	if (printSavesAndDeletes) console.log(`Deleting IndexedDB item with key '${key}!'`);
	
	const db = await initDB();

	return new Promise((resolve, reject) => {
		const transaction = db.transaction([STORE_NAME], 'readwrite');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.delete(key);

		transaction.oncomplete = () => {
			resolve();
		};

		transaction.onerror = () => {
			reject(new Error(`Failed to delete item with key: ${key}`));
		};

		request.onerror = () => {
			reject(new Error(`Failed to delete item with key: ${key}`));
		};
	});
}

/**
 * Checks if an entry has expired
 * @param save The entry to check
 * @returns true if expired, false otherwise
 */
function hasItemExpired(save: Entry | any): boolean {
	if (save.expires === undefined) {
		console.log(`IndexedDB item was in an old format. Deleting it! Value: ${JSON.stringify(save, jsutil.stringifyReplacer)}}`);
		return true;
	}
	return Date.now() >= save.expires;
}

/**
 * Erases all expired items from IndexedDB storage
 * @returns A promise that resolves when all expired items are deleted
 */
async function eraseExpiredItems(): Promise<void> {
	const db = await initDB();

	return new Promise((resolve, reject) => {
		const transaction = db.transaction([STORE_NAME], 'readwrite');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.openCursor();

		request.onsuccess = (event) => {
			const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
			
			if (cursor) {
				const save = cursor.value;
				if (hasItemExpired(save)) {
					// Delete the expired item directly using the cursor
					cursor.delete();
				}
				cursor.continue();
			}
		};

		transaction.oncomplete = () => {
			resolve();
		};

		transaction.onerror = () => {
			reject(new Error('Failed to iterate over IndexedDB entries'));
		};

		request.onerror = () => {
			reject(new Error('Failed to iterate over IndexedDB entries'));
		};
	});
}

/**
 * Erases all items from IndexedDB storage
 * @returns A promise that resolves when all items are deleted
 */
async function eraseAll(): Promise<void> {
	console.log("Erasing ALL items in IndexedDB...");
	const db = await initDB();

	return new Promise((resolve, reject) => {
		const transaction = db.transaction([STORE_NAME], 'readwrite');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.clear();

		transaction.oncomplete = () => {
			resolve();
		};

		transaction.onerror = () => {
			reject(new Error('Failed to clear all items from IndexedDB'));
		};

		request.onerror = () => {
			reject(new Error('Failed to clear all items from IndexedDB'));
		};
	});
}

/**
 * Resets the database instance. Useful for testing.
 * @internal
 */
function resetDBInstance(): void {
	dbInstance = null;
	dbInitPromise = null;
}

export default {
	saveItem,
	loadItem,
	deleteItem,
	eraseExpiredItems,
	eraseAll,
	resetDBInstance
};
