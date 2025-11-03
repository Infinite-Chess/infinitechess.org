
// src/client/scripts/esm/game/boardeditor/tools/selection/stransformations.ts

/**
 * Selection Tool Transformations
 * 
 * Contains transformation functions for the curreng
 * selection from the Selection Tool in the Board Editor
 */

/**
 * Implement TODO:
 * 
 * * Copy
 * * Paste (in whole multiples)
 * * Flip horizontally
 * * Flip vertically
 * * Rotate left
 * * Rotate right
 * * Invert color
 * 
 * * Fill (allows partial multiples)
 */

import type { BoundingBox } from "../../../../../../../shared/util/math/bounds";
import type { FullGame } from "../../../../../../../shared/chess/logic/gamefile";
import type { Mesh } from "../../../rendering/piecemodels";

import boardutil, { LineKey, Piece } from "../../../../../../../shared/chess/util/boardutil";
import bd, { BigDecimal } from "../../../../../../../shared/util/bigdecimal/bigdecimal";
import coordutil, { BDCoords, Coords } from "../../../../../../../shared/chess/util/coordutil";
import boardeditor, { Edit } from "../../boardeditor";
import vectors, { Vec2 } from "../../../../../../../shared/util/math/vectors";
import organizedpieces from "../../../../../../../shared/chess/logic/organizedpieces";
import bounds from "../../../../../../../shared/util/math/bounds";
import selectiontool from "./selectiontool";
import bimath from "../../../../../../../shared/util/bigdecimal/bimath";
import typeutil from "../../../../../../../shared/chess/util/typeutil";


// Type Definitions ----------------------------------------------------------


/** A Piece object that also remembers its specialrights state. */
interface StatePiece extends Piece {
	specialrights: boolean;
}


// Constants ------------------------------------------------------------------


const NEGONE = bd.FromBigInt(-1n, 1);
const HALF = bd.FromNumber(0.5, 1);
const ONE = bd.FromBigInt(1n, 1);
const TWO = bd.FromBigInt(2n, 1);


// State ------------------------------------------------------------------------


/** Whatever's copied to the clipboard via the "Copy selection" action button. */
let clipboard: StatePiece[] | undefined;
/** The top-left corner tile of the clipboard selection. */
let clipboardBox: BoundingBox | undefined;


// Selection Box Transformations ------------------------------------------------


/** Translates the selection by a given vector. */
function Translate(gamefile: FullGame, mesh: Mesh, selectionBox: BoundingBox, translation: Coords): void {
	const destinationBox = bounds.translateBoundingBox(selectionBox, translation);
	const newSelectionCorners: [Coords, Coords] = [
		[destinationBox.left, destinationBox.top],
		[destinationBox.right, destinationBox.bottom]
	];
	// A function controlling how each piece is transformed
	const transformer = (coords: Coords): Coords => coordutil.addCoords(coords, translation);

	// Execute the transformation
	displacingTransform(gamefile, mesh, selectionBox, destinationBox, newSelectionCorners, transformer);
}


