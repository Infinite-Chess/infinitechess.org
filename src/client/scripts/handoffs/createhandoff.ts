// src/client/scripts/handoffs/createhandoff.ts

/**
 * Factory for cross-page handoffs — a one-shot payload that one page stashes
 * before navigating, and the destination page consumes on its next load.
 *
 * IndexedDB (not localStorage) because handed-off positions can exceed 1MB.
 */

import type { ZodType } from 'zod';

import IndexedDB from '../util/IndexedDB.js';

// Types -----------------------------------------------------------------------

/** One handoff slot, with its own storage key and lifetime. */
export interface Handoff<T> {
	/**
	 * Stashes a payload for the destination page to consume on its next load.
	 * @throws If the payload can't be written.
	 */
	save(payload: T): Promise<void>;
	/** Consumes (reads and clears) a pending payload, or undefined if none, unreadable or malformed. */
	take(): Promise<T | undefined>;
}

// Factory ---------------------------------------------------------------------

/**
 * Creates a handoff slot backed by one IndexedDB key.
 * @param key - IndexedDB key the payload is stashed under.
 * @param expiryMillis - How long a stashed payload stays valid before being auto-discarded.
 * @param schema - What a payload must match to be taken.
 */
export function createHandoff<T>(
	key: string,
	expiryMillis: number,
	schema: ZodType<T>,
): Handoff<T> {
	return {
		async save(payload: T): Promise<void> {
			await IndexedDB.saveItem(key, payload, expiryMillis);
		},
		async take(): Promise<T | undefined> {
			const raw = await IndexedDB.loadItem(key).catch((err: unknown) => {
				console.error(`Failed to read handoff "${key}":`, err);
				return undefined;
			});
			if (raw === undefined) return undefined;
			await IndexedDB.deleteItem(key);

			const parsed = schema.safeParse(raw);
			if (!parsed.success) {
				console.error(`Discarding malformed handoff "${key}":`, parsed.error);
				return undefined;
			}
			return parsed.data;
		},
	};
}
