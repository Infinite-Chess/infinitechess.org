// src/shared/util/jsonutil.ts

/**
 * JSON that survives a round trip through types plain `JSON.stringify` drops:
 * BigInts, Maps, Sets and TypedArrays.
 *
 * Each is written as a `{ $$type, value }` envelope on the way out and rebuilt from it
 * on the way back, so a replacer and a reviver must always be used as a pair.
 */

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

// Replacer & Reviver ----------------------------------------------------------

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

// Safe Stringify --------------------------------------------------------------

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

// Exports ---------------------------------------------------------------------

export default {
	// Replacer & Reviver
	stringifyReplacer,
	parseReviver,
	// Safe Stringify
	ensureJSONString,
};
