
/**
 * This script tests for piece selection and keeps track of the selected piece,
 * including the legal moves it has available.
 */


import type { Piece } from '../../chess/logic/boardchanges.js';
// @ts-ignore
import type { LegalMoves } from '../../chess/logic/legalmoves.js';
// @ts-ignore
import type gamefile from '../../chess/logic/gamefile.js';


import gameslot from './gameslot.js';
import movesendreceive from '../misc/onlinegame/movesendreceive.js';
import droparrows from '../rendering/dragging/droparrows.js';
import onlinegame from '../misc/onlinegame/onlinegame.js';
import gamefileutility from '../../chess/util/gamefileutility.js';
import colorutil from '../../chess/util/colorutil.js';
import movesequence from './movesequence.js';
import coordutil, { Coords } from '../../chess/util/coordutil.js';
import frametracker from '../rendering/frametracker.js';
import pieces from '../rendering/pieces.js';
import guipromotion from '../gui/guipromotion.js';
import legalmovehighlights from '../rendering/highlights/legalmovehighlights.js';
import moveutil from '../../chess/util/moveutil.js';
import space from '../misc/space.js';
// @ts-ignore
import config from '../config.js';
// @ts-ignore
import guipause from '../gui/guipause.js';
// @ts-ignore
import legalmoves from '../../chess/logic/legalmoves.js';
// @ts-ignore
import input from '../input.js';
// @ts-ignore
import specialdetect, { CoordsSpecial } from '../../chess/logic/specialdetect.js';
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
import draganimation from '../rendering/dragging/draganimation.js';
import { MoveDraft } from '../../chess/logic/movepiece.js';
import math from '../../util/math.js';
import boardchanges from '../../chess/logic/boardchanges.js';
import animation from '../rendering/animation.js';


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
let hoverSquare: CoordsSpecial; // Current square mouse is hovering over
/** Whether the {@link hoverSquare} is legal to move the selected piece to. */
let hoverSquareLegal: boolean = false;

/** If a pawn is currently promoting (waiting on the promotion UI selection),
 * this will be set to the square it's moving to: `[x,y]`. */
let pawnIsPromotingOn: CoordsSpecial | undefined;
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
function getSquarePawnIsCurrentlyPromotingOn() { return pawnIsPromotingOn; }

/**
 * Flags the currently selected pawn to be promoted next frame.
 * Call when a choice is made on the promotion UI.
 */
function promoteToType(type: string) { promoteTo = type; }


// Updating ---------------------------------------------------------------------------------------------


/** Tests if we have selected a piece, or moved the currently selected piece. */
function update() {
	if (input.isMouseDown_Right()) return unselectPiece(); // Right-click deselects everything

	// Guard clauses...
	const gamefile = gameslot.getGamefile()!;
	if (pawnIsPromotingOn) { // Do nothing else this frame but wait for a promotion piece to be selected
		if (promoteTo) makePromotionMove(gamefile);
		return;
	}
	if (movement.isScaleLess1Pixel_Virtual() || transition.areWeTeleporting() || gamefileutility.isGameOver(gamefile) || guipause.areWePaused() || perspective.isLookingUp()) return;

	// Update the hover square
	hoverSquare = space.convertWorldSpaceToCoords_Rounded(input.getPointerWorldLocation() as Coords);
	updateHoverSquareLegal(gamefile); // Update whether the hover square is legal to move to.

	// What should selection.ts do?

	// 1. Test if we selected a new piece, or a different piece.

	testIfPieceSelected(gamefile); // Test this EVEN if a piece is currently selected, because we can always select a different piece.

	// Piece IS selected...

	// 2. Test if the piece was dropped. If it happened to be dropped on a legal square, then make the move.

	testIfPieceDropped(gamefile);

	// 3. Test if the piece was moved.

	testIfPieceMoved(gamefile);
}

/**
 * Updates the hover square, and tests if it is among
 * our pre-calculated legal moves for our selected piece.
 * 
 * This is required to call BEFORE we test if a piece should
 * be selected, because if we are switching selections, but
 * it turns out the new piece is legal to move to, we don't want
 * to select it instead, but capture it.
 */