/** Extends the selection area by repeating its contents into the given fill box. */
function Fill(gamefile: FullGame, mesh: Mesh, selectionBox: BoundingBox, fillBox: BoundingBox): void {
	const piecesInSelection: Piece[] = getPiecesInBox(gamefile, selectionBox);
	const piecesInPasteBox: Piece[] = getPiecesInBox(gamefile, fillBox);

	// Determine the dimensions of the selection box
	const selectionWidth: bigint = selectionBox.right - selectionBox.left + 1n;
	const selectionHeight: bigint = selectionBox.top - selectionBox.bottom + 1n;
	// Dimensions of the fill box
	const fillBoxWidth: bigint = fillBox.right - fillBox.left + 1n;
	const fillBoxHeight: bigint = fillBox.top - fillBox.bottom + 1n;

	const isHorizontal = fillBox.left !== selectionBox.left;

	/** How many whole copies fit in the fill box, floored. */
	let wholeCopies: bigint;
	/** +X/+Y or -X/-Y */
	let isPositiveDirection: boolean;
	/** How much each copy's coordinate is incremented by each iteration. May be negative. */
	let axisIncrement: bigint;
	/** The axis coordinate the fill box ends at. Also where we stop filling. */
	let fillBoxAxisEnd: bigint;
	/** The axis translation for the current iteration. */
	let currentCopyStartAxis: bigint;
	
	if (isHorizontal) { // Horizontal fill
		isPositiveDirection = fillBox.left > selectionBox.left;
		axisIncrement = isPositiveDirection ? selectionWidth : -selectionWidth;
		wholeCopies = fillBoxWidth / selectionWidth;
		fillBoxAxisEnd = isPositiveDirection ? fillBox.right : fillBox.left;
		currentCopyStartAxis = isPositiveDirection ? selectionBox.left : selectionBox.right;
	} else { // Vertical fill
		isPositiveDirection = fillBox.bottom > selectionBox.bottom;
		axisIncrement = isPositiveDirection ? selectionHeight : -selectionHeight;
		wholeCopies = fillBoxHeight / selectionHeight;
		fillBoxAxisEnd = isPositiveDirection ? fillBox.top : fillBox.bottom;
		currentCopyStartAxis = isPositiveDirection ? selectionBox.bottom : selectionBox.top;
	}

	/** A +1/-1 multiplier to allow us to use one comparison symbol, ">", for both positive and negative directions. */
	const direction = isPositiveDirection ? 1n : -1n;

	const edit: Edit = { changes: [], state: { local: [], global: [] } };

	// First, delete all pieces in the fill box.
	removeAllPieces(gamefile, edit, piecesInPasteBox);

	// Cache frequently-used references for slightly better performance
	const specialRights = gamefile.boardsim.state.global.specialRights;
	const getKey = coordutil.getKeyFromCoords;

	// Iterate over each whole copy, plus one additional for a partial if needed
	for (let i = 1n; i <= wholeCopies + 1n; i++) {	
		currentCopyStartAxis += axisIncrement;

		const partial: boolean = i === wholeCopies + 1n;
		if (partial && currentCopyStartAxis * direction > fillBoxAxisEnd * direction) break; // No more space to fill even a partial box

		// Add all the pieces from the selection box, translated to this copy's position
		for (const piece of piecesInSelection) {
			// Determine the translated coordinates for this piece in this copy
			const translatedCoords: Coords = isHorizontal ?
				[piece.coords[0] + axisIncrement * i, piece.coords[1]] :
				[piece.coords[0], piece.coords[1] + axisIncrement * i];
			// Only add if within fill box (only might exceed it on the final partial copy)
			if (partial && !bounds.boxContainsSquare(fillBox, translatedCoords)) continue;
			// Queue the addition of the piece at its new location
			const hasSpecialRights = specialRights.has(getKey(piece.coords));
			boardeditor.queueAddPiece(gamefile, edit, translatedCoords, piece.type, hasSpecialRights);
		}
	}

	// Apply the collective edit and add it to the history
	applyEdit(gamefile, mesh, edit);

	// Update the selection area to be the box containing both the original selection and the filled area

	const newBox: BoundingBox = bounds.mergeBoundingBoxDoubles(selectionBox, fillBox);
	selectiontool.setSelection([newBox.left, newBox.top], [newBox.right, newBox.bottom]);
}


// Action Button Transformations ------------------------------------------------


/** Deletes the given selection box. */
function Delete(gamefile: FullGame, mesh: Mesh, box: BoundingBox): void {
	const piecesInSelection: Piece[] = getPiecesInBox(gamefile, box);
	const edit: Edit = { changes: [], state: { local: [], global: [] } };
	removeAllPieces(gamefile, edit, piecesInSelection);
	applyEdit(gamefile, mesh, edit);
}

/** Copies the given selection box. */
function Copy(gamefile: FullGame, box: BoundingBox): void {
	const piecesInSelection: Piece[] = getPiecesInBox(gamefile, box);

	// Modify the pieces to include specialrights state

	// Cache frequently-used references for slightly better performance
	const specialRights = gamefile.boardsim.state.global.specialRights;
	const getKey = coordutil.getKeyFromCoords;

	// Modify the existing array in place to avoid performance hit of a new array.
	// Reverse loop that avoids re-evaluating length each iteration
	for (let i = piecesInSelection.length - 1; i >= 0; i--) {
		const p = piecesInSelection[i] as StatePiece;
		p.specialrights = specialRights.has(getKey(p.coords));
	}

	clipboard = piecesInSelection as StatePiece[];
	clipboardBox = box;
}

