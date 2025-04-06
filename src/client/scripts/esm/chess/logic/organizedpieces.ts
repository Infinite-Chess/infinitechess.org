
/**
 * This script generates and manages the organized pieces of a game.
 * 
 * The pieces are organized in many different ways to optimize for different accessing methods.
 * 
 * Ways to access the pieces:
 * - By index
 * - By coordinate
 * - By line
 */


import typeutil, { ext, players, rawTypes } from "../util/typeutil.js";
import coordutil from "../util/coordutil.js";
import math from "../../util/math.js";
import movesets from "./movesets.js";

import type { LineKey, Position } from "../util/boardutil.js";
import type { Vec2, Vec2Key } from "../../util/math.js";
import type { Coords, CoordsKey } from "../util/coordutil.js";
import type { PieceMoveset } from "./movesets.js";
import type { Player, PlayerGroup, RawType, TypeGroup } from "../util/typeutil.js";


// Type Definitions ----------------------------------------------------------------


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
	 * 'x,y' => idx
	 */
	coords: Map<CoordsKey, number>
	/**
	 * Pieces organized by line (rank/file/diagonal)
	 * Map{ 'dx,dy' => Map { 'yint|xafter0' => [idx, idx, idx...] }}
	 * dx is never negative. If dx is 0, dy cannot be negative either.
	 */
	lines: Map<Vec2Key, Map<LineKey, number[]>>
	/** All slide directions possible in the game. [1,0] guaranteed for castling to work. */
	slides: Vec2[]
	/** Whether there are any hippogonal riders in the game (knightriders). */
	hippogonalsPresent: boolean,
	/**
	 * If this flag is present, it means the pieces have been regenerated
	 * to add more undefineds to the type ranges.
	 * movesequence should see this and immediately regenerate the piece models!
	 */
	newlyRegenerated?: true,
}

type TypeRanges = Map<number, TypeRange>

interface TypeRange {
	/** Inclusive */
	start: number,
	/** Exclusive */
	end: number,
	/** Each number in this array is the index of the undefined in the large XYPositions arrays. This array is also sorted. */
	undefineds: Array<number>
}


// Constants ---------------------------------------------------------------------------


/** How many extra undefined placeholders each type range should have.
 * When these are all exhausted, the large piece lists must be regenerated. */
const listExtras = 1;
/** EDITOR-MODE-SPECIFIC {@link listExtras} */
const listExtras_Editor = 100;

/**
 * TODO: Move to a more suitable location!!!!!!!
 * The maximum number of pieces in-game to still use the checkmate algorithm. Above this uses "royalcapture".
 */
const pieceCountToDisableCheckmate = 50_000;


// Main Functions ---------------------------------------------------------------------


/**
 * Takes the source Position for the variant, and constructs the entire
 * organized pieces object, and returns other information inherited from it.
 */
