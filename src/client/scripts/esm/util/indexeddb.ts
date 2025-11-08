/**
 * This script handles reading, saving, and deleting
 * browser IndexedDB data for us!
 * 
 * IndexedDB provides persistent large-scale storage beyond localStorage's limitations.
 * 
 * @example
 * ```typescript
 * import indexeddb from './indexeddb.js';
 * 
 * // Save data
 * await indexeddb.saveItem('user-preferences', { theme: 'dark', language: 'en' });
 * 
 * // Load data (returns undefined if not found)
 * const preferences = await indexeddb.loadItem('user-preferences');
 * 
 * // Get all keys
 * const keys = await indexeddb.getAllKeys();
 * 
 * // Delete specific item
 * await indexeddb.deleteItem('user-preferences');
 * 
 * // Clear all storage
 * await indexeddb.eraseAll();
 * ```
 */

/** For debugging. This prints to the console all save and delete operations. */
const printSavesAndDeletes = false;

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
 * @returns A promise that resolves when the item is saved
 */
async function saveItem(key: string, value: any): Promise<void> {
	if (printSavesAndDeletes) console.log(`Saving key to IndexedDB: ${key}`);
	
	const db = await initDB();

	return new Promise((resolve, reject) => {
		const transaction = db.transaction([STORE_NAME], 'readwrite');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.put(value, key);

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
 * @returns A promise that resolves to the entry value, or undefined if not found
 */
async function loadItem(key: string): Promise<any> {
	const db = await initDB();

	return new Promise((resolve, reject) => {
		const transaction = db.transaction([STORE_NAME], 'readonly');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.get(key);

		request.onsuccess = () => {
			const value = request.result;
			resolve(value);
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
 * Gets all keys present in the IndexedDB storage
 * @returns A promise that resolves to an array of all keys
 */
async function getAllKeys(): Promise<string[]> {
	const db = await initDB();

	return new Promise((resolve, reject) => {
		const transaction = db.transaction([STORE_NAME], 'readonly');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.getAllKeys();

		request.onsuccess = () => {
			resolve(request.result as string[]);
		};

		transaction.onerror = () => {
			reject(new Error('Failed to get all keys from IndexedDB'));
		};

		request.onerror = () => {
			reject(new Error('Failed to get all keys from IndexedDB'));
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
	getAllKeys,
	eraseAll,
	resetDBInstance
};