/** Pastes the copied region in whole multiples to fill the target box, but not exceed it. */
function Paste(gamefile: FullGame, mesh: Mesh, targetBox: BoundingBox): void {
	if (!clipboard || !clipboardBox) return; // Nothing to paste

	// Determine the dimensions of the clipboard box
	const clipboardWidth: bigint = clipboardBox.right - clipboardBox.left + 1n;
	const clipboardHeight: bigint = clipboardBox.top - clipboardBox.bottom + 1n;
	// Dimensions of the target box (current selection area to paste in)
	const targetBoxWidth: bigint = targetBox.right - targetBox.left + 1n;
	const targetBoxHeight: bigint = targetBox.top - targetBox.bottom + 1n;

	// Determine how many whole copies fit in the target box, in both dimensions, with a minimum of 1.
	const copiesX: bigint = bimath.max(targetBoxWidth / clipboardWidth, 1n);
	const copiesY: bigint = bimath.max(targetBoxHeight / clipboardHeight, 1n);

	// The actual paste box dimensions is the minimum box that fits all whole copies
	const actualPasteBoxWidth: bigint = clipboardWidth * copiesX;
	const actualPasteBoxHeight: bigint = clipboardHeight * copiesY;
	const actualPasteBox: BoundingBox = {
		left: targetBox.left,
		right: targetBox.left + actualPasteBoxWidth - 1n,
		bottom: targetBox.top - actualPasteBoxHeight + 1n,
		top: targetBox.top,
	};

	// Determine the translation vector from top-left of clipboard to top-left of target box
	const clipboardCoords: Coords = [clipboardBox.left, clipboardBox.top];
	const targetBoxCoords: Coords = [targetBox.left, targetBox.top];
	const translation: Coords = coordutil.subtractCoords(targetBoxCoords, clipboardCoords);

	const edit: Edit = { changes: [], state: { local: [], global: [] } };

	// First, delete all pieces in the actual paste box.
	const piecesInPasteBox: Piece[] = getPiecesInBox(gamefile, actualPasteBox);
	removeAllPieces(gamefile, edit, piecesInPasteBox);

	// Iterate over each copy position
	for (let x = 0n; x < copiesX; x++) {
		for (let y = 0n; y < copiesY; y++) {
			// Determine translation for this copy
			const thisTranslation: Coords = [
				translation[0] + (clipboardWidth * x),
				translation[1] + (clipboardHeight * -y),
			];

			// Now, add all pieces from the clipboard, translated to this copy's position
			for (const piece of clipboard) {
				const translatedCoords = coordutil.addCoords(piece.coords, thisTranslation);
				// Queue the addition of the piece at its new location
				boardeditor.queueAddPiece(gamefile, edit, translatedCoords, piece.type, piece.specialrights);
			}
		}
	}

	// Apply the collective edit and add it to the history
	applyEdit(gamefile, mesh, edit);

	// Update the selection area to the actual paste box

	selectiontool.setSelection([actualPasteBox.left, actualPasteBox.top], [actualPasteBox.right, actualPasteBox.bottom]);
}

/** Flips the selection box horizontally. */
function FlipHorizontal(gamefile: FullGame, mesh: Mesh, box: BoundingBox): void {	
	Reflect(gamefile, mesh, box, 0); // Reflect across the X-axis
}


/** Flips the selection box vertically. */
function FlipVertical(gamefile: FullGame, mesh: Mesh, box: BoundingBox): void {
	Reflect(gamefile, mesh, box, 1); // Reflect across the Y-axis
}

/**
 * Reflects the selection box across a given axis.
 * @param axis The axis to reflect across (0 for X, 1 for Y).
 */
function Reflect(gamefile: FullGame, mesh: Mesh, box: BoundingBox, axis: 0 | 1): void {
	// Determine the bounds for calculating the reflection line based on the axis
	const bound1 = axis === 0 ? box.left : box.bottom;
	const bound2 = axis === 0 ? box.right : box.top;

	// Calculate the reflection line with BigDecimals, for decimal precision.
	// 1 precision is enough to perfectly represent 1/2 increments, which is the finest we need.
	const bound1BD: BigDecimal = bd.FromBigInt(bound1, 1);
	const bound2BD: BigDecimal = bd.FromBigInt(bound2, 1);
	const sum: BigDecimal = bd.add(bound1BD, bound2BD);
	const reflectionLine: BigDecimal = bd.divide_fixed(sum, TWO, 0); // Working precision isn't needed because the quotient is rational

	// A function for controlling each piece's new state
	const transformer = (piece: Piece): { coords: Coords; type: number } => {
		// Reflect the piece's coordinate on the chosen axis
		const coordToReflect = piece.coords[axis];
		const coordBD: BigDecimal = bd.FromBigInt(coordToReflect, 1);
		const distanceFromLine: BigDecimal = bd.subtract(coordBD, reflectionLine);
		const reflectedCoordBD: BigDecimal = bd.subtract(reflectionLine, distanceFromLine);
		// We already know it's a perfect integer so this doesn't lose precision
		const reflectedCoord: bigint = bd.toBigInt(reflectedCoordBD);

		// Create the new coordinates, modifying only the reflected axis
		const reflectedCoords: Coords = [...piece.coords]; // Create a mutable copy
		reflectedCoords[axis] = reflectedCoord;
        
		return { coords: reflectedCoords, type: piece.type };
	};

	// Execute the transformation
	inPlaceTransform(gamefile, mesh, box, transformer);
}


