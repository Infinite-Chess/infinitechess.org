//Records premoves made by the player and submits them to the server

"use strinct";

const premove = (function(){

    let premovesEnabled = true; //alows the user to make premoves.

    function allowPremoves(value) {
        premovesEnabled = value;
    }

    function arePremovesEnabled() {
        return premovesEnabled;
    }

    /** @type {Move[]} */
    let premoves = [];

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


        if(!premoves.length || !premovesEnabled)
            return; //The user has not made a premove.
        let premove = premoves.shift();
        
        //check if the premove is legal
        let gamefile = game.getGamefile();
        let piece = gamefileutility.getPieceAtCoords(gamefile, premove.startCoords);
        let legalMoves = legalmoves.calculate(gamefile, piece);
        let premoveLegal = legalmoves.checkIfMoveLegal(legalMoves, premove.startCoords, premove.endCoords);
        
        if(!premoveLegal)
        {
            //If this premove was innvalid all subsequent premoves are also invalid.
            premoves = [];
            return;
        }
        movepiece.makeMove(game.getGamefile(), premove)
        onlinegame.sendMove();
    }

    function makePremove(move) {
        if(!premovesEnabled)
            return;
        if (main.devBuild) console.log("A premove was made.");
        premoves.push(move);
    }

    function getPremoveCount()
    {
        return premovesEnabled? premoves.length : 0;
    }
    return Object.freeze({
        makePremove,
        submitPremove,
        arePremovesEnabled
    });
})();