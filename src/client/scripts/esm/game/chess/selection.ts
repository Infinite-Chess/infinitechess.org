
/**
 * This script tests for piece selection and keeps track of the selected piece,
 * including the legal moves it has available.
 */


import type { Piece } from '../../chess/util/boardutil.js';
import type { MoveDraft } from '../../chess/logic/movepiece.js';
import type { RawType } from '../../chess/util/typeutil.js';
import type { Mesh } from '../rendering/piecemodels.js';
import type { LegalMoves } from '../../chess/logic/legalmoves.js';
import type { Game, FullGame } from '../../chess/logic/gamefile.js';

import gameslot from './gameslot.js';
import movesendreceive from '../misc/onlinegame/movesendreceive.js';
import droparrows from '../rendering/dragging/droparrows.js';
import gamefileutility from '../../chess/util/gamefileutility.js';
import boardutil from '../../chess/util/boardutil.js';
import typeutil from '../../chess/util/typeutil.js';
import movesequence from './movesequence.js';
import coordutil, { Coords } from '../../chess/util/coordutil.js';
import frametracker from '../rendering/frametracker.js';
import pieces from '../rendering/pieces.js';
import guipromotion from '../gui/guipromotion.js';
import legalmovehighlights from '../rendering/highlights/legalmovehighlights.js';
import moveutil from '../../chess/util/moveutil.js';
import draganimation from '../rendering/dragging/draganimation.js';
import gameloader from './gameloader.js';
import onlinegame from '../misc/onlinegame/onlinegame.js';
import preferences from '../../components/header/preferences.js';
import { rawTypes, players } from '../../chess/util/typeutil.js';
import { listener_document, listener_overlay } from './game.js';
import { Mouse } from '../input.js';
import mouse from '../../util/mouse.js';
import boardpos from '../rendering/boardpos.js';
import boarddrag from '../rendering/boarddrag.js';
import annotations from '../rendering/highlights/annotations/annotations.js';
import arrows from '../rendering/arrows/arrows.js';
import config from '../config.js';
import legalmoves from '../../chess/logic/legalmoves.js';
import enginegame from '../misc/enginegame.js';
// @ts-ignore
import guipause from '../gui/guipause.js';
// @ts-ignore
import specialdetect, { CoordsSpecial } from '../../chess/logic/specialdetect.js';
// @ts-ignore
import perspective from '../rendering/perspective.js';
// @ts-ignore
import transition from '../rendering/transition.js';
// @ts-ignore
import statustext from '../gui/statustext.js';


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
let promoteTo: number | undefined;

/**
 * When enabled, allows moving pieces anywhere else on the board, disregarding whether it's legal.
 * Special flags however will still only be transferred if the destination is legal.
 */
let editMode = false; // editMode, allows moving pieces anywhere else on the board!


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
function promoteToType(type: number) { promoteTo = type; }

// Toggles EDIT MODE! editMode
// Called when '1' is pressed!
function toggleEditMode() {
	// Make sure it's legal
	const legalInPrivate = onlinegame.areInOnlineGame() && onlinegame.getIsPrivate() && listener_document.isKeyHeld('0');
	if (onlinegame.areInOnlineGame() && !legalInPrivate) return; // Don't toggle if in an online game
	if (enginegame.areInEngineGame()) return; // Don't toggle if in an engine game

	editMode = !editMode;
	statustext.showStatus(`Toggled Edit Mode: ${editMode}`);
}

function disableEditMode() { editMode = false; }


// Updating ---------------------------------------------------------------------------------------------