/** Rotates the selection 90 degrees to the left (counter-clockwise). */
function RotateLeft(gamefile: FullGame, mesh: Mesh, box: BoundingBox): void {
	Rotate(gamefile, mesh, box, false); // false for counter-clockwise
}

/** Rotates the selection 90 degrees to the right (clockwise). */
function RotateRight(gamefile: FullGame, mesh: Mesh, box: BoundingBox): void {
	Rotate(gamefile, mesh, box, true); // true for clockwise
}

/**
 * The parity of which vector the pivot point of rotations shifts
 * so as the pieces don't land on floating point coords after rotation.
 * This makes it so that 2 consecutive rotations return to the original position.
 */
let rotationParity: boolean = false;

/** Rotates the selection 90 degrees clockwise or counter-clockwise. */
function Rotate(gamefile: FullGame, mesh: Mesh, box: BoundingBox, clockwise: boolean): void {
	// Calculate the pivot point for rotation.
	const sumXEdgesBD = bd.FromBigInt(box.left + box.right, 1);
	const sumYEdgesBD = bd.FromBigInt(box.bottom + box.top, 1);

	const pivot: BDCoords = [
		bd.divide_fixed(sumXEdgesBD, TWO, 0), // Working precision isn't needed because the quotient is rational
		bd.divide_fixed(sumYEdgesBD, TWO, 0)
	];

	// Adjust pivot for unstable rotations.
	// If that point is unstable, shift it by 0.5 to make it so.
	// Stable = In them middle of a square, or at a corner between squares.
	// Unstable = On an edge between squares, rotating the pieces would place them at floating point coords.

	// These work because with a precision of 1, only .0 and .5 fractional parts are possible.
	const selectionWidthXISEven = !bd.isInteger(pivot[0]);
	const selectionHeightYISEven = !bd.isInteger(pivot[1]);

	// If both dimensions are equal in evenness/oddness, then the pivot is stable (on a square or corner)
	// Otherwise, the rotation around an unstable pivot point on an edge causes pieces coordinates to not be integers.
	if (selectionWidthXISEven !== selectionHeightYISEven) {
		// This logic for parity, operation, and axis choice ensures that any sequence of
		// left/right rotations doesn't result in bias towards one vector.
		const thisParity = clockwise ? rotationParity : !rotationParity; // Use opposite parity for CCW
		const thisAxis = clockwise ? 1 : 0; // Shift Y axis for CW, X axis for CCW
		const operation = thisParity ? bd.add : bd.subtract;
		pivot[thisAxis] = operation(pivot[thisAxis], HALF);
		rotationParity = !rotationParity;
	}

	// Calculate the rotated selection box
	const rotatedBoxCorner1: Coords = rotatePoint([box.left, box.top], pivot, clockwise);
	const rotatedBoxCorner2: Coords = rotatePoint([box.right, box.bottom], pivot, clockwise);
	const rotatedBox: BoundingBox = {
		left: bimath.min(rotatedBoxCorner1[0], rotatedBoxCorner2[0]),
		right: bimath.max(rotatedBoxCorner1[0], rotatedBoxCorner2[0]),
		bottom: bimath.min(rotatedBoxCorner1[1], rotatedBoxCorner2[1]),
		top: bimath.max(rotatedBoxCorner1[1], rotatedBoxCorner2[1]),
	};

	const newSelectionCorners: [Coords, Coords] = [rotatedBoxCorner1, rotatedBoxCorner2];

	// A function controlling how each piece is transformed
	const transformer = (coords: Coords): Coords => rotatePoint(coords, pivot, clockwise);

	// Execute the transformation
	displacingTransform(gamefile, mesh, box, rotatedBox, newSelectionCorners, transformer);
}

