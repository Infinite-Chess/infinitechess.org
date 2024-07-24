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

    /** 
     * Stores all of the pieces that have been moved to a position different from gamefile. 
     * Actually moving the pieces would confuse legality checks and/or checkmate detection.
     * 
     */
    let movedPieces = [];

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

        /** @type {Move} */ //We already checked that the array isn't empty. `premoves.shift()` should return a value.
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

        //If the last premove in the queue was just made,
        //clear all highlighted sqares and movedPieces.
        if(!premoves) {
            clearPremoves();
            return;
        }

        if(math.areCoordsEqual(piece.coords, piece.premovedCoords)) {
            if (math.areCoordsEqual(piece.premovedCoords, premove.endCoords))
            {
                movedPieces.splice(movedPieces.indexOf(piece), 2);
                //Un-highlight the square the piece moved to as the piece is in its final position
                removeSquareHighlight(premove.endCoords);
            } else {
                pieceTranslation.startCoords = premove.endCoords;
            }
        }

        //Un-highlight the square the piece moved from
        removeSquareHighlight(premove.startCoords);
    }
    
    /**
     * Move the visual position of the piece if premoves are shown.
     * @param {Piece} piece - The piece to premove.
     * @param {number[] | null} newCoords - The coordinates to move the piece to. *null* if the piece was captured.
     */
    function premovePiece(piece, newCoords) {
        if(newCoords) {
            
            let capturedPiece = getPieceAtCoords(newCoords);
            if (capturedPiece) premovePiece(capturedPiece, null);

            //Update the visual position of the piece.
            piecesmodel.movebufferdata(game.getGamefile(), piece, newCoords);
        } else {
            //The piece was captured. Remove it.
            piecesmodel.deletebufferdata(game.getGamefile(), piece);
        }

        piece.premovedCoords = newCoords;
        movedPieces.push(piece);
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

        let trimmedType = math.trimWorBFromType(piece.type);
        let specialMoveMade;
        let gamefile = game.getGamefile();
        if(gamefile.specialMoves[trimmedType]) 
            specialMoveMade = game.getGamefile().specialMoves[trimmedType](gamefile, piece, move, { isPremove:true });

        if (!specialMoveMade) premovePiece(piece, move.endCoords);

        highlightedSquares.push(move.endCoords);
    }

    /** Sends all premoved pieces back to their original positions then clears the queue of premoves. */
    function clearPremoves()
    {
        hidePremoves();
        premoves = [];
        movedPieces = [];
        highlightedSquares = [];
    }

    /** Displays premoved pieces in their new positions. */
    function showPremoves() {
        if(!premoves) return;
        let gamefile = game.getGamefile();
        for (let movedPiece of Object.values(movedPieces)) {
            if(movedPiece.premovedCoords)
                piecesmodel.movebufferdata(gamefile, movedPiece, movedPiece.premovedCoords);
            else if(movedPiece.premovedCoords == null)
                piecesmodel.deletebufferdata(gamefile, movedPiece);
            else
                console.error("Premoved coordinates undefined.");
        }
    }

    /** Sends all pieces back to their original positions. */
    function hidePremoves() {
        if(!premoves) return;
        let gamefile = game.getGamefile();
        for (const movedPiece of Object.values(movedPieces)) {
            if(movedPiece.premovedCoords) {
                piecesmodel.movebufferdata(gamefile, movedPiece, movedPiece.coords);
            } else if (movedPiece.premovedCoords === null) {
                piecesmodel.overwritebufferdata(
                    gamefile, 
                    movedPiece, 
                    movedPiece.coords, 
                    movedPiece.type);
            } else {
                console.error("Premoved coordinates undefined.");
            }
        }
    }

    /**
     * Returns piece that has been premoved to `coords`. 
     * 
     * If no piece has been premoved to `coords` forwards the request to `gamefileutility`
     * @param {number[]} coords - The coordinates of the pieces: `[x,y]`
     * @returns {Piece} The piece at `coords` if there is one.
     */
    function getPieceAtCoords(coords) {
        let pieceGone = false; //Has the piece moved away or been captured?
        for (let movedPiece of Object.values(movedPieces)) {
            if (math.areCoordsEqual(movedPiece.premovedCoords, coords)) {
                return movedPiece;
            }
            if (math.areCoordsEqual(movedPiece.coords, coords)) {
                pieceGone = true;
            }
        }
        return pieceGone?undefined:gamefileutility.getPieceAtCoords(game.getGamefile(), coords);
    }

    /**Returns *true* if we are currently makeing a premove.*/
    function isPremove() {
        return premovesEnabled && onlinegame.areInOnlineGame() && !onlinegame.isItOurTurn();
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
        premovePiece,
        allowPremoves,
        arePremovesEnabled,
        getPremoveCount,
        isPremove,
        getPieceAtCoords
    });

})();