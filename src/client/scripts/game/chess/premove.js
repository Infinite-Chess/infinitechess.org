//Records premoves made by the player and submits them to the server

"use strict";

const premove = (function(){

    let premovesEnabled = true; //alows the user to make premoves.

    /** Enables or disables premoves.
     * @param {boolean} value - Are premoves allowed? 
     * - True: enable premoves
     * - False: disable premoves
     */
    function allowPremoves(value) {
        premovesEnabled = value;
        if(!value) clearPremoves();
    }

    function arePremovesEnabled() {
        return premovesEnabled;
    }

    /** @type {Move[]} */
    let premoves = [];

    /** A list of squares that pieces have premoved into or out of.
     * @type{number[][]}
     */
    let highlightedSquares = [];

    /** Stores the new position of peices after the premove
     * @type {Object}
     * - `startCoords`: where the piece was
     * - `endCoords`: where it will be after premoves
     * - `piece`: the piece that was moved
    */
    let movedPieces = {};

    /**
     * Submits the next premove to the server if it is legal.
     * Otherwise deletes the queue.
     */
    function submitPremove() {
        /**
         * The piece is unselected to prevent bugs where the player selects a moves that is no longer legal but was still displayed.
         * Ideally the following should be done instead:
         *      Unselect the piece if it no longer exists.
         *      Recalculate legal moves and new display options.
         *      Close the promotion GUI if promotion is no longer legal.
         */
        selection.unselectPiece();


        if (!premoves.length || !premovesEnabled)
            return; //The user has not made a premove.
        let premove = premoves.shift();
        
        //check if the premove is legal
        let gamefile = game.getGamefile();
        let piece = gamefileutility.getPieceAtCoords(gamefile, premove.startCoords);
        let legalMoves = legalmoves.calculate(gamefile, piece);
        let premoveLegal = legalmoves.checkIfMoveLegal(legalMoves, premove.startCoords, premove.endCoords);
        
        if (!premoveLegal)
        {
            //If this premove was innvalid all subsequent premoves are also invalid.
            clearPremoves();
            return;
        }
        movepiece.makeMove(game.getGamefile(), premove)
        onlinegame.sendMove();

        if(!premoves) {
            clearPremoves();
            return;
        }

        for(const key in movedPieces) {
            const movement = movedPieces[key];
            if(math.areCoordsEqual(movement.startCoords, premove.startCoords)) {
                if (math.areCoordsEqual(movement.endCoords, premove.endCoords))
                {
                    delete movedPieces[key];
                    //Un-highlight the square the piece moved to as the piece is in its final position
                    removeSquareHighlight(premove.endCoords);
                } else {
                    movement.startCoords = premove.endCoords;
                }
                break;
            }
        }

        //Un-highlight the square the piece moved from
        removeSquareHighlight(premove.startCoords);
    }

    /** Remove premove highlight from a square.
     * @pram {number[]} coords - The coordinates of the square to un-highlight
     */
    function removeSquareHighlight(coords) {
        let highlighedSquareIndex = highlightedSquares.indexOf(coords)
        if (highlighedSquareIndex < 0)
            return console.error("Cannot remove highlight as it was never added.");
        highlightedSquares.splice(highlighedSquareIndex, 1);
    }

    /** Adds a premove to the queue.
     * @param {Piece} piece
     * @param {Move} move
    */
    function makePremove(piece, move) {
        if (!premovesEnabled)
            return;
        if (main.devBuild) console.log("A premove was made.");
        premoves.push(move);
        if (!movedPieces[piece.type + piece.index]) {
            movedPieces[piece.type + piece.index] = {
                piece, 
                startCoords: move.startCoords, 
                endCoords: move.endCoords
            };
            highlightedSquares.push(move.startCoords);
        }
        else {
            movedPieces[piece.type + piece.index].endCoords = move.endCoords;
        }
        highlightedSquares.push(move.endCoords);
        piecesmodel.movebufferdata(game.getGamefile(), piece, move.endCoords);
    }

    function clearPremoves()
    {
        hidePremoves();
        premoves = [];
        movedPieces = {};
        highlightedSquares = [];
    }

    /**
     * 
     */
    function showPremoves() {
        if(!premoves) return;
        for (const movement of Object.values(movedPieces)) {
            piecesmodel.movebufferdata(game.getGamefile(), movement.piece, movement.endCoords);
        }
    }

    /** Sends all pieces back to their original positions. */
    function hidePremoves() {
        if(!premoves) return;
        for (const movement of Object.values(movedPieces)) {
            piecesmodel.movebufferdata(game.getGamefile(), movement.piece, movement.startCoords);
        }
    }

    /**
     * @param coords
     */
    function getPieceAtCoords(coords) {
        
    }

    function getPremoveCount() {
        return premovesEnabled? premoves.length : 0;
    }

    return Object.freeze({
        makePremove,
        hidePremoves,
        showPremoves,
        submitPremove,
        allowPremoves,
        arePremovesEnabled
    });

})();