function processInitialPosition(position: Position, pieceMovesets: TypeGroup<() => PieceMoveset>, turnOrder: Player[], promotionsAllowed?: PlayerGroup<RawType[]>, editor?: true): {
	pieces: OrganizedPieces,
	/** The total number of pieces in the starting position. */
	pieceCount: number,
	/**
	 * All existing types in the game, with their color information.
	 * This may include pieces not in the starting position,
	 * such as those that can be promoted to.
	 */
	existingTypes: number[],
	/** All raw existing types in the game. */
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

	const { existingTypes, existingRawTypes } = calcRemainingExistingTypes(existingTypesSet, turnOrder, promotionsAllowed, editor);

	// Determine how many undefineds each type needs

	const listExtrasByType: TypeGroup<number> = {};
	for (const type of existingTypes) {
		const numOfPieceInStartingPos = piecesByType.get(type)?.length ?? 0;
		listExtrasByType[type] = getListExtrasOfType(type, numOfPieceInStartingPos, promotionsAllowed, editor);
	}

	// console.log("List extras by type:");
	// console.log(listExtrasByType);

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
	// console.log("Total piece count: " + pieceCount);
	// console.log(`Total slots needed: ${totalSlotsNeeded}`);

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

		// Set the pieces X, Y, and type, and register in space
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
			start,
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
 * Resizes the piece arrays and updates type ranges to ensure minimum undefined slots.
 * Afterward, flags the pieces as newly regenerated. movesequence may
 * watch for that to know when to regenerate the piece models.
 */
function regenerateLists(o: OrganizedPieces, promotionsAllowed?: PlayerGroup<RawType[]>, editor?: true): void {

	const additionalUndefinedsNeeded: Map<number, number> = new Map();
	const typeOffsets: Map<number, number> = new Map();
	const modifiedTypes: number[] = []; // A list of all type ranges that changed in size.
	let totalAdditionalSlots = 0;
	let currentCumulativeOffset = 0;

	// 1. Calculate needed slots, offsets, and track modified types
	// for (const [type, range] of typesAndRanges) {
	for (const [type, range] of o.typeRanges) {
		const pieceTypeCount = (range.end - range.start) - range.undefineds.length; // The type of this piece, excluding undefineds
		const targetUndefineds = getListExtrasOfType(type, pieceTypeCount, promotionsAllowed, editor);
		const needed = Math.max(0, targetUndefineds - range.undefineds.length);

		additionalUndefinedsNeeded.set(type, needed);
		typeOffsets.set(type, currentCumulativeOffset);

		if (needed > 0) { // Only track if modification occurred
			modifiedTypes.push(type);
			totalAdditionalSlots += needed;
		}

		currentCumulativeOffset += needed;
	}

	// --- Early exit if no changes are needed ---
	if (totalAdditionalSlots === 0) {
		console.warn("regenerateLists() called but no additional slots were needed.");
		return; // Return (no type ranges modified)
	}

	console.log(`Regenerating lists: Adding ${totalAdditionalSlots} more total slots for types: ${modifiedTypes.map(typeutil.debugType).join(', ')}.`);

	// --- Prepare for copy ---
	const oldSize = o.XPositions.length;
	const newSize = oldSize + totalAdditionalSlots;

	// 2. Allocate new, larger arrays
	const newXPositions = new Float64Array(newSize);
	const newYPositions = new Float64Array(newSize);
	const newTypes = new Uint8Array(newSize);

	// Keep track of original types before overwriting o.types
	const originalTypes = new Uint8Array(o.types);

	// 3. Copy data and update TypeRanges
	for (const [type, range] of o.typeRanges) {
		const offset = typeOffsets.get(type)!;
		const addedSlots = additionalUndefinedsNeeded.get(type)!; // Will be 0 if not modified
		const newStart = range.start + offset;
		const newEnd = range.end + offset + addedSlots;

		// console.log(`Copying type ${typeutil.debugType(type)}: ${range.start} -> ${newStart}, ${range.end} -> ${newEnd}`);

		// Copy existing data block
		newXPositions.set(o.XPositions.subarray(range.start, range.end), newStart);
		newYPositions.set(o.YPositions.subarray(range.start, range.end), newStart);
		newTypes.set(o.types.subarray(range.start, range.end), newStart);

		// Update the TypeRange

		// Update existing undefined indices
		range.undefineds = range.undefineds.map(oldUndefIndex => oldUndefIndex + offset);

		// Add new undefined indices (only if addedSlots > 0)
		if (addedSlots > 0) {
			const firstNewUndefIndex = range.end + offset;
			for (let i = 0; i < addedSlots; i++) {
				const newIndex = firstNewUndefIndex + i;
				newTypes[newIndex] = type; // Set type for the new slot
				range.undefineds.push(newIndex);
			}
		}

		// Update range properties
		range.start = newStart;
		range.end = newEnd;
	}

	// 4. Update indices in coords map
	const newCoords = new Map<CoordsKey, number>();
	for (const [key, oldIdx] of o.coords.entries()) {
		const type = originalTypes[oldIdx]!;
		const offset = typeOffsets.get(type)!;
		newCoords.set(key, oldIdx + offset);
	}
	o.coords = newCoords;

	// 5. Update indices in lines map
	for (const lineGroup of o.lines.values()) {
		for (const indicesArray of lineGroup.values()) {
			for (let i = 0; i < indicesArray.length; i++) {
				const oldIdx = indicesArray[i]!;
				const type = originalTypes[oldIdx]!;
				const offset = typeOffsets.get(type)!;
				indicesArray[i] = oldIdx + offset;
			}
		}
	}

	// 6. Replace old arrays with new ones
	o.XPositions = newXPositions;
	o.YPositions = newYPositions;
	o.types = newTypes;

	o.newlyRegenerated = true; // Mark as newly regenerated. Piece models should be regenerated too.

	// console.log("Regenerated lists:");
	// console.log(o);
}


// Processing and Removing Pieces in space -------------------------------------------------


/** Adds a piece to o.coords and o.lines so that it can be used for efficient collision detection. */
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
	const x = o.XPositions[idx];
	const y = o.YPositions[idx];
	const coords = [x,y] as Coords;
	const key = coordutil.getKeyFromCoords(coords);
	if (o.coords.has(key)) throw Error(`While organizing a piece, there was already an existing piece there!! ${key} idx ${idx}`);
	o.coords.set(key, idx);
	const lines = o.lines;
	for (const [strline, linegroup] of lines) {
		const lkey = getKeyFromLine(coordutil.getCoordsFromKey(strline), coords);
		// Is line initialized
		if (linegroup.get(lkey) === undefined) lines.get(strline)!.set(lkey, []);
		linegroup.get(lkey)!.push(idx);
	}
}

