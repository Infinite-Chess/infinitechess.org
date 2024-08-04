
// This module keeps track of the data of the engine game we are currently in.

"use strict";

const enginegame = (function(){

    /** Whether we are currently in an engine game. */
    let inEngineGame = false
    let ourColor; // white/black

    const engineTimeLimitPerMoveMillis = 1000;

    function areInEngineGame() { return inEngineGame }

    function getOurColor() { return ourColor }

    /**
     * This has to be called before and separate from {@link initEngineGame}
     * because loading the gamefile and the mesh generation requires this script to know our color.
     * @param {string} color - The color we are in this engine game
     */
    function setColorAndGameID(gameOptions) {
        inEngineGame = true
        ourColor = gameOptions.youAreColor;
    }

    /**
     * Inits an engine game
     */
    function initEngineGame () {
        // This make sure it will place us in black's perspective if applicable
        perspective.resetRotations()
    }

    // Call when we leave an engine game
    function closeEngineGame() {
        inEngineGame = false;
        ourColor = undefined;
        perspective.resetRotations() // Without this, leaving an engine game of which we were black, won't reset our rotation.
    }

    /**
     * Tests if it's our turn to move
     * @returns {boolean} *true* if it's currently our turn to move
     */
    function isItOurTurn() { return game.getGamefile().whosTurn === ourColor }

    /**
     * Tests if we are this color in the engine game.
     * @param {string} color - "white" / "black"
     * @returns {boolean} *true* if we are that color.
     */
    function areWeColor(color) { return color === ourColor; }

    /**
     * This method is called externally when the player submits his move in an engine game
     */
    function submitMove() {
        if (!inEngineGame) return; // Don't do anything if it's not an engine game
        if (game.getGamefile().gameConclusion) return; // Don't do anything if the game is over

        // Let the engine take over now
        makeEngineMove();
    }

    /**
     * This method takes care of all the logic involved in making an engine move
     * It is async because it needs to wait for the engine to finish its calculation
     */
    async function makeEngineMove() {
        if (!inEngineGame) return;
        
        const gamefile = game.getGamefile();
        const move = await engine.runEngine(gamefile);

        const piecemoved = gamefileutility.getPieceAtCoords(gamefile, move.startCoords)
        const legalMoves = legalmoves.calculate(gamefile, piecemoved);
        const endCoordsToAppendSpecial = math.deepCopyObject(move.endCoords);
        legalmoves.checkIfMoveLegal(legalMoves, move.startCoords, endCoordsToAppendSpecial) // Passes on any special moves flags to the endCoords

        move.type = piecemoved.type;
        specialdetect.transferSpecialFlags_FromCoordsToMove(endCoordsToAppendSpecial, move)
        movepiece.makeMove(gamefile, move)

        selection.reselectPiece(); // Reselect the currently selected piece. Recalc its moves and recolor it if needed.

        if (gamefile.gameConclusion) gamefileutility.concludeGame(gamefile);
    }


    return Object.freeze({
        areInEngineGame,
        getOurColor,
        setColorAndGameID,
        initEngineGame,
        closeEngineGame,
        isItOurTurn,
        areWeColor,
        submitMove,
        makeEngineMove
    })

})();