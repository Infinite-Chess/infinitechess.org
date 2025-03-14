
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



let capturedPieceThisFrame: Piece | undefined;


/**
 * Update the piece that would be captured if we were to let
 * go of the dragged piece right now and return those coordinates if so.
 * 
 * CALL BEFORE shiftArrows()
 */
function updateCapturedPiece(): void {
	if (!draganimation.areDraggingPiece()) throw Error('Should not be updating droparrows when not dragging a piece!');

	capturedPieceThisFrame = undefined;

	const selectedPiece = selection.getPieceSelected()!;
	const selectedPieceLegalMoves = selection.getLegalMovesOfSelectedPiece()!;
	const selectedPieceColor = colorutil.getColorFromPieceType(selectedPiece.type);

	// Test if the mouse is hovering over any arrow

	let hoveredArrows = arrows.getHoveredArrows();

	// Filter out the selected piece

	hoveredArrows = hoveredArrows.filter(arrow => arrow.piece.coords !== selectedPiece.coords);

	// For each of the hovered arrows, test if capturing is legal

	const legalCaptureHoveredArrows = hoveredArrows.filter(arrow => {
		return legalmoves.checkIfMoveLegal(gameslot.getGamefile(), selectedPieceLegalMoves, selectedPiece.coords, arrow.piece.coords, selectedPieceColor);
	});

	// console.log(JSON.stringify(legalCaptureHoveredArrows));

	if (legalCaptureHoveredArrows.length === 1) capturedPieceThisFrame = legalCaptureHoveredArrows[0]!.piece;
}

function getCaptureCoords(): Coords | undefined {
	return capturedPieceThisFrame?.coords;
}

/**
 * Shifts an arrow indicator if we are hovering the dragged piece over a capturable arrow.
 * 
 * DO AFTER selection.update(). Because making a move changes the board.
 */
function shiftArrows(): void {
	if (!draganimation.areDraggingPiece()) return;

	const selectedPiece = selection.getPieceSelected()!;

	// Modify the arrow indicators to reflect the potentialcapture

	let newLocationOfSelectedPiece: Coords | undefined;

	if (capturedPieceThisFrame !== undefined) {
		// Reflect the dragged piece's new location in draganimation.ts
		const worldCoords = space.convertCoordToWorldSpace(capturedPieceThisFrame.coords) as Coords;
		draganimation.setDragLocationAndHoverSquare(worldCoords, capturedPieceThisFrame.coords);
		// Delete the captured piece arrow
		arrows.shiftArrow(capturedPieceThisFrame.type, capturedPieceThisFrame.coords, undefined);
		// Place the selected piece's arrow location on it
		newLocationOfSelectedPiece = capturedPieceThisFrame.coords;
	}

	// Shift the arrow of the selected piece
	arrows.shiftArrow(selectedPiece.type, selectedPiece.coords, newLocationOfSelectedPiece);
}

function onDragTermination() {
	capturedPieceThisFrame = undefined;
}



export default {
	updateCapturedPiece,
	getCaptureCoords,
	shiftArrows,
	onDragTermination,
};