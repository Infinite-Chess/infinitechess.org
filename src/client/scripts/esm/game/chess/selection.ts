
/**
 * This script tests for piece selection and keeps track of the selected piece,
 * including the legal moves it has available.
 */


import type { Piece } from '../../chess/logic/boardchanges.js';
import type { CoordsSpecial, MoveDraft } from '../../chess/logic/movepiece.js';
// @ts-ignore
import type { LegalMoves } from '../../chess/logic/legalmoves.js';


import gameslot from './gameslot.js';
import movesendreceive from '../misc/onlinegame/movesendreceive.js';
import droparrows from '../rendering/dragging/droparrows.js';
import onlinegame from '../misc/onlinegame/onlinegame.js';
import gamefileutility from '../../chess/util/gamefileutility.js';
import colorutil from '../../chess/util/colorutil.js';
import movesequence from './movesequence.js';
import coordutil, { Coords } from '../../chess/util/coordutil.js';
import frametracker from '../rendering/frametracker.js';
import guipromotion from '../gui/guipromotion.js';
import legalmovehighlights from '../rendering/highlights/legalmovehighlights.js';
import draganimation from '../rendering/dragging/draganimation.js';
import boardchanges from '../../chess/logic/boardchanges.js';
import math from '../../util/math.js';
import animation from '../rendering/animation.js';
// @ts-ignore
import pieces from '../rendering/pieces.js';
// @ts-ignore
import moveutil from '../../chess/util/moveutil.js';
// @ts-ignore
import config from '../config.js';
// @ts-ignore
import space from '../misc/space.js';
// @ts-ignore
import guipause from '../gui/guipause.js';
// @ts-ignore
import legalmoves from '../../chess/logic/legalmoves.js';
// @ts-ignore
import input from '../input.js';
// @ts-ignore
import specialdetect from '../../chess/logic/specialdetect.js';
// @ts-ignore
import perspective from '../rendering/perspective.js';
// @ts-ignore
import transition from '../rendering/transition.js';
// @ts-ignore
import movement from '../rendering/movement.js';
// @ts-ignore
import options from '../rendering/options.js';
// @ts-ignore
import statustext from '../gui/statustext.js';
// @ts-ignore
import preferences from '../../components/header/preferences.js';
// @ts-ignore
import sound from '../misc/sound.js';


// Variables -----------------------------------------------------------------------------


/** The currently selected piece, if there is one */
let pieceSelected: Piece | undefined;
/** The pre-calculated legal moves of the current selected piece. */
let legalMoves: LegalMoves | undefined;
/** Whether or not the piece selected belongs to the opponent.
 * If so, it's legal moves are rendered a different color, and you aren't allowed to move it.  */
let isOpponentPiece = false;
/** Whether or not the piece selected activated premove mode.
 * This happens when we select our own pieces, in online games, when it's not our turn. */
let isPremove = false;

/** The tile the mouse is hovering over, OR the tile we just performed a simulated click over: `[x,y]` */
let hoverSquare: Coords; // Current square mouse is hovering over
/** Whether the {@link hoverSquare} is legal to move the selected piece to. */
let hoverSquareLegal: boolean = false;

/** If a pawn is currently promoting (waiting on the promotion UI selection),
 * this will be set to the square it's moving to: `[x,y]`. */
let pawnIsPromoting: Coords | undefined;
/** When a promotion UI piece is selected, this is set to the promotion you selected. */
let promoteTo: string | undefined;


// Getters ---------------------------------------------------------------------------------------


/** Returns the current selected piece, if there is one. */
function getPieceSelected() { return pieceSelected; }

/** Returns *true* if a piece is currently selected. */
function isAPieceSelected() { return pieceSelected !== undefined; }

/** Returns true if we have selected an opponents piece to view their moves */
function isOpponentPieceSelected() { return isOpponentPiece; }

/** Returns true if we are in premove mode (i.e. selected our own piece in an online game, when it's not our turn) */
function arePremoving() { return isPremove; }

