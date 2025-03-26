
/**
 * This scripts contains utility methods for working with javascript objects.
 * 
 * ZERO dependancies.
 */

const fixedArrays = [
	Float32Array,
	Float64Array,

	Int8Array,
	Int16Array,
	Int32Array,
	BigInt64Array,

	Uint8Array,
	Uint16Array,
	Uint32Array,
	BigUint64Array,
] as const;

type FixedArray = Float32Array | Float64Array | Int8Array | Int16Array | Int32Array | BigInt64Array | Uint8Array | Uint16Array | Uint32Array | BigUint64Array;

function getConstructorOfArray(array: any) {
	for (const c of fixedArrays) {
		if (array instanceof c) return c;
	}
	return false;
}

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
    
	if (src instanceof Map) {
		return new Map([...src]) as T;
	}

	const constructor = getConstructorOfArray(src);
	if (constructor) {
		// @ts-ignore
		const copy = new constructor((src as FixedArray).length);
		for (let i = 0; i < copy.length; i++) {
			// @ts-ignore
			copy[i] = src[i];
		}
		return copy as T;
	}

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
function invertObj(obj: Record<string, string>): Record<string, string> {
	const inv: Record<string, string> = {};
	for (const key in obj) {
		inv[obj[key]!] = key;
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
 * as those have extra prototype methods, etc, adding more memory.
 * 
 * For that reason, it'd be good to avoid the number of objects we create being
 * linear with the number of pieces in our game.
 */
function estimateMemorySizeOf(obj: any): string {
	// Credit: Liangliang Zheng https://stackoverflow.com/a/6367736
	function roughSizeOfObject(value: any, level?: number ) {
		if (level === undefined) level = 0;
		let bytes = 0;
	
		if (typeof value === 'boolean') bytes = 4;
		else if (typeof value === 'string' ) bytes = value.length * 2;
		else if (typeof value === 'number') bytes = 8;
		else if (value === null) bytes = 1;
		else if (typeof value === 'object') {
			if (value['__visited__']) return 0;
			value['__visited__'] = 1;
			for (const i in value) {
				bytes += i.length * 2;
				bytes += 8; // an assumed existence overhead
				bytes += roughSizeOfObject(value[i], 1);
			}
		}
	
		if (level === 0) clear__visited__(value);
		return bytes;
	}
	
	function clear__visited__(value: any) {
		if (typeof value === 'object' && value !== null) {
			delete value['__visited__'];
			for (const i in value) {
				clear__visited__(value[i]);
			}
		}
	}

	// Turns the number into a human-readable string
	function formatByteSize(bytes: number): string {
		if (bytes < 1000) return bytes + " bytes";
		else if (bytes < 1000000) return (bytes / 1000).toFixed(3) + " KB";
		else if (bytes < 1000000000) return (bytes / 1000000).toFixed(3) + " MB";
		else return (bytes / 1000000000).toFixed(3) + " GB";
	};

	return formatByteSize(roughSizeOfObject(obj));
};




export default {
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
};