/**
 * Rotates a point around a pivot 90 degrees clockwise or counter-clockwise.
 * @param point The point to rotate.
 * @param pivot The pivot point to rotate around. MUST BE IN THE middle of a square, or on a corner between squares, otherwise there will be precision loss when rounding the rotated point to integers.
 * @param clockwise Whether to rotate clockwise (true) or counter-clockwise (false).
 * @returns The rotated point.
 */
function rotatePoint(point: Coords, pivot: BDCoords, clockwise: Boolean): Coords {
	// Represent coord as BDCoords for high precision
	const pointBD = bd.FromCoords(point, 1);

	// 1. Translate to origin to get relative coordinates
	const relativeX = bd.subtract(pointBD[0], pivot[0]);
	const relativeY = bd.subtract(pointBD[1], pivot[1]);

	// 2. Apply the 90 degree rotation based on direction
	// For CCW (+90): direction = 1, (x, y) -> (-y, x)
	// For CW  (-90): direction = -1, (x, y) -> (y, -x)
	const direction = clockwise ? NEGONE : ONE;

	// rotatedRelativeX = -direction * relativeY
	const rotatedRelativeX = bd.multiply_fixed(relativeY, bd.negate(direction));
	// rotatedRelativeY = direction * relativeX
	const rotatedRelativeY = bd.multiply_fixed(relativeX, direction);

	// 3. Translate back from the origin
	const finalX = bd.add(rotatedRelativeX, pivot[0]);
	const finalY = bd.add(rotatedRelativeY, pivot[1]);

	return [
		bd.toBigInt(finalX),
		bd.toBigInt(finalY),
	];
}


/** Inverts the color of the pieces in the selection box. */
function InvertColor(gamefile: FullGame, mesh: Mesh, box: BoundingBox): void {
	// A function for controlling each piece's new state
	const transformer = (piece: Piece): { coords: Coords; type: number } => {
		const newType = typeutil.invertType(piece.type);
		return { coords: piece.coords, type: newType };
	};

	// Execute the transformation
	inPlaceTransform(gamefile, mesh, box, transformer);
}


// Transformation Helpers -----------------------------------------------------


/**
 * Executes a displacing transformation, where the selection is moved to a new area.
 * Handles clearing the destination area, clearing the selection area, moving the
 * pieces, and updating the selection area.
 */
function displacingTransform(
	gamefile: FullGame, 
	mesh: Mesh, 
	sourceBox: BoundingBox,
	destinationBox: BoundingBox,
	newSelectionCorners: [Coords, Coords],
	/** A function to transform individual coordinates. */
	// eslint-disable-next-line no-unused-vars
	transformer: (coords: Coords) => Coords
): void {
	const piecesInSource = getPiecesInBox(gamefile, sourceBox);
	const piecesInDestination = getPiecesInBox(gamefile, destinationBox);

	const edit: Edit = { changes: [], state: { local: [], global: [] } };

	// Clear the destination area of any pieces not part of the original selection
	for (const piece of piecesInDestination) {
		if (bounds.boxContainsSquare(sourceBox, piece.coords)) continue;
		boardeditor.queueRemovePiece(gamefile, edit, piece);
	}

	// Delete all pieces in the original selection area
	removeAllPieces(gamefile, edit, piecesInSource);

	// Cache frequently-used references for slightly better performance
	const specialRights = gamefile.boardsim.state.global.specialRights;
	const getKey = coordutil.getKeyFromCoords;

	// Add all pieces in the original selection area, but transformed
	for (const piece of piecesInSource) {
		// Determine the new coordinates for this piece
		const newCoords = transformer(piece.coords);
		// Queue the addition of the piece at its new location
		const hasSpecialRights = specialRights.has(getKey(piece.coords));
		boardeditor.queueAddPiece(gamefile, edit, newCoords, piece.type, hasSpecialRights);
	}
    
	// Apply the collective edit and add it to the history
	applyEdit(gamefile, mesh, edit);

	// Update the selection area
	selectiontool.setSelection(newSelectionCorners[0], newSelectionCorners[1]);
}

/**
 * Executes an in-place transformation, where pieces within the selection
 * may be moved or modified, but the selection box itself does not move.
 */
