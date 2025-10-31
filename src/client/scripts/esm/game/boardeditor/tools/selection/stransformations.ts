
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


// Transformations ---------------------------------------------------------


/** Translates the selection by a given vector. */
function translate(translation: Coords): void {
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	const pieces = gamefile.boardsim.pieces;

	const edit: Edit = { changes: [], state: { local: [], global: [] } };
	const piecesInSelection: Piece[] = getPiecesInSelection(gamefile);

	// Now, for each piece, queue its removal and the addition at the new location.
	for (const piece of piecesInSelection) {
		const newCoords = coordutil.addCoords(piece.coords, translation);

		// A piece might be moved to a square occupied by another piece from the selection.
		// We handle this by first queuing all removals, then all additions.
		// However, a simpler approach that also handles overwriting pieces outside the selection
		// is to check for and remove a piece at the destination for every piece we move.
		const pieceAtDestination = boardutil.getPieceFromCoords(pieces, newCoords);
		if (pieceAtDestination) boardeditor.queueRemovePiece(gamefile, edit, pieceAtDestination);
        
		// Queue the removal of the original piece
		boardeditor.queueRemovePiece(gamefile, edit, piece);

		// Queue the addition of the piece at its new location
		const hasSpecialRights = gamefile.boardsim.state.global.specialRights.has(coordutil.getKeyFromCoords(piece.coords));
		if (hasSpecialRights) boardeditor.queueAddPieceWithSpecialRights(gamefile, edit, undefined, newCoords, piece.type);
		else boardeditor.queueAddPiece(gamefile, edit, undefined, newCoords, piece.type);
	}
    
	// Apply the collective edit and add it to the history for undo/redo
	if (edit.changes.length > 0 || edit.state.global.length > 0) {
		boardeditor.runEdit(gamefile, mesh, edit, true);
		boardeditor.addEditToHistory(edit);
	}
}


// Utility ------------------------------------------------------------


/** Calculates all pieces within the selection area. */
function getPiecesInSelection(gamefile: FullGame): Piece[] {
	const o = gamefile.boardsim.pieces; // Organized pieces

	const selectionIntBox: BoundingBox = selectiontool.getSelectionIntBox()!;
	const selectionBoxWidth: bigint = selectionIntBox.right - selectionIntBox.left;
	const selectionBoxHeight: bigint = selectionIntBox.top - selectionIntBox.bottom;

	// The dimensions of the selection determine which organized line axis
	// we'll be reading from, for greater performance.

	const axis: 0 | 1 = selectionBoxWidth >= selectionBoxHeight ? 0 : 1;
	console.log("axis chosen: ", axis);
	const coordPositions: bigint[] = axis === 0 ? o.XPositions : o.YPositions;
	const slideKey = axis === 0 ? '1,0' : '0,1';
	const lines: Map<LineKey, number[]> = o.lines.get(slideKey)!; // All lines of pieces going in one vector direction

	/** Running list of all pieces within the selection area. */
	const piecesInSelection: Piece[] = getPiecesInSelection(gamefile);

	// The start and end keys of those lines
	const linesStart = axis === 0 ? selectionIntBox.bottom : selectionIntBox.left;
	const linesEnd =   axis === 0 ? selectionIntBox.top : selectionIntBox.right;
	const rangeStart = axis === 0 ? selectionIntBox.left : selectionIntBox.bottom;
	const rangeEnd =   axis === 0 ? selectionIntBox.right : selectionIntBox.top;
	console.log("lines start: ", rangeStart, " lines end: ", rangeEnd);
	console.log("lines start: ", linesStart, " lines end: ", linesEnd);

	for (let i = linesStart; i <= linesEnd; i++) {
		const lineKey: LineKey = `${i}|0`;
		const thisLine: number[] | undefined = lines.get(lineKey);
		if (!thisLine) continue; // Empty line
		for (let a = 0; a < thisLine.length; a++) {
			const idx = thisLine[a]!;
			// The piece is in the selection area if it's axis coord is within bounds
			const thisCoord: bigint = coordPositions[idx]!;
			if (thisCoord >= rangeStart && thisCoord <= rangeEnd) {
				// Custom piece construction instead of built in boardutil.ts
				// method which does unnecesary verification the piece isn't an undefined placeholder.
				const piece: Piece = {
					type: o.types[idx]!,
					coords: boardutil.getCoordsFromIdx(o, idx),
					index: boardutil.getRelativeIdx(o, idx)
				};
				piecesInSelection.push(piece);
			}
		}
	}

	console.log("All calculated pieces in selection: ", piecesInSelection.map(p => p.coords));

	return piecesInSelection;
}


// Exports --------------------------------------------------------------------


export default {
	translate,
};