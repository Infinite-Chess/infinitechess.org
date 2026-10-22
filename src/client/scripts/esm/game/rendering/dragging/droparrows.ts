// src/client/scripts/esm/game/rendering/dragging/droparrows.ts

/**
 * This script handles dropping the dragged piece onto
 * arrow indicators to capture the piece the arrow
 * is pointing to.
 */

import type { Piece } from '../../../../../../shared/chess/logic/boardutil.js';
import type { Coords } from '../../../../../../shared/util/coordutil.js';

import typeutil from '../../../../../../shared/chess/util/typeutil.js';
import bdcoords from '../../../../../../shared/util/bdcoords.js';
import coordutil from '../../../../../../shared/util/coordutil.js';
import boardutil from '../../../../../../shared/chess/logic/boardutil.js';
import legalmoves from '../../../../../../shared/chess/logic/legalmoves.js';

import space from '../../../board/rendering/space.js';
import arrows from '../../../board/rendering/arrows/arrows.js';
import gameslot from '../../chess/gameslot.js';
import boardpos from '../../../board/rendering/boardpos.js';
import selection from '../../chess/selection.js';
import gamescene from '../gamescene.js';
import arrowshifts from '../../../board/rendering/arrows/arrowshifts.js';
import frametracker from '../../../board/rendering/frametracker.js';
import draganimation from './draganimation.js';
import arrowinteraction from '../arrows/arrowinteraction.js';

// Constants -------------------------------------------------------------------

/** Settings for the opacity pulsation on legally capturable arrow indicators. */
const LEGAL_CAPTURE_PULSATE = {
	/** Period of the oscillation, in milliseconds. */
	PERIOD_MS: 700,
	/** Lower bound of the opacity oscillation. */
	MIN_OPACITY: 0.4,
} as const;

// State -----------------------------------------------------------------------

/** The piece that letting go of the dragged piece this frame would capture, if any. */
let capturedPieceThisFrame: Piece | undefined;
/** Timestamp when the current drag started, used to anchor the pulsation phase to 0. */
let dragStartTime: number | undefined;

// Functions -------------------------------------------------------------------

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

	let hoveredArrows = arrowinteraction.getHoveredArrows();

	// Filter out the selected piece

	hoveredArrows = hoveredArrows.filter((arrow) => {
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

	capturedPieceThisFrame = {
		type: legalCapturePiece.type,
		coords: bdcoords.coordsToBigInt(legalCapturePiece.coords),
		index: legalCapturePiece.index,
	};
}

/** The coords of the piece letting go now would capture, if any. */
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
	const board = gamescene.getGameContext();

	// Modify the arrow indicators to reflect the potential capture

	let newLocationOfSelectedPiece: Coords | undefined;

	if (capturedPieceThisFrame !== undefined) {
		// Reflect the dragged piece's new location in draganimation.ts
		const worldCoords = space.convertCoordToWorldSpace(
			bdcoords.fromCoords(capturedPieceThisFrame.coords),
			boardpos.getBoardPos(),
			boardpos.getBoardScale(),
		);
		draganimation.setDragLocationAndHoverSquare(worldCoords, capturedPieceThisFrame.coords);
		// Delete the captured piece arrow
		arrowshifts.deleteArrow(board, capturedPieceThisFrame.coords);
		// Place the selected piece's arrow location on it
		newLocationOfSelectedPiece = capturedPieceThisFrame.coords;
	}

	// Shift the arrow of the selected piece
	if (newLocationOfSelectedPiece)
		arrowshifts.moveArrow(board, selectedPiece.coords, newLocationOfSelectedPiece);
	// Or just delete if there's no new integer destination
	else arrowshifts.deleteArrow(board, selectedPiece.coords);
}

/**
 * Every frame while dragging, iterates all visible arrow indicators and pulsates
 * the opacity of any that the dragged piece could legally capture.
 */
function updateLegalCaptureArrows(): void {
	if (!draganimation.areDraggingPiece()) return;

	const gamefile = gameslot.getGamefile()!;

	const selectedPiece = selection.getPieceSelected()!;
	const selectedPieceLegalMoves = selection.getLegalMovesOfSelectedPiece()!;
	const selectedPieceColor = typeutil.getColorFromType(selectedPiece.type);

	if (dragStartTime === undefined) dragStartTime = performance.now();
	const phase =
		(2 * Math.PI * (performance.now() - dragStartTime)) / LEGAL_CAPTURE_PULSATE.PERIOD_MS;
	const alpha =
		LEGAL_CAPTURE_PULSATE.MIN_OPACITY +
		((1 - LEGAL_CAPTURE_PULSATE.MIN_OPACITY) * (Math.cos(phase) + 1)) / 2;

	let hasCapturable = false;
	for (const arrow of arrows.getAllArrows(gamescene.getGameContext())) {
		// Shifts can show a piece the board doesn't hold there: the dragged piece's own arrow moved
		// onto a pending capture, a piece mid-capture shown in place, or one animating in flight.
		const intCoords = bdcoords.coordsToBigInt(arrow.piece.coords);
		if (boardutil.getPieceFromCoords(gamefile.pieces, intCoords)?.type !== arrow.piece.type)
			continue;
		if (
			legalmoves.checkIfMoveLegal(
				gamefile,
				selectedPieceLegalMoves,
				selectedPiece.coords,
				intCoords,
				selectedPieceColor,
			)
		) {
			arrow.opacity = alpha;
			hasCapturable = true;
		}
	}

	if (hasCapturable) frametracker.onVisualChange();
}

/** Clears the pending capture and the pulsation's start, once a drag ends. */
function onDragTermination(): void {
	capturedPieceThisFrame = undefined;
	dragStartTime = undefined;
}

// Exports ---------------------------------------------------------------------

export default {
	updateCapturedPiece,
	getCaptureCoords,
	shiftArrows,
	updateLegalCaptureArrows,
	onDragTermination,
};
