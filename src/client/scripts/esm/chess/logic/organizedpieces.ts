const ArrayTypes = [Int8Array, Int16Array, Int32Array, BigInt64Array, Uint8Array];
type PositionArray = Int8Array | Int16Array | Int32Array | BigInt64Array;
type SizedArray = PositionArray | Uint8Array
type PositionArrayConstructor = Int32ArrayConstructor | Int8ArrayConstructor | BigInt64ArrayConstructor | Int16ArrayConstructor;
/** Stores the maximum values for each typed array */
const MaxTypedArrayValues: Record<string, bigint> = {
	Int8Array: 127n,
	Int16Array: 32767n,
	Int32Array: 2147483647n,
	BigInt64Array: 9223372036854775807n,
};

const listExtras = 20;

interface OrganizedPieces {
	XPositions: PositionArray
	YPositions: PositionArray
	types: Uint8Array // Range 0-255. There are 22 total types currently, potentially 4 unique colors/players in a game ==> 88 posible types.
	typeRanges: {
		[type: number]: {
			start: number,
			end: number,
			/** Each number in this array is the index of the undefined in the large XYPositions arrays. This array is also sorted. */
			undefineds: Array<number>
		},
	}
	// Maybe not needed? Since typeRanges above contains undefineds arrays. Correct me if wrong
	// undefineds: Array<number>
	/**
	 * Pieces organized by coordinate
	 * 
	 * 'x,y' => idx
	 */
	coords: Map<string, number>
	/**
	 * I actually do think we should stick to the maps being the keys of the slide/line
	 * instead of integers of the dx/dy. There's half as many lookups to do (but maybe a little
	 * slower due to them being strings), and string keys can contain arbitrarily large numbers.
	 * 
	 * Map{ 'dx,dy' => Map { 'yint|xafter0' => [idx, idx, idx...] }}
	 */
	lines: Map<string, Map<string,number[]>>
}


function getArrayType<C extends SizedArray>(a: C) {
	for (const t of ArrayTypes) {
		if (a instanceof t) return t;
	}
	throw Error();
}

function constuctNewArray(a: SizedArray, i: number) {
	const constructor = getArrayType(a);
	return new constructor(a.length + i);
}

function regenerateLists(o: OrganizedPieces) {
	const typeOrder = Object.keys(o.typeRanges);
	typeOrder.sort((a,b) => {return o.typeRanges[a].start - o.typeRanges[b].start;});

	let totalUndefinedsNeeded = 0;
	let currentOffset = 0;
	const offsetByType = {};
	const extraUndefinedsByType = {};
	for (const t in typeOrder) {
		offsetByType[t] = currentOffset;
		const undefinedsNeeded = Math.min(listExtras - o.typeRanges[t].undefineds.length, 0);
		extraUndefinedsByType[t] = undefinedsNeeded;
		totalUndefinedsNeeded += undefinedsNeeded;
		currentOffset += undefinedsNeeded;
	}

	const newXpos = constuctNewArray(o.XPositions, totalUndefinedsNeeded);
	const newYpos = constuctNewArray(o.YPositions, totalUndefinedsNeeded);
	const newTypes = constuctNewArray(o.types, totalUndefinedsNeeded);

	for (const t in o.typeRanges) {
		const rangeData = o.typeRanges[t];
		const extraNeeded = extraUndefinedsByType[t];
		const currentOffset = offsetByType[t];
		// Copy all data
		for (let i = rangeData.start; i < rangeData.end; i++) {
			newXpos[i + currentOffset] = o.XPositions[i];
			newYpos[i + currentOffset] = o.YPositions[i];
			newTypes[i + currentOffset] = o.types[i];
		}
		// Move undefineds
		for (const i in rangeData.undefineds) {
			rangeData.undefineds[i] = rangeData.undefineds[i] + currentOffset;
		}
		// Move ranges
		rangeData.start += currentOffset;
		rangeData.end += currentOffset;
		// Add new undefineds
		for (let i = rangeData.end + 1; i <= rangeData.end + extraNeeded; i++) {
			rangeData.undefineds.push(i);
		}

		rangeData.end += extraNeeded;
	}

	for (const dir in o.lines) {
		for (const linekey in o.lines[dir]) {
			const line: number[] = o.lines[dir][linekey];
			for (const i in line) {
				const idx = line[i];
				line[i] = offsetByType[o.types[idx]] + idx;
			}
		}
	}
}

function areWeShortOnUndefineds(o: OrganizedPieces): boolean {
	for (const t in o.typeRanges) {
		if (!isTypeATypeWereAppendingUndefineds()) return false;
		if (o.typeRanges[t].undefineds.length === 0) return true;
	}
	return false;
}

/**
 * Sees if the provided type is a type we need to append undefined
 * placeholders to the piece list of this type.
 * The mesh of all the pieces needs placeholders in case we
 * promote to a new piece.
 * @param {gamefile} gamefile - The gamefile
 * @param {string} type - The type of piece (e.g. "pawnsW")
 * @returns {boolean} *true* if we need to append placeholders for this type.
 */
function isTypeATypeWereAppendingUndefineds(gamefile: gamefile, type: string): boolean {
	if (!gamefile.gameRules.promotionsAllowed) return false; // No pieces can promote, definitely not appending undefineds to this piece.

	const color = colorutil.getPieceColorFromType(type);

	if (!gamefile.gameRules.promotionsAllowed[color]) return false; // Eliminates neutral pieces.
    
	const trimmedType = colorutil.trimColorExtensionFromType(type);
	return gamefile.gameRules.promotionsAllowed[color].includes(trimmedType); // Eliminates all pieces that can't be promoted to
}

/**
 * Converts a piece list organized by key to organized by type.
 * @returns Pieces organized by type: `{ pawnsW: [ [1,2], [2,2], ...]}`
 */
function buildStateFromKeyList(gamefile: gamefile, coordConstructor: PositionArrayConstructor): PiecesByType {
	const keyList = gamefile.startSnapshot.position;
	const state = getEmptyTypeState(gamefile);

	// For some reason, does not iterate through inherited properties?
	for (const key in keyList) {
		const type = keyList[key];
		const coords = coordutil.getCoordsFromKey(key as CoordsKey);
		// Does the type parameter exist?
		// if (!state[type]) state[type] = []
		if (!state[type]) throw Error(`Error when building state from key list. Type ${type} is undefined!`);
		// Push the coords
		state[type].push(coords);
	}

	return state;
}