/** Tests if we have selected a piece, or moved the currently selected piece. */
function update() {
	guipromotion.update();
	// DISABLED BECAUSE highlight drawing uses the right click
	if (mouse.isMouseDown(Mouse.MIDDLE)) return unselectPiece(); // Right-click deselects everything

	// Guard clauses...
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh();
	if (pawnIsPromotingOn) { // Do nothing else this frame but wait for a promotion piece to be selected
		if (promoteTo) makePromotionMove(gamefile, mesh);
		return;
	}
	if (boardpos.areZoomedOut() || transition.areWeTeleporting() || gamefileutility.isGameOver(gamefile.basegame) || guipause.areWePaused() || perspective.isLookingUp()) {
		// We might be zoomed way out.
		// If we are still dragging a piece, we still want to be able to drop it.
		if (draganimation.areDraggingPiece() && draganimation.hasPointerReleased()) draganimation.dropPiece(); // Drop it without moving it.
		return;
	}

	hoverSquare = mouse.getTileMouseOver_Integer()!; // Update the tile the mouse is hovering over, if any.
	// console.log("Hover square:", hoverSquare);

	updateHoverSquareLegal(gamefile); // Update whether the hover square is legal to move to.

	// What should selection.ts do?

	// 1. Test if we selected a new piece, or a different piece.

	testIfPieceSelected(gamefile, mesh); // Test this EVEN if a piece is currently selected, because we can always select a different piece.

	// Piece IS selected...

	// 2. Test if the piece was dropped. If it happened to be dropped on a legal square, then make the move.

	testIfPieceDropped(gamefile, mesh);

	// 3. Test if the piece was moved.

	testIfPieceMoved(gamefile, mesh);
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
function updateHoverSquareLegal(gamefile: FullGame): void {
	if (!pieceSelected) return;
	const colorOfSelectedPiece = typeutil.getColorFromType(pieceSelected.type);
	// Required to pass on the special flag
	const legal = legalmoves.checkIfMoveLegal(gamefile, legalMoves!, pieceSelected!.coords, hoverSquare, colorOfSelectedPiece);
	const typeAtHoverCoords = boardutil.getTypeFromCoords(gamefile.boardsim.pieces, hoverSquare);
	hoverSquareLegal = legal && canMovePieceType(pieceSelected!.type) || editMode && canDropOnPieceTypeInEditMode(typeAtHoverCoords);
}


// Piece Select / Drop / Move -----------------------------------------------------------------------------


/** If a piece was clicked or dragged, this will attempt to select that piece. */
function testIfPieceSelected(gamefile: FullGame, mesh: Mesh | undefined) {
	if (arrows.areHoveringAtleastOneArrow()) return; // Don't select a piece if we're hovering over an arrow
	// If we did not click, exit...
	const dragEnabled = preferences.getDragEnabled();
	if (dragEnabled && !mouse.isMouseDown(Mouse.LEFT) && !mouse.isMouseClicked(Mouse.LEFT)) return; // If dragging is enabled, all we need is pointer down event.
	else if (!dragEnabled && !mouse.isMouseClicked(Mouse.LEFT)) return; // When dragging is off, we actually need a pointer click.

	if (boardpos.boardHasMomentum()) return; // Don't select a piece if the boardsim is moving

	// We have clicked, test if we clicked a piece...

	const pieceClicked = boardutil.getPieceFromCoords(gamefile.boardsim.pieces, hoverSquare);
	// if (pieceClicked) console.log(typeutil.debugType(pieceClicked?.type));

	// Is the type selectable by us? (not necessarily moveable)
	const selectionLevel = canSelectPieceType(gamefile.basegame, pieceClicked?.type);
	// console.log('Selection Level:', selectionLevel);
	if (selectionLevel === 0) return; // Can't select this piece type
	else if (selectionLevel === 1 && mouse.isMouseClicked(Mouse.LEFT)) { // CAN select this piece type
		/** Just quickly make sure that, if we already have selected a piece,
		 * AND we just clicked a piece that's legal to MOVE to,
		 * that we don't select it instead! */
		if (pieceSelected && hoverSquareLegal) return; // Return. Don't select it, NOR make the move, let testIfPieceMoved() catch that.
		mouse.claimMouseClick(Mouse.LEFT); // Claim the mouse click so that annotations does use it to Collapse annotations.
		// If we are viewing past moves, forward to front instead!!
		if (viewFrontIfNotViewingLatestMove(gamefile, mesh)) return; // Forwarded to front, DON'T select the piece.
		selectPiece(gamefile, pieceClicked!, false); // Select, but don't start dragging
	} else if (selectionLevel === 2 && mouse.isMouseDown(Mouse.LEFT)) { // Can DRAG this piece type
		if (listener_document.isKeyHeld('ControlLeft')) return; // Control key force drags the board, disallowing picking up a piece.
		// If this is the second total pointer, then skip picking it up so that board dragging can pinch the board!
		if (listener_overlay.getPointerCount() === 2) return;
		/** Just quickly make sure that, if we already have selected a piece,
		 * AND we just clicked a piece that's legal to MOVE to,
		 * that we don't select it instead! */
		if (pieceSelected && hoverSquareLegal) return; // Return. Don't select it, NOR make the move, let testIfPieceMoved() catch that.
		mouse.claimMouseDown(Mouse.LEFT); // Claim the mouse down so board dragging doesn't use it
		mouse.cancelMouseClick(Mouse.LEFT); // Cancel the click so annotation doesn't clear when the mouse released in a few frames, simulating a click.
		if (viewFrontIfNotViewingLatestMove(gamefile, mesh)) return; // Forwarded to front, DON'T select the piece.
		selectPiece(gamefile, pieceClicked!, true); // Select, AND start dragging if that's enabled.
	}
}

/** If a piece is being dragged, this will test if it was dropped, making the move if it is legal. */
function testIfPieceDropped(gamefile: FullGame, mesh: Mesh | undefined): void {
	if (!pieceSelected) return; // No piece selected, can't move nor drop anything.
	if (!draganimation.areDraggingPiece()) return; // The selected piece is not being dragged.
	droparrows.updateCapturedPiece(); // Update the piece that would be captured if we were to let go of the dragged piece right now.
	if (listener_overlay.isMouseDown(Mouse.LEFT) && listener_overlay.getPointerCount() === 2) { // Prevent accidental dragging when trying to zoom.
		draganimation.unclaimPointer(); // Unclaim the pointer so that board dragging may capture it again to initiate a pinch.
		if (draganimation.getDragParity()) return unselectPiece();
		return draganimation.dropPiece();
	}

	if (!draganimation.hasPointerReleased()) return; // The pointer has not released yet, don't drop it.

	// The pointer has released, drop the piece.

	// If it was dropped an an arrow indicator pointing to a legal piece to capture, capture that!
	const dropArrowsCaptureCoords = droparrows.getCaptureCoords();
	if (dropArrowsCaptureCoords) return moveGamefilePiece(gamefile, mesh, dropArrowsCaptureCoords);

	// If it was dropped on its own square, AND the parity is negative, then also deselect the piece.

	const droppedOnOwnSquare = coordutil.areCoordsEqual(hoverSquare, pieceSelected!.coords);
	if (droppedOnOwnSquare && !draganimation.getDragParity()) unselectPiece();
	else if (hoverSquareLegal) moveGamefilePiece(gamefile, mesh, hoverSquare); // It was dropped on a legal square. Make the move. Making a move automatically deselects the piece and cancels the drag.
	else draganimation.dropPiece(); // Drop it without moving it.
}

/** If a piece is selected, and we clicked a legal square to move to, this will make the move. */
function testIfPieceMoved(gamefile: FullGame, mesh: Mesh | undefined): void {
	if (!pieceSelected) return;
	if (arrows.areHoveringAtleastOneArrow()) return; // Don't move a piece if we're hovering over an arrow
	if (!mouse.isMouseClicked(Mouse.LEFT)) return; // Pointer did not click, couldn't have moved a piece.

	if (!hoverSquareLegal) return; // Don't move it
	else moveGamefilePiece(gamefile, mesh, hoverSquare);
	
	mouse.claimMouseClick(Mouse.LEFT); // Claim the mouse click so that annotations does use it to Collapse annotations.
}

/** Forwards to the front of the game if we're viewing history, and returns true if we did. */
function viewFrontIfNotViewingLatestMove(gamefile: FullGame, mesh: Mesh | undefined): boolean {
	// If we're viewing history, return.
	if (moveutil.areWeViewingLatestMove(gamefile.boardsim)) return false;

	movesequence.viewFront(gamefile, mesh);
	// Also animate the last move
	const lastMove = moveutil.getLastMove(gamefile.boardsim.moves)!;
	movesequence.animateMove(lastMove);
	return true;
}


// Can Select/Move/Drop Piece Type ---------------------------------------------------------------------------------


/**
 * 0 => Can't select this piece type EVER (i.e. voids, neutrals).
 * 1 => Can select this piece type, but not draggable.
 * 2 => Can select and drag this piece type.
 * 
 * A piece will not be considered draggable (level 2) if the user disabled dragging.
 * This means more information is needed to tell if the piece is moveable by us.
 */
function canSelectPieceType(basegame: Game, type: number | undefined): 0 | 1 | 2 {
	if (type === undefined) return 0; // Can't select nothing
	const [raw, player] = typeutil.splitType(type);
	if (raw === rawTypes.VOID) return 0; // Can't select voids
	if (editMode) return preferences.getDragEnabled() ? 2 : 1; // Edit mode allows any piece besides voids to be selected and dragged.
	if (player === players.NEUTRAL) return 0; // Can't select neutrals, period.
	if (isOpponentType(basegame, type)) return 1; // Can select opponent pieces, but not draggable..
	const isOurTurn = gameloader.isItOurTurn(player);
	if (!isOurTurn) return 1; // Can select our piece when it's not our turn, but not draggable.
	// The piece is also not considered draggable if this is exactly the second pointer down.
	// But it still may be selected by a simulated click.
	// This allows us to tap to select friendly pieces, even if we're already dragging with one finger.
	if (boarddrag.isBoardDragging() && listener_overlay.getPointerCount() === 1) return 1;
	return preferences.getDragEnabled() ? 2 : 1; // Can select and move this piece type (draggable too IF THAT IS ENABLED).
}

/**
 * Returns true if the user is currently allowed to move the pieceType. It must be our piece and our turn.
 */
function canMovePieceType(pieceType: number): boolean {
	if (editMode) return true; // Edit mode allows pieces to be moved on any turn.
	const isOpponentPiece = isOpponentType(gameslot.getGamefile()!.basegame, pieceType);
	if (isOpponentPiece) return false; // Don't move opponent pieces
	const isPremove = !isOpponentPiece && !gameloader.areInLocalGame() && !gameloader.isItOurTurn();
	return (!isPremove); // For now we can't premove, can only move our pieces on our turn.
}

/**
 * Tests our selected piece can POSSIBLY be dropped on the provided type.
 * As if edit mode was on, ignoring legal moves.
 */
function canDropOnPieceTypeInEditMode(type?: number) {
	if (type === undefined) return true; // Can drop on empty squares.
	const [rawtype, color] = typeutil.splitType(type);
	const selectedPieceColor = typeutil.getColorFromType(pieceSelected!.type);
	// Can't drop on voids or friendlies, EVER, not even when edit mode is on.
	return rawtype !== rawTypes.VOID && (color !== selectedPieceColor);
	// return color !== selectedPieceColor; // Allow capturing voids for debugging
}

/** Returns true if the type belongs to our opponent, no matter what kind of game we're in. */
function isOpponentType(basegame: Game, type: number) {
	const pieceColor = typeutil.getColorFromType(type);
	return !gameloader.areInLocalGame() ? pieceColor !== gameloader.getOurColor()
	/* Local Game */ : pieceColor !== basegame.whosTurn;
}


// Selection & Moving ---------------------------------------------------------------------------------------------


/**
 * Selects the provided piece. If the piece is already selected, it will be deselected.
 * @param gamefile 
 * @param piece 
 * @param drag - If true, the piece starts being dragged. This also means it won't be deselected if you clicked the selected piece again.
 */
function selectPiece(gamefile: FullGame, piece: Piece, drag: boolean) {
	hoverSquareLegal = false; // Reset the hover square legal flag so that it doesn't remain true for the remainer of the update loop.

	annotations.onPieceSelection();

	const alreadySelected = pieceSelected !== undefined && coordutil.areCoordsEqual(pieceSelected.coords, piece.coords);
	if (drag) { // Pick up anyway, don't unselect it if it was already selected.
		if (alreadySelected) {
			draganimation.pickUpPiece(piece, false); // Toggle the parity since it's the same piece being picked up.
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
	const pieceTypeOnCoords = boardutil.getTypeFromCoords(gamefile.boardsim.pieces, pieceSelected.coords);
	if (pieceTypeOnCoords !== pieceSelected.type) { // It either moved, or was captured
		unselectPiece(); // Can't be reselected, unselect it instead.
		return;
	}

	if (gamefileutility.isGameOver(gamefile.basegame)) return; // Don't reselect, game is over

	// Reselect! Recalc its legal moves, and recolor.
	const pieceToReselect = boardutil.getPieceFromCoords(gamefile.boardsim.pieces, pieceSelected.coords)!;
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
function initSelectedPieceInfo(gamefile: FullGame, piece: Piece) {
	// Initiate
	pieceSelected = piece;

	// Calculate the legal moves it has. Keep a record of this so that when the mouse clicks we can easily test if that is a valid square.
	legalMoves = legalmoves.calculateAll(gamefile, piece);
	// console.log('Selected Legal Moves:', legalMoves);

	isOpponentPiece = isOpponentType(gamefile.basegame, piece.type);
	isPremove = !gameloader.areInLocalGame() && !gameloader.isItOurTurn() && !isOpponentType(gamefile.basegame, piece.type);

	legalmovehighlights.onPieceSelected(pieceSelected, legalMoves); // Generate the buffer model for the blue legal move fields.
}

/**
 * Moves the currently selected piece to the specified coordinates, then unselects the piece.
 * The destination coordinates MUST contain any special move flags.
 * @param coords - The destination coordinates`[x,y]`. MUST contain any special move flags.
 */
function moveGamefilePiece(gamefile: FullGame, mesh: Mesh | undefined, coords: CoordsSpecial) {
	// Check if the move is a pawn promotion
	if (coords.promoteTrigger) {
		const color = typeutil.getColorFromType(pieceSelected!.type);
		guipromotion.open(color);
		perspective.unlockMouse();
		pawnIsPromotingOn = coords;
		return;
	}

	const strippedCoords = moveutil.stripSpecialMoveTagsFromCoords(coords) as Coords;
	const moveDraft: MoveDraft = { startCoords: pieceSelected!.coords, endCoords: strippedCoords };
	specialdetect.transferSpecialFlags_FromCoordsToMove(coords, moveDraft);

	// Since making a move immediately cancels the current drag, we
	// have to note whether it was being dragged BEFORE we move it!
	const wasBeingDragged = draganimation.areDraggingPiece();

	const animateMain = !wasBeingDragged; // This needs to be ABOVE makeMove(), since that will terminate the drag if the move ends the game.
	const move = movesequence.makeMove(gamefile, mesh, moveDraft);
	// Not actually needed? Test it. To my knowledge, animation.ts will automatically cancel previous animations, since now it handles playing the sound for drops.
	// if (wasBeingDragged) animation.clearAnimations(); // We still need to clear any other animations in progress BEFORE we make the move (in case a secondary needs to be animated)
	// Don't animate the main piece if it's being dragged, but still animate secondary pieces affected by the move (like the rook in castling).
	movesequence.animateMove(move, true, animateMain);

	movesendreceive.sendMove();
	enginegame.onMovePlayed();

	unselectPiece();
}

/** Adds the promotion flag to the destination coordinates before making the move. */
function makePromotionMove(gamefile: FullGame, mesh: Mesh | undefined) {
	const coords = pawnIsPromotingOn!;
	// DELETE THE promoteTrigger flag, and add the promoteTo flag
	delete coords.promoteTrigger;
	coords.promotion = promoteTo!;
	moveGamefilePiece(gamefile, mesh, coords);
	perspective.relockMouse();
}


// Rendering ---------------------------------------------------------------------------------------------------------


/** Renders the translucent piece underneath your mouse when hovering over the blue legal move fields. */
function renderGhostPiece() {
	if (!pieceSelected || !hoverSquareLegal || draganimation.areDraggingPiece() || listener_overlay.isMouseTouch(Mouse.LEFT) || config.VIDEO_MODE) return;
	const rawType = typeutil.getRawType(pieceSelected.type);
	if (typeutil.SVGLESS_TYPES.some((type: RawType) => type === rawType)) return; // No svg/texture for this piece (void), don't render the ghost image.

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
	toggleEditMode,
	disableEditMode,
	promoteToType,
	update,
	renderGhostPiece,
	isOpponentPieceSelected,
	arePremoving,
};