// src/client/scripts/esm/game/rendering/dragging/droparrows.ts

/**
 * This script handles dropping the dragged piece onto
 * arrow indicators to capture the piece the arrow
 * is pointing to.
 */

import type { Piece } from '../../../../../../shared/chess/util/boardutil.js';
import type { Coords } from '../../../../../../shared/chess/util/coordutil.js';

import space from '../../misc/space.js';
import arrows from '../arrows/arrows.js';
import typeutil from '../../../../../../shared/chess/util/typeutil.js';
import gameslot from '../../chess/gameslot.js';
import bdcoords from '../../../../../../shared/chess/util/bdcoords.js';
import selection from '../../chess/selection.js';
import coordutil from '../../../../../../shared/chess/util/coordutil.js';
import legalmoves from '../../../../../../shared/chess/logic/legalmoves.js';
import draganimation from './draganimation.js';

let capturedPieceThisFrame: Piece | undefined;

/**
 * Update the piece that would be captured if we were to let
 * go of the dragged piece right now and return those coordinates if so.
 *
 * CALL BEFORE shiftArrows()
 */
function updateCapturedPiece(): void {
	if (!draganimation.areDraggingPiece())
		throw Error('Should not be updating droparrows when not dragging a piece!');

	capturedPieceThisFrame = undefined;

	const selectedPiece = selection.getPieceSelected()!;
	const selectedPieceLegalMoves = selection.getLegalMovesOfSelectedPiece()!;
	const selectedPieceColor = typeutil.getColorFromType(selectedPiece.type);

	// Test if the mouse is hovering over any arrow

	let hoveredArrows = arrows.getHoveredArrows();

	// Filter out the selected piece, and floating point arrows (animated ones)

	hoveredArrows = hoveredArrows.filter((arrow) => {
		if (arrow.piece.floating) return false; // Filter animated arrows
		const integerCoords = bdcoords.coordsToBigInt(arrow.piece.coords);
		return !coordutil.areCoordsEqual(integerCoords, selectedPiece.coords);
	});

	// For each of the hovered arrows, test if capturing is legal

	const legalCaptureHoveredArrows = hoveredArrows.filter((arrow) => {
		return legalmoves.checkIfMoveLegal(
			gameslot.getGamefile()!,
			selectedPieceLegalMoves,
			selectedPiece.coords,
			bdcoords.coordsToBigInt(arrow.piece.coords),
			selectedPieceColor,
		);
	});

	if (legalCaptureHoveredArrows.length === 0) return; // No arrow being hovered over is legal to capture by the dragged piece

	const legalCapturePiece = legalCaptureHoveredArrows[0]!.piece;

	// console.log(JSON.stringify(legalCaptureHoveredArrows));

	capturedPieceThisFrame = {
		type: legalCapturePiece.type,
		coords: bdcoords.coordsToBigInt(legalCapturePiece.coords),
		index: legalCapturePiece.index,
	};
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
		const worldCoords = space.convertCoordToWorldSpace(
			bdcoords.FromCoords(capturedPieceThisFrame.coords),
		);
		draganimation.setDragLocationAndHoverSquare(worldCoords, capturedPieceThisFrame.coords);
		// Delete the captured piece arrow
		arrows.deleteArrow(capturedPieceThisFrame.coords);
		// Place the selected piece's arrow location on it
		newLocationOfSelectedPiece = capturedPieceThisFrame.coords;
	}

	// Shift the arrow of the selected piece
	if (newLocationOfSelectedPiece)
		arrows.moveArrow(selectedPiece.coords, newLocationOfSelectedPiece);
	// Or just delete if there's no new integer destination
	else arrows.deleteArrow(selectedPiece.coords);
}

function onDragTermination(): void {
	capturedPieceThisFrame = undefined;
}

export default {
	updateCapturedPiece,
	getCaptureCoords,
	shiftArrows,
	onDragTermination,
};
