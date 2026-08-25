// src/shared/util/jsutil.ts

/**
 * This script contains utility methods for working with javascript objects.
 */

import bimath from './math/bimath.js';

// Types -----------------------------------------------------------------------

/** Any of the TypedArray constructor types listed in {@link FIXED_ARRAY_INFO}. */
type FixedArrayConstructor = (typeof FIXED_ARRAY_INFO)[keyof typeof FIXED_ARRAY_INFO];

// Constants -------------------------------------------------------------------

/** TypedArray constructors and their names, for stringifying and reviving them. */
const FIXED_ARRAY_INFO = {
	Float32Array: Float32Array,
	Float64Array: Float64Array,

	Int8Array: Int8Array,
	Int16Array: Int16Array,
	Int32Array: Int32Array,

	Uint8Array: Uint8Array,
	Uint16Array: Uint16Array,
	Uint32Array: Uint32Array,
} as const;

// Functions -------------------------------------------------------------------

/**
 * Deep copies an entire object, no matter how deep its nested.
 * No properties will contain references to the source object.
 * Use this instead of structuredClone() because of browser support,
 * or when that throws an error due to functions contained within the src.
 *
 * SLOW. Avoid using for very massive objects.
 */
function deepCopyObject<T>(src: T): T {
	if (typeof src !== 'object' || src === null) return src;

	// Check for Maps
	if (src instanceof Map) {
		// Create a new Map instance
		const copy = new Map();
		// Iterate over the original map's entries
		for (const [key, value] of src.entries()) {
			// Deep copy both the key and the value before setting them in the new map
			copy.set(deepCopyObject(key), deepCopyObject(value));
		}
		return copy as T; // Return the new Map with deep copied entries
	}

	// Check for Sets
	if (src instanceof Set) {
		// Create a new Set instance
		const copy = new Set();
		// Iterate over the original set's values
		for (const value of src) {
			// Deep copy the value before adding it to the new set
			copy.add(deepCopyObject(value));
		}
		return copy as T; // Return the new Set with deep copied values
	}

	// Check for TypedArrays (which are ArrayBuffer views and have slice)
	if (ArrayBuffer.isView(src) && typeof (src as any).slice === 'function') {
		return (src as any).slice() as T; // Use slice for TypedArray copy
	}

	// Handle remaining arrays and objects
	const copy: any = Array.isArray(src) ? [] : {}; // Create an empty array or object
	for (const key in src) {
		const value = src[key];
		copy[key] = deepCopyObject(value); // Recursively copy each property
	}

	return copy as T; // Return the copied object
}

/**
 * Searches an organized array and returns an object telling
 * you the index the element could be added at for the array to remain
 * organized, and whether the element was already found in the array.
 * @param sortedArray - The array sorted in ascending order.
 * @param value - The value to find in the array.
 */
function binarySearch(sortedArray: number[], value: number): { found: boolean; index: number } {
	let left = 0;
	let right = sortedArray.length - 1;

	while (left <= right) {
		const mid = Math.floor((left + right) / 2);
		const midValue = sortedArray[mid]!;

		if (value < midValue) right = mid - 1;
		else if (value > midValue) left = mid + 1;
		else return { found: true, index: mid };
	}

	// The left is the correct index to insert at, while retaining order!
	return { found: false, index: left };
}

/**
 * Uses binary search to quickly find and insert the given number in the
 * organized array.
 *
 * MUST NOT ALREADY CONTAIN THE VALUE!!
 * @param sortedArray - The array to search, which must be sorted in ascending order.
 * @param value - The value to add in the correct place, retaining order.
 * @throws If the array already contains the value.
 */
function addElementToOrganizedArray(sortedArray: number[], value: number): number[] {
	const { found, index } = binarySearch(sortedArray, value);
	if (found)
		throw Error(`Cannot add element to sorted array when it already contains the value! ${value}. List: ${JSON.stringify(sortedArray)}`); // prettier-ignore
	sortedArray.splice(index, 0, value);
	return sortedArray;
}

/**
 * Calculates the index in the given organized array at which you could insert
 * the point and the array would still be organized.
 * @param sortedArray - An array of numbers organized in ascending order.
 * @param point - The point in the array to find the index for.
 */
