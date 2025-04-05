

import typeutil, { ext, players, rawTypes } from "../util/typeutil.js";
import coordutil from "../util/coordutil.js";
import math from "../../util/math.js";
import movesets from "./movesets.js";

import type { LineKey, Position } from "../util/boardutil.js";
import type { Vec2, Vec2Key } from "../../util/math.js";
import type { Coords, CoordsKey } from "../util/coordutil.js";
import type { PieceMoveset } from "./movesets.js";
import type { Player, PlayerGroup, RawType, TypeGroup } from "../util/typeutil.js";
import type { FixedArray } from "../../util/jsutil.js";
// @ts-ignore
import type gamefile from "./gamefile.js";
// @ts-ignore
import type { GameRules } from "../variants/gamerules.js";

type PositionArray = Float32Array | Float64Array //| BigInt64Array;
type PositionArrayConstructor = Float32ArrayConstructor | Float64ArrayConstructor //| BigInt64ArrayConstructor;
/** Stores the maximum values for each typed array */
const MaxTypedArrayValues: Record<string, bigint> = {
	Int8Array: 127n,
	Int16Array: 32767n,
	Int32Array: 2147483647n,
	BigInt64Array: 9223372036854775807n,
};

// eslint-disable-next-line no-unused-vars
type RegenerateHook = (gamefile: gamefile, regenData: TypeGroup<number>) => false

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
	/** The X position of all pieces. Undefined pieces are set to 0. */
	XPositions: Float64Array
	/** The Y position of all pieces. Undefined pieces are set to 0. */
	YPositions: Float64Array
	/**
	 * The type of all pieces. Undefined pieces retain the type of the type range they are in.
	 * 
	 * Uint8Array range: 0-255. There are 22 total types currently, potentially 4 unique players/players in a game ==> 88 posible types.
	*/
	types: Uint8Array
	typeRanges: TypeRanges
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
	lines: Map<Vec2Key, Map<LineKey, number[]>>
	/** All slide directions possible in the game. [1,0] guaranteed for castling to work. */
	slides: Vec2[]
	/** Whether there are any hippogonal riders in the game (knightriders). */
	hippogonalsPresent: boolean
}

/** The maximum number of pieces in-game to still use the checkmate algorithm. Above this uses "royalcapture". */
const pieceCountToDisableCheckmate = 50_000;

/** How many extra undefined placeholders each type range should have.
 * When these are all exhausted, the large piece lists must be regenerated. */
const listExtras = 10;
/** EDITOR-MODE-SPECIFIC {@link listExtras} */
const listExtras_Editor = 100;


/**
 * Creates a new, larger TypedArray of the SAME specific type as the input array.
 * Does NOT copy the elements from the original array.
 * @param a The TypedArray instance to base the new array on.
 * @param i The number of elements to add to the length.
 * @returns A new, empty TypedArray of the same type as 'a' with length 'a.length + i'.
 */
function extendArray<C extends FixedArray>(a: C, i: number): C {
	// Use the specific constructor property of the input array 'a'
	// eslint-disable-next-line no-unused-vars
	const constructor = a.constructor as new (length: number) => C;
	// Create a new array of the *same specific type* as 'a'
	return new constructor(a.length + i);
}

// /**
//  * This is used to regenerate the organizational lists of the board
//  * so that extra space can be added to anticipate extra pieces being added,
//  * currently this is only useful for promotion.
//  * @param o The organized pieces
//  * @param gamerule
//  * @param listExtras The amount of undefineds that we should have for pieces that may be added
//  * @returns how much each typerange was extended by
//  */
// function regenerateLists(o: OrganizedPieces, gamerule: GameRules, listExtras: number): RegenerateData {
// 	const typeOrder = [...o.typeRanges.keys()];
// 	typeOrder.sort((a,b) => {
// 		const startDiff = o.typeRanges.get(a)!.start - o.typeRanges.get(b)!.start;
// 		if (startDiff !== 0) return startDiff;
// 		return b - a; // Just so typeranges are in the order of type ASC when they start at the same point.
// 	});

// 	let totalUndefinedsNeeded = 0;
// 	let currentOffset = 0;
// 	const offsetByType: {[type: number]: number} = {};
// 	const extraUndefinedsByType: RegenerateData = {};
// 	for (const t of typeOrder) {
// 		offsetByType[t] = currentOffset;
// 		let undefinedsNeeded = 0;
// 		if (isTypeATypeWereAppendingUndefineds(gamerule.promotionsAllowed!, t)) {
// 			undefinedsNeeded = Math.max(listExtras - o.typeRanges.get(t)!.undefineds.length, undefinedsNeeded);
// 		}
// 		extraUndefinedsByType[t] = undefinedsNeeded;
// 		totalUndefinedsNeeded += undefinedsNeeded;
// 		currentOffset += undefinedsNeeded;
// 	}

// 	const newXpos = extendArray(o.XPositions as unknown as FixedArray, totalUndefinedsNeeded);
// 	const newYpos = extendArray(o.YPositions as unknown as FixedArray, totalUndefinedsNeeded);
// 	const newTypes = extendArray(o.types as unknown as FixedArray, totalUndefinedsNeeded);

// 	for (const [t, rangeData] of o.typeRanges) {
// 		const extraNeeded = extraUndefinedsByType[t]!;
// 		const currentOffset = offsetByType[t]!;
// 		// Copy all data
// 		for (let i = rangeData.start; i < rangeData.end; i++) {
// 			newXpos[i + currentOffset] = o.XPositions[i]!;
// 			newYpos[i + currentOffset] = o.YPositions[i]!;
// 			newTypes[i + currentOffset] = o.types[i]!;
// 		}
// 		// Move undefineds
// 		for (let i = 0; i < rangeData.undefineds.length; i++) {
// 			rangeData.undefineds[i]! += currentOffset;
// 		}
// 		// Move ranges
// 		rangeData.start += currentOffset;
// 		rangeData.end += currentOffset;
// 		// Add new undefineds
// 		for (let i = rangeData.end; i < rangeData.end + extraNeeded; i++) {
// 			rangeData.undefineds.push(i);
// 			newTypes[i] = t; // Assign type to new undefined slots
// 		}

// 		rangeData.end += extraNeeded; // Update final end
// 	}

// 	// Update indices in o.lines (original logic)
// 	for (const l of o.lines.values()) {
// 		for (const line of l.values()) {
// 			for (const i in line) {
// 				const idx = line[i]!;
// 				line[i] = offsetByType[o.types[idx]!]! + idx;
// 			}
// 		}
// 	}

// 	for (const [pos, idx] of o.coords.entries()) {
// 		o.coords.set(pos as CoordsKey, idx + offsetByType[o.types[idx]!]!);
// 	}

// 	o.XPositions = newXpos as Float64Array;
// 	o.YPositions = newYpos as Float64Array;
// 	o.types = newTypes as Uint8Array; // Assuming o.types is always Uint8Array

// 	return extraUndefinedsByType;
// }

/**
 * 
 * @param o 
 * @param type 
 * @param numOfPieces - The number of pieces of this type in the position, EXCLUDING undefineds
 * @param promotionsAllowed 
 * @param editor 
 * @returns 
 */
function getListExtrasOfType(type: number, numOfPieces: number, promotionsAllowed?: PlayerGroup<RawType[]>, editor?: true): number {
	const undefinedsBehavior = getTypeUndefinedsBehavior(type, promotionsAllowed, editor);

	return undefinedsBehavior === 2 ? Math.max(listExtras_Editor, numOfPieces) // Count of piece can increase RAPIDLY (editor)
		 : undefinedsBehavior === 1 ? listExtras // Count of piece can increase slowly (promotion)
		 : undefinedsBehavior === 0 ? 0 // Count of piece CANNOT increase
		 : (() => { throw Error(`Unsupported undefineds behavior" ${undefinedsBehavior} for type ${type}!`); })();
}

/**
 * Returns a number signifying the importance of this piece type needing undefineds placeholders in its type list.
 * 
 * 0 => Pieces of this type can not increase in count in this gamefile
 * 1 => Can increase in count, but slowly (promotion)
 * 2 => Can increase in count rapidly (board editor)
 */
function getTypeUndefinedsBehavior(type: number, promotionsAllowed?: PlayerGroup<RawType[]>, editor?: true): 0 | 1 | 2 {
	if (editor) return 2; // gamefile is in the board editor, EVERY piece needs undefined placeholders, and a lot of them!
	if (!promotionsAllowed) return 0; // No pieces can promote, definitely not appending undefineds to this piece.
	const [rawType, player] = typeutil.splitType(type);
	if (!promotionsAllowed[player]) return 0; // This player color cannot promote (neutral).
	if (promotionsAllowed[player].includes(rawType)) return 1; // Can be promoted to
	return 0; // This piece cannot be promoted to anything.
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
 * Converts a piece list organized by key to the organized pieces format.
 * @returns Organized pieces
 */
function processInitialPosition(position: Position, pieceMovesets: TypeGroup<() => PieceMoveset>, turnOrder: Player[], promotionsAllowed?: PlayerGroup<RawType[]>, editor?: true): {
	pieces: OrganizedPieces,
	pieceCount: number,
	existingTypes: number[],
	existingRawTypes: RawType[],
} {
	// Organize the pieces by type

	const piecesByType: Map<number, Coords[]> = new Map();
	let pieceCount = 0;
	const existingTypesSet = new Set<number>();
	for (const coordsKey in position) {
		pieceCount++;
		const coords = coordutil.getCoordsFromKey(coordsKey as CoordsKey);
		const type = position[coordsKey]!;
		existingTypesSet.add(type);
		if (!piecesByType.has(type)) piecesByType.set(type, []);
		piecesByType.get(type)!.push(coords); // Push the coords
	}

	// Calculate the possible types

	const { existingTypes, existingRawTypes } = getExistingTypes(existingTypesSet, turnOrder, promotionsAllowed, editor);

	// Determine how many undefineds each type needs

	const listExtrasByType: TypeGroup<number> = {};
	for (const type of existingTypes) {
		const numOfPieceInStartingPos = piecesByType.get(type)?.length ?? 0;
		listExtrasByType[type] = getListExtrasOfType(type, numOfPieceInStartingPos, promotionsAllowed, editor);
	}

	console.log("List extras by type:");
	console.log(listExtrasByType);

	/**
	 * Trim the pieceMovesets to only include movesets for types in the game
	 * This is REQUIRED for possible slides to be calculated correctly!!
	 */

	for (const typeString in pieceMovesets) {
		const rawType = Number(typeString) as RawType;
		if (!existingRawTypes.includes(rawType)) delete pieceMovesets[typeString];
	}

	// We can get the possible slides now that the movesets are trimmed to only include the types in the game.
	const slides = movesets.getPossibleSlides(pieceMovesets);

	// Allocate the space needed for the XPositions, YPositions, and types arrays

	const totalSlotsNeeded = pieceCount + Object.values(listExtrasByType).reduce((a, b) => a + b, 0);
	console.log("Total piece count: " + pieceCount);
	console.log(`Total slots needed: ${totalSlotsNeeded}`);
	// This way we save on RAM since we don't have to construct normal arrays first and transfer the data after.
	const XPositions = new Float64Array(totalSlotsNeeded);
	const YPositions = new Float64Array(totalSlotsNeeded);
	const types = new Uint8Array(totalSlotsNeeded);
	
	// Initialize the organized lines

	const lines = new Map<Vec2Key, Map<LineKey, number[]>>();
	for (const line of slides) {
		const strline = math.getKeyFromVec2(line);
		lines.set(strline, new Map());
	}

	// Fill the lists and Construct the type ranges, coords, and lines!

	const partialPieces = {
		XPositions,
		YPositions,
		coords: new Map<CoordsKey, number>(),
		lines,
	};

	let start = 0; // The next range start
	let pointer = 0; // The index within the XPositions, YPosition, and types, we are currently setting.
	const ranges: TypeRanges = new Map();
	for (const type of existingTypes) {
		const pieces = piecesByType.get(type) ?? []; // It will be empty if there are no pieces of this type in the starting position. Those may be acquired via promotion / board editor.

		// Set the pieces X, Y, and type
		for (let i = 0; i < pieces.length; i++) {
			XPositions[pointer] = pieces[i]![0];
			YPositions[pointer] = pieces[i]![1];
			types[pointer] = Number(type);
			registerPieceInSpace(pointer, partialPieces);
			pointer++;
		}
		
		// Create the undefineds list
		const undefineds: number[] = [];
		for (let i = 0; i < listExtrasByType[type]!; i++) {
			// The XPositions and YPositions are initialized to 0, so we don't need to set them here.
			types[pointer] = Number(type); // The undefined is still in the same type range, though, so we do need to set this.
			undefineds.push(pointer);
			pointer++;
		}

		// Set the range
		ranges.set(type, {
			start: start,
			end: pointer,
			undefineds,
		});

		// console.log("Set type range for type " + typeutil.debugType(type) + ":");
		// console.log(ranges.get(type));

		start = pointer;
	}

	// Construct the OrganizedPieces object

	return {
		pieces: {
			XPositions,
			YPositions,
			types,
			typeRanges: ranges,
			coords: partialPieces.coords,
			lines: partialPieces.lines,
			slides,
			hippogonalsPresent: areHippogonalsPresentInGame(slides),
		},
		pieceCount,
		existingTypes,
		existingRawTypes,
	};
}

/**
 * 
 * @param existingTypesSet - A set of all existing types in the STARTING POSITION, not promotions.
 * @param turnOrder 
 * @param promotionsAllowed 
 * @param editor 
 * @returns 
 */
function getExistingTypes(existingTypesSet: Set<number>, turnOrder: Player[], promotionsAllowed?: PlayerGroup<RawType[]>, editor?: true): {
	existingTypes: number[],
	existingRawTypes: RawType[],
} {
	let existingTypes: number[];
	let existingRawTypes: RawType[];
	if (editor) {
		existingTypes = typeutil.buildAllTypesForPlayers(Object.values(players), Object.values(rawTypes));
		existingRawTypes = Object.values(rawTypes);
	} else {
		if (promotionsAllowed) {
			// Makes sure pieces that are possible to promote to are accounted for.
			for (const playerString in promotionsAllowed) {
				const player = Number(playerString) as Player;
				const rawPromotions = promotionsAllowed[player]!;
				for (const rawType of rawPromotions) {
					existingTypesSet.add(typeutil.buildType(rawType, player));
				}
			}
		}
		/** If Player 3 or greater is present (multiplayer game), then gargoyles may appear when a player dies.
		 * Which means we also must add corresponding neutral for every type in the game! */
		if (turnOrder.some(p => p >= 3)) {
			for (const type of [...existingTypesSet]) { // Spread to avoid problems with infinite iteration when adding to it at the same time.
				// Convert it to neutral, and add it to existingTypes
				existingTypesSet.add(typeutil.getRawType(type) + ext.N);
			}
		}
		existingTypes = [...existingTypesSet];
		existingRawTypes = [...new Set(existingTypes.map(typeutil.getRawType))];
	}

	return {
		existingTypes,
		existingRawTypes,
	};
}

/**
 * Adds a piece to coords and lines
 * so that it can be used for collision detection
 * @param idx 
 * @param o 
 */
function registerPieceInSpace(idx: number, o: {
	/*
	 * Declaring the argument like this instead of using
	 * Partial<OrganizedPieces> guarantees these options MUST be present.
	 * And doesn't require us pass in a fully-constructed organized pieces object.
	 */
	XPositions: Float64Array,
	YPositions: Float64Array,
	coords: Map<CoordsKey, number>,
	lines: Map<Vec2Key, Map<LineKey, number[]>>,
}) {
	if (idx === undefined) throw Error("Undefined idx is trying");
	const x = o.XPositions![idx];
	const y = o.YPositions![idx];
	const coords = [x,y] as Coords;
	const key = coordutil.getKeyFromCoords(coords);
	if (o.coords!.has(key)) throw Error(`While organizing a piece, there was already an existing piece there!! ${key} idx ${idx}`);
	o.coords!.set(key, idx);
	const lines = o.lines!;
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
};

export default {
	MaxTypedArrayValues,
	pieceCountToDisableCheckmate,

	areHippogonalsPresentInGame,
	processInitialPosition,

	registerPieceInSpace,
	removePieceFromSpace,

	// regenerateLists,
	getTypeUndefinedsBehavior,

	getKeyFromLine,
	getCFromKey,
	getXFromLine,
};