function updateHoverSquareLegal(gamefile: gamefile): void {
	if (!pieceSelected) return;
	// Required to pass on the special flag
	const legal = legalmoves.checkIfMoveLegal(legalMoves!, pieceSelected!.coords, hoverSquare);
	const typeAtHoverCoords = gamefileutility.getPieceTypeAtCoords(gamefile, hoverSquare);
	hoverSquareLegal = legal && canMovePieceType(pieceSelected!.type) || options.getEM() && canDropOnPieceTypeInEditMode(typeAtHoverCoords);
}


// Piece Select / Drop / Move -----------------------------------------------------------------------------


/** If a piece was clicked or dragged, this will attempt to select that piece. */
function testIfPieceSelected(gamefile: gamefile) {
	// If we did not click, exit...
	const dragEnabled = preferences.getDragEnabled();
	if (dragEnabled && !input.getPointerDown() && !input.getPointerClicked()) return; // If dragging is enabled, all we need is pointer down event.
	else if (!dragEnabled && !input.getPointerClicked()) return; // When dragging is off, we actually need a pointer click.

	if (movement.boardHasMomentum()) return; // Don't select a piece if the board is moving

	// We have clicked, test if we clicked a piece...

	const pieceClicked = gamefileutility.getPieceAtCoords(gamefile, hoverSquare);

	// Is the type selectable by us? (not necessarily moveable)
	const selectionLevel = canSelectPieceType(gamefile, pieceClicked?.type);
	if (selectionLevel === 0) return; // Can't select this piece type
	else if (selectionLevel === 1 && input.getPointerClicked()) {
		/** Just quickly make sure that, if we already have selected a piece,
		 * AND we just clicked a piece that's legal to MOVE to,
		 * that we don't select it instead! */
		if (pieceSelected && hoverSquareLegal) return; // Return. Don't select it, NOR make the move, let testIfPieceMoved() catch that.
		// If we are viewing past moves, forward to front instead!!
		if (viewFrontIfNotViewingLatestMove(gamefile)) return; // Forwarded to front, DON'T select the piece.
		selectPiece(gamefile, pieceClicked!, false); // Select, but don't start dragging
	} else if (selectionLevel === 2 && input.getPointerDown()) {
		/** Just quickly make sure that, if we already have selected a piece,
		 * AND we just clicked a piece that's legal to MOVE to,
		 * that we don't select it instead! */
		if (pieceSelected && hoverSquareLegal) return; // Return. Don't select it, NOR make the move, let testIfPieceMoved() catch that.
		if (viewFrontIfNotViewingLatestMove(gamefile)) return; // Forwarded to front, DON'T select the piece.
		selectPiece(gamefile, pieceClicked!, true); // Select, AND start dragging if that's enabled.
	}
}

/** If a piece is being dragged, this will test if it was dropped, making the move if it is legal. */
function testIfPieceDropped(gamefile: gamefile): void {
	if (!pieceSelected) return; // No piece selected, can't move nor drop anything.
	if (!draganimation.areDraggingPiece()) return; // The selected piece is not being dragged.
	// if (pawnIsPromotingOn) return; // Can't drop a piece while promoting
	if (input.getTouchHelds().length > 1) { // Prevent accidental dragging when trying to zoom.
		if (draganimation.getDragParity()) return unselectPiece();
		return draganimation.dropPiece();
	}
	if (input.getPointerHeld()) return; // Not dropped yet

	// The pointer has released, drop the piece.

	// If it was dropped on its own square, AND the parity is negative, then also deselect the piece.

	const droppedOnOwnSquare = coordutil.areCoordsEqual(hoverSquare, pieceSelected!.coords);
	if (droppedOnOwnSquare && !draganimation.getDragParity()) unselectPiece();
	else if (hoverSquareLegal) moveGamefilePiece(gamefile, hoverSquare); // It was dropped on a legal square. Make the move. Making a move automatically deselects the piece and cancels the drag.
	else draganimation.dropPiece(); // Drop it without moving it.
}

/** If a piece is selected, and we clicked a legal square to move to, this will make the move. */
function testIfPieceMoved(gamefile: gamefile): void {
	if (!pieceSelected) return;
	if (!input.getPointerClicked()) return; // Pointer did not click, couldn't have moved a piece.

	if (!hoverSquareLegal) return; // Don't move it
	else moveGamefilePiece(gamefile, hoverSquare);
}

