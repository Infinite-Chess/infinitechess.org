
/**
 * This scripts contains utility methods for working with javascript objects.
 * 
 * ZERO dependancies.
 */


/**
 * Deep copies an entire object, no matter how deep its nested.
 * No properties will contain references to the source object.
 * Use this instead of structuredClone() because of browser support,
 * or when that throws an error due to functions contained within the src.
 * 
 * SLOW. Avoid using for very massive objects.
 */
function deepCopyObject<T extends unknown>(src: T): T {
	if (typeof src !== "object" || src === null) return src;
    
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
 * Deep copies a Float32Array.
 */
function copyFloat32Array(src: Float32Array): Float32Array {
	if (!src || !(src instanceof Float32Array)) {
		throw new Error('Invalid input: must be a Float32Array');
	}
    
	const copy = new Float32Array(src.length);
    
	for (let i = 0; i < src.length; i++) {
		copy[i]! = src[i]!;
	}
    
	return copy;
}

/**
 * Searches an organized array and returns an object telling
 * you the index the element could be added at for the array to remain
 * organized, and whether the element was already found in the array.
 * @param sortedArray - The array sorted in ascending order
 * @param value - The value to find in the array.
 * @returns An object telling you whether the value was found, and the index of that value, or where it can be inserted to remain organized.
 */
function binarySearch(sortedArray: number[], value: number): { found: boolean, index: number } {
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
 * @param value - The value add in the correct place, retaining order.
 * @returns The new array with the sorted element.
 */
function addElementToOrganizedArray(sortedArray: number[], value: number): number[] {
	const { found, index } = binarySearch(sortedArray, value);
	if (found) throw Error(`Cannot add element to sorted array when it already contains the value! ${value}. List: ${JSON.stringify(sortedArray)}`);
	sortedArray.splice(index, 0, value);
	return sortedArray;
}

/**
 * Calculates the index in the given organized array at which you could insert
 * the point and the array would still be organized.
 * @param sortedArray - An array of numbers organized in ascending order.
 * @param point - The point in the array to find the index for.
 * @returns The index
 */
function findIndexOfPointInOrganizedArray(sortedArray: number[], point: number): number {
	return binarySearch(sortedArray, point).index;
}

/**
 * Deletes an element from an organized array. MUST CONTAIN THE ELEMENT.
 * @param sortedArray - An array of numbers organized in ascending order.
 * @param value - The value to search for and delete
 * @returns The new array with the element deleted
 */
function deleteElementFromOrganizedArray(sortedArray: number[], value: number): number[] {
	const { found, index } = binarySearch(sortedArray, value);
	if (!found) throw Error(`Cannot delete value "${value}" from organized array (not found). Array: ${JSON.stringify(sortedArray)}`);
	sortedArray.splice(index, 1);
	return sortedArray;
}

// Removes specified object from given array. Throws error if it fails. The object cannot be an object or array, only a single value.
function removeObjectFromArray(array: any[], object: any) { // object can't be an array
	const index = array.indexOf(object);
	if (index !== -1) array.splice(index, 1);
	else throw Error(`Could not delete object from array, not found! Array: ${JSON.stringify(array)}. Object: ${object}`);
}

// Returns true if provided object is a float32array
function isFloat32Array(param: any) {
	return param instanceof Float32Array;
}

/**
 * Copies the properties from one object to another,
 * without overwriting the existing properties on the destination object,
 * UNLESS the destination object has a matching property name.
 * @param objSrc - The source object
 * @param objDest - The destination object
 */
function copyPropertiesToObject(objSrc: Record<string, any>, objDest: Record<string, any>) {
	for (const [key, value] of Object.entries(objSrc)) {
		objDest[key] = value;
	}
}

/**
 * O(1) method of checking if an object/dict is empty
 * I think??? I may be wrong. I think before the first iteration of
 * a for-in loop the program still has to calculate the keys...
 */
function isEmpty(obj: object): boolean {
	for (const prop in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, prop)) return false;
	}
    
	return true;
}

/**
 * Tests if a string is in valid JSON format, and can thus be parsed into an object.
 */
function isJson(str: string): boolean {
	try {
		JSON.parse(str);
	} catch {
		return false;
	}
	return true;
}

/**
 * Returns a new object with the keys being the values of the provided object, and the values being the keys.
 * @param obj - The object to invert
 * @returns The inverted object
 */
function invertObj<K extends string | number, V extends string | number | symbol>(obj: Record<K, V>): Record<V, K> {
	const inv = {} as Record<V, K>;
	for (const key in obj) {
		inv[obj[key]] = key;
	}
	return inv;
}

/**
 * Checks if array1 contains all the strings that array2 has and returns a list of missing strings.
 * @param array1 - The first array to check against.
 * @param array2 - The second array whose elements need to be present in array1.
 * @returns - An array of missing strings from array1. If none are missing, returns an empty array.
 */
