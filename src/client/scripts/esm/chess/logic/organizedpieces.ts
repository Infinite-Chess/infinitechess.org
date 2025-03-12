import typeutil from "../util/typeutil";
import coordutil from "../util/coordutil";
import math from "../../util/math";
import { listExtras, players } from "../config";

// @ts-ignore
import type gamefile from "./gamefile";
import type { RawType } from "../util/typeutil";
import type { Vec2, LineKey, Vec2Key } from "../util/boardutil";
import type { Coords, CoordsKey } from "../util/coordutil";
// @ts-ignore
import type { GameRules } from "../variants/gamerules";
import type { PieceMoveset } from "./movesets";

const ArrayTypes = [Int8Array, Int16Array, Int32Array, BigInt64Array, Uint8Array];
type PositionArray = Int8Array | Int16Array | Int32Array; //| BigInt64Array;
type SizedArray = PositionArray | Uint8Array
type PositionArrayConstructor = Int32ArrayConstructor | Int8ArrayConstructor | Int16ArrayConstructor; //| BigInt64ArrayConstructor;
/** Stores the maximum values for each typed array */
const MaxTypedArrayValues: Record<string, bigint> = {
	Int8Array: 127n,
	Int16Array: 32767n,
	Int32Array: 2147483647n,
	BigInt64Array: 9223372036854775807n,
};

interface TypeRange {
	start: number,
	end: number, // Exclusive
	/** Each number in this array is the index of the undefined in the large XYPositions arrays. This array is also sorted. */
	undefineds: Array<number>
}

type TypeRanges = Map<number, TypeRange>

interface OrganizedPieces {
	XPositions: PositionArray
	YPositions: PositionArray
	types: Uint8Array // Range 0-255. There are 22 total types currently, potentially 4 unique players/players in a game ==> 88 posible types.
	typeRanges: TypeRanges
	// Maybe not needed? Since typeRanges above contains undefineds arrays. Correct me if wrong
	// undefineds: Array<number>
	/**
	 * Pieces organized by coordinate
	 * 
	 * 'x,y' => idx
	 */
	coords: Map<CoordsKey, number>
	/**
	 * I actually do think we should stick to the maps being the keys of the slide/line
	 * instead of integers of the dx/dy. There's half as many lookups to do (but maybe a little
	 * slower due to them being strings), and string keys can contain arbitrarily large numbers.
	 * 
	 * Map{ 'dx,dy' => Map { 'yint|xafter0' => [idx, idx, idx...] }}
	 */
	lines: Map<Vec2Key, Map<LineKey,number[]>>
	slides: Vec2[]
	hippogonalsPresent: boolean
	/** Whether colinear lines are present in the gamefile.
	* (e.g. [1,0] and [2,0] are colinear) @type {boolean} */
	colinearsPresent: undefined,
}


function getArrayType<C extends SizedArray>(a: C) {
	for (const t of ArrayTypes) {
		if (a instanceof t) return t;
	}
	throw Error();
}

function constuctNewArray<C extends SizedArray>(a: C, i: number): C {
	const constructor = getArrayType(a);
	return new constructor(a.length + i) as C;
}

function regenerateLists(o: OrganizedPieces, gamerule: GameRules) {
	const typeOrder = [...o.typeRanges.keys()];
	typeOrder.sort((a,b) => {return o.typeRanges.get(a)!.start - o.typeRanges.get(b)!.start;});

	let totalUndefinedsNeeded = 0;
	let currentOffset = 0;
	const offsetByType: {[type: number]: number} = {};
	const extraUndefinedsByType: {[type: number]: number} = {};
	for (const t of typeOrder) {
		offsetByType[t] = currentOffset;
		let undefinedsNeeded = 0;
		if (isTypeATypeWereAppendingUndefineds(gamerule.promotionsAllowed!, t)) {
			undefinedsNeeded = Math.min(listExtras - o.typeRanges.get(t)!.undefineds.length, undefinedsNeeded);
		}
		extraUndefinedsByType[t] = undefinedsNeeded;
		totalUndefinedsNeeded += undefinedsNeeded;
		currentOffset += undefinedsNeeded;
	}

	const newXpos = constuctNewArray(o.XPositions, totalUndefinedsNeeded);
	const newYpos = constuctNewArray(o.YPositions, totalUndefinedsNeeded);
	const newTypes = constuctNewArray(o.types, totalUndefinedsNeeded);

	for (const [t, rangeData] of o.typeRanges) {
		const extraNeeded = extraUndefinedsByType[t]!;
		const currentOffset = offsetByType[t]!;
		// Copy all data
		for (let i = rangeData.start; i < rangeData.end; i++) {
			newXpos[i + currentOffset] = o.XPositions[i]!;
			newYpos[i + currentOffset] = o.YPositions[i]!;
			newTypes[i + currentOffset] = o.types[i]!;
		}
		// Move undefineds
		for (const i in rangeData.undefineds) {
			rangeData.undefineds[i]! += currentOffset;
		}
		// Move ranges
		rangeData.start += currentOffset;
		rangeData.end += currentOffset;
		// Add new undefineds
		for (let i = rangeData.end; i < rangeData.end + extraNeeded; i++) {
			rangeData.undefineds.push(i);
		}

		rangeData.end += extraNeeded;
	}

	for (const dir in o.lines) {
		const l = o.lines.get(dir as Vec2Key);
		for (const linekey in l) {
			const line: number[] = l.get(linekey as LineKey)!;
			for (const i in line) {
				const idx = line[i]!;
				line[i] = offsetByType[o.types[idx]!]! + idx;
			}
		}
	}

	for (const pos in o.coords ) {
		const idx = o.coords.get(pos as CoordsKey)!;
		o.coords.set(pos as CoordsKey, idx + offsetByType[o.types[idx]!]!);
	}

	o.XPositions = newXpos;
	o.YPositions = newYpos;
	o.types = newTypes;
}