/** Deletes a piece from o.coords and o.lines */
function removePieceFromSpace(idx: number, o: {
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
	const x = o.XPositions![idx];
	const y = o.YPositions![idx];
	const coords = [x,y] as Coords;
	const key = coordutil.getKeyFromCoords(coords);

	o.coords.delete(key);
	const lines = o.lines;
	for (const [strline, linegroup] of lines) {
		const lkey = getKeyFromLine(coordutil.getCoordsFromKey(strline), coords);
		// Is line initialized
		if (linegroup.get(lkey) === undefined) continue;
		removePieceFromLine(linegroup, lkey);
	}

	// Takes a line from a property of an organized piece list, deletes the piece at specified coords
	function removePieceFromLine(lineset: Map<LineKey, number[]>, lineKey: LineKey) {
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


// Helper Functions ------------------------------------------------------------------------


/**
 * Takes a Set of all types in the STARTING POSITION and adds to it other
 * potential pieces that may join the game via promotion or board editor.
 */
function calcRemainingExistingTypes(startingPositionExistingTypes: Set<number>, turnOrder: Player[], promotionsAllowed?: PlayerGroup<RawType[]>, editor?: true): {
	existingTypes: number[],
	existingRawTypes: RawType[],
} {
	let existingTypes: number[];
	let existingRawTypes: RawType[];
	if (editor) {
		// ALL pieces may be added in the board editor
		existingTypes = typeutil.buildAllTypesForPlayers(Object.values(players), Object.values(rawTypes));
		existingRawTypes = Object.values(rawTypes);
	} else {
		if (promotionsAllowed) {
			// Makes sure pieces that are possible to promote to are accounted for.
			for (const playerString in promotionsAllowed) {
				const player = Number(playerString) as Player;
				const rawPromotions = promotionsAllowed[player]!;
				for (const rawType of rawPromotions) {
					startingPositionExistingTypes.add(typeutil.buildType(rawType, player));
				}
			}
		}
		/** If Player 3 or greater is present (multiplayer game), then gargoyles may appear when a player dies.
		 * Which means we also must add corresponding neutral for every type in the game! */
		if (turnOrder.some(p => p >= 3)) {
			for (const type of [...startingPositionExistingTypes]) { // Spread to avoid problems with infinite iteration when adding to it at the same time.
				// Convert it to neutral, and add it to existingTypes
				startingPositionExistingTypes.add(typeutil.getRawType(type) + ext.N);
			}
		}
		existingTypes = [...startingPositionExistingTypes];
		existingRawTypes = [...new Set(existingTypes.map(typeutil.getRawType))];
	}

	return {
		existingTypes,
		existingRawTypes,
	};
}

/**
 * Returns the target number of undefineds that should be alloted for a given type.
 * @param numOfPieces - The number of pieces of this type in the position, EXCLUDING undefineds
 */
function getListExtrasOfType(type: number, numOfPieces: number, promotionsAllowed?: PlayerGroup<RawType[]>, editor?: true): number {
	const undefinedsBehavior = getTypeUndefinedsBehavior(type, promotionsAllowed, editor);

	return undefinedsBehavior === 2 ? Math.max(listExtras_Editor, numOfPieces) // Count of piece can increase RAPIDLY (editor)
		 : undefinedsBehavior === 1 ? listExtras // Count of piece can increase slowly (promotion)
		 : undefinedsBehavior === 0 ? 0 // Count of piece CANNOT increase
		 : (() => { throw Error(`Unsupported undefineds behavior" ${undefinedsBehavior} for type ${typeutil.debugType(type)}!`); })();
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


// Line Key Functions --------------------------------------------------------------


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

/** Splits the `C` value out of the line key */
function getCFromKey(lineKey: LineKey): number {
	return Number(lineKey.split('|')[0]);
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


// Exports --------------------------------------------------


export default {
	pieceCountToDisableCheckmate,
	processInitialPosition,
	regenerateLists,
	registerPieceInSpace,
	removePieceFromSpace,
	getTypeUndefinedsBehavior,
	getKeyFromLine,
	getCFromKey,
	getXFromLine,
};

export type {
	OrganizedPieces,
	TypeRange,
};