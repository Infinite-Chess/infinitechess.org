// src/client/scripts/esm/handoffs/createhandoff.ts

/**
 * Factory for cross-page handoffs — a one-shot payload that one page stashes
 * before navigating, and the destination page consumes on its next load.
 *
 * IndexedDB (not localStorage) because handed-off positions can exceed 1MB.
 */

import IndexedDB from '../util/IndexedDB.js';

// Types -----------------------------------------------------------------------

/** One handoff slot, with its own storage key and lifetime. */
export interface Handoff<T> {
	/** Stashes a payload for the destination page to consume on its next load. */
	save(payload: T): Promise<void>;
	/** Consumes (reads and clears) a pending payload, or undefined if there is none. */
	take(): Promise<T | undefined>;
}

// Factory ---------------------------------------------------------------------

/**
 * Creates a handoff slot backed by one IndexedDB key.
 * @param key - IndexedDB key the payload is stashed under.
 * @param expiryMillis - How long a stashed payload stays valid before being auto-discarded.
 */
export function createHandoff<T>(key: string, expiryMillis: number): Handoff<T> {
	return {
		async save(payload: T): Promise<void> {
			await IndexedDB.saveItem(key, payload, expiryMillis);
		},
		async take(): Promise<T | undefined> {
			const payload = await IndexedDB.loadItem<T>(key);
			if (payload !== undefined) await IndexedDB.deleteItem(key);
			return payload;
		},
	};
}