/** Forwards to the front of the game if we're viewing history, and returns true if we did. */
function viewFrontIfNotViewingLatestMove(gamefile: gamefile): boolean {
	// If we're viewing history, return.
	if (moveutil.areWeViewingLatestMove(gamefile)) return false;

	movesequence.viewFront(gamefile);
	// Also animate the last move
	const lastMove = moveutil.getLastMove(gamefile.moves)!;
	movesequence.animateMove(lastMove);
	return true;
}


// Can Select/Move/Drop Piece Type ---------------------------------------------------------------------------------


/**
 * 0 => Can't select this piece type (i.e. voids, neutrals)
 * 1 => Can select this piece type, but not draggable.
 * 2 => Can select and drag this piece type.
 * 
 * A piece will not be considered draggable (level 2) if the user disabled dragging.
 * This means more information is needed to tell if the piece is moveable.
 * @param type 
 */
function canSelectPieceType(gamefile: gamefile, type: string | undefined): 0 | 1 | 2 {
	if (type === undefined) return 0; // Can't select nothing
	if (type === 'voidsN') return 0; // Can't select voids
	if (options.getEM()) return 2; // Edit mode allows any piece besides voids to be selected and dragged.
	const color = colorutil.getPieceColorFromType(type);
	if (color === colorutil.colorOfNeutrals) return 0; // Can't select neutrals, period.
	if (isOpponentType(gamefile, type)) return 1; // Can select opponent pieces, but not draggable..
	const isOurTurn = onlinegame.areInOnlineGame() ? onlinegame.isItOurTurn() : /* Local Game */ gameslot.getGamefile()!.whosTurn === color;
	if (!isOurTurn) return 1; // Can select our piece when it's not our turn, but not draggable.
	return preferences.getDragEnabled() ? 2 : 1; // Can select and move this piece type (draggable too IF THAT IS ENABLED).
}

/**
 * Returns true if the user is currently allowed to move the pieceType. It must be our piece and our turn.
 * @param pieceType - the type of piece 
 */
function canMovePieceType(pieceType: string): boolean {
	if (options.getEM()) return true; // Edit mode allows pieces to be moved on any turn.
	const isOpponentPiece = isOpponentType(gameslot.getGamefile()!, pieceType);
	if (isOpponentPiece) return false; // Don't move opponent pieces
	const isPremove = !isOpponentPiece && onlinegame.areInOnlineGame() && !onlinegame.isItOurTurn();
	return (!isPremove /*|| premovesEnabled*/);
}

/**
 * Tests our selected piece can POSSIBLY be dropped on the provided type.
 * As if edit mode was on, ignoring legal moves.
 */
function canDropOnPieceTypeInEditMode(type?: string) {
	if (type === undefined) return true; // Can drop on empty squares.
	const color = colorutil.getPieceColorFromType(type);
	const selectedPieceColor = colorutil.getPieceColorFromType(pieceSelected!.type);
	// Can't drop on voids or friendlies, EVER, not even when edit mode is on.
	return !type.startsWith('voids') && (color !== selectedPieceColor);
}

/** Returns true if the type belongs to our opponent, no matter what kind of game we're in. */
function isOpponentType(gamefile: gamefile, type: string) {
	const pieceColor = colorutil.getPieceColorFromType(type);
	return onlinegame.areInOnlineGame() ? pieceColor !== onlinegame.getOurColor()
	/* Local Game */ : pieceColor !== gamefile.whosTurn;
}


// Selection & Moving ---------------------------------------------------------------------------------------------


/**
 * Selects the provided piece. If the piece is already selected, it will be deselected.
 * @param gamefile 
 * @param piece 
 * @param drag - If true, the piece starts being dragged. This also means it won't be deselected if you clicked the selected piece again.
 */