/** Returns the pre-calculated legal moves of the selected piece. */
function getLegalMovesOfSelectedPiece() { return legalMoves; }

/** Returns *true* if a pawn is currently promoting (promotion UI open). */
function isPawnCurrentlyPromoting() { return pawnIsPromoting; }

/**
 * Flags the currently selected pawn to be promoted next frame.
 * Call when a choice is made on the promotion UI.
 */
function promoteToType(type: string) { promoteTo = type; }


// Updating ---------------------------------------------------------------------------------------------


/** Tests if we have selected a piece, or moved the currently selected piece. */
function update() {
	// Guard clauses...
	const gamefile = gameslot.getGamefile()!;
	// if (onlinegame.areInOnlineGame() && !onlinegame.isItOurTurn(gamefile)) return; // Not our turn
	if (input.isMouseDown_Right()) return unselectPiece(); // Right-click deselects everything
	if (pawnIsPromoting) { // Do nothing else this frame but wait for a promotion piece to be selected
		if (promoteTo) makePromotionMove();
		return;
	}
	const draggingPiece = draganimation.areDraggingPiece();
	if (movement.isScaleLess1Pixel_Virtual() || transition.areWeTeleporting()) {
		if (draggingPiece) handleDragging(undefined, false);
		return;
	}
	if (gamefile.gameConclusion || guipause.areWePaused() || perspective.isLookingUp()) return;

	// Calculate if the hover square is legal so we know if we need to render a ghost image...
	
	// What coordinates are we hovering over?
	hoverSquare = (input.getPointerClicked() && !draggingPiece) ? input.getPointerClickedTile()
            : space.convertWorldSpaceToCoords_Rounded(input.getPointerWorldLocation() as Coords);
	
	updateHoverSquareLegal();
	
	const pieceClickedType = gamefileutility.getPieceTypeAtCoords(gamefile, hoverSquare);
	
	if (draggingPiece) return handleDragging(pieceClickedType);
	
	// Pick up the piece on mousedown if we are allowed to move it. Otherwise only select when clicked.
	const clicked = (canMovePieceType(pieceClickedType) && preferences.getDragEnabled()) ? input.getPointerDown() : input.getPointerClicked();
	if (!clicked || input.isKeyHeld('control')) return; // Exit, we did not click
	
	if (pieceSelected) handleMovingSelectedPiece(hoverSquare, pieceClickedType); // A piece is already selected. Test if it was moved.
	else if (pieceClickedType) handleSelectingPiece(pieceClickedType);
	// Else we clicked, but there was no piece to select, *shrugs*
}

/**
 * Update the location of the dragged piece or make a move if it was dropped.
 * @param pieceHoveredType - The type of piece hovered over, if there is one.
 * @param allowDrop - If false, dropping the piece will not make a move. Default is true.
 */
function handleDragging(pieceHoveredType: string | undefined, allowDrop = true) {
	if (input.getTouchHelds().length > 1) {
		//Prevents accidental dragging when trying to zoom.
		if (draganimation.getDragParity()) return unselectPiece();
		return draganimation.cancelDragging();
	}
	if (input.getPointerHeld()) { // still dragging.
		// Render the piece at the pointer.
		draganimation.dragPiece(input.getPointerWorldLocation() as Coords, allowDrop ? hoverSquare : undefined);
		droparrows.update_ReturnCaptureCoords();
	} else {
		if (!allowDrop) draganimation.cancelDragging();

		const droparrowsCaptureCoords = droparrows.update_ReturnCaptureCoords();
		if (droparrowsCaptureCoords !== undefined) {
			moveGamefilePiece(droparrowsCaptureCoords);
			draganimation.dropPiece();
			return;
		}

		handleMovingSelectedPiece(hoverSquare, pieceHoveredType);
		if (pawnIsPromoting) return; // The sound will be played after the user selects the piece to promote to.
		draganimation.dropPiece();
	}
}

/**
 * Picks up the currently selected piece if we are allowed to.
 * Returns true if it was successful.
 */