function inPlaceTransform(
	gamefile: FullGame, 
	mesh: Mesh, 
	box: BoundingBox,
	/** A function that takes a piece and returns its new state: { coords, type }. */
	// eslint-disable-next-line no-unused-vars
	transformer: (piece: Piece) => { coords: Coords, type: number }
): void {
	const piecesInSelection = getPiecesInBox(gamefile, box);
	const edit: Edit = { changes: [], state: { local: [], global: [] } };
    
	// First, remove all original pieces
	removeAllPieces(gamefile, edit, piecesInSelection);

	const specialRights = gamefile.boardsim.state.global.specialRights;
	const getKey = coordutil.getKeyFromCoords;

	// Then, add back the transformed versions
	for (const piece of piecesInSelection) {
		// Determine the transformed state for this piece
		const transformed = transformer(piece);
		// Queue the addition of the piece at its new location/type
		const hasSpecialRights = specialRights.has(getKey(piece.coords));
		boardeditor.queueAddPiece(gamefile, edit, transformed.coords, transformed.type, hasSpecialRights);
	}
    
	// Apply the collective edit and add it to the history
	applyEdit(gamefile, mesh, edit);
}


// Utility ------------------------------------------------------------


/** Queues all the pieces in the list to be removed in this Edit. */
function removeAllPieces(gamefile: FullGame, edit: Edit, pieces: Piece[]): void {
	for (const piece of pieces) {
		boardeditor.queueRemovePiece(gamefile, edit, piece);
	}
}

/** Applies the provided edit and adds it to the history. */
function applyEdit(gamefile: FullGame, mesh: Mesh, edit: Edit): void {
	if (edit.changes.length === 0 && edit.state.global.length === 0) return; // No changes made => don't need to apply

	// Apply the collective edit and add it to the history
	boardeditor.runEdit(gamefile, mesh, edit, true);
	boardeditor.addEditToHistory(edit);
}

/** Calculates all pieces within the given box area. */
function getPiecesInBox(gamefile: FullGame, intBox: BoundingBox): Piece[] {
	const o = gamefile.boardsim.pieces; // Organized pieces

	const selectionBoxWidth: bigint = intBox.right - intBox.left;
	const selectionBoxHeight: bigint = intBox.top - intBox.bottom;

	// The dimensions of the selection determine which organized line axis
	// we'll be reading from, for greater performance.

	const axis: 0 | 1 = selectionBoxWidth >= selectionBoxHeight ? 0 : 1;
	const coordPositions: bigint[] = axis === 0 ? o.XPositions : o.YPositions;
	const step: Vec2 = axis === 0 ? [1n, 0n] : [0n, 1n];

	const slideKey = vectors.getKeyFromVec2(step);
	const lines: Map<LineKey, number[]> = o.lines.get(slideKey)!; // All lines of pieces going in one vector direction

	/** Running list of all pieces within the box. */
	const piecesInSelection: Piece[] = [];

	// The start and end keys of those lines
	const linesStart = axis === 0 ? intBox.bottom : intBox.left;
	const linesEnd =   axis === 0 ? intBox.top : intBox.right;
	const rangeStart = axis === 0 ? intBox.left : intBox.bottom;
	const rangeEnd =   axis === 0 ? intBox.right : intBox.top;

	for (let i = linesStart; i <= linesEnd; i++) {
		const coordsForKey: Coords = axis === 0 ? [0n, i] : [i, 0n]; // 0n makes no difference for the final key of the line, it can be anything.
		const lineKey: LineKey = organizedpieces.getKeyFromLine(step, coordsForKey);

		const thisLine: number[] | undefined = lines.get(lineKey);
		if (!thisLine) continue; // Empty line
		for (let a = 0; a < thisLine.length; a++) {
			const idx = thisLine[a]!;
			// The piece is in the selection area if it's axis coord is within bounds
			const thisCoord: bigint = coordPositions[idx]!;
			if (thisCoord >= rangeStart && thisCoord <= rangeEnd) {
				piecesInSelection.push(boardutil.getDefinedPieceFromIdx(o, idx));
			}
		}
	}

	return piecesInSelection;
}


// API -------------------------------------------------------------------------


function resetState(): void {
	clipboard = undefined;
	clipboardBox = undefined;
}


// Exports --------------------------------------------------------------------


export default {
	// Selection Box Transformations
	Translate,
	Fill,
	// Action Button Transformations
	Delete,
	Copy,
	Paste,
	FlipHorizontal,
	FlipVertical,
	RotateLeft,
	RotateRight,
	InvertColor,
	// API
	resetState,
};