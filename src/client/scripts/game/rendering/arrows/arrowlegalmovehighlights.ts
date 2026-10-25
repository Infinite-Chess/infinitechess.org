// src/client/scripts/game/rendering/arrows/arrowlegalmovehighlights.ts

/**
 * This script keeps track of and renders the
 * legal moves of all arrow indicators being hovered over.
 */

import type { Piece } from '../../../../../shared/chess/logic/boardutil.js';
import type { LegalMoves } from '../../../../../shared/chess/logic/legalmoves.js';
import type { ArrowPiece } from '../../../board/rendering/arrows/arrows.js';
import type { PersistentRenderableInstanced } from '../../../webgl/Renderable.js';

import typeutil from '../../../../../shared/chess/util/typeutil.js';
import bdcoords from '../../../../../shared/util/bdcoords.js';
import legalmoves from '../../../../../shared/chess/logic/legalmoves.js';
import coordutil, { Coords } from '../../../../../shared/util/coordutil.js';

import meshes from '../../../board/rendering/meshes.js';
import gameslot from '../../chess/gameslot.js';
import boardpos from '../../../board/rendering/boardpos.js';
import selection from '../../chess/selection.js';
import gamesession from '../../chess/gamesession.js';
import preferences from '../../../util/preferences.js';
import { GameBus } from '../../../board/GameBus.js';
import legalmovemodel from '../highlights/legalmovemodel.js';
import arrowinteraction from './arrowinteraction.js';

// Types -----------------------------------------------------------------------

/** Contains the legal moves, and other info, about the piece an arrow indicator is pointing to. */
interface ArrowLegalMoves {
	/** The Piece this arrow is pointing to, including its coords & type. */
	piece: Piece;
	/** The calculated legal moves of the piece. */
	legalMoves: LegalMoves;
	/** The buffer model for rendering the non-capturing legal moves of the piece. */
	model_NonCapture: PersistentRenderableInstanced;
	/** The buffer model for rendering the capturing legal moves of the piece. */
	model_Capture: PersistentRenderableInstanced;
}

// State -----------------------------------------------------------------------

/**
 * An array storing the LegalMoves, model and other info, for rendering the legal move highlights
 * of piece arrow indicators currently being hovered over!
 *
 * THIS IS UPDATED AFTER OTHER SCRIPTS have a chance to add/delete pieces to show arrows for,
 * as hovered arrows have a chance of being removed before rendering!
 */
const hoveredArrowsLegalMoves: ArrowLegalMoves[] = [];

// Events ----------------------------------------------------------------------

// Whenever viewing a different move in the game, the color of the legal
// move highlights of the hovered arrows changes depending on whosTurn.
// Erase the list so they can be regenerated next frame with the correct color.
GameBus.addEventListener('view-move', () => reset());

// Functions -------------------------------------------------------------------

/**
 * This makes sure that the legal moves of all of the hovered arrows this
 * frame are already calculated.
 *
 * Pieces that are consecutively hovered over each frame have their
 * legal moves cached.
 */
function update(): void {
	const hoveredArrows = arrowinteraction.getHoveredArrows();

	// Iterate through all pieces in piecesHoveredOver, if they aren't being
	// hovered over anymore, delete them. Stop rendering their legal moves.
	for (let i = hoveredArrowsLegalMoves.length - 1; i >= 0; i--) {
		// Iterate backwards because we are removing elements as we go
		const thisHoveredArrow = hoveredArrowsLegalMoves[i]!;
		// Is this arrow still being hovered over?
		if (
			!hoveredArrows.some((arrow) => {
				if (arrow.piece.floating) return false;
				const integerCoords = bdcoords.coordsToBigInt(arrow.piece.coords);
				return coordutil.areCoordsEqual(integerCoords, thisHoveredArrow.piece.coords);
			})
		) {
			disposeModels(thisHoveredArrow);
			hoveredArrowsLegalMoves.splice(i, 1); // No longer being hovered over. Delete its legal moves.
		}
	}

	for (const pieceHovered of hoveredArrows) {
		onPieceIndicatorHover(pieceHovered.piece); // Generate their legal moves and highlight model
	}
}

/**
 * Call when a piece's arrow is hovered over.
 * Calculates their legal moves and model for rendering them.
 * @param arrowPiece - The piece this arrow is pointing to
 */
