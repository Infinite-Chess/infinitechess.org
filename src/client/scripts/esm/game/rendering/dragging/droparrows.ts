
/**
 * This script handles dropping the dragged piece onto
 * arrow indicators to capture the piece the arrow
 * is pointing to.
 */


import type { Piece } from "../../../chess/logic/boardchanges.js";
import type { Coords } from "../../../chess/util/coordutil.js";


import arrows, { HoveredArrow } from "../arrows/arrows.js";
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

	// Delete the captured piece arrow
	if (capturePiece !== undefined) arrows.shiftArrow(capturePiece.type, capturePiece.coords, undefined);

	// New location of the selected piece
	const newLocation = capturePiece !== undefined ? capturePiece.coords : undefined;
	arrows.shiftArrow(selectedPiece.type, selectedPiece.coords, newLocation);

	return capturePiece?.coords;
}

/**
 * Returns the piece that would be captured if we were to let
 * go of the dragged piece right now, if there is a piece to capture.
 */
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

	const captureLegal: HoveredArrow | undefined = legalCaptureHoveredArrows[0];

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
function getCaptureCoords(): Coords | undefined {
	return getCapturePiece()?.coords;
}


export default {
	update_ReturnCaptureCoords,
	getCaptureCoords,
};