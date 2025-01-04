
/**
 * This script handles reading, saving, and deleting expired
 * browser local storage data for us!
 * Without it, things we save NEVER expire or are deleted.
 * (unless the user clears their browser cache)
 */


/** An entry in local storage */
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

// Do this on load every time
eraseExpiredItems();

/**
 * Saves an item in browser local storage
 * @param key - The key-name to give this entry.
 * @param value - What to save
 * @param [expiryMillis] How long until this entry should be auto-deleted for being stale
 */
function saveItem(key: string, value: any, expiryMillis: number = defaultExpiryTimeMillis) {
	if (printSavesAndDeletes) console.log(`Saving key to local storage: ${key}`);
	const timeExpires = Date.now() + expiryMillis;
	const save: Entry = { value, expires: timeExpires };
	const stringifiedSave = JSON.stringify(save);
	localStorage.setItem(key, stringifiedSave);
}

/**
 * Loads an item from browser local storage
 * @param key - The name/key of the item in storage
 * @returns The entry
 */
function loadItem(key: string): any {
	const stringifiedSave: string | null = localStorage.getItem(key); // "{ value, expiry }"
	if (stringifiedSave === null) return;
	let save: Entry | any;
	try {
		save = JSON.parse(stringifiedSave); // { value, expires }
	} catch (e) { // Value wasn't in json format, just delete it. They have to be in json because we always store the 'expiry' property.
		deleteItem(key);
		return;
	}
	if (hasItemExpired(save)) {
		deleteItem(key);
		return;
	}
	// Not expired...
	return save.value;
}

/**
 * Deletes an item from browser local storage
 * @param key The name/key of the item in storage
 */
function deleteItem(key: string) {
	if (printSavesAndDeletes) console.log(`Deleting local storage item with key '${key}!'`);
	localStorage.removeItem(key);
}

function hasItemExpired(save: Entry | any) {
	if (save.expires === undefined) {
		console.log(`Local storage item was in an old format. Deleting it! Value: ${JSON.stringify(save)}}`);
		return true;
	}
	return Date.now() >= save.expires;
}

function eraseExpiredItems() {
	const keys = Object.keys(localStorage);

	// if (keys.length > 0) console.log(`Items in local storage: ${JSON.stringify(keys)}`);

	for (const key of keys) {
		loadItem(key); // Auto-deletes expired items
	}
}

function eraseAll() {
	console.log("Erasing ALL items in local storage...");
	const keys = Object.keys(localStorage);
	for (const key of keys) {
		deleteItem(key); // Auto-deletes expired items
	}
}

export default {
	saveItem,
	loadItem,
	deleteItem,
	eraseExpiredItems,
	eraseAll
};