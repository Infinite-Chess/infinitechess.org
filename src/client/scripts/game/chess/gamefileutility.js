
/*
 * This script contains many utility methods for working with gamefiles
 * and *should* (theoretically) have zero dependancies,
 * except for maybe the math script.
 */

"use strict";

const gamefileutility = (function() {

    /** The maximum number of pieces in-game to still use the checkmate algorithm. Above this uses "royalcapture". */
    const pieceCountToDisableCheckmate = 50_000;

    /**
     * Counts the number of pieces in the gamefile of a specific type. Adjusts for undefined placeholders.
     * @param {gamefile} gamefile - The gamefile.
     * @param {string} type - The type of piece to count (e.g. "pawnsW")
     * @returns {number} The number of pieces of this type in the gamefile
     */
    function getPieceCountOfType(gamefile, type) {
        const typeList = gamefile.ourPieces[type];
        if (typeList == null) return 0; // Unknown piece
        return typeList.length - typeList.undefineds.length;
    }

    // Iterates through EVERY piece in the game state, and performs specified function on the type.
    // Callback parameters should be: (type, coords, gamefile)
    // USE THIS instead of forEachPieceInTypeList() when you need the gamefile passed into the callback!
    function forEachPieceInGame(gamefile, callback, ignoreVoids) {
        if (!gamefile) return console.log("Cannot iterate through each piece in an undefined game!");
        if (!gamefile.ourPieces) return console.error("Cannot iterate through every piece of game when there's no piece list.");

        forEachPieceInPiecesByType(callback, gamefile.ourPieces, ignoreVoids, gamefile);
    }

    // Callback params should be:  type, coords, gamefile (optional)
    // USE THIS instead of forEachPieceInGame() when you don't need the gamefile passed into the callback!
    function forEachPieceInPiecesByType(callback, typeList, ignoreVoids, gamefile) { // typeList = pieces organized by type 
        if (!typeList) return console.log("Cannot iterate through each piece in an undefined typeList!");

        for (let i = 0; i < pieces.white.length; i++) {

            const thisWhiteType = pieces.white[i];
            const thisBlackType = pieces.black[i];

            const theseWhitePieces = typeList[thisWhiteType];
            const theseBlackPieces = typeList[thisBlackType];

            // First it inserts the type of piece into the callback, then coords of piece 
            if (theseWhitePieces) for (let a = 0; a < theseWhitePieces.length; a++) callback(thisWhiteType, theseWhitePieces[a], gamefile); 
            if (theseBlackPieces) for (let a = 0; a < theseBlackPieces.length; a++) callback(thisBlackType, theseBlackPieces[a], gamefile); 
        }
        for (let i = 0; i < pieces.neutral.length; i++) {

            const thisNeutralType = pieces.neutral[i];
            if (ignoreVoids && thisNeutralType.startsWith('voids')) continue;

            const theseNeutralPieces = typeList[thisNeutralType];

            // First it inserts the type of piece into the callback, then coords of piece 
            if (theseNeutralPieces) for (let a = 0; a < theseNeutralPieces.length; a++) callback(thisNeutralType, theseNeutralPieces[a], gamefile); 
        }
    }

    /**
     * Iterates through each piece in the provided keys-state and executes a callback function.
     * @param {Function} callback - The callback function to execute for each piece. The function will receive two arguments: the type of the piece and its coordinates.
     * @param {Object} state - The keys-state object containing pieces organized by key.
     * @param {Object} [options] - Optional settings.
     * @param {boolean} [options.ignoreNeutrals] - If true, neutral pieces (those with types ending in 'N') will be ignored.
     * @param {boolean} [options.ignoreVoids] - If true, void pieces (those with types starting with 'voids') will be ignored.
     */
    function forEachPieceInKeysState(callback, state, { ignoreNeutrals, ignoreVoids } = {}) { // state is pieces organized by key
        if (!state) return console.log("Cannot iterate through each piece in an undefined keys-state!");

        // Position with 372K pieces takes 80ms to key,
        // WHETHER that's using Object.keys(), or the time until the first iteration of "for (let key in state)"

        if (ignoreNeutrals) {
            for (const key in state) {
                const thisPieceType = state[key];
                if (thisPieceType.endsWith('N')) continue;
                // First it inserts the type of piece into the callback, then coords of piece 
                callback(thisPieceType, math.getCoordsFromKey(key)); 
            }
        }
        if (ignoreVoids) {
            for (const key in state) {
                const thisPieceType = state[key];
                if (thisPieceType.startsWith('voids')) continue;
                // First it inserts the type of piece into the callback, then coords of piece 
                callback(thisPieceType, math.getCoordsFromKey(key)); 
            }
        } else {
            for (const key in state) {
                const thisPieceType = state[key];
                // First it inserts the type of piece into the callback, then coords of piece 
                callback(thisPieceType, math.getCoordsFromKey(key)); 
            }
        }
    }

    /**
     * Deletes the index from the provided piece list and updates its `undefineds` property.
     * No deleting a piece ever changes the size of this list, because the index becomes *undefined*,
     * this is so that the mesh doesn't get screwed up.
     * @param {coord[][]} list - The list of pieces of a specific type.
     * @param {number} pieceIndex - The index to delete
     */
    function deleteIndexFromPieceList(list, pieceIndex) {
        list[pieceIndex] = undefined;
        // Keep track of where the undefined indices are! Have an "undefineds" array property.
        const insertIndex = math.binarySearch_findSplitPoint(list.undefineds, pieceIndex);
        list.undefineds.splice(insertIndex, 0, pieceIndex);
    }

    /**
     * Returns the specified piece's index in its type-array in the `ourPieces` property of the gamefile.
     * @param {gamefile} gamefile - The gamefile
     * @param {string} type - The type of the piece
     * @param {number[]} coords - The coordinates of the piece
     * @returns {number} The index of the piece
     */
    function getPieceIndexByTypeAndCoords(gamefile, type, coords) {
        const thesePieces = gamefile.ourPieces[type];
        if (!thesePieces) return console.error("Cannot find piece index. Type array doesn't exist."); // Break if there are none of those piece ty
        for (let i = 0; i < thesePieces.length; i++) {
            const thisPieceCoords = thesePieces[i];
            // Piece is undefined. Deleted pieces are left as "undefined" so others keep their indexes!
            if (!thisPieceCoords) continue;

            // Does this piece match the coords? If so, return the piece index.
            if (math.areCoordsEqual_noValidate(thisPieceCoords, coords)) return i;
        }
        console.error("Unable to find index of piece!");
    }

    /**
     * Returns the piece at the specified coords.
     * @param {gamefile} gamefile - The gamefile
     * @param {string} type - The type of the piece
     * @param {number[]} coords - The coordinates of the piece
     * @returns {Piece} The piece object
     */
    function getPieceFromTypeAndCoords(gamefile, type, coords) {
        const index = getPieceIndexByTypeAndCoords(gamefile, type, coords);
        return { type, coords, index };
    }

    /**
     * Returns the type of piece at the specified coords, otherwise undefined.
     * @param {gamefile} gamefile - The gamefile
     * @param {number[]} coords - The coordinates to test for a piece
     * @returns {string | undefined} The type of the piece, if there is one, otherwise undefined
     */
    function getPieceTypeAtCoords(gamefile, coords) {
        const key = math.getKeyFromCoords(coords);
        return gamefile.piecesOrganizedByKey[key];
    }

    /**
     * Returns the piece at the indicated coordinates, if there is one.
     * @param {gamefile} gamefile - The gamefile
     * @param {number[]} coords - The coordinates to retreive the piece at
     * @returns {Piece | undefined} The piece, or *undefined* if there isn't one: `{ type, index, coords }`
     */
    function getPieceAtCoords(gamefile, coords) {
        const type = getPieceTypeAtCoords(gamefile, coords);
        if (!type) return undefined;
        const index = getPieceIndexByTypeAndCoords(gamefile, type, coords);
        return { type, index, coords };
    }

    /**
     * Tests if the game is over by the used win condition, and if so, ends it.
     * @param {gamefile} gamefile - The gamefile
     * @param {Object} An object containing various properties:
     * - `concludeGameIfOver`: If true, we will not stop the clocks, darken the board, display who won, or play a sound effect. Default: *true*. `simulated` MUST ALSO BE FALSE.
     * - `simulated`: Whether you plan on undo'ing this move. We don't conclude the game. Default: *false*
     */
    function updateGameConclusion(gamefile, { concludeGameIfOver = true, simulated = false } = {}) {
        gamefile.gameConclusion = wincondition.getGameConclusion(gamefile);
        if (!simulated && concludeGameIfOver && gamefile.gameConclusion && !onlinegame.areInOnlineGame()) concludeGame(gamefile);
    }

    /**
     * Ends the game. Call this when the game is over by the used win condition.
     * Stops the clocks, darkens the board, displays who won, plays a sound effect.
     * @param {gamefile} gamefile - The gamefile
     * @param {string} [conclusion] - Optional. The conclusion string. For example, "white checkmate".
     * @param {Object} options - An object that may contain the following properties (all are default TRUE):
     * - `requestRemovalFromActiveGames`: Whether to request the server to remove us from the player-in-active-games list, to allow us to join a new game.
     */
    function concludeGame(gamefile, conclusion = gamefile.gameConclusion, { requestRemovalFromActiveGames = true } = {}) {
        gamefile.gameConclusion = conclusion;
        if (requestRemovalFromActiveGames) onlinegame.requestRemovalFromPlayersInActiveGames();
        if (wincondition.isGameConclusionDecisive(gamefile.gameConclusion)) movesscript.flagLastMoveAsMate(gamefile);
        clock.stop();
        board.darkenColor();
        guigameinfo.gameEnd(gamefile.gameConclusion);
        onlinegame.onGameConclude();

        const delayToPlayConcludeSoundSecs = 0.65;
        if (!onlinegame.areInOnlineGame()) {
            if (!gamefile.gameConclusion.includes('draw')) sound.playSound_win(delayToPlayConcludeSoundSecs);
            else sound.playSound_draw(delayToPlayConcludeSoundSecs);
        } else { // In online game
            if (gamefile.gameConclusion.includes(onlinegame.getOurColor())) sound.playSound_win(delayToPlayConcludeSoundSecs);
            else if (gamefile.gameConclusion.includes('draw') || gamefile.gameConclusion.includes('aborted')) sound.playSound_draw(delayToPlayConcludeSoundSecs);
            else sound.playSound_loss(delayToPlayConcludeSoundSecs);
        }

        // Set the Result and Condition metadata
        setTerminationMetadata(gamefile);

        selection.unselectPiece();
        guipause.changeTextOfMainMenuButton();
    }

    /**
     * Returns true if the game is over (gameConclusion is truthy).
     * If the game is over, it will be a string. If not, it will be false.
     * @param {gamefile} gamefile - The gamefile. If not specified, this is game.getGamefile()
     * @returns {boolean} true if over
     */
    function isGameOver(gamefile = game.getGamefile()) {
        if (gamefile.gameConclusion) return true;
        return false;
    }

    /**
     * Sets the `Termination` and `Result` metadata of the gamefile, according to the game conclusion.
     * @param {gamefile} gamefile - The gamefile
     */
    function setTerminationMetadata(gamefile) {
        if (!gamefile.gameConclusion) return console.error("Cannot set conclusion metadata when game isn't over yet.");

        const victorAndCondition = wincondition.getVictorAndConditionFromGameConclusion(gamefile.gameConclusion);
        const condition = wincondition.getTerminationInEnglish(gamefile, victorAndCondition.condition);
        gamefile.metadata.Termination = condition;
    
        const victor = victorAndCondition.victor; // white/black/draw/undefined
        gamefile.metadata.Result = victor === 'white' ? '1-0'
            : victor === 'black' ? '0-1'
                : victor === 'draw' ? '1/2-1/2'
                    : '0-0'; // Aborted
    }

    // Returns a list of all the jumping royal it comes across of a specific color.
    function getJumpingRoyalCoords(gamefile, color) {
        const state = gamefile.ourPieces;
        const jumpingRoyals = pieces.jumpingRoyals;

        const royalCoordsList = []; // A running list of all the jumping royals of this color

        if (color === 'white') {
            for (let i = 0; i < jumpingRoyals.length; i++) {
                const thisRoyalType = jumpingRoyals[i] + 'W';
                if (!state[thisRoyalType]) return console.error(`Cannot fetch jumping royal coords when list ${thisRoyalType} is undefined!`);
                state[thisRoyalType].forEach(coords => { // [x,y]
                    if (!coords) return;
                    royalCoordsList.push(coords);
                });
            }
        } else if (color === 'black') {
            for (let i = 0; i < jumpingRoyals.length; i++) {
                const thisRoyalType = jumpingRoyals[i] + 'B';
                if (!state[thisRoyalType]) return console.error(`Cannot fetch jumping royal coords when list ${thisRoyalType} is undefined!`);
                state[thisRoyalType].forEach(coords => { // [x,y]
                    if (!coords) return;
                    royalCoordsList.push(coords);
                });
            }
        } else console.error(`Cannot get jumping royal coords from a side with color ${color}!`);

        return royalCoordsList;
    }

    // Accepts an array list of pieces to count up from a specific color.
    // Returns the total counted amount.
    // IGNORES UNDEFINEDS
    function getCountOfTypesFromPiecesByType(piecesByType, arrayOfPieces, color) { // arrayOfPieces = ['kings', 'royalCentaurs', ...]
        const WorB = math.getWorBFromColor(color);

        let count = 0;
        for (let i = 0; i < arrayOfPieces.length; i++) {
            const thisType = arrayOfPieces[i] + WorB;

            if (!piecesByType[thisType]) return console.error(`Cannot fetch royal count of type ${thisType} when the list is undefined!`);
            
            let length = piecesByType[thisType].length;
            if (piecesByType[thisType].undefineds) length -= piecesByType[thisType].undefineds.length;

            count += length;
        }

        return count;
    }

    function getCoordsOfAllPieces(gamefile) {

        const allCoords = [];

        forEachPieceInPiecesByType(callback, gamefile.ourPieces);

        function callback(type, coords) {
            if (coords) allCoords.push(coords); // Only push coords if it's defined
        }

        return allCoords;
    }

    function getCoordsOfAllPiecesByKey(piecesByKey) {
        const allCoords = [];

        forEachPieceInKeysState(callback, piecesByKey);
        function callback(type, coords) {
            allCoords.push(coords);
        }

        return allCoords;
    }

    // Calculates and returns the amount of pieces in the pieces by type list, including undefineds!
    // Time complexity: O(1)
    function getPieceCount(piecesByType) {
        let pieceCount = 0;

        pieces.forEachPieceType(appendCount);

        function appendCount(type) {
            pieceCount += piecesByType[type].length;
        }

        return pieceCount;
    }

    function getPieceCountOfColorFromPiecesByType(piecesByType, color) {
        let pieceCount = 0;

        pieces.forEachPieceTypeOfColor(color, appendCount);

        function appendCount(type) {
            const thisTypeList = piecesByType[type];

            for (let i = 0; i < thisTypeList.length; i++) {
                const thisPiece = thisTypeList[i];
                if (thisPiece) pieceCount++; // Only increment piece count if its not an undefined placeholder
            }
        }

        return pieceCount;
    }

    /**
     * Counts the number of pieces in the gamefile. Adjusts for undefined placeholders.
     * 
     * @param {Object} gamefile - The gamefile object containing piece data.
     * @param {Object} [options] - Optional settings.
     * @param {boolean} [options.ignoreVoids] - Whether to ignore void pieces.
     * @param {boolean} [options.ignoreObstacles] - Whether to ignore obstacle pieces.
     * @returns {number} The number of pieces in the gamefile.
     */
    // Returns piece count of game, excluding undefineds.
    function getPieceCountOfGame(gamefile, { ignoreVoids, ignoreObstacles } = {}) {
        if (!gamefile.ourPieces) return console.error("Cannot count pieces, ourPieces is not defined");

        let count = 0;
        for (const key in gamefile.ourPieces) {
            if (ignoreVoids && key === 'voidsN') continue;
            if (ignoreObstacles && key === 'obstaclesN') continue;

            const typeList = gamefile.ourPieces[key];
            count += typeList.length;
            if (typeList.undefineds) count -= typeList.undefineds.length;
        }
        return count;
    }

    /**
     * Calculates the piece's index position among EVERY piece in the game.
     * Used to calculate its index within in the mesh vertex data.
     * IGNORES VOIDS.
     * @param {gamefile} gamefile - The gamefile
     * @param {Object} piece - The piece: `{ type, index }`
     * @returns {number} The index of the piece
     */
    function calcPieceIndexInAllPieces(gamefile, piece) {
        const type = piece.type;
        const pieceIndex = piece.index;

        let index = 0;
        let foundPiece = false;

        // We need to use the same iteration function that our regenPiecesModel() uses!
        pieces.forEachPieceType(iterate);

        function iterate(listType) {
            if (foundPiece) return;

            if (listType.startsWith('voids')) return; // SKIP Voids!

            const list = gamefile.ourPieces[listType];

            if (listType === type) { // Same list our piece is in!
                index += pieceIndex;
                foundPiece = true;
                return;
            } else { // Our piece isnt in this list
                index += list.length;
            }
        }

        if (foundPiece) return index;

        return console.error(`Could not find piece type ${piece.type} with index ${piece.index} when calculating its index in all the pieces!`);
    }

    // Returns an array containing the coordinates of ALL royal pieces of specified color.
    function getRoyalCoords(gamefile, color) {
        const royals = pieces.royals; // ['kings', ...]
        const WorB = math.getWorBFromColor(color);

        const piecesByType = gamefile.ourPieces;
        const royalCoords = [];

        for (let i = 0; i < royals.length; i++) {
            const thisRoyalType = royals[i] + WorB;
            const thisTypeList = piecesByType[thisRoyalType];
            if (!thisTypeList) return console.error(`Cannot fetch royal coords of type ${thisRoyalType} when the list is undefined!`);
            
            for (let a = 0; a < thisTypeList.length; a++) {
                const thisPieceCoords = thisTypeList[a]; // [x,y]
                if (thisPieceCoords) royalCoords.push(thisPieceCoords); // Only add if it's not an undefined placeholder
            }
        }

        return royalCoords;
    }

    /**
	 * Returns an number of the royal pieces a side has
	 * @param {gamefile.piecesOrganizedByKey} piecesByKey - Pieces organized by key: `{ '1,2':'queensW', '2,3':'queensW' }`
	 * @param {string} color - `white` | `black` | `neutral` a string that represents the color of pieces the function will return
	 * @returns {number} the count of the royal pieces of color `color`
	 */
    function getRoyalCountOfColor(piecesByKey, color) {
        const royals = pieces.royals; // ['kings', ...]
        const WorB = math.getWorBFromColor(color);

        let royalCount = 0;
        for (const key in piecesByKey) {
            const type = piecesByKey[key];
            const thisColor = math.getPieceColorFromType(type);
            if (!thisColor.endsWith(WorB)) return; // Different color
            const strippedType = math.trimWorBFromType(type);
            if (!royals.includes(strippedType)) continue; // Not royalty
            royalCount++;
        }
        return royalCount;
    }

    /**
     * 
     * @param {gamefile} gamefile - The gamefile
     * @param {number} moveIndex - The move index we want to get whos turn it was then.
     * @returns {string} 'white' / 'black'
     */
    function getWhosTurnAtMoveIndex(gamefile, moveIndex) {
        let mod2 = Math.abs(moveIndex % 2);
        if (gamefile.startSnapshot.turn === 'black') mod2++;
        return mod2 === 1 ? 'white' : 'black';
    }

    return Object.freeze({
        pieceCountToDisableCheckmate,
        getPieceCountOfType,
        forEachPieceInGame,
        forEachPieceInPiecesByType,
        forEachPieceInKeysState,
        deleteIndexFromPieceList,
        getPieceIndexByTypeAndCoords,
        getPieceTypeAtCoords,
        getPieceAtCoords,
        getPieceFromTypeAndCoords,
        updateGameConclusion,
        concludeGame,
        getJumpingRoyalCoords,
        getCountOfTypesFromPiecesByType,
        getCoordsOfAllPieces,
        getCoordsOfAllPiecesByKey,
        getPieceCount,
        getPieceCountOfColorFromPiecesByType,
        calcPieceIndexInAllPieces,
        getRoyalCoords,
        getRoyalCountOfColor,
        getPieceCountOfGame,
        getWhosTurnAtMoveIndex,
        isGameOver,
    });

})();