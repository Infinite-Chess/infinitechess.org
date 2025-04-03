import typeutil from "../util/typeutil.js";
import coordutil from "../util/coordutil.js";
import math from "../../util/math.js";
import jsutil from "../../util/jsutil.js";

// @ts-ignore
import type gamefile from "./gamefile.js";
import { Vec2, Vec2Key } from "../../util/math.js";
import type { LineKey, Position } from "../util/boardutil.js";
import type { Coords, CoordsKey } from "../util/coordutil.js";
// @ts-ignore
import type { GameRules } from "../variants/gamerules.js";
import type { PieceMoveset } from "./movesets.js";
import type { Player } from "../util/typeutil.js";
import type { FixedArray } from "../../util/jsutil.js";

type PositionArray = Float32Array | Float64Array //| BigInt64Array;
type PositionArrayConstructor = Float32ArrayConstructor | Float64ArrayConstructor //| BigInt64ArrayConstructor;
/** Stores the maximum values for each typed array */
const MaxTypedArrayValues: Record<string, bigint> = {
	Int8Array: 127n,
	Int16Array: 32767n,
	Int32Array: 2147483647n,
	BigInt64Array: 9223372036854775807n,
};

type RegenerateData = {[type: number]: number};

// eslint-disable-next-line no-unused-vars
type RegenerateHook = (gamefile: gamefile, regenData: RegenerateData) => false

interface TypeRange {
	/** Inclusive */
	start: number,
	/** Exclusive */
	end: number,
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
	/** All slide directions possible in the game. [1,0] guaranteed for castling to work. */
	slides: Vec2[]
	/** Whether there are any hippogonal riders in the game (knightriders). */
	hippogonalsPresent: boolean
	/** Whether colinear lines are present in the gamefile.
	* (e.g. [1,0] and [2,0] are colinear) */
	colinearsPresent: boolean,
}

/** The maximum number of pieces in-game to still use the checkmate algorithm. Above this uses "royalcapture". */
const pieceCountToDisableCheckmate = 50_000;


function extendArray<C extends FixedArray>(a: C, i: number): C {
	const constructor = jsutil.getConstructorOfArray(a);

	if (!constructor) throw Error(`${a} is not a fixed array, cannot extend it.`);

	return new constructor(a.length + i) as C;
}

/**
 * This is used to regenerate the organizational lists of the board
 * so that extra space can be added to anticipate extra pieces being added,
 * currently this is only useful for promotion.
 * @param o The organized pieces
 * @param gamerule 
 * @param listExtras The amount of undefineds that we should have for pieces that may be added
 * @returns how much each typerange was extended by
 */
function regenerateLists(o: OrganizedPieces, gamerule: GameRules, listExtras: number): RegenerateData {
	const typeOrder = [...o.typeRanges.keys()];
	typeOrder.sort((a,b) => {
		const startDiff = o.typeRanges.get(a)!.start - o.typeRanges.get(b)!.start;
		if (startDiff !== 0) return startDiff;
		return b - a; // Just so typeranges are in the order of type ASC when they start at the same point.
	});

	let totalUndefinedsNeeded = 0;
	let currentOffset = 0;
	const offsetByType: {[type: number]: number} = {};
	const extraUndefinedsByType: RegenerateData = {};
	for (const t of typeOrder) {
		offsetByType[t] = currentOffset;
		let undefinedsNeeded = 0;
		if (isTypeATypeWereAppendingUndefineds(gamerule.promotionsAllowed!, t)) {
			undefinedsNeeded = Math.max(listExtras - o.typeRanges.get(t)!.undefineds.length, undefinedsNeeded);
		}
		extraUndefinedsByType[t] = undefinedsNeeded;
		totalUndefinedsNeeded += undefinedsNeeded;
		currentOffset += undefinedsNeeded;
	}

	const newXpos = extendArray(o.XPositions, totalUndefinedsNeeded);
	const newYpos = extendArray(o.YPositions, totalUndefinedsNeeded);
	const newTypes = extendArray(o.types, totalUndefinedsNeeded);

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
			newTypes[i] = t;
		}

		rangeData.end += extraNeeded;
	}

	for (const l of o.lines.values()) {
		for (const line of l.values()) {
			for (const i in line) {
				const idx = line[i]!;
				line[i] = offsetByType[o.types[idx]!]! + idx;
			}
		}
	}

	for (const [pos, idx] of o.coords.entries()) {
		o.coords.set(pos as CoordsKey, idx + offsetByType[o.types[idx]!]!);
	}

	o.XPositions = newXpos;
	o.YPositions = newYpos;
	o.types = newTypes;

	return extraUndefinedsByType;
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
 * The lists of all the pieces needs placeholders in case we
 * promote to a new piece.
 * @param gamefile - The gamefile
 * @param type - The type of piece (e.g. r.pawns + e.W)
 * @returns *true* if we need to append placeholders for this type.
 */
