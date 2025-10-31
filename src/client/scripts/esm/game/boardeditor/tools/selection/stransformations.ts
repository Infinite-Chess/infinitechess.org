
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
 * * Delete
 * * Flip horizontally
 * * Flip vertically
 * * Rotate left
 * * Rotate right
 * * Invert color
 * * Copy
 * * Cut
 * * Paste (in whole multiples)
 * * Repeat (allows partial multiples)
 */

import type { BoundingBox } from "../../../../../../../shared/util/math/bounds";
import type { FullGame } from "../../../../../../../shared/chess/logic/gamefile";

import boardutil, { LineKey, Piece } from "../../../../../../../shared/chess/util/boardutil";
import coordutil, { Coords } from "../../../../../../../shared/chess/util/coordutil";
import gameslot from "../../../chess/gameslot";
import boardeditor, { Edit } from "../../boardeditor";
import selectiontool from "./selectiontool";
import organizedpieces from "../../../../../../../shared/chess/logic/organizedpieces";
import vectors, { Vec2 } from "../../../../../../../shared/util/math/vectors";
import bounds from "../../../../../../../shared/util/math/bounds";


// Transformations ---------------------------------------------------------


/** Translates the selection by a given vector. */
function translate(translation: Coords): void {
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;

	const selectionIntBox: BoundingBox = selectiontool.getSelectionIntBox()!;
	const translatedIntBox: BoundingBox = bounds.translateBoundingBox(selectionIntBox, translation);

	const piecesInSelection: Piece[] = getPiecesInBox(gamefile, selectionIntBox);
	const piecesInTranslatedSelection: Piece[] = getPiecesInBox(gamefile, translatedIntBox);

	const edit: Edit = { changes: [], state: { local: [], global: [] } };

	// First, delete any pieces in the translated selection area.
	// BUT ONLY IF their coordinates aren't also in the original selection area! (which is deleted next)
	for (const piece of piecesInTranslatedSelection) {
		if (bounds.boxContainsSquare(selectionIntBox, piece.coords)) continue; // Piece is also in the original selection box, skip it
		boardeditor.queueRemovePiece(gamefile, edit, piece);
	}

	// Now, delete all pieces in the original selection area
	for (const piece of piecesInSelection) {
		boardeditor.queueRemovePiece(gamefile, edit, piece);
	}

	// Now, add all pieces in the original selection area, but translated
	for (const piece of piecesInSelection) {
		const translatedCoords = coordutil.addCoords(piece.coords, translation);
		// Queue the addition of the piece at its new location
		const hasSpecialRights = gamefile.boardsim.state.global.specialRights.has(coordutil.getKeyFromCoords(piece.coords));
		boardeditor.queueAddPiece(gamefile, edit, translatedCoords, piece.type, hasSpecialRights);
	}
    
	// Apply the collective edit and add it to the history
	if (edit.changes.length > 0 || edit.state.global.length > 0) {
		boardeditor.runEdit(gamefile, mesh, edit, true);
		boardeditor.addEditToHistory(edit);
	}
}


// Utility ------------------------------------------------------------


/** Calculates all pieces within the selection area. */
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


// Exports --------------------------------------------------------------------


export default {
	translate,
};