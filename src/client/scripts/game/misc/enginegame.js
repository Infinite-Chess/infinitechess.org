
// This module keeps track of the data of the engine game we are currently in.

"use strict";

const enginegame = (function(){

    /** Whether we are currently in an engine game. */
    let inEngineGame = false
    let ourColor; // white/black
    let currentEngine; // name of the current engine used
    let currentEngineMove; // currently best move recommended by the engine

    const engineTimeLimitPerMoveMillis = 500; // hard time limit for the engine to think in milliseconds

    function areInEngineGame() { return inEngineGame }

    function getOurColor() { return ourColor }

    function getCurrentEngine() { return currentEngine }

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
     * Inits an engine game. In particular, it needs gameOptions in order to know what engine to use for this enginegame.
     * @param {Object} gameOptions - An object that contains the property `currentEngine`
     */
    function initEngineGame (gameOptions) {
        // This make sure it will place us in black's perspective if applicable
        perspective.resetRotations()

        currentEngine = gameOptions.currentEngine;
        currentEngineMove = undefined;
        if (!currentEngine) return console.error (`Attempting to start game with unknown engine: ${currentEngine}`);
        console.log(`Started engine game with engine ${currentEngine}`);
    }

    // Call when we leave an engine game
    function closeEngineGame() {
        inEngineGame = false;
        ourColor = undefined;
        currentEngine = undefined;
        currentEngineMove = undefined;
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
    async function submitMove() {
        if (!inEngineGame) return; // Don't do anything if it's not an engine game
        const gamefile = game.getGamefile();
        if (gamefile.gameConclusion) return; // Don't do anything if the game is over

        // Initialize the engine as a webworker
        if (!window.Worker) return console.error('Your browser doesn\'t support web workers.');
        let engineWorker = new Worker(`../scripts/game/chess/${currentEngine}.js`);
        currentEngineMove = undefined;
        engineWorker.onmessage = function(e) { 
            currentEngineMove = e.data;
            console.log(`Updated the engine recommended move to ${JSON.stringify(currentEngineMove)}`);
        };

        // Send the gamefile to the engine web worker
        engineWorker.postMessage(JSON.parse(JSON.stringify(gamefile)));

        // give the engine time to think
        await main.sleep(engineTimeLimitPerMoveMillis);

        // terminate the webworker and make the recommended engine move
        engineWorker.terminate();
        if (!currentEngineMove) return console.error("Engine failed to submit a move within the allocated time limit!");
        makeEngineMove(currentEngineMove);
    }

    /**
     * This method takes care of all the logic involved in making an engine move
     * It gets called after the engine finishes its calculation
     */
    function makeEngineMove(move) {
        if (!inEngineGame) return;
        if (!currentEngine) return console.error ("Attempting to make engine move, but no engine loaded!");
        
        const gamefile = game.getGamefile();
        const piecemoved = gamefileutility.getPieceAtCoords(gamefile, move.startCoords)
        const legalMoves = legalmoves.calculate(gamefile, piecemoved);
        const endCoordsToAppendSpecial = math.deepCopyObject(move.endCoords);
        legalmoves.checkIfMoveLegal(legalMoves, move.startCoords, endCoordsToAppendSpecial) // Passes on any special moves flags to the endCoords

        move.type = piecemoved.type;
        movepiece.makeMove(gamefile, move)

        selection.reselectPiece(); // Reselect the currently selected piece. Recalc its moves and recolor it if needed.

        if (gamefile.gameConclusion) gamefileutility.concludeGame(gamefile);
    }

    function onGameConclude() {
        if (!inEngineGame) return;
        checkmatepractice.onEngineGameConclude();
    }


    return Object.freeze({
        areInEngineGame,
        getOurColor,
        getCurrentEngine,
        setColorAndGameID,
        initEngineGame,
        closeEngineGame,
        isItOurTurn,
        areWeColor,
        submitMove,
        makeEngineMove,
        onGameConclude
    })

})();