function selectPiece(gamefile: gamefile, piece: Piece, drag: boolean) {
	hoverSquareLegal = false; // Reset the hover square legal flag so that it doesn't remain true for the remainer of the update loop.
	const alreadySelected = pieceSelected !== undefined && coordutil.areCoordsEqual(pieceSelected.coords, piece.coords);

	if (drag) { // Pick up anyway, don't unselect it if it was already selected.
		if (alreadySelected) {
			draganimation.pickUpPiece(piece, false); // Reset parity since it's the same piece being picked up.
			return; // Already selected, don't have to recalculate legal moves.
		} draganimation.pickUpPiece(piece, true); // Reset parity since it's a new piece being picked up.
	} else { // Not being dragged. If this piece is already selected, unselect it.
		if (alreadySelected) return unselectPiece();
	}

	initSelectedPieceInfo(gamefile, piece);
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

	if (gamefileutility.isGameOver(gamefile)) return; // Don't reselect, game is over

	// Reselect! Recalc its legal moves, and recolor.
	const pieceToReselect = gamefileutility.getPieceFromTypeAndCoords(gamefile, pieceSelected.type, pieceSelected.coords);
	initSelectedPieceInfo(gamefile, pieceToReselect);
}

/** Unselects the currently selected piece. Cancels pawns currently promoting, closes the promotion UI. */
function unselectPiece() {
	if (pieceSelected === undefined) return; // No piece to unselect.
	pieceSelected = undefined;
	isOpponentPiece = false;
	isPremove = false;
	legalMoves = undefined;
	pawnIsPromotingOn = undefined;
	promoteTo = undefined;
	hoverSquareLegal = false;
	guipromotion.close(); // Close the promotion UI
	draganimation.cancelDragging();
	frametracker.onVisualChange();
	legalmovehighlights.onPieceUnselected();
}

/** Initializes the selected piece, and calculates its legal moves. */
function initSelectedPieceInfo(gamefile: gamefile, piece: Piece) {
	// Initiate
	pieceSelected = piece;
	// Calculate the legal moves it has. Keep a record of this so that when the mouse clicks we can easily test if that is a valid square.
	legalMoves = legalmoves.calculate(gamefile, pieceSelected);

	isOpponentPiece = isOpponentType(gamefile, piece.type);
	isPremove = onlinegame.areInOnlineGame() && !onlinegame.isItOurTurn() && !isOpponentType(gamefile, piece.type);

	legalmovehighlights.onPieceSelected(pieceSelected, legalMoves); // Generate the buffer model for the blue legal move fields.
}

/**
 * Moves the currently selected piece to the specified coordinates, then unselects the piece.
 * The destination coordinates MUST contain any special move flags.
 * @param coords - The destination coordinates`[x,y]`. MUST contain any special move flags.
 */
function moveGamefilePiece(gamefile: gamefile, coords: CoordsSpecial) {
	// Check if the move is a pawn promotion
	if (coords.promoteTrigger) {
		const color = colorutil.getPieceColorFromType(pieceSelected!.type);
		guipromotion.open(color);
		perspective.unlockMouse();
		pawnIsPromotingOn = coords;
		return;
	}
	// Don't move the piece if the mesh is locked, because it will mess up the mesh generation algorithm.
	if (gamefile.mesh.locked) {
		statustext.pleaseWaitForTask();
		unselectPiece();
		return;
	}

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
function makePromotionMove(gamefile: gamefile) {
	const coords = pawnIsPromotingOn!;
	// DELETE THE promoteTrigger flag, and add the promoteTo flag
	delete coords.promoteTrigger;
	coords.promotion = promoteTo!;
	moveGamefilePiece(gamefile, coords);
	perspective.relockMouse();
}


// Rendering ---------------------------------------------------------------------------------------------------------


/** Renders the translucent piece underneath your mouse when hovering over the blue legal move fields. */
function renderGhostPiece() {
	if (!pieceSelected || !hoverSquareLegal || draganimation.areDraggingPiece() || input.getPointerIsTouch() || config.VIDEO_MODE) return;
	pieces.renderGhostPiece(pieceSelected!.type, hoverSquare);
}


// Exports ------------------------------------------------------------------------------------


export default {
	isAPieceSelected,
	getPieceSelected,
	reselectPiece,
	unselectPiece,
	getLegalMovesOfSelectedPiece,
	getSquarePawnIsCurrentlyPromotingOn,
	promoteToType,
	update,
	renderGhostPiece,
	isOpponentPieceSelected,
	arePremoving,
};