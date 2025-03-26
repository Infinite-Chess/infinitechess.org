

const fixedArrays =  {
	"Float32Array": Float32Array,
	"Float64Array": Float64Array,
	
	"Int8Array": Int8Array,
	"Int16Array": Int16Array,
	"Int32Array": Int32Array,
	"BigInt64Array": BigInt64Array,

	"Uint8Array": Uint8Array,
	"Uint16Array": Uint16Array,
	"Uint32Array": Uint32Array,
	"BigUint64Array": BigUint64Array,
};

function replacer(key, value) {
	if (value instanceof Map) {
		return {
			TrueType: "Map",
			value: [...value]
		};
	}
		
	for (const [name, type] of Object.entries(fixedArrays)) {
		if (value instanceof type) {
			return {
				TrueType: name,
				value: [...value]
			};
		}
	}

	return value;
}

function reviver(key, value) {
	if (typeof value === 'object' && value !== null) {
		if (value.TrueType === 'Map') {
			return new Map(value.value);
		}

		if (value.TrueType in fixedArrays) {
			const constructor = fixedArrays[value.TrueType];
			const array = new constructor(value.value.length);
			for (let i = 0; i < array.length; i++) {
				array[i] = value.value[i];
			}
			return array;
		}
	}
	return value;
}

/**
 * Ensures any type of object is JSON stringified. Strings are left unchanged.
 * If there's a provided error message, it will log any ocurred error.
 * @param {*} input - The input to stringify.
 * @param {string} [errorMessage] - If specified, then this message will be printed if an error occurs.
 * @returns {string} - The JSON stringified input or the original string if input was a string. Or, if an error ocurred, 'Error: Input could not be JSON stringified'.
 */
function ensureJSONString(input, errorMessage) {
	if (typeof input === 'string') return input;
	try {
		return JSON.stringify(input, replacer);
	} catch (error) {
		// Handle cases where input cannot be stringified
		if (errorMessage) { // Print the error...
			const errText = `${errorMessage}\n${error.stack}`;
			console.log(errText);
		}
		return 'Error: Input could not be JSON stringified';
	}
}

export {
	ensureJSONString,
	replacer,
	reviver,
};