function onPieceIndicatorHover(arrowPiece: ArrowPiece): void {
	if (!bdcoords.areCoordsIntegers(arrowPiece.coords))
		throw Error('Hovered arrow points to a piece at floating point coordinates.');

	// Check if their legal moves and mesh have already been stored
	if (
		hoveredArrowsLegalMoves.some((hoveredArrow) => {
			const integerCoords = bdcoords.coordsToBigInt(arrowPiece.coords);
			return coordutil.areCoordsEqual(hoveredArrow.piece.coords, integerCoords);
		})
	)
		return; // Legal moves and mesh already calculated.

	const integerCoords: Coords = bdcoords.coordsToBigInt(arrowPiece.coords);
	const piece: Piece = {
		type: arrowPiece.type,
		coords: integerCoords,
		index: arrowPiece.index,
	};

	const legalMoves = legalmoves.calculateAll(gameslot.getGamefile()!, piece);
	const { NonCaptureModel, CaptureModel } = genModels(piece, legalMoves);
	hoveredArrowsLegalMoves.push({
		piece,
		legalMoves,
		model_NonCapture: NonCaptureModel,
		model_Capture: CaptureModel,
	});
}

/** Builds a hovered piece's legal move highlight models, colored for its owner and the turn. */
function genModels(
	piece: Piece,
	legalMoves: LegalMoves,
): ReturnType<typeof legalmovemodel.generateModelsForPiecesLegalMoveHighlights> {
	const isOpponentPiece = selection.isOpponentType(gameslot.getGamefile()!, piece.type);
	const isPremove = !isOpponentPiece && !gamesession.isItOurTurn();
	return legalmovemodel.generateModelsForPiecesLegalMoveHighlights(
		piece.coords,
		legalMoves,
		typeutil.getColorFromType(piece.type),
		preferences.getLegalMoveHighlightColor({ isOpponentPiece, isPremove }),
	);
}

/** Renders the pre-cached legal move highlights of all arrow indicators being hovered over */
function renderEachHoveredPieceLegalMoves(): void {
	if (hoveredArrowsLegalMoves.length === 0) return; // No legal moves to render

	const { position, scale } = meshes.getBoardRenderTransform(
		boardpos,
		legalmovemodel.getOffset(),
	);

	hoveredArrowsLegalMoves.forEach((hoveredArrow) => {
		// Skip it if the piece being hovered over IS the piece selected! (Its legal moves are already being rendered)
		if (selection.isAPieceSelected()) {
			const pieceSelectedCoords = selection.getPieceSelected()!.coords;
			if (coordutil.areCoordsEqual(hoveredArrow.piece.coords, pieceSelectedCoords)) return; // Skip (already rendering its legal moves, because it's selected)
		}
		hoveredArrow.model_NonCapture.render(position, scale);
		hoveredArrow.model_Capture.render(position, scale);
	});
}

/** Rebuilds the hovered arrows' models, for when the highlights' offset, shape or theme changes. */
function regenModelsOfHoveredPieces(): void {
	if (hoveredArrowsLegalMoves.length === 0) return; // No arrows being hovered over

	console.log("Updating models of hovered piece's legal moves..");

	hoveredArrowsLegalMoves.forEach((hoveredArrow) => {
		const { NonCaptureModel, CaptureModel } = genModels(
			hoveredArrow.piece,
			hoveredArrow.legalMoves,
		);
		disposeModels(hoveredArrow);
		hoveredArrow.model_NonCapture = NonCaptureModel;
		hoveredArrow.model_Capture = CaptureModel;
	});
}

/** Erases the cached legal moves of the hovered arrow indicators */
function reset(): void {
	hoveredArrowsLegalMoves.forEach((hoveredArrow) => disposeModels(hoveredArrow));
	hoveredArrowsLegalMoves.length = 0; // Erase, otherwise their legal move highlights continue to render
}

/** Frees the GPU models of a hovered arrow's legal moves. */
function disposeModels(hoveredArrow: ArrowLegalMoves): void {
	hoveredArrow.model_NonCapture.dispose();
	hoveredArrow.model_Capture.dispose();
}

// Exports ---------------------------------------------------------------------

export default {
	update,
	reset,
	renderEachHoveredPieceLegalMoves,
	regenModelsOfHoveredPieces,
};