// eslint-disable-next-line no-unused-vars
function isTypeATypeWereAppendingUndefineds(promotionGameRule: {[color in Player]?: number[]} | undefined, type: number): boolean {
	if (!promotionGameRule) return false; // No pieces can promote, definitely not appending undefineds to this piece.

	const [rawType, player] = typeutil.splitType(type);

	if (!promotionGameRule[player]) return false; // This player color cannot promote (neutral).
	return promotionGameRule[player].includes(rawType); // Eliminates all pieces that can't be promoted to
}

/**
 * Copies the contents of an array over to a fixed array
 */
// TODO: move to jsutil?
function copyToSizedArray<T extends FixedArray>(arr: number[], sizedArray: T): T {
	for (let i = 0; i < sizedArray.length; i++) {
		sizedArray[i] = arr[i]!;
	}
	return sizedArray;
}

/**
 * Uses the information in the gamefile to build organized pieces.
 * @param gamefile 
 * @param coordConstructor The type of array to be used for `Xpositions` and `Ypositions`
 * @returns 
 */
function buildStateForGame(gamefile: gamefile, coordConstructor: PositionArrayConstructor): OrganizedPieces {
	const keyList = gamefile.startSnapshot.position;
	return buildStateFromPosition(keyList, coordConstructor, gamefile.startSnapshot.existingTypes, getSlidingInfo(gamefile));
}

/**
 * Converts a piece list organized by key to the organized pieces format.
 * @returns Organized pieces
 */
