
// This script tests for piece selection and keeps track of the selected piece,
// including the legal moves it has available.

"use strict";

const selection = (function() {

    /** The currently selected piece, if there is one: `{ type, index, coords }` */
    let pieceSelected;
    /** The pre-calculated legal moves of the current selected piece.
     * @type {LegalMoves} */
    let legalMoves;

    /** The tile the mouse is hovering over, OR the tile we just performed a simulated click over: `[x,y]` */
    let hoverSquare; // Current square mouse is hovering over
    /** whether the {@link hoverSquare} is legal to move the selected piece to. */
    let hoverSquareLegal = false;

    /** If a pawn is currently promoting (waiting on the promotion UI selection),
     * this will be set to the square it's moving to: `[x,y]`, otherwise `false`. */
    let pawnIsPromoting = false; // Set to coordsClicked when a player moves a pawn to the last rank
    /** When a promotion UI piece is selected, this is set to the promotion you selected. */
    let promoteTo;


    /**
     * Returns the current selected piece, if there is one.
     * @returns {Object | undefined} The selected piece, if there is one: `{ type, index, coords }`, otherwise undefined.
     */
    function getPieceSelected() { return pieceSelected; }

    /**
     * Returns *true* if a piece is currently selected.
     * @returns {boolean}
     */
    function isAPieceSelected() { return pieceSelected != null; }

    /**
     * Returns the pre-calculated legal moves of the selected piece.
     * @returns {Object} The selected piece, if there is one: `{ type, index, coords }`.
     */
    function getLegalMovesOfSelectedPiece() { return legalMoves; }

    /**
     * Returns *true* if a pawn is currently promoting (promotion UI open).
     * @returns {boolean}
     */
    function isPawnCurrentlyPromoting() { return pawnIsPromoting; }

    /**
     * Flags the currently selected pawn to be promoted next frame.
     * Call when a choice is made on the promotion UI.
     * @param {boolean} type
     */
    function promoteToType(type) { promoteTo = type; }

    /** Tests if we have selected a piece, or moved the currently selected piece. */
    function update() {
        // Guard clauses...
        const gamefile = game.getGamefile();
        if (onlinegame.areInOnlineGame() && !onlinegame.isItOurTurn(gamefile)) return; // Not our turn
        if (pawnIsPromoting) { // Do nothing else this frame but wait for a promotion piece to be selected
            if (promoteTo) makePromotionMove()
            return;
        }
        if (movement.isScaleLess1Pixel_Virtual() || transition.areWeTeleporting() || gamefile.gameConclusion || guipause.areWePaused() || perspective.isLookingUp()) return;

        // Calculate if the hover square is legal so we know if we need to render a ghost image...

        // What coordinates are we hovering over?
        let touchClickedTile = input.getTouchClickedTile() // { id, x, y }
        hoverSquare = input.getTouchClicked() ? [touchClickedTile.x, touchClickedTile.y]
                    : input.getMouseClicked() ? input.getMouseClickedTile()
                                              : board.gtile_MouseOver_Int();
        if (!hoverSquare) return; // Undefined, this means we're in perspective and we shouldn't be listening to tile mouse over
        updateHoverSquareLegal()

        if (!input.getMouseClicked() && !input.getTouchClicked()) return; // Exit, we did not click

        const pieceClickedType = gamefileutility.getPieceTypeAtCoords(gamefile, hoverSquare)

        if (pieceSelected) handleMovingSelectedPiece(hoverSquare, pieceClickedType) // A piece is already selected. Test if it was moved.
        else if (pieceClickedType) handleSelectingPiece(pieceClickedType);
        // Else we clicked, but there was no piece to select, *shrugs*
    }

    /**
     * A piece is already selected. This is called when you *click* somewhere.
     * This will execute the move if you clicked on a legal square to move to,
     * or it will select a different piece if you clicked another piece.
     * @param {number[]} coordsClicked - The square clicked: `[x,y]`.
     * @param {string} [pieceClickedType] - The type of piece clicked on, if there is one.
     */
    function handleMovingSelectedPiece(coordsClicked, pieceClickedType) {
        const gamefile = game.getGamefile();

        tag: if (pieceClickedType) {

            // Did we click a friendly piece?
            const selectedPieceColor = math.getPieceColorFromType(pieceSelected.type)
            const clickedPieceColor = math.getPieceColorFromType(pieceClickedType);

            if (selectedPieceColor !== clickedPieceColor) break tag; // Did not click a friendly

            // If it clicked iteself, deselect.
            if (pieceClickedType && math.areCoordsEqual(pieceSelected.coords, coordsClicked)) {
                main.renderThisFrame();
                unselectPiece();
            } else if (pieceClickedType !== 'voidsN') { // Select that other friendly piece instead. Prevents us from selecting a void after selecting an obstacle.
                const clickedPieceIndex = gamefileutility.getPieceIndexByTypeAndCoords(gamefile, pieceClickedType, coordsClicked)
                selectPiece(pieceClickedType, clickedPieceIndex, coordsClicked)
            }

            return;
        }

        // If we haven't return'ed at this point, check if the move is legal.
        if (!hoverSquareLegal) return; // Illegal

        // Don't move the piece if the mesh is locked, because it will mess up either
        // the mesh generation algorithm or checkmate algorithm.
        if (gamefile.mesh.locked) return statustext.pleaseWaitForTask(); 

        // Check if the move is a pawn promotion
        if (specialdetect.isPawnPromotion(gamefile, pieceSelected.type, coordsClicked)) {
            const color = math.getPieceColorFromType(pieceSelected.type)
            guipromotion.open(color);
            pawnIsPromoting = coordsClicked;
            return;
        }

        moveGamefilePiece(coordsClicked)
    }

    /**
     * A piece is **not** already selected. This is called when you *click* a piece.
     * This will select the piece if it is a friendly, or forward
     * you to the game's front if your viewing past moves.
     * @param {number[]} coordsClicked - The square clicked: `[x,y]`.
     * @param {string} [pieceClickedType] - The type of piece clicked on, if there is one.
     */
    function handleSelectingPiece(pieceClickedType) {
        const gamefile = game.getGamefile();
        const clickedPieceColor = math.getPieceColorFromType(pieceClickedType);

        // If we're viewing history, return. But also if we clicked a piece, forward moves.
        if (!movesscript.areWeViewingLatestMove(gamefile)) {
            if (clickedPieceColor === gamefile.whosTurn ||
                options.getEM() && pieceClickedType !== 'voidsN') return movepiece.forwardToFront(gamefile, { flipTurn: false, updateProperties: false })
                // ^^ The extra conditions needed here so in edit mode and you click on an opponent piece
                // it will still forward you to front!
        }

        // If it's your turn, select that piece.

        if (clickedPieceColor !== gamefile.whosTurn && !options.getEM()) return; // Don't select opposite color
        if (options.getEM() && pieceClickedType === 'voidsN') return; // Don't select voids.

        const clickedPieceIndex = gamefileutility.getPieceIndexByTypeAndCoords(gamefile, pieceClickedType, hoverSquare)

        // Select the piece
        selectPiece(pieceClickedType, clickedPieceIndex, hoverSquare)
    }

    /**
     * Selects the provided piece. Auto-calculates it's legal moves.
     * @param {string} type - The type of piece to select.
     * @param {*} index - The index of the piece within the gamefile's piece list.
     * @param {*} coords - The coordinates of the piece.
     */
    function selectPiece(type, index, coords) {
        main.renderThisFrame()
        pieceSelected = { type, index, coords }
        // Calculate the legal moves it has. Keep a record of this so that when the mouse clicks we can easily test if that is a valid square.
        legalMoves = legalmoves.calculate(game.getGamefile(), pieceSelected)
        highlights.regenModel() // Generate the buffer model for the blue legal move fields.
    }

    /**
     * Unselects the currently selected piece. Cancels pawns currently promoting, closes the promotion UI.
     */
    function unselectPiece() {
        pieceSelected = undefined;
        legalMoves = undefined;
        pawnIsPromoting = false;
        promoteTo = undefined;
        guipromotion.close() // Close the promotion UI
        main.renderThisFrame();
    }

    /**
     * Moves the currently selected piece to the specified coordinates, then unselects the piece.
     * The destination coordinates MUST contain any special move flags.
     * @param {number[]} coords - The destination coordinates`[x,y]`. MUST contain any special move flags.
     */
    function moveGamefilePiece(coords) {
        const strippedCoords = movepiece.stripSpecialMoveTagsFromCoords(coords);
        /** @type {Move} */
        const move = { type: pieceSelected.type, startCoords: pieceSelected.coords, endCoords: strippedCoords }
        specialdetect.transferSpecialFlags_FromCoordsToMove(coords, move)
        const compact = formatconverter.LongToShort_CompactMove(move);
        move.compact = compact;

        movepiece.makeMove(game.getGamefile(), move)
        onlinegame.sendMove();

        unselectPiece()
    }

    /** Adds the promotion flag to the destination coordinates before making the move. */
    function makePromotionMove() {
        const coords = pawnIsPromoting;
        coords.promotion = promoteTo; // Add a tag on the coords of what piece we're promoting to
        moveGamefilePiece(coords)
        perspective.relockMouse()
    }

    /**
     * Tests if the square being hovered over is among
     * our pre-calculated legal moves for our selected piece.
     * Updates the {@link hoverSquareLegal} variable.
     */
    function updateHoverSquareLegal() {
        if (pieceSelected == null) {
            hoverSquareLegal = false;
            return;
        }

        const gamefile = game.getGamefile();
        const typeAtHoverCoords = gamefileutility.getPieceTypeAtCoords(gamefile, hoverSquare);
        const hoverSquareIsSameColor = typeAtHoverCoords && math.getPieceColorFromType(pieceSelected.type) === math.getPieceColorFromType(typeAtHoverCoords);
        const hoverSquareIsVoid = !hoverSquareIsSameColor && typeAtHoverCoords === 'voidsN';
        // This will also subtley transfer any en passant capture tags to our `hoverSquare` if the function found an individual move with the tag.
        hoverSquareLegal = legalmoves.checkIfMoveLegal(legalMoves, pieceSelected.coords, hoverSquare) || (options.getEM() && !hoverSquareIsVoid && !hoverSquareIsSameColor)
    }

    /** Renders the translucent piece underneath your mouse when hovering over the blue legal move fields. */
    function renderGhostPiece() {
        if (!isAPieceSelected() || !hoverSquare || !hoverSquareLegal || !input.isMouseSupported() || main.videoMode) return;
        pieces.renderGhostPiece(pieceSelected.type, hoverSquare)
    }

    return Object.freeze({
        isAPieceSelected,
        getPieceSelected,
        unselectPiece,
        getLegalMovesOfSelectedPiece,
        isPawnCurrentlyPromoting,
        promoteToType,
        update,
        renderGhostPiece
    })
})();