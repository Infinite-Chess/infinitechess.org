// src/client/scripts/esm/util/LocalStorage.ts

/**
 * Synchronous browser local storage, with automatic expiry so entries don't
 * live forever (short of the user clearing their browser cache).
 *
 * Prefer this over IndexedDB.ts for its simpler synchronous API. Use it for small
 * entries only: the whole origin shares a ~5MB localStorage quota, so anything that
 * can grow past a few hundred KB per entry — or accumulate many sizeable entries —
 * belongs in IndexedDB.ts instead (e.g. full infinite-chess board positions).
 */

import jsonutil from '../../../../shared/util/jsonutil.js';

// Types -----------------------------------------------------------------------

/** An entry in local storage */
interface Entry {
	/** The actual value of the entry. */
	value: unknown;
	/** The timestamp the entry will become stale, at which point it should be deleted. */
	expires: number;
}

// Constants -------------------------------------------------------------------

/** For debugging. This prints to the console all save and delete operations. */
const PRINT_CHANGES = false;

const DEFAULT_EXPIRY_MS = 1000 * 60 * 60 * 24; // 24 hours
// const DEFAULT_EXPIRY_MS = 1000 * 20; // 20 seconds

// Initialization --------------------------------------------------------------

// Do this on load every time
eraseExpiredItems();

// Saving & Loading ------------------------------------------------------------

/**
 * Saves an item in browser local storage
 * @param key - The key-name to give this entry.
 * @param value - What to save
 * @param [expiryMillis] How long until this entry should be auto-deleted for being stale
 * @throws A `QuotaExceededError` if the write exceeds the origin's ~5MB localStorage quota.
 */
function saveItem(key: string, value: unknown, expiryMillis: number = DEFAULT_EXPIRY_MS): void {
	if (PRINT_CHANGES) console.log(`Saving key to local storage: ${key}`);
	const timeExpires = Date.now() + expiryMillis;
	const save: Entry = { value, expires: timeExpires };
	const stringifiedSave = JSON.stringify(save, jsonutil.stringifyReplacer);
	localStorage.setItem(key, stringifiedSave);
}

/**
 * Loads an item from browser local storage. Callers must validate the value.
 * @param key - The name/key of the item in storage
 * @returns The entry's value, or undefined if absent, expired, or not one of our entries.
 */
function loadItem(key: string): unknown {
	const stringifiedSave: string | null = localStorage.getItem(key); // "{ value, expiry }"
	if (stringifiedSave === null) return;
	let save: unknown;
	try {
		save = JSON.parse(stringifiedSave, jsonutil.parseReviver); // { value, expires }
	} catch (_e) {
		// Not JSON — not an entry we wrote, so leave it alone.
		// This protects the 'color-scheme' entry which the browser needs available before the
		// first paint, so it can't wait until LocalStorage.ts has finished loading to read it.
		return;
	}
	// Valid JSON but not our { value, expires } shape — not ours, leave it alone.
	if (!isEntry(save)) return;
	if (hasItemExpired(save)) {
		deleteItem(key);
		return;
	}
	// Not expired...

	// console.log(`Fetched key ${key} from local storage:`);
	// console.log(save);

	return save.value;
}

// Deleting & Expiry -----------------------------------------------------------

/**
 * Deletes an item from browser local storage
 * @param key The name/key of the item in storage
 */
function deleteItem(key: string): void {
	if (PRINT_CHANGES) console.log(`Deleting local storage item with key '${key}!'`);
	localStorage.removeItem(key);
}

/** Whether a parsed localStorage value is one of the entries we wrote. */
function isEntry(save: unknown): save is Entry {
	return (
		typeof save === 'object' &&
		save !== null &&
		'expires' in save &&
		typeof save.expires === 'number'
	);
}

function hasItemExpired(save: Entry): boolean {
	return Date.now() >= save.expires;
}

function eraseExpiredItems(): void {
	const keys = Object.keys(localStorage);

	// if (keys.length > 0) console.log(`Items in local storage: ${JSON.stringify(keys)}`);

	for (const key of keys) {
		loadItem(key); // Auto-deletes expired items
	}
}

function eraseAll(): void {
	console.log('Erasing ALL items in local storage...');
	const keys = Object.keys(localStorage);
	for (const key of keys) {
		deleteItem(key); // Auto-deletes expired items
	}
}

// Exports ---------------------------------------------------------------------

export default {
	saveItem,
	loadItem,
	deleteItem,
	eraseExpiredItems,
	eraseAll,
};