function areWeShortOnUndefineds(o: OrganizedPieces, gamerules: GameRules): boolean {
	for (const [t, range] of o.typeRanges) {
		if (!isTypeATypeWereAppendingUndefineds(gamerules.promotionsAllowed!, t)) return false;
		if (range.undefineds.length === 0) return true;
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
function isTypeATypeWereAppendingUndefineds(promotionGameRule: {[color: string]: number[]} | undefined, type: number): boolean {
	if (!promotionGameRule) return false; // No pieces can promote, definitely not appending undefineds to this piece.

	const color = typeutil.getColorStringFromType(type);

	if (!promotionGameRule[color]) return false; // Eliminates neutral pieces.
    
	const trimmedType = typeutil.getRawType(type);
	return promotionGameRule[color].includes(trimmedType); // Eliminates all pieces that can't be promoted to
}

/**
 * 
 * @param {gamefile} gamefile
 */
function getEmptyTypeRanges(gamefile: gamefile): TypeRanges {
	const state: TypeRanges = new Map();

	typeutil.forEachPieceType(t => {
		state.set(t, {
			start: 0,
			end: -1,
			undefineds: []
		});
	}, [players.NEUTRAL, players.WHITE, players.BLACK],
	gamefile.startSnapshot.existingTypes as RawType[]);

	return state;
}

function toSizedArray<T extends SizedArray>(arr: number[], sizedArray: T): T {
	for (let i = 0; i < sizedArray.length; i++) {
		sizedArray[i] = arr[i]!;
	}
	return sizedArray;
}

/**
 * Converts a piece list organized by key to organized by type.
 * @returns Pieces organized by type: `{ pawnsW: [ [1,2], [2,2], ...]}`
 */
function buildStateFromKeyList(gamefile: gamefile, coordConstructor: PositionArrayConstructor): OrganizedPieces {
	const keyList = gamefile.startSnapshot.position;
	const ranges = getEmptyTypeRanges(gamefile);
	const piecesByType: {[type: number]: Coords[]} = {};
	const organizedPieces: Partial<OrganizedPieces> = {
		typeRanges: ranges,
	};

	// For some reason, does not iterate through inherited properties?
	for (const key in keyList) {
		const type = keyList[key];
		const coords = coordutil.getCoordsFromKey(key as CoordsKey);
		// Does the type parameter exist?
		// if (!state[type]) state[type] = []
		if (!ranges.has(type)) throw Error(`Error when building state from key list. Type ${type} has no range!`);
		// Push the coords
		piecesByType[type]!.push(coords);
	}

	const typeOrder: number[] = Object.keys(piecesByType).map(Number).sort();
	let currentOffset = 0;
	const x: number[] = [];
	const y: number[] = [];
	const t: number[] = [];
	for (const rt of typeOrder) {
		const pieces = piecesByType[rt]!;
		const range = ranges.get(rt)!;
		range.start = currentOffset;
		currentOffset += pieces.length;
		range.end = currentOffset; 
		for (const c of pieces) {
			x.push(c[0]);
			y.push(c[1]);
			t.push(rt);
		}
	}
	organizedPieces.XPositions = toSizedArray(x, new coordConstructor(currentOffset));
	organizedPieces.YPositions = toSizedArray(y, new coordConstructor(currentOffset));
	organizedPieces.types = toSizedArray(t, new Uint8Array(currentOffset));

	initSlidingMoves(gamefile, organizedPieces);

	placePieces(organizedPieces);

	// TODO: Trim piece lists that are empty and cant be promoted to.

	return organizedPieces as OrganizedPieces;
}

/**
 * Calculates all possible slides that should be possible in the provided game,
 * excluding pieces that aren't in the provided position.
 */
function getPossibleSlides(gamefile: gamefile): Vec2[] {
	const rawtypes = gamefile.startSnapshot.existingTypes;
	const movesets = gamefile.pieceMovesets;
	const slides = new Set(['1,0']); // '1,0' is required if castling is enabled.
	for (const type of rawtypes) {
		let moveset = movesets[type];
		if (!moveset) continue;
		moveset = moveset();
		if (!moveset.sliding) continue;
		Object.keys(moveset.sliding).forEach(slide => slides.add(slide));
	}
	const temp: Vec2[] = [];
	slides.forEach(slideline => temp.push(coordutil.getCoordsFromKey(slideline as Vec2Key)));
	return temp;
}

/**
 * Inits the `slidingMoves` property of the `startSnapshot` of the gamefile.
 * This contains the information of what slides are possible, according to
 * what piece types are in this game.
 */
function initSlidingMoves(gamefile: gamefile, o: Partial<OrganizedPieces>) {
	o.slides = getPossibleSlides(gamefile);
	o.hippogonalsPresent = areHippogonalsPresentInGame(o.slides);
}

function placePieces(organizedPieces: Partial<OrganizedPieces>) {
	organizedPieces.lines = new Map();
	organizedPieces.coords = new Map();
	for (const line of organizedPieces.slides!) {
		const strline = coordutil.getKeyFromCoords(line);
		organizedPieces.lines.set(strline, new Map());
	}
	for (let i = 0; i < organizedPieces.types!.length; i++) {
		registerPieceInSpace(i, organizedPieces);
	}
}

function registerPieceInSpace(idx: number, organizedPieces: Partial<OrganizedPieces>) {
	const x = organizedPieces.XPositions![idx];
	const y = organizedPieces.YPositions![idx];
	const coords = [x,y] as Coords;
	const key = coordutil.getKeyFromCoords(coords);
	if (!organizedPieces.coords!.has(key)) throw Error(`While organizing a piece, there was already an existing piece there!! ${key}`);
	organizedPieces.coords!.set(key, idx);
	const lines = organizedPieces.lines!;
	for (const [strline, linegroup] of lines) {
		const lkey = getKeyFromLine(coordutil.getCoordsFromKey(strline), coords);
		// Is line initialized
		if (linegroup.get(lkey) === undefined) lines.get(strline)!.set(lkey, []);
		linegroup.get(lkey)!.push(idx);
	}
}

function removePieceFromSpace(idx: number, organizedPieces: Partial<OrganizedPieces>) {
	const x = organizedPieces.XPositions![idx];
	const y = organizedPieces.YPositions![idx];
	const coords = [x,y] as Coords;
	const key = coordutil.getKeyFromCoords(coords);

	organizedPieces.coords!.delete(key);
	const lines = organizedPieces.lines!;
	for (const [strline, linegroup] of lines) {
		const lkey = getKeyFromLine(coordutil.getCoordsFromKey(strline), coords);
		// Is line initialized
		if (linegroup.get(lkey) === undefined) continue;
		removePieceFromLine(linegroup, lkey);
	}

	// Takes a line from a property of an organized piece list, deletes the piece at specified coords
	function removePieceFromLine(organizedPieces: Map<LineKey,number[]>, lineKey: LineKey) {
		const line = organizedPieces.get(lineKey)!;

		for (let i = 0; i < line.length; i++) {
			const thisPieceIdx = line[i]!;
			if (thisPieceIdx !== idx) continue;
			line.splice(i, 1); // Delete
			// If the line length is now 0, remove itself from the organizedPieces
			if (line.length === 0) organizedPieces.delete(lineKey);
			break;
		}
	}
}

/**
 * Returns a string that is a unique identifier of a given organized line: `"C|X"`.
 * Where `C` is the c in the linear standard form of the line: "ax + by = c",
 * and `X` is the nearest x-value the line intersects on or after the y-axis.
 * For example, the line with step-size [2,0] that starts on point (0,0) will have an X value of '0',
 * whereas the line with step-size [2,0] that starts on point (1,0) will have an X value of '1',
 * because it's step size means it never intersects the y-axis at x = 0, but x = 1 is the nearest it gets to it, after 0.
 * 
 * If the line is perfectly vertical, the axis will be flipped, so `X` in this
 * situation would be the nearest **Y**-value the line intersects on or above the x-axis.
 * @param {Vec2} step - Line step `[dx,dy]`
 * @param {Coords} coords `[x,y]` - A point the line intersects
 * @returns {String} the key `C|X`
 */
function getKeyFromLine(step: Vec2, coords: Coords): LineKey {
	const C = math.getLineCFromCoordsAndVec(coords, step);
	const X = getXFromLine(step, coords);
	return `${C}|${X}`;
}

/**
 * Calculates the `X` value of the line's key from the provided step direction and coordinates,
 * which is the nearest x-value the line intersects on or after the y-axis.
 * For example, the line with step-size [2,0] that starts on point (0,0) will have an X value of '0',
 * whereas the line with step-size [2,0] that starts on point (1,0) will have an X value of '1',
 * because it's step size means it never intersects the y-axis at x = 0, but x = 1 is the nearest it gets to it, after 0.
 * 
 * If the line is perfectly vertical, the axis will be flipped, so `X` in this
 * situation would be the nearest **Y**-value the line intersects on or above the x-axis.
 * @param {Vec2} step - [dx,dy]
 * @param {Coords} coords - Coordinates that are on the line
 * @returns {number} The X in the line's key: `C|X`
 */
function getXFromLine(step: Coords, coords: Coords): number {
	// See these desmos graphs for inspiration for finding what line the coords are on:
	// https://www.desmos.com/calculator/d0uf1sqipn
	// https://www.desmos.com/calculator/t9wkt3kbfo

	const lineIsVertical = step[0] === 0;
	const deltaAxis = lineIsVertical ? step[1] : step[0];
	const coordAxis = lineIsVertical ? coords[1] : coords[0];
	return math.posMod(coordAxis, deltaAxis);
}

/** Splits the `C` value out of the line key */
function getCFromKey(lineKey: LineKey): number {
	return Number(lineKey.split('|')[0]);
}

/**
 * Tests if the provided gamefile has colinear organized lines present in the game.
 * This can occur if there are sliders that can move in the same exact direction as others.
 * For example, [2,0] and [3,0]. We typically like to know this information because
 * we want to avoid having trouble with calculating legal moves surrounding discovered attacks
 * by using royalcapture instead of checkmate.
 */
function areColinearSlidesPresentInGame(gamefile: gamefile): boolean { // [[1,1], [1,0], ...]

	/**
	 * 1. Colinears are present if any vector is NOT a primitive vector.
	 * 
	 * This is because if a vector is not primitive, multiple simpler vectors can be combined to make it.
	 * For example, [2,0] can be made by combining [1,0] and [1,0].
	 * In a real game, you could have two [2,0] sliders, offset by 1 tile, and their lines would be colinear, yet not intersecting.
	 * 
	 * A vector is considered primitive if the greatest common divisor (GCD) of its components is 1.
	 */

	if (gamefile.startSnapshot.slidingPossible.some((vector: Vec2) => math.GCD(vector[0], vector[1]) !== 1)) return true; // Colinears are present

	/**
	 * 2. Colinears are present if there's at least one custom ignore function.
	 * 
	 * This is because a custom ignore function can be used to simulate a non-primitive vector.
	 * Or another vector for that matter.
	 * We cannot predict if the piece will not cause colinears.
	 */

	if (gamefile.startSnapshot.existingTypes.some((type: number) => {
		const movesetFunc = gamefile.pieceMovesets[type];
		if (!movesetFunc) return false;
		const thisTypeMoveset: PieceMoveset = movesetFunc();
		// A custom blocking function may trigger crazy checkmate colinear shenanigans because it can allow opponent pieces to phase through your pieces, so pinning works differently.
		return 'ignore' in thisTypeMoveset || 'blocking' in thisTypeMoveset; // True if this type has a custom ignore/blocking function being used (colinears may be present).
	})) return true; // Colinears are present

	return false; // Colinears are not present
}

/**
 * Tests if the provided gamefile has hippogonal lines present in the game.
 * True if there are knightriders or higher riders.
 */
function areHippogonalsPresentInGame(slidingPossible: Vec2[]): boolean {
	for (let i = 0; i < slidingPossible.length; i++) {
		const thisSlideDir: Vec2 = slidingPossible[i]!;
		if (Math.abs(thisSlideDir[0]) > 1) return true;
		if (Math.abs(thisSlideDir[1]) > 1) return true;
	}
	return false;
}



export type {
	OrganizedPieces,
	TypeRange,
};

export default {
	MaxTypedArrayValues,

	areHippogonalsPresentInGame,
	areColinearSlidesPresentInGame,
	buildStateFromKeyList,

	registerPieceInSpace,
	removePieceFromSpace,

	regenerateLists,
	areWeShortOnUndefineds,
	isTypeATypeWereAppendingUndefineds,

	getKeyFromLine,
	getCFromKey,
	getXFromLine,
};