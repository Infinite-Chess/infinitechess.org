// src/client/scripts/esm/game/rendering/arrows/arrowlegalmovehighlights.ts

/**
 * This script keeps track of and renders the
 * legal moves of all arrow indicators being hovered over.
 */

import type { Vec3 } from '../../../../../../shared/util/math/vectors.js';
import type { Color } from '../../../../../../shared/util/math/math.js';
import type { Piece } from '../../../../../../shared/chess/util/boardutil.js';
import type { LegalMoves } from '../../../../../../shared/chess/logic/legalmoves.js';
import type { RenderableInstanced } from '../../../webgl/Renderable.js';

import meshes from '../meshes.js';
import typeutil from '../../../../../../shared/chess/util/typeutil.js';
import gameslot from '../../chess/gameslot.js';
import moveutil from '../../../../../../shared/chess/util/moveutil.js';
import boardpos from '../boardpos.js';
import bdcoords from '../../../../../../shared/chess/util/bdcoords.js';
import selection from '../../chess/selection.js';
import legalmoves from '../../../../../../shared/chess/logic/legalmoves.js';
import gameloader from '../../chess/gameloader.js';
import preferences from '../../../components/header/preferences.js';
import boardeditor from '../../boardeditor/boardeditor.js';
import legalmovemodel from '../highlights/legalmovemodel.js';
import coordutil, { Coords } from '../../../../../../shared/chess/util/coordutil.js';
import arrows, { ArrowPiece } from './arrows.js';
import { GameBus } from '../../GameBus.js';

/** Contains the legal moves, and other info, about the piece an arrow indicator is pointing to. */
interface ArrowLegalMoves {
	/** The Piece this arrow is pointing to, including its coords & type. */
	piece: Piece;
	/** The calculated legal moves of the piece. */
	legalMoves: LegalMoves;
	/** The buffer model for rendering the non-capturing legal moves of the piece. */
	model_NonCapture: RenderableInstanced;
	/** The buffer model for rendering the capturing legal moves of the piece. */
	model_Capture: RenderableInstanced;
	/** The [r,b,g,a] values these legal move highlights should be rendered.
	 * Depends on whether the piece is ours, a premove, or an opponent's piece. */
	color: Color;
}

/**
 * An array storing the LegalMoves, model and other info, for rendering the legal move highlights
 * of piece arrow indicators currently being hovered over!
 *
 * THIS IS UPDATED AFTER OTHER SCRIPTS have a chance to add/delete pieces to show arrows for,
 * as hovered arrows have a chance of being removed before rendering!
 */
const hoveredArrowsLegalMoves: ArrowLegalMoves[] = [];

// Events ----------------------------------------------------------------------------------------------

GameBus.addEventListener('physical-move', () => {
	// Whenever a move is made in the game, the color of the legal move highlights
	// of the hovered arrows often changes.
	// Erase the list so they can be regenerated next frame with the correct color.
	reset();
});

// Functions -------------------------------------------------------------------------------------------

/**
 * This makes sure that the legal moves of all of the hovered arrows this
 * frame are already calculated.
 *
 * Pieces that are consecutively hovered over each frame have their
 * legal moves cached.
 */
function update(): void {
	const gamefile = gameslot.getGamefile()!;

	// Do not render line highlights upon arrow hover, when game is rewinded,
	// since calculating their legal moves means overwriting game's move history.
	if (!moveutil.areWeViewingLatestMove(gamefile.boardsim)) {
		hoveredArrowsLegalMoves.length = 0;
		return;
	}

	const hoveredArrows = arrows.getHoveredArrows();

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
		)
			hoveredArrowsLegalMoves.splice(i, 1); // No longer being hovered over. Delete its legal moves.
	}

	for (const pieceHovered of hoveredArrows) {
		onPieceIndicatorHover(pieceHovered.piece); // Generate their legal moves and highlight model
	}
}

/**
 * Call when a piece's arrow is hovered over.
 * Calculates their legal moves and model for rendering them.
 * @param piece - The piece this arrow is pointing to
 */
function onPieceIndicatorHover(arrowPiece: ArrowPiece): void {
	// SHOULD WE JUST RETURN HERE INSTEAD OF ERROR???
	if (!bdcoords.areCoordsIntegers(arrowPiece.coords))
		throw Error(
			'We should not be calculating legal moves for a hovered arrow pointing to a piece at floating point coordinates!',
		);

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

	// Calculate their legal moves and mesh!
	const gamefile = gameslot.getGamefile()!;
	const thisPieceLegalMoves = legalmoves.calculateAll(gamefile, piece);

	// Calculate the mesh...

	// Determine what color the legal move highlights should be...
	const pieceColor = typeutil.getColorFromType(piece.type);
	const ourColor =
		gameloader.areInLocalGame() || boardeditor.areInBoardEditor()
			? gamefile.basegame.whosTurn
			: gameloader.getOurColor();
	const isOpponentPiece = pieceColor !== ourColor;
	const isOurTurn = gamefile.basegame.whosTurn === pieceColor;
	const color = preferences.getLegalMoveHighlightColor({
		isOpponentPiece,
		isPremove: !isOurTurn,
	});

	const { NonCaptureModel, CaptureModel } =
		legalmovemodel.generateModelsForPiecesLegalMoveHighlights(
			piece.coords,
			thisPieceLegalMoves,
			pieceColor,
			color,
		);
	// Store both these objects inside piecesHoveredOver
	hoveredArrowsLegalMoves.push({
		piece,
		legalMoves: thisPieceLegalMoves,
		model_NonCapture: NonCaptureModel,
		model_Capture: CaptureModel,
		color,
	});
}

/** Renders the pre-cached legal move highlights of all arrow indicators being hovered over */
function renderEachHoveredPieceLegalMoves(): void {
	if (hoveredArrowsLegalMoves.length === 0) return; // No legal moves to render

	const boardPos = boardpos.getBoardPos();
	const model_Offset = legalmovemodel.getOffset();
	const position: Vec3 = meshes.getModelPosition(boardPos, model_Offset, 0);
	const boardScale = boardpos.getBoardScaleAsNumber();
	const scale: Vec3 = [boardScale, boardScale, 1];

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

/**
 * Regenerates the mesh of the piece arrow indicators hovered legal moves.
 *
 * Call when our highlights offset, or render range bounding box, changes,
 * so we account for the new offset.
 */
function regenModelsOfHoveredPieces(): void {
	if (hoveredArrowsLegalMoves.length === 0) return; // No arrows being hovered over

	console.log("Updating models of hovered piece's legal moves..");

	hoveredArrowsLegalMoves.forEach((hoveredArrow) => {
		// Calculate the mesh...
		const pieceColor = typeutil.getColorFromType(hoveredArrow.piece.type);
		const { NonCaptureModel, CaptureModel } =
			legalmovemodel.generateModelsForPiecesLegalMoveHighlights(
				hoveredArrow.piece.coords,
				hoveredArrow.legalMoves,
				pieceColor,
				hoveredArrow.color,
			);
		// Overwrite the model inside piecesHoveredOver
		hoveredArrow.model_NonCapture = NonCaptureModel;
		hoveredArrow.model_Capture = CaptureModel;
	});
}

/** Erases the cached legal moves of the hovered arrow indicators */
function reset(): void {
	hoveredArrowsLegalMoves.length = 0; // Erase, otherwise their legal move highlights continue to render
}

// -------------------------------------------------------------------------------------------------------------

export default {
	update,
	reset,
	renderEachHoveredPieceLegalMoves,
	regenModelsOfHoveredPieces,
};