function startDragging(): boolean {
	if (!preferences.getDragEnabled() || !canMovePieceType(pieceSelected!.type) || movement.boardHasMomentum()) return false; // Not allowed to
	draganimation.pickUpPiece(pieceSelected!);
	return true; // Dragging was just enabled.
}


/**
 * A piece is already selected. This is called when you *click* somewhere.
 * This will execute the move if you clicked on a legal square to move to,
 * or it will select a different piece if you clicked another piece.
 * @param coordsClicked - The square clicked: `[x,y]`.
 * @param [pieceClickedType] The type of piece clicked on, if there is one.
 */
function handleMovingSelectedPiece(coordsClicked: Coords, pieceClickedType?: string) {
	const gamefile = gameslot.getGamefile()!;

	tag: if (pieceClickedType) {

		// Did we click a friendly piece?
		// const selectedPieceColor = colorutil.getPieceColorFromType(pieceSelected.type)
		// const clickedPieceColor = colorutil.getPieceColorFromType(pieceClickedType);
		// if (selectedPieceColor !== clickedPieceColor) break tag; // Did not click a friendly

		if (hoverSquareLegal) break tag; // This piece is capturable, don't select it instead

		const draggingPiece = draganimation.areDraggingPiece();
		// If it clicked iteself, deselect or pick it up again.
		if (coordutil.areCoordsEqual(pieceSelected!.coords, coordsClicked)) {
			if (draggingPiece) { // The piece was dropped in its original square.
				if (!draganimation.getDragParity()) unselectPiece(); // Toggle selection
			} else { // The selected piece was clicked.
				// Pick up the piece if it's ours; otherwise, unselect it now.
				if (!canMovePieceType(pieceClickedType) || !startDragging()) unselectPiece();
				draganimation.setDragParity(false);
			}
		} else if (pieceClickedType !== 'voidsN' && !draggingPiece) { // Select that other piece instead. Prevents us from selecting a void after selecting an obstacle.
			handleSelectingPiece(pieceClickedType);
		}

		return;
	}

	// If we haven't return'ed at this point, check if the move is legal.
	if (!hoverSquareLegal) return; // Illegal

	// If it's a premove, hoverSquareLegal should not be true at this point unless
	// we are actually starting to implement premoving.
	if (isPremove) throw new Error("Don't know how to premove yet! Will not submit move normally.");

	// Don't move the piece if the mesh is locked, because it will mess up the mesh generation algorithm.
	if (gamefile.mesh.locked) return statustext.pleaseWaitForTask(); 

	// Check if the move is a pawn promotion
	if (specialdetect.isPawnPromotion(gamefile, pieceSelected!.type, coordsClicked)) {
		const color = colorutil.getPieceColorFromType(pieceSelected!.type);
		guipromotion.open(color);
		perspective.unlockMouse();
		pawnIsPromoting = coordsClicked;
		return;
	}

	moveGamefilePiece(coordsClicked, pieceClickedType !== undefined);
}

/**
 * A piece is **not** already selected. This is called when you *click* a piece.
 * This will select the piece if it is a friendly, or forward
 * you to the game's front if your viewing past moves.
 * @param [pieceClickedType] - The type of piece clicked on, if there is one.
 */
function handleSelectingPiece(pieceClickedType: string) {
	const gamefile = gameslot.getGamefile()!;

	// If we're viewing history, return. But also if we clicked a piece, forward moves.
	if (!moveutil.areWeViewingLatestMove(gamefile)) {
		// if (clickedPieceColor === gamefile.whosTurn ||
		//     options.getEM() && pieceClickedType !== 'voidsN') 
		// ^^ The extra conditions needed here so in edit mode and you click on an opponent piece
		// it will still forward you to front!
		movesequence.viewFront(gamefile);
		const lastMove = moveutil.getLastMove(gamefile.moves)!;
		movesequence.animateMove(lastMove);
		return;
	}

	// If it's your turn, select that piece.

	if (hoverSquareLegal) return; // Don't select different piece if the move is legal (its a capture)
	const clickedPieceColor = colorutil.getPieceColorFromType(pieceClickedType);
	if (!options.getEM() && clickedPieceColor === colorutil.colorOfNeutrals) return; // Don't select neutrals, unless we're in edit mode
	if (pieceClickedType === 'voidsN') return; // NEVER select voids, EVEN in edit mode.

	const pieceToSelect = gamefileutility.getPieceFromTypeAndCoords(gamefile, pieceClickedType, hoverSquare);

	// Select the piece
	selectPiece(pieceToSelect);
	if (canMovePieceType(pieceClickedType)) startDragging();
	draganimation.setDragParity(true);
}

