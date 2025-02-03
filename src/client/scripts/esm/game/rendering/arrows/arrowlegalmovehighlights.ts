

/**
 * This script renders the legal moves of all hovered arrow indicators.
 */

import type { Piece } from "../../../chess/logic/boardchanges";
// @ts-ignore
import type { LegalMoves } from "../../../chess/logic/legalmoves";
import type { Color } from "../../../chess/util/colorutil";
import type { BufferModelInstanced } from "../buffermodel";

// @ts-ignore
import legalmoves from "../../../chess/logic/legalmoves";
import colorutil from "../../../chess/util/colorutil";
import coordutil from "../../../chess/util/coordutil";
import gamefileutility from "../../../chess/util/gamefileutility";
// @ts-ignore
import moveutil from "../../../chess/util/moveutil";
import gameslot from "../../chess/gameslot";
// @ts-ignore
import selection from "../../chess/selection";
import onlinegame from "../../misc/onlinegame/onlinegame";
import legalmovehighlights from "../highlights/legalmovehighlights";
// @ts-ignore
import movement from "../movement";
// @ts-ignore
import options from "../options";
import arrows from "./arrows";


/** Contains the legal moves, and other info, about the piece an arrow indicator is pointing to. */
interface ArrowLegalMoves {
	/** The Piece this arrow is pointing to, including its coords & type. */
	piece: Piece,
	/** The calculated legal moves of the piece. */
	legalMoves: LegalMoves,
	/** The buffer model for rendering the non-capturing legal moves of the piece. */
	model_NonCapture: BufferModelInstanced,
	/** The buffer model for rendering the capturing legal moves of the piece. */
	model_Capture: BufferModelInstanced,
	/** The [r,b,g,a] values these legal move highlights should be rendered.
	 * Depends on whether the piece is ours, a premove, or an opponent's piece. */
	color: Color
}

/**
 * An array storing the LegalMoves, model and other info, for rendering the legal move highlights
 * of piece arrow indicators currently being hovered over!
 * 
 * THIS IS UPDATED AFTER OTHER SCRIPTS have a chance to add/delete pieces to show arrows for,
 * as hovered arrows have a chance of being removed before rendering!
 */
const hoveredArrowsLegalMoves: ArrowLegalMoves[] = [];




function reset() {
	hoveredArrowsLegalMoves.length = 0; // Erase, otherwise their legal move highlights continue to render
}



/**
 * This makes sure that the legal moves of all of the hovered arrows this
 * frame are already calculated.
 * 
 * Pieces that are consecutively hovered over each frame have their
 * legal moves cached.
 */
function update() {
	const gamefile = gameslot.getGamefile()!;

	// Do not render line highlights upon arrow hover, when game is rewinded,
	// since calculating their legal moves means overwriting game's move history.
	if (!moveutil.areWeViewingLatestMove(gamefile)) {
		hoveredArrowsLegalMoves.length = 0;
		return;
	}

	const hoveredArrows = arrows.getHoveredArrows();

	// Iterate through all pieces in piecesHoveredOver, if they aren't being
	// hovered over anymore, delete them. Stop rendering their legal moves. 
	for (let i = hoveredArrowsLegalMoves.length - 1; i >= 0; i--) { // Iterate backwards because we are removing elements as we go
		const thisHoveredArrow = hoveredArrowsLegalMoves[i]!;
		// Is this arrow still being hovered over?
		if (!hoveredArrows.some(arrow => arrow.piece.coords === thisHoveredArrow.piece.coords)) hoveredArrowsLegalMoves.splice(i, 1); // No longer being hovered over
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
function onPieceIndicatorHover(piece: Piece) {

	// Check if their legal moves and mesh have already been stored
	// TODO: Make sure this is still often called
	if (hoveredArrowsLegalMoves.some(hoveredArrow => hoveredArrow.piece.coords === piece.coords)) return; // Legal moves and mesh already calculated.

	// Calculate their legal moves and mesh!
	const gamefile = gameslot.getGamefile()!;
	const thisRider = gamefileutility.getPieceAtCoords(gamefile, piece.coords)!;
	const thisPieceLegalMoves = legalmoves.calculate(gamefile, thisRider);

	// Calculate the mesh...

	// Determine what color the legal move highlights should be...
	const pieceColor = colorutil.getPieceColorFromType(piece.type);
	const opponentColor = onlinegame.areInOnlineGame() ? colorutil.getOppositeColor(onlinegame.getOurColor()) : colorutil.getOppositeColor(gamefile.whosTurn);
	const isOpponentPiece = pieceColor === opponentColor;
	const isOurTurn = gamefile.whosTurn === pieceColor;
	const color = options.getLegalMoveHighlightColor({ isOpponentPiece, isPremove: !isOurTurn });

	const { NonCaptureModel, CaptureModel } = legalmovehighlights.generateModelsForPiecesLegalMoveHighlights(piece.coords, thisPieceLegalMoves, color);
	// Store both these objects inside piecesHoveredOver
	hoveredArrowsLegalMoves.push({ piece, legalMoves: thisPieceLegalMoves, model_NonCapture: NonCaptureModel, model_Capture: CaptureModel, color });
}



function renderEachHoveredPieceLegalMoves() {
	if (hoveredArrowsLegalMoves.length === 0) return; // No legal moves to render

	const boardPos = movement.getBoardPos();
	const model_Offset = legalmovehighlights.getOffset();
	const position: [number,number,number] = [
		-boardPos[0] + model_Offset[0], // Add the highlights offset
		-boardPos[1] + model_Offset[1],
		0
	];
	const boardScale = movement.getBoardScale();
	const scale: [number,number,number] = [boardScale, boardScale, 1];

	hoveredArrowsLegalMoves.forEach(hoveredArrow => {
		// Skip it if the piece being hovered over IS the piece selected! (Its legal moves are already being rendered)
		if (selection.isAPieceSelected()) {
			const pieceSelectedCoords = selection.getPieceSelected()!.coords;
			if (coordutil.areCoordsEqual_noValidate(hoveredArrow.piece.coords, pieceSelectedCoords)) return; // Skip (already rendering its legal moves, because it's selected)
		}
		hoveredArrow.model_NonCapture.render(position, scale);
		hoveredArrow.model_Capture.render(position, scale);
	});
}

/**
 * Call when our highlights offset, or render range bounding box, changes.
 * This regenerates the mesh of the piece arrow indicators hovered
 * over to account for the new offset.
 */
function regenModelsOfHoveredPieces() {
	if (hoveredArrowsLegalMoves.length === 0) return; // No arrows being hovered over

	console.log("Updating models of hovered piece's legal moves..");

	hoveredArrowsLegalMoves.forEach(hoveredArrow => {
		// Calculate the mesh...
		const { NonCaptureModel, CaptureModel } = legalmovehighlights.generateModelsForPiecesLegalMoveHighlights(hoveredArrow.piece.coords, hoveredArrow.legalMoves, hoveredArrow.color);
		// Overwrite the model inside piecesHoveredOver
		hoveredArrow.model_NonCapture = NonCaptureModel;
		hoveredArrow.model_Capture = CaptureModel;
	});
}



export default {
	update,
	reset,
	renderEachHoveredPieceLegalMoves,
	regenModelsOfHoveredPieces,
};