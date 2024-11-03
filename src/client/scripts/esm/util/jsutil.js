
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
 * @param {Object | string | number | bigint | boolean} src - The source object
 * @returns {Object | string | number | bigint | boolean} The copied object
 */
function deepCopyObject(src) {
	if (typeof src !== "object" || src === null) return src;
    
	const copy = Array.isArray(src) ? [] : {}; // Create an empty array or object
    
	for (const key in src) {
		const value = src[key];
		copy[key] = deepCopyObject(value); // Recursively copy each property
	}
    
	return copy; // Return the copied object
}

/**
 * Deep copies a Float32Array.
 * @param {Float32Array} src - The source Float32Array
 * @returns {Float32Array} The copied Float32Array
 */
function copyFloat32Array(src) {
	if (!src || !(src instanceof Float32Array)) {
		throw new Error('Invalid input: must be a Float32Array');
	}
    
	const copy = new Float32Array(src.length);
    
	for (let i = 0; i < src.length; i++) {
		copy[i] = src[i];
	}
    
	return copy;
}

// Assumes the sortedArray DOES NOT contain the value!
function binarySearch_findSplitPoint(sortedArray, value) {
	if (value === undefined) throw new Error('Cannot binary search when value is undefined!');

	let left = 0;
	let right = sortedArray.length - 1;

	while (left <= right) {
		const mid = Math.floor((left + right) / 2);
		const midValue = sortedArray[mid];

		if (value < midValue) right = mid - 1;
		else if (value > midValue) left = mid + 1;
		else if (midValue === value) {
			throw new(`Cannot find split point of sortedArray when it already contains the value! ${value}. List: ${JSON.stringify(sortedArray)}`);
		}
	}

	// The left is the index at which you could insert the new value at the correct location!
	return left;
}

// Returns the index at which you could insert the value and keep it organized,
// OR returns the index of the value!
function binarySearch_findValue(sortedArray, value) {
	if (value === undefined) return console.error('Cannot binary search when value is undefined!');

	let left = 0;
	let right = sortedArray.length - 1;

	while (left <= right) {
		const mid = Math.floor((left + right) / 2);
		const midValue = sortedArray[mid];

		if (value < midValue) right = mid - 1;
		else if (value > midValue) left = mid + 1;
		else if (midValue === value) return mid;
	}

	// The left is the index at which you could insert the new value at the correct location!
	return left;
}

// Returns the index if deletion was successful.
// false if not found
function deleteValueFromOrganizedArray(sortedArray, value) { // object can't be an array

	let left = 0;
	let right = sortedArray.length - 1;

	while (left <= right) {
		const mid = Math.floor((left + right) / 2);
		const midValue = sortedArray[mid];

		if (value === midValue) {
			sortedArray.splice(mid, 1);
			return mid;
		} else if (value < midValue) { // Set the new left
			right = mid - 1;
		} else if (value > midValue) {
			left = mid + 1;
		}
	}
}

// Removes specified object from given array. Throws error if it fails. The object cannot be an object or array, only a single value.
function removeObjectFromArray(array, object) { // object can't be an array
	const index = array.indexOf(object);
	if (index !== -1) array.splice(index, 1);
	else throw new Error(`Could not delete object from array, not found! Array: ${JSON.stringify(array)}. Object: ${object}`);
}

// Returns true if provided object is a float32array
function isFloat32Array(param) {
	return param instanceof Float32Array;
}

/**
 * Copies the properties from one object to another,
 * without overwriting the existing properties on the destination object.
 * @param {Object} objSrc - The source object
 * @param {Object} objDest - The destination object
 */
function copyPropertiesToObject(objSrc, objDest) {
	const objSrcKeys = Object.keys(objSrc);
	for (let i = 0; i < objSrcKeys.length; i++) {
		const key = objSrcKeys[i];
		objDest[key] = objSrc[key];
	}
}

/**
 * O(1) method of checking if an object/dict is empty
 * @param {Object} obj 
 * @returns {Boolean}
 */
function isEmpty(obj) {
	for (const prop in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, prop)) {
			return false;
		}
	}
    
	return true;
}

/**
 * Tests if a string is in valid JSON format, and can thus be parsed into an object.
 * @param {string} str - The string to test
 * @returns {boolean} *true* if the string is in valid JSON fromat
 */
function isJson(str) {
	try {
		JSON.parse(str);
	} catch {
		return false;
	}
	return true;
}

/**
 * Returns a new object with the keys being the values of the provided object, and the values being the keys.
 * @param {Object} obj - The object to invert
 * @returns {Object} The inverted object
 */
function invertObj(obj) {
	const inv = {};
	for (const key in obj) {
		inv[obj[key]] = key;
	}
	return inv;
}

export default {
	deepCopyObject,
	copyFloat32Array,
	binarySearch_findSplitPoint,
	binarySearch_findValue,
	deleteValueFromOrganizedArray,
	isFloat32Array,
	copyPropertiesToObject,
	isEmpty,
	isJson,
	invertObj,
	removeObjectFromArray
};