/** Selects the provided piece. Auto-calculates it's legal moves. */
function selectPiece(piece: Piece) {
	frametracker.onVisualChange();
	const gamefile = gameslot.getGamefile()!;
	pieceSelected = piece;
	// Calculate the legal moves it has. Keep a record of this so that when the mouse clicks we can easily test if that is a valid square.
	legalMoves = legalmoves.calculate(gamefile, pieceSelected);

	const pieceColor = colorutil.getPieceColorFromType(pieceSelected.type);
	isOpponentPiece = onlinegame.areInOnlineGame() ? pieceColor !== onlinegame.getOurColor()
    /* Local Game */ : pieceColor !== gamefile.whosTurn;
	isPremove = !isOpponentPiece && onlinegame.areInOnlineGame() && !onlinegame.isItOurTurn();

	legalmovehighlights.onPieceSelected(pieceSelected, legalMoves); // Generate the buffer model for the blue legal move fields.
}

/**
 * Reselects the currently selected piece by recalculating its legal moves again,
 * and changing the color if needed.
 * Typically called after our opponent makes a move while we have a piece selected.
 */
function reselectPiece() {
	if (!pieceSelected) return; // No piece to reselect.
	const gamefile = gameslot.getGamefile()!;
	// Test if the piece is no longer there
	// This will work for us long as it is impossible to capture friendly's
	const pieceTypeOnCoords = gamefileutility.getPieceTypeAtCoords(gamefile, pieceSelected.coords);
	if (pieceTypeOnCoords !== pieceSelected.type) { // It either moved, or was captured
		unselectPiece(); // Can't be reselected, unselect it instead.
		return;
	}

	if (gamefile.gameConclusion) return; // Don't reselect, game is over

	// Reselect! Recalc its legal moves, and recolor.
	const pieceToReselect = gamefileutility.getPieceFromTypeAndCoords(gamefile, pieceSelected.type, pieceSelected.coords);
	selectPiece(pieceToReselect);
}

/**  Unselects the currently selected piece. Cancels pawns currently promoting, closes the promotion UI. */
function unselectPiece() {
	pieceSelected = undefined;
	isOpponentPiece = false;
	isPremove = false;
	legalMoves = undefined;
	pawnIsPromoting = undefined;
	promoteTo = undefined;
	guipromotion.close(); // Close the promotion UI
	if (draganimation.areDraggingPiece()) draganimation.cancelDragging();
	frametracker.onVisualChange();
	legalmovehighlights.onPieceUnselected();
}

/**
 * Moves the currently selected piece to the specified coordinates, then unselects the piece.
 * The destination coordinates MUST contain any special move flags.
 * @param coords - The destination coordinates`[x,y]`. MUST contain any special move flags.
 */
