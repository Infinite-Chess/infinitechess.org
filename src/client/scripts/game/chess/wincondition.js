
/*
 * This script contains the methods for calculating if the
 * game is over by the win condition used, for all win
 * conditions except for checkmate, stalemate, and repetition.
 */

"use strict";

// Module
const wincondition = (function() {

    /** Valid win conditions in the gamerules. */
    const validWinConditions = ['checkmate','royalcapture','allroyalscaptured','allpiecescaptured','threecheck','koth'];
    
    /**
     * List of all win conditions that happen after a move being made.
     * This excludes conclusions such as resignation, time, aborted, disconnect, and agreement.
     * which can happen at any point in time.
     */
    const decisiveGameConclusions = [...validWinConditions, 'stalemate', 'repetition', 'moverule', 'insuffmat'];

    // The squares in KOTH where if you get your king to you WIN
    const kothCenterSquares = [[4,4],[5,4],[4,5],[5,5]];

    /**
     * Tests if the game is over by the win condition used, and if so,
     * returns the `gameConclusion` property of the gamefile.
     * For example, "white checkmate", or "draw stalemate".
     * @param {gamefile} gamefile - The gamefile
     * @returns {string | false} The conclusion string, if the game is over. For example, "white checkmate", or "draw stalemate". If the game isn't over, this returns *false*.
     */
    function getGameConclusion(gamefile) {
        return detectAllpiecescaptured(gamefile)
            || detectRoyalCapture(gamefile)
            || detectAllroyalscaptured(gamefile)
            || detectThreecheck(gamefile)
            || detectKoth(gamefile)
            || checkmate.detectCheckmateOrDraw(gamefile) // Also checks for repetition draw!
            // This needs to be last so that a draw isn't enforced in a true win
            || detectMoveRule(gamefile) // 50-move-rule
			|| insufficientmaterial.detectInsufficientMaterial(gamefile) // checks for insufficient material
            || false; // No win condition passed. No game conclusion!
    }

    function detectRoyalCapture(gamefile) {
        if (!isOpponentUsingWinCondition(gamefile, 'royalcapture')) return false; // Not using this gamerule

        // Was the last move capturing a royal piece?
        if (wasLastMoveARoyalCapture(gamefile)) {
            const colorThatWon = movesscript.getColorThatPlayedMoveIndex(gamefile, gamefile.moves.length - 1);
            return `${colorThatWon} royalcapture`;
        }

        return false;
    }

    function detectAllroyalscaptured(gamefile) {
        if (!isOpponentUsingWinCondition(gamefile, 'allroyalscaptured')) return false; // Not using this gamerule
        if (!wasLastMoveARoyalCapture(gamefile)) return false; // Last move wasn't a royal capture.

        // Are there any royal pieces remaining?
        // Remember that whosTurn has already been flipped since the last move.
        const royalCount = gamefileutility.getCountOfTypesFromPiecesByType(gamefile.ourPieces, pieces.royals, gamefile.whosTurn);

        if (royalCount === 0) {
            const colorThatWon = movesscript.getColorThatPlayedMoveIndex(gamefile, gamefile.moves.length - 1);
            return `${colorThatWon} allroyalscaptured`;
        }

        return false;
    }

    function detectAllpiecescaptured(gamefile) {
        if (!isOpponentUsingWinCondition(gamefile, 'allpiecescaptured')) return false; // Not using this gamerule

        // If the player who's turn it is now has zero pieces left, win!
        const count = gamefileutility.getPieceCountOfColorFromPiecesByType(gamefile.ourPieces, gamefile.whosTurn);

        if (count === 0) {
            const colorThatWon = movesscript.getColorThatPlayedMoveIndex(gamefile, gamefile.moves.length - 1);
            return `${colorThatWon} allpiecescaptured`;
        }

        return false;
    }

    function detectThreecheck(gamefile) {
        if (!isOpponentUsingWinCondition(gamefile, 'threecheck')) return false; // Not using this gamerule

        // Was the last move a check?
        if (gamefile.inCheck) {
            if (gamefile.checksGiven == null) gamefile.checksGiven = { white: 0, black: 0 };
            
            if (gamefile.whosTurn === 'white') gamefile.checksGiven.white++;
            else if (gamefile.whosTurn === 'black') gamefile.checksGiven.black++;
            else throw new Error(`Whosturn is invalid when detecting threecheck! Value ${gamefile.whosTurn}`);

            if (gamefile.checksGiven[gamefile.whosTurn] === 3) {
                if (gamefile.whosTurn === 'white') return 'black threecheck';
                else if (gamefile.whosTurn === 'black') return 'white threecheck';
                else throw new Error("Cannot determine winning color by wincondition threecheck!");
            }
        }

        return false;
    }

    function detectKoth(gamefile) {
        if (!isOpponentUsingWinCondition(gamefile, 'koth')) return false; // Not using this gamerule

        // Was the last move a king move?
        const lastMove = movesscript.getLastMove(gamefile.moves);
        if (!lastMove) return false;
        if (!lastMove.type.startsWith('kings')) return false;

        let kingInCenter = false;
        for (let i = 0; i < kothCenterSquares.length; i++) {
            const thisCenterSquare = kothCenterSquares[i];

            const typeAtSquare = gamefileutility.getPieceTypeAtCoords(gamefile, thisCenterSquare);
            if (!typeAtSquare) continue;
            if (typeAtSquare.startsWith('kings')) {
                kingInCenter = true;
                break;
            }
        }

        if (kingInCenter) {
            const colorThatWon = movesscript.getColorThatPlayedMoveIndex(gamefile, gamefile.moves.length - 1);
            return `${colorThatWon} koth`;
        }

        return false;
    }

    /**
     * Detects if the game is over by, for example, the 50-move rule.
     * @param {gamefile} gamefile - The gamefile
     * @returns {string | false} 'draw moverule', if the game is over by the move-rule, otherwise *false*.
     */
    function detectMoveRule(gamefile) {
        if (!gamefile.gameRules.moveRule) return false; // No move-rule being used
        if (gamefile.moveRuleState === gamefile.gameRules.moveRule) return 'draw moverule';
        return false;
    }

    /**
     * Tests if the player who JUST played a move can win from the specified win condition.
     * @param {gamefile} gamefile - The gamefile containing game data.
     * @param {string} winCondition - The win condition to check against.
     * @returns {boolean} True if the opponent can win from the specified win condition, otherwise false.
     */
    function isOpponentUsingWinCondition(gamefile, winCondition) {
        const oppositeColor = math.getOppositeColor(gamefile.whosTurn);
        return gamefile.gameRules.winConditions[oppositeColor].includes(winCondition);
    }

    /**
     * Checks if a specified color has a given win condition.
     * @param {gamefile} gamefile - The gamefile.
     * @param {string} color - The color to check (e.g., 'white', 'black').
     * @param {string} winCondition - The win condition for.
     * @returns {boolean} True if the specified color has the given win condition, otherwise false.
     */
    function doesColorHaveWinCondition(gamefile, color, winCondition) {
        return gamefile.gameRules.winConditions[color].includes(winCondition);
    }

    /**
     * Gets the count of win conditions for a specified color in the gamefile.
     * @param {gamefile} gamefile - The gamefile.
     * @param {string} color - The color to check (e.g., 'white', 'black').
     * @returns {number} The number of win conditions for the specified color. Returns 0 if the color is not defined.
     */
    function getWinConditionCountOfColor(gamefile, color) {
        if (gamefile.gameRules.winConditions[color] == null) return 0; // Color not defined.
        return gamefile.gameRules.winConditions[color].length;
    }

    // Returns true if the very last move captured a royal piece.
    function wasLastMoveARoyalCapture(gamefile) {
        const lastMove = movesscript.getLastMove(gamefile.moves);
        if (!lastMove) return false;

        if (!lastMove.captured) return false; // Last move not a capture

        const trimmedTypeCaptured = math.trimWorBFromType(lastMove.captured);

        // Does the piece type captured equal any royal piece?
        return pieces.royals.includes(trimmedTypeCaptured);
    }

    /**
     * Calculates if the provided game conclusion is a decisive conclusion.
     * This is any conclusion that can happen after a move is made.
     * Excludes conclusions like resignation, time, aborted, disconnect, and agreement.
     * which can happen at any point in time.
     * @param {string} gameConclusion - The gameConclusion
     * @returns {boolean} *true* if the gameConclusion is decisive.
     */
    function isGameConclusionDecisive(gameConclusion) {
        if (gameConclusion === false) throw new Error("Should not be checking if gameConclusion is decisive when game isn't over.");
        for (const conclusion of decisiveGameConclusions) {
            if (gameConclusion.includes(conclusion)) return true;
        }
        return false;
    }

    /**
     * Calculates the victor and condition properties from the specified game conclusion.
     * For example, "white checkmate" => `{ victor: 'white', condition: 'checkmate' }`.
     * If the game was aborted, victor will be undefined.
     * @param {string} gameConclusion - The gameConclusion of the gamefile. Examples: 'white checkmate' / 'draw stalemate'  
     * @returns {Object} An object containing 2 properties: `victor` and `condition`
     */
    function getVictorAndConditionFromGameConclusion(gameConclusion) {
        let [victor, condition] = gameConclusion.split(' ');
        if (victor === 'aborted') { // If the conclusion is "aborted", then the victor isn't specified.
            condition = victor;
            victor = undefined;
        }
        return { victor, condition };
    }

    /**
	 * Returns the game result based on the victor.
	 *
	 * @param {string} victor - The victor of the game. Can be 'white', 'black', 'draw', or 'aborted'.
	 * @returns {string} The result of the game in the format '1-0', '0-1', '0.5-0.5', or '0-0'.
	 * @throws {Error} Throws an error if the victor is not recognized.
	 */
    function getResultFromVictor(victor) {
	    if (victor === 'white') return '1-0';
	    else if (victor === 'black') return '0-1';
	    else if (victor === 'draw') return '0.5-0.5';
	    else if (victor === 'aborted') return '0-0';
	    throw new Error(`Cannot get game result from strange victor "${victor}"!`);
    }

    /**
     * If the game is multiplayer, or if anyone gets multiple turns in a row, then that allows capturing
     * of the kings no matter the win conditions, by way of one person opening a discovered on turn 1, and
     * another person capturing the king on turn 2 => CHECKMATE NOT COMPATIBLE!
     * 
     * Checkmate is also not compatible with games with colinear lines present, because the logic surrounding
     * making opening discovered attacks illegal is a nightmare.
     * @param {gamefile} gamefile
     * @returns {boolean} true if the gamefile is checkmate compatible
     */
    function isCheckmateCompatibleWithGame(gamefile) {
        if (gamefile.startSnapshot.pieceCount >= gamefileutility.pieceCountToDisableCheckmate) return false; // Too many pieces (checkmate algorithm takes too long)
        if (organizedlines.areColinearSlidesPresentInGame(gamefile)) return false; // Logic surrounding making opening discovered attacks illegal is a nightmare.
        if (gamefile.startSnapshot.playerCount > 2) return false; // 3+ Players allows for 1 player to open a discovered and a 2nd to capture a king. CHECKMATE NOT COMPATIBLE
        if (movesscript.doesAnyPlayerGet2TurnsInARow(gamefile)) return false; // This also allows the capture of the king.
        return true; // Checkmate compatible!
    }
    
    /**
     * Swaps the "checkmate" win condition for "royalcapture" in the gamefile if applicable.
     *
     * @param {gamefile} gamefile - The gamefile containing game data.
     */
    function swapCheckmateForRoyalCapture(gamefile) {
        // Check if the game is using the "royalcapture" win condition
        if (doesColorHaveWinCondition(gamefile, 'white', 'checkmate')) {
            math.removeObjectFromArray(gamefile.gameRules.winConditions.white, 'checkmate');
            gamefile.gameRules.winConditions.white.push('royalcapture');
        }
        if (doesColorHaveWinCondition(gamefile, 'black', 'checkmate')) {
            math.removeObjectFromArray(gamefile.gameRules.winConditions.black, 'checkmate');
            gamefile.gameRules.winConditions.black.push('royalcapture');
        }
        console.log("Swapped checkmate wincondition for royalcapture.");
    }

    /**
     * Returns the termination of the game in english language.
     * @param {gamefile} gamefile
     * @param {string} condition - The 2nd half of the gameConclusion: checkmate/stalemate/repetition/moverule/insuffmat/allpiecescaptured/royalcapture/allroyalscaptured/resignation/time/aborted/disconnect
     */
    function getTerminationInEnglish(gamefile, condition) {
        // Modify these values in translation/en-US.toml
        switch (condition) {
            case "checkmate":
                return translations.termination.checkmate;
            case "stalemate":
                return translations.termination.stalemate;
            case "repetition":
                return translations.termination.repetition;
            case "moverule": { // Contain this case in a block so that it's variables are not hoisted 
                const numbWholeMovesUntilAutoDraw = gamefile.gameRules.moveRule / 2;
                return `${translations.termination.moverule[0]}${numbWholeMovesUntilAutoDraw}${translations.termination.moverule[1]}`;
            } case "insuffmat":
                return translations.termination.insuffmat;
            case "royalcapture":
                return translations.termination.royalcapture;
            case "allroyalscaptured":
                return translations.termination.allroyalscaptured;
            case "allpiecescaptured":
                return translations.termination.allpiecescaptured;
            case "threecheck":
                return translations.termination.threecheck;
            case "koth":
                return translations.termination.koth;
            // Non-decisive "decisive" conclusions
            case "resignation":
                return translations.termination.resignation;
            case "time":
                return translations.termination.time;
            case "aborted": // Happens within the first 2 moves
                return translations.termination.aborted;
            case "disconnect": // Happens when a player leaves
                return translations.termination.disconnect;
            case "agreement": // Draw by agreement
                return translations.termination.agreement;
            default:
                console.error(`Cannot return English termination for unknown condition "${condition}"!`);
                return 'Unknown';
        }
    }

    return Object.freeze({
        validWinConditions,
        getGameConclusion,
        detectThreecheck,
        isOpponentUsingWinCondition,
        doesColorHaveWinCondition,
        getWinConditionCountOfColor,
        isGameConclusionDecisive,
        getVictorAndConditionFromGameConclusion,
	    getResultFromVictor,
        isCheckmateCompatibleWithGame,
        swapCheckmateForRoyalCapture,
        getTerminationInEnglish,
    });

})();