function findIndexOfPointInOrganizedArray(sortedArray: number[], point: number): number {
	return binarySearch(sortedArray, point).index;
}

/** Copies every own property of `objSrc` onto `objDest`, overwriting any that collide. */
function copyPropertiesToObject(objSrc: Record<string, any>, objDest: Record<string, any>): void {
	for (const [key, value] of Object.entries(objSrc)) {
		objDest[key] = value;
	}
}

/** Whether an object has no own enumerable properties. */
function isEmpty(obj: object): boolean {
	for (const prop in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, prop)) return false;
	}

	return true;
}

/**
 * Returns a new object with the keys being the values of the provided object, and the values being the keys.
 * THE VALUES WILL ALWAYS BE STRINGS. This is because the keys of an object are always strings.
 */
function invertObj(obj: Record<string, string> | Record<number, string>): Record<string, string> {
	const inv: Record<string, string> = {};
	for (const key in obj) {
		inv[obj[key as keyof typeof obj]!] = key;
	}
	return inv;
}

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
function estimateMemorySizeOf(obj: any): string {
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

/**
 * A "replacer" for JSON.stringify()'ing with custom behavior,
 * allowing us to stringify special objects like BigInts, Maps and TypedArrays.
 * Use {@link parseReviver} to parse back.
 */
function stringifyReplacer(_key: string, value: any): any {
	// Stringify BigInts
	if (typeof value === 'bigint')
		return {
			$$type: 'BigInt',
			value: value.toString(), // Convert BigInt to a string
		};
	// Stringify Maps
	if (value instanceof Map)
		return {
			$$type: 'Map',
			value: [...value],
		};
	// Stringify Sets
	if (value instanceof Set)
		return {
			$$type: 'Set',
			value: [...value], // Convert Set elements to an array
		};
	// Stringify TypedArrays
	for (const [name, type] of Object.entries(FIXED_ARRAY_INFO)) {
		if (value instanceof type)
			return {
				$$type: name,
				value: [...value],
			};
	}

	return value;
}

/**
 * A "reviver" for JSON.parse()'ing that will convert back from the custom stringified format to the original objects.
 * This allows us to parse back the special objects like Maps and TypedArrays that were stringified using {@link stringifyReplacer}.
 */
function parseReviver(_key: string, value: any): any {
	if (typeof value === 'object' && value !== null) {
		if (value.$$type === 'BigInt') return BigInt(value.value); // Convert string back to BigInt
		if (value.$$type === 'Map') return new Map(value.value); // value.value should be an array of [key, value] pairs
		if (value.$$type === 'Set') return new Set(value.value); // value.value should be an array of elements
		if (value.$$type in FIXED_ARRAY_INFO) {
			const constructor: FixedArrayConstructor =
				FIXED_ARRAY_INFO[value.$$type as keyof typeof FIXED_ARRAY_INFO]; // Get the constructor
			return new constructor(value.value); // value.value should be an array of numbers
		}
	}
	return value;
}

/**
 * Ensures any type of object is JSON stringified. Strings are left unchanged.
 * Unstringifiable input (a circular structure) yields a placeholder instead of throwing.
 * @param input - The input to stringify.
 * @param spaces - If specified, the number of spaces to indent the output with (pretty-printing).
 */
function ensureJSONString(input: any, spaces?: number): string {
	if (typeof input === 'string') return input;
	try {
		return JSON.stringify(input, stringifyReplacer, spaces);
	} catch {
		return 'Error: Input could not be JSON stringified';
	}
}

/**
 * Returns a caught error's message, or its String() form if it wasn't
 * thrown as an Error.
 */
function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Returns a caught error's stack trace, or its String() form if it wasn't
 * thrown as an Error, or has no stack.
 */
function getErrorStack(error: unknown): string {
	return error instanceof Error ? (error.stack ?? String(error)) : String(error);
}

// Exports ---------------------------------------------------------------------

export default {
	deepCopyObject,
	binarySearch,
	addElementToOrganizedArray,
	findIndexOfPointInOrganizedArray,
	copyPropertiesToObject,
	isEmpty,
	invertObj,
	estimateMemorySizeOf,
	stringifyReplacer,
	parseReviver,
	ensureJSONString,
	getErrorMessage,
	getErrorStack,
};