function getMissingStringsFromArray(array1: string[], array2: string[]): string[] {
	// Convert array1 to a Set for efficient lookup
	const set1 = new Set(array1);
	const missing: string[] = [];
 
	// Check if each element in array2 is present in set1
	for (const item of array2) {
		if (!set1.has(item)) missing.push(item); // If element from array2 is missing in array1, add it to the missing list
	}
 
	return missing; // Return the list of missing strings
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
	const visited = new Set<any>(); // Use a Set to track visited objects to handle cycles and prevent double-counting.

	// --- Helper Functions ---

	function roughSizeOfObject(value: any): number {
		let bytes = 0;

		// --- Primitive types ---
		if (typeof value === 'boolean') bytes = 4;
		else if (typeof value === 'string') bytes = value.length * 2; // Each char is 2 bytes in JS strings (UTF-16)
		else if (typeof value === 'number') bytes = 8; // 64-bit float
		else if (typeof value === 'symbol') bytes = (value.description?.length ?? 0) * 2 + 8; // Description + internal overhead
		else if (typeof value === 'bigint') bytes = 8 + Math.ceil(value.toString().length / 2); // Rough guess
		else if (value === null || typeof value === 'undefined') bytes = 0; // Very small
		else if (typeof value === 'function') bytes = value.toString().length * 2 + 100; // Very rough guess
		// --- Object types ---
		else if (typeof value === 'object') {
			// --- Handle circular references and already visited objects ---
			if (visited.has(value)) return 0;
			visited.add(value);

			// --- Specific object types ---

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
			else if (value instanceof Date) bytes = 8 + 40; // Internal number + object overhead
			// RegExp objects
			else if (value instanceof RegExp) bytes = value.source.length * 2 + 40; // Source string + object overhead
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
			// --- Generic objects and arrays ---
			else {
				const isArray = Array.isArray(value);
				// Overhead for object/array itself (pointers, length, prototype)
				bytes = isArray ? 40 : 40;

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

	// Turns the number into a human-readable string
	function formatByteSize(bytes: number): string {
		if (bytes < 1024) return bytes + " bytes";
		else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
		else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + " MB";
		else return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
	}

	// --- Main execution ---
	const totalBytes = roughSizeOfObject(obj);
	visited.clear(); // Clean up the visited set
	return formatByteSize(totalBytes);
}

/**
 * A "replacer" for JSON.stringify()'ing with custom behavior,
 * allowing us to stringify special objects like Maps and TypedArrays.
 * Use {@link parseReviver} to parse back.
 */
function stringifyReplacer(key: string, value: any): any {
	// Stringify Maps
	if (value instanceof Map) return {
		$$type: "Map",
		value: [...value]
	};
	// Stringify Sets
	if (value instanceof Set) return {
		$$type: "Set",
		value: [...value] // Convert Set elements to an array
	};
	// Stringify TypedArrays
	for (const [name, type] of Object.entries(FixedArrayInfo)) {
		if (value instanceof type) return {
			$$type: name,
			value: [...value]
		};
	}

	return value;
}

/** TypedArray constructors and their names. */
const FixedArrayInfo = {
	"Float32Array": Float32Array,
	"Float64Array": Float64Array,

	"Int8Array": Int8Array,
	"Int16Array": Int16Array,
	"Int32Array": Int32Array,

	"Uint8Array": Uint8Array,
	"Uint16Array": Uint16Array,
	"Uint32Array": Uint32Array,
} as const;

/** Type representing any of the TypedArray constructor types listed in FixedArrayInfo. */
type FixedArrayConstructor = typeof FixedArrayInfo[keyof typeof FixedArrayInfo];

/**
 * A "reviver" for JSON.parse()'ing that will convert back from the custom stringified format to the original objects.
 * This allows us to parse back the special objects like Maps and TypedArrays that were stringified using {@link stringifyReplacer}.
 */
function parseReviver(key: string, value: any): any {
	if (typeof value === 'object' && value !== null) {
		if (value.$$type === 'Map') return new Map(value.value); // value.value should be an array of [key, value] pairs
		if (value.$$type === 'Set') return new Set(value.value); // value.value should be an array of elements
		if (value.$$type in FixedArrayInfo) {
			const constructor: FixedArrayConstructor = FixedArrayInfo[value.$$type as keyof typeof FixedArrayInfo]; // Get the constructor
			return new constructor(value.value); // value.value should be an array of numbers
		}
	}
	return value;
}

/**
 * Ensures any type of object is JSON stringified. Strings are left unchanged.
 * If there's a provided error message, it will log any ocurred error.
 * @param input - The input to stringify.
 * @param [errorMessage] - If specified, then this message will be printed if an error occurs.
 * @returns - The JSON stringified input or the original string if input was a string. Or, if an error ocurred, 'Error: Input could not be JSON stringified'.
 */
function ensureJSONString(input: any, errorMessage?: string): string {
	if (typeof input === 'string') return input;
	try {
		return JSON.stringify(input, stringifyReplacer);
	} catch (error) {
		// Handle cases where input cannot be stringified
		if (errorMessage) { // Print the error...
			const errText = `${errorMessage}\n${(error as Error).stack}`;
			console.log(errText);
		}
		return 'Error: Input could not be JSON stringified';
	}
}


export default {
	binarySearch,
	deepCopyObject,
	copyFloat32Array,
	addElementToOrganizedArray,
	findIndexOfPointInOrganizedArray,
	deleteElementFromOrganizedArray,
	isFloat32Array,
	copyPropertiesToObject,
	isEmpty,
	isJson,
	invertObj,
	removeObjectFromArray,
	getMissingStringsFromArray,
	estimateMemorySizeOf,
	stringifyReplacer,
	parseReviver,
	ensureJSONString,
};