function buildStateFromPosition(position: Position, coordConstructor: PositionArrayConstructor, possibleTypes: Iterable<number>, 
	{ hippogonalsPresent = false, slides = [] as Vec2[], colinearsPresent = false} = {}
): OrganizedPieces {
	const piecesByType: {[type: number]: Coords[]} = {};
	const ranges: TypeRanges = new Map();

	// Init all type ranges for pieces in game
	for (const type of possibleTypes) {
		ranges.set(type, {
			start: 0,
			end: 0,
			undefineds: []
		});
	}

	const organizedPieces: Partial<OrganizedPieces> = {
		typeRanges: ranges,
		hippogonalsPresent: hippogonalsPresent,
		slides: slides,
		colinearsPresent: colinearsPresent,
	};

	// For some reason, does not iterate through inherited properties?
	for (const [key, type] of Object.entries(position)) {
		const coords = coordutil.getCoordsFromKey(key as CoordsKey);
		
		if (!piecesByType[type]) piecesByType[type] = [];
		if (!ranges.has(type)) throw Error(`Error when building state from key list. Type ${typeutil.debugType(type)} has no range!`);
		// Push the coords
		piecesByType[type]!.push(coords);
	}

	// convert piecesByType to piece lists
	const typeOrder: number[] = [...possibleTypes].sort();
	let currentOffset = 0;
	const x: number[] = [];
	const y: number[] = [];
	const t: number[] = [];
	for (const rt of typeOrder) {
		const pieces = piecesByType[rt];
		if (pieces === undefined) continue; // There are no pieces of this type in the starting position

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

	// Convert piece lists to fixed arrays
	organizedPieces.XPositions = copyToSizedArray(x, new coordConstructor(currentOffset));
	organizedPieces.YPositions = copyToSizedArray(y, new coordConstructor(currentOffset));
	organizedPieces.types = copyToSizedArray(t, new Uint8Array(currentOffset));

	// Position all the pieces
	organizedPieces.lines = new Map();
	organizedPieces.coords = new Map();
	for (const line of organizedPieces.slides!) {
		const strline = coordutil.getKeyFromCoords(line);
		organizedPieces.lines.set(strline, new Map());
	}
	for (let i = 0; i < organizedPieces.types!.length; i++) {
		registerPieceInSpace(i, organizedPieces);
	}

	return organizedPieces as OrganizedPieces;
}

/**
 * Calculates all possible slides that should be possible in the provided game,
 * excluding pieces that aren't in the provided position.
 */
function getPossibleSlides(gamefile: gamefile): Vec2[] {
	const movesets = gamefile.pieceMovesets;
	const slides = new Set<Vec2Key>(['1,0']); // '1,0' is required if castling is enabled.
	for (const rawtype of gamefile.startSnapshot.existingRawTypes) {
		const movesetFunc = movesets[rawtype];
		if (!movesetFunc) continue;
		const moveset: PieceMoveset = movesetFunc() as PieceMoveset;
		if (!moveset.sliding) continue;
		Object.keys(moveset.sliding).forEach(slide => slides.add(slide as Vec2Key));
	}
	const temp: Vec2[] = Array.from(slides, math.getVec2FromKey);
	return temp;
}

/**
 * Inits the `slidingMoves` property of the `startSnapshot` of the gamefile.
 * This contains the information of what slides are possible, according to
 * what piece types are in this game.
 */
function getSlidingInfo(gamefile: gamefile) {
	const slides = getPossibleSlides(gamefile);
	return {
		slides,
		hippogonalsPresent: areHippogonalsPresentInGame(slides),
		colinearsPresent: areColinearSlidesPresentInGame(gamefile, slides),
	};
}

/**
 * Adds a piece to coords and lines
 * so that it can be used for collision detection
 * @param idx 
 * @param organizedPieces 
 */
function registerPieceInSpace(idx: number, organizedPieces: Partial<OrganizedPieces>) {
	if (idx === undefined) throw Error("Undefined idx is trying");
	const x = organizedPieces.XPositions![idx];
	const y = organizedPieces.YPositions![idx];
	const coords = [x,y] as Coords;
	const key = coordutil.getKeyFromCoords(coords);
	if (organizedPieces.coords!.has(key)) throw Error(`While organizing a piece, there was already an existing piece there!! ${key}`);
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
	function removePieceFromLine(lineset: Map<LineKey,number[]>, lineKey: LineKey) {
		const line = lineset.get(lineKey)!;

		for (let i = 0; i < line.length; i++) {
			const thisPieceIdx = line[i]!;
			if (thisPieceIdx !== idx) continue;
			line.splice(i, 1); // Delete
			// If the line length is now 0, remove itself from the lineset
			if (line.length === 0) lineset.delete(lineKey);
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
function areColinearSlidesPresentInGame(gamefile: gamefile, slides: Vec2[]): boolean { // [[1,1], [1,0], ...]

	/**
	 * 1. Colinears are present if any vector is NOT a primitive vector.
	 * 
	 * This is because if a vector is not primitive, multiple simpler vectors can be combined to make it.
	 * For example, [2,0] can be made by combining [1,0] and [1,0].
	 * In a real game, you could have two [2,0] sliders, offset by 1 tile, and their lines would be colinear, yet not intersecting.
	 * 
	 * A vector is considered primitive if the greatest common divisor (GCD) of its components is 1.
	 */

	if (slides!.some((vector: Vec2) => math.GCD(vector[0], vector[1]) !== 1)) return true; // Colinears are present

	/**
	 * 2. Colinears are present if there's at least one custom ignore function.
	 * 
	 * This is because a custom ignore function can be used to simulate a non-primitive vector.
	 * Or another vector for that matter.
	 * We cannot predict if the piece will not cause colinears.
	 */

	if (gamefile.startSnapshot.existingTypes.some((type: number) => {
		const rawType = typeutil.getRawType(type);
		const movesetFunc = gamefile.pieceMovesets[rawType];
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

	RegenerateHook,
	RegenerateData
};

export default {
	MaxTypedArrayValues,
	pieceCountToDisableCheckmate,

	areHippogonalsPresentInGame,
	areColinearSlidesPresentInGame,
	buildStateForGame,
	buildStateFromPosition,

	registerPieceInSpace,
	removePieceFromSpace,

	regenerateLists,
	areWeShortOnUndefineds,
	isTypeATypeWereAppendingUndefineds,

	getKeyFromLine,
	getCFromKey,
	getXFromLine,
};