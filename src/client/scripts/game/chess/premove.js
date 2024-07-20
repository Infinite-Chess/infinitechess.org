/** 
 * This script records premoves made by the player and submits them to the server on their next turn.
 * The legality of the move is checked before submission.
 */

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

    /** 
     * The queue of premoves waiting to be verified and submitted.
     * @type {Move[]} 
     */
    let premoves = [];

    /** A list of squares that pieces have premoved into or out of.
     * @type{number[][]}
     */
    let highlightedSquares = [];

    /** Stores the position of a piece before and after all premoves are applied.
     * @typedef {Object} PieceTranslation
     * @property {number[]} startCoords - Where was the piece before premoves?
     * @property {number[]} [endCoords] - Where will the piece be after premoves? Undefined if the piece was destoyed.
     * @property {Piece} piece - The piece is moved.
    */

    /** @type {Object.<string, PieceTranslation>}*/
    let movedPieces = {};

    /**
     * Submits the next premove to the server if it is legal;
     * otherwise, deletes the queue.
     * 
     * Only call function this when the legality of the premove can be verified(on our turn);
     * otherwise the move is deemed illegal.
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
            const pieceTranslation = movedPieces[key];
            if(math.areCoordsEqual(pieceTranslation.startCoords, premove.startCoords)) {
                if (math.areCoordsEqual(pieceTranslation.endCoords, premove.endCoords))
                {
                    delete movedPieces[key];
                    //Un-highlight the square the piece moved to as the piece is in its final position
                    removeSquareHighlight(premove.endCoords);
                } else {
                    pieceTranslation.startCoords = premove.endCoords;
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
     * @param {Piece} piece - the piece that was moved
     * @param {Move} move - the move the piece made
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

    /** Sends all premoved pieces back to their original positions then clears the queue of premoves. */
    function clearPremoves()
    {
        hidePremoves();
        premoves = [];
        movedPieces = {};
        highlightedSquares = [];
    }

    /** Displays premoved pieces in their new positions. */
    function showPremoves() {
        if(!premoves) return;
        for (const movement of Object.values(movedPieces)) {
            piecesmodel.movebufferdata(game.getGamefile(), movement.piece, movement.endCoords);
        }
    }

    /** Sends all pieces back to their original positions. */
    function hidePremoves() {
        if(!premoves) return;
        for (const pieceTranslation of Object.values(movedPieces)) {
            piecesmodel.movebufferdata(game.getGamefile(), pieceTranslation.piece, movement.startCoords);
        }
    }

    /**
     * Returns piece that has been premoved to `coords`. 
     * 
     * If no piece has been premoved to `coords` forwards the request to `gamefile`
     * @param {number[]} coords - The coordinates of the pieces: `[x,y]`
     * @returns {Piece | undefined} The piece at `coords` or *undifined* if there isn't one.
     */
    function getPieceAtCoords(coords) {
        for (let pieceMoved of Object.values(movedPieces)) {
            if (math.areCoordsEqual(pieceMoved.endCoords, coords)) {
                return pieceMoved.piece;
            }
            if (math.areCoordsEqual(pieceMoved.startCoords, coords)) {
                return undefined;
            }
        }
        return gamefileutility.getPieceAtCoords(game.getGamefile(), coords);
    }

    /**
     * Returns the number of premoves that have been recorded.
     * @returns {number} Number of premoves that have been recorded.
     */
    function getPremoveCount() {
        return premovesEnabled? premoves.length : 0;
    }

    return Object.freeze({
        makePremove,
        clearPremoves,
        hidePremoves,
        showPremoves,
        submitPremove,
        allowPremoves,
        arePremovesEnabled,
        getPremoveCount,
        getPieceAtCoords
    });

})();