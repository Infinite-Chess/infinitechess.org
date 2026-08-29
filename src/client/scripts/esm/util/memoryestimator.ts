// src/client/scripts/esm/util/memoryestimator.ts

/**
 * Estimates how much memory an arbitrary object occupies, for the in-game debug toggles.
 *
 * Approximate by nature: object and per-entry overheads are assumed constants, so read
 * the result as an order of magnitude, not a measurement.
 */

import bimath from '../../../../shared/util/math/bimath.js';

// Functions -------------------------------------------------------------------

/**
 * Estimates the size, in memory, of ANY object, no matter how deep it's nested,
 * and returns that number in a human-readable string.
 *
 * This takes into account added overhead from each object/array created,
 * as those have extra prototype methods, etc, adding more memory. It also
 * attempts to correctly estimate the size of TypedArrays, ArrayBuffers, Maps, and Sets.
 *
 * @author Gemini 2.5 Pro
 */
export function estimateMemorySizeOf(obj: any): string {
	const visited = new Set<any>(); // Tracks visited objects, to handle cycles and prevent double-counting.

	/** The estimated byte size of one value, recursing into objects. */
	function roughSizeOfObject(value: any): number {
		let bytes = 0;

		// Primitive types
		if (typeof value === 'boolean') bytes = 4;
		else if (typeof value === 'string')
			bytes = value.length * 2; // Each char is 2 bytes in JS strings (UTF-16)
		else if (typeof value === 'number')
			bytes = 8; // 64-bit float
		else if (typeof value === 'symbol')
			bytes = (value.description?.length ?? 0) * 2 + 8; // Description + internal overhead
		else if (typeof value === 'bigint')
			bytes = bimath.estimateBigIntSize(value); // Precise BigInt estimator
		else if (value === null || typeof value === 'undefined')
			bytes = 0; // Very small
		else if (typeof value === 'function')
			bytes = value.toString().length * 2 + 100; // Very rough guess
		// Object types
		else if (typeof value === 'object') {
			// Circular references and already visited objects cost nothing more.
			if (visited.has(value)) return 0;
			visited.add(value);

			// ArrayBuffer: The raw data store
			if (value instanceof ArrayBuffer) {
				bytes = value.byteLength + 64; // byteLength + object overhead
			}
			// TypedArray views (Int8Array, Float32Array, etc.)
			else if (ArrayBuffer.isView(value)) {
				bytes = value.byteLength + 64; // Data size + view object overhead
				// Ensure the underlying buffer is also marked as visited if not already
				if (value.buffer && !visited.has(value.buffer)) {
					visited.add(value.buffer);
					// Optionally add buffer overhead ONCE if buffer itself wasn't visited
					// bytes += 64; // Depends on desired accuracy for shared buffer overhead.
				}
			}
			// Date objects
			else if (value instanceof Date)
				bytes = 8 + 40; // Internal number + object overhead
			// RegExp objects
			else if (value instanceof RegExp)
				bytes = value.source.length * 2 + 40; // Source string + object overhead
			// Map objects
			else if (value instanceof Map) {
				bytes = 64; // Overhead for the Map object itself
				for (const [key, val] of value.entries()) {
					bytes += roughSizeOfObject(key);
					bytes += roughSizeOfObject(val);
					bytes += 16; // Overhead per entry (approx)
				}
			}
			// Set objects
			else if (value instanceof Set) {
				bytes = 64; // Overhead for the Set object itself
				for (const val of value.values()) {
					bytes += roughSizeOfObject(val);
					bytes += 16; // Overhead per entry (approx)
				}
			}
			// Generic objects and arrays
			else {
				const isArray = Array.isArray(value);
				// Overhead for object/array itself (pointers, length, prototype)
				bytes = 40;

				for (const key in value) {
					// Only count own properties
					if (!Object.hasOwnProperty.call(value, key)) continue;

					// Size of the key (property name or array index)
					if (!isArray || isNaN(parseInt(key, 10))) {
						bytes += key.length * 2; // Key string size
					}

					// Reference pointer size (approx)
					bytes += 8; // Assumed pointer/reference overhead

					// Size of the value (recursive call)
					bytes += roughSizeOfObject(value[key]);
				}
			}
		}

		return bytes;
	}

	/** Turns a byte count into a human-readable string. */
	function formatByteSize(bytes: number): string {
		if (bytes < 1024) return bytes + ' bytes';
		else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
		else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
		else return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
	}

	const totalBytes = roughSizeOfObject(obj);
	visited.clear(); // Clean up the visited set
	return formatByteSize(totalBytes);
}
