
/**
 * This script handles dropping the dragged piece onto
 * arrow indicators to capture the piece the arrow
 * is pointing to.
 */


import type { Piece } from "../../../chess/logic/boardchanges.js";
import type { Coords } from "../../../chess/util/coordutil.js";


import arrows from "../arrows/arrows.js";
import selection from "../../chess/selection.js";
import draganimation from "./draganimation.js";
import space from "../../misc/space.js";
// @ts-ignore
import legalmoves from "../../../chess/logic/legalmoves.js";



function update_ReturnCaptureCoords(): Coords | undefined {

	const selectedPiece = selection.getPieceSelected()!;
	const capturePiece = getCapturePiece();

	// Modify the arrow indicators to reflect the potentialcapture

	if (capturePiece !== undefined) {
		const worldCoords = space.convertCoordToWorldSpace(capturePiece.coords) as Coords;
		draganimation.dragPiece(worldCoords, capturePiece.coords); // Reflect the dragged piece's new location
	}

	const newLocation = capturePiece !== undefined ? capturePiece.coords : undefined;
	arrows.shiftArrow2(selectedPiece, newLocation, capturePiece);

	return capturePiece?.coords;
}

function getCapturePiece(): Piece | undefined {
	const selectedPiece = selection.getPieceSelected()!;
	const selectedPieceLegalMoves = selection.getLegalMovesOfSelectedPiece()!;

	// Test if the mouse is hovering over any arrow

	let hoveredArrows = arrows.getHoveredArrows();

	// Filter out the selected piece

	hoveredArrows = hoveredArrows.filter(arrow => arrow.piece.coords !== selectedPiece.coords);

	// For each of the hovered arrows, test if capturing is legal

	const legalCaptureHoveredArrows = hoveredArrows.filter(arrow => {
		return legalmoves.checkIfMoveLegal(selectedPieceLegalMoves, selectedPiece.coords, arrow.piece.coords);
	});

	// console.log(JSON.stringify(legalCaptureHoveredArrows));

	const captureLegal = legalCaptureHoveredArrows.length === 1 ? legalCaptureHoveredArrows[0]! : undefined;

	// console.log(captureLegal);

	return captureLegal?.piece;
}

/**
 * Returns the coordinates the selected piece would be dropped on,
 * if we were to let go at this moment.
 * 
 * This won't always be underneath the mouse, because we could be
 * dropping it on an arrow indicator.
 */
// function getCaptureCoords(): Coords | undefined {
// 	return getCapturePiece()?.coords;
// }


export default {
	update_ReturnCaptureCoords,
	// getCaptureCoords,
};