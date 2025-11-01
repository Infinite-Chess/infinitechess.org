
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
import bigdecimal, { BigDecimal } from "../../../../../../../shared/util/bigdecimal/bigdecimal";
import coordutil, { Coords } from "../../../../../../../shared/chess/util/coordutil";
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


const TWO = bigdecimal.FromBigInt(2n);


// State ------------------------------------------------------------------------


/** Whatever's copied to the clipboard via the "Copy selection" action button. */
let clipboard: StatePiece[] | undefined;
/** The top-left corner tile of the clipboard selection. */
let clipboardBox: BoundingBox | undefined;


// Selection Box Transformations ------------------------------------------------


/** Translates the selection by a given vector. */
function Translate(gamefile: FullGame, mesh: Mesh, selectionBox: BoundingBox, translation: Coords): void {
	const translatedBox: BoundingBox = bounds.translateBoundingBox(selectionBox, translation);

	const piecesInSelection: Piece[] = getPiecesInBox(gamefile, selectionBox);
	const piecesInTranslatedSelection: Piece[] = getPiecesInBox(gamefile, translatedBox);

	const edit: Edit = { changes: [], state: { local: [], global: [] } };

	// First, delete any pieces in the translated selection area.
	// BUT ONLY IF their coordinates aren't also in the original selection area! (which is deleted next)
	for (const piece of piecesInTranslatedSelection) {
		if (bounds.boxContainsSquare(selectionBox, piece.coords)) continue; // Piece is also in the original selection box, skip it
		boardeditor.queueRemovePiece(gamefile, edit, piece);
	}

	// Now, delete all pieces in the original selection area
	removeAllPieces(gamefile, edit, piecesInSelection);

	// Now, add all pieces in the original selection area, but translated
	for (const piece of piecesInSelection) {
		const translatedCoords = coordutil.addCoords(piece.coords, translation);
		// Queue the addition of the piece at its new location
		const hasSpecialRights = gamefile.boardsim.state.global.specialRights.has(coordutil.getKeyFromCoords(piece.coords));
		boardeditor.queueAddPiece(gamefile, edit, translatedCoords, piece.type, hasSpecialRights);
	}
    
	// Apply the collective edit and add it to the history
	applyEdit(gamefile, mesh, edit);

	// Update the selection area

	const [ corner1, corner2 ] = selectiontool.getSelectionCorners();
	const translatedCorner1: Coords = coordutil.addCoords(corner1, translation);
	const translatedCorner2: Coords = coordutil.addCoords(corner2, translation);

	selectiontool.setSelection(translatedCorner1, translatedCorner2);
}


// Fill...


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

	const fullPasteBoxCorner1: Coords = [actualPasteBox.left, actualPasteBox.top];
	const fullPasteBoxCorner2: Coords = [actualPasteBox.right, actualPasteBox.bottom];
	selectiontool.setSelection(fullPasteBoxCorner1, fullPasteBoxCorner2);
}

/** Flips the selection box horizontally. */
function FlipHorizontal(gamefile: FullGame, mesh: Mesh, box: BoundingBox): void {	
	ReflectAxis(gamefile, mesh, box, 0); // Reflect across the X-axis
}


/** Flips the selection box vertically. */
function FlipVertical(gamefile: FullGame, mesh: Mesh, box: BoundingBox): void {
	ReflectAxis(gamefile, mesh, box, 1); // Reflect across the Y-axis
}

/**
 * Reflects the pieces in the selection box across a given axis.
 * @param axis The axis to reflect across (0 for X, 1 for Y).
 */
function ReflectAxis(gamefile: FullGame, mesh: Mesh, box: BoundingBox, axis: 0 | 1): void {
	const piecesInSelection: Piece[] = getPiecesInBox(gamefile, box);

	// Determine the bounds for calculating the reflection line based on the axis
	const bound1 = axis === 0 ? box.left : box.bottom;
	const bound2 = axis === 0 ? box.right : box.top;

	// Calculate the reflection line with BigDecimals, for decimal precision.
	// 1 precision is enough to perfectly represent 1/2 increments, which is the finest we need.
	const bound1BD: BigDecimal = bigdecimal.FromBigInt(bound1, 1);
	const bound2BD: BigDecimal = bigdecimal.FromBigInt(bound2, 1);
	const sum: BigDecimal = bigdecimal.add(bound1BD, bound2BD);
	const reflectionLine: BigDecimal = bigdecimal.divide_fixed(sum, TWO, 0);
	// console.log("Reflection line:", bigdecimal.toExactString(reflectionLine));

	const edit: Edit = { changes: [], state: { local: [], global: [] } };

	// Delete all pieces in the original selection area
	removeAllPieces(gamefile, edit, piecesInSelection);

	// Cache frequently-used references for slightly better performance
	const specialRights = gamefile.boardsim.state.global.specialRights;
	const getKey = coordutil.getKeyFromCoords;

	// Now, add all pieces in the original selection area, but reflected across the line
	for (const piece of piecesInSelection) {
		// Reflect the piece's coordinate on the chosen axis
		const coordToReflect = piece.coords[axis];
		const coordBD: BigDecimal = bigdecimal.FromBigInt(coordToReflect, 1);
		const distanceFromLine: BigDecimal = bigdecimal.subtract(coordBD, reflectionLine);
		const reflectedCoordBD: BigDecimal = bigdecimal.subtract(reflectionLine, distanceFromLine);
		// We already know it's a perfect integer so this doesn't lose precision
		const reflectedCoord: bigint = bigdecimal.toBigInt(reflectedCoordBD);

		// Create the new coordinates, modifying only the reflected axis
		const reflectedCoords: Coords = [...piece.coords]; // Create a mutable copy
		reflectedCoords[axis] = reflectedCoord;

		// Queue the addition of the piece at its new location
		const hasSpecialRights = specialRights.has(getKey(piece.coords));
		boardeditor.queueAddPiece(gamefile, edit, reflectedCoords, piece.type, hasSpecialRights);
	}

	// Apply the collective edit and add it to the history
	applyEdit(gamefile, mesh, edit);
}


// Rotate left...


// Rotate right...


/** Inverts the color of the pieces in the selection box. */
function InvertColor(gamefile: FullGame, mesh: Mesh, box: BoundingBox): void {
	const piecesInSelection: Piece[] = getPiecesInBox(gamefile, box);

	const edit: Edit = { changes: [], state: { local: [], global: [] } };

	// For each piece in the selection, change its type to the inverted color type
	for (const piece of piecesInSelection) {
		const newType: number = typeutil.invertType(piece.type);

		if (newType === piece.type) continue; // No change in type (neutral), skip

		const coordsKey = coordutil.getKeyFromCoords(piece.coords);
		const hasSpecialRights = gamefile.boardsim.state.global.specialRights.has(coordsKey);

		boardeditor.queueRemovePiece(gamefile, edit, piece);
		boardeditor.queueAddPiece(gamefile, edit, piece.coords, newType, hasSpecialRights);
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
	// Action Button Transformations
	Delete,
	Copy,
	Paste,
	FlipHorizontal,
	FlipVertical,
	// Rotate left,
	// Rotate right,
	InvertColor,
	// API
	resetState,
};