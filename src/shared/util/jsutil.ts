// src/shared/util/jsutil.ts

/**
 * Plain JavaScript helpers owned by no other module: deep copies, sorted-array
 * insertion, object shape checks, and the text of a caught error.
 *
 * A helper belongs here only until a module exists whose subject it actually is.
 */

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
	getErrorMessage,
	getErrorStack,
};