function moveGamefilePiece(coords: CoordsSpecial, isCapture = false) {
	const strippedCoords = moveutil.stripSpecialMoveTagsFromCoords(coords) as Coords;
	const moveDraft: MoveDraft = { startCoords: pieceSelected!.coords, endCoords: strippedCoords };
	specialdetect.transferSpecialFlags_FromCoordsToMove(coords, moveDraft);

	const wasBeingDragged = draganimation.areDraggingPiece();

	const animateMain = !wasBeingDragged; // This needs to be above makeMove(), since that will terminate the drag if the move ends the game.
	const move = movesequence.makeMove(gameslot.getGamefile()!, moveDraft);

	// Don't animate the main piece if it's being dragged, but still animate secondary pieces affected by the move (like the rook in castling).
	movesequence.animateMove(move, true, animateMain);
	// Normally the animation is in charge of playing the move sound when it's finished,
	// but if it's a drop from dragging, then we have to play the sound NOW!
	if (wasBeingDragged) {
		const dist = math.chebyshevDistance(move.startCoords, move.endCoords);
		if (boardchanges.wasACapture(move)) sound.playSound_capture(dist);
		else sound.playSound_move(dist);
		// However, we still need to clear any other animations in progress
		animation.clearAnimations();
	}

	movesendreceive.sendMove();

	unselectPiece();
}

/** Adds the promotion flag to the destination coordinates before making the move. */
function makePromotionMove() {
	const coords = pawnIsPromoting!;
	const coordsSpecial: CoordsSpecial = coordutil.copyCoords(coords);
	coordsSpecial.promotion = promoteTo; // Add a tag on the coords of what piece we're promoting to
	moveGamefilePiece(coordsSpecial);
	perspective.relockMouse();
}

/**
 * Tests if the square being hovered over is among
 * our pre-calculated legal moves for our selected piece.
 * Updates the {@link hoverSquareLegal} variable.
 */
function updateHoverSquareLegal() {
	if (!pieceSelected) {
		hoverSquareLegal = false;
		return;
	}

	const gamefile = gameslot.getGamefile()!;
	const typeAtHoverCoords = gamefileutility.getPieceTypeAtCoords(gamefile, hoverSquare);
	const hoverSquareIsSameColor = typeAtHoverCoords && colorutil.getPieceColorFromType(pieceSelected.type) === colorutil.getPieceColorFromType(typeAtHoverCoords);
	const hoverSquareIsVoid = !hoverSquareIsSameColor && typeAtHoverCoords === 'voidsN';
	// This will also subtley transfer any en passant capture tags to our `hoverSquare` if the function found an individual move with the tag.
	hoverSquareLegal = canMovePieceType(pieceSelected.type) && legalmoves.checkIfMoveLegal(legalMoves!, pieceSelected.coords, hoverSquare) || options.getEM() && !hoverSquareIsVoid && !hoverSquareIsSameColor;
}

/**
 * Returns true if the user is currently allowed to move the pieceType. It must be our piece and our turn.
 * @param pieceType - the type of piece 
 */
function canMovePieceType(pieceType?: string): boolean {
	if (pieceType === undefined || pieceType === 'voidsN') return false; // Never move voids
	else if (options.getEM()) return true; //Edit mode allows pieces to be moved on any turn.
	const pieceColor = colorutil.getPieceColorFromType(pieceType);
	const isOpponentPiece = onlinegame.areInOnlineGame() ? pieceColor !== onlinegame.getOurColor()
	/* Local Game */ : pieceColor !== gameslot.getGamefile()!.whosTurn;
	if (isOpponentPiece) return false; // Don't move opponent pieces
	const isPremove = !isOpponentPiece && onlinegame.areInOnlineGame() && !onlinegame.isItOurTurn();
	return (!isPremove /*|| premovesEnabled*/);
}

/** Renders the translucent piece underneath your mouse when hovering over the blue legal move fields. */
function renderGhostPiece() {
	if (!isAPieceSelected() || !hoverSquare || !hoverSquareLegal || draganimation.areDraggingPiece() || !input.isMouseSupported() || input.getPointerIsTouch() || config.VIDEO_MODE) return;
	pieces.renderGhostPiece(pieceSelected!.type, hoverSquare);
}


// ------------------------------------------------------------------------------------


export default {
	isAPieceSelected,
	getPieceSelected,
	reselectPiece,
	unselectPiece,
	getLegalMovesOfSelectedPiece,
	isPawnCurrentlyPromoting,
	promoteToType,
	update,
	renderGhostPiece,
	isOpponentPieceSelected,
	arePremoving,
};

export type {
	CoordsSpecial
};