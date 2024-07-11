
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
     * This excludes conclusions such as resignation, time, aborted, and disconnect,
     * which can happen at any point in time.
     */
    const decisiveGameConclusions = [...validWinConditions, 'stalemate', 'repetition', 'moverule', 'insuffmat']

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

            || checkdetection.detectCheckmateOrDraw(gamefile) // Also checks for repetition draw!
            // This needs to be last so that a draw isn't enforced in a true win
            || detectMoveRule(gamefile) // 50-move-rule
			|| insufficientmaterial.detectInsufficientMaterial(gamefile) // checks for insufficient material
            || false; // No win condition passed. No game conclusion!
    }

    function detectRoyalCapture(gamefile) {
        if (!isOpponentUsingWinCondition(gamefile, 'royalcapture')) return false; // Not using this gamerule

        // Was the last move capturing a royal piece?
        if (wasLastMoveARoyalCapture(gamefile)) {
            if      (gamefile.whosTurn === 'white') return 'black royalcapture'
            else if (gamefile.whosTurn === 'black') return 'white royalcapture'
            else throw new Error("Cannot determine winning color by wincondition royalcapture!")
        }

        return false;
    }

    function detectAllroyalscaptured(gamefile) {
        if (!isOpponentUsingWinCondition(gamefile, 'allroyalscaptured')) return false; // Not using this gamerule
        if (!wasLastMoveARoyalCapture(gamefile)) return false; // Last move wasn't a royal capture.

        // Are there any royal pieces remaining?
        // Remember that whosTurn has already been flipped since the last move.
        const royalCount = gamefileutility.getCountOfTypesFromPiecesByType(gamefile.ourPieces, pieces.royals, gamefile.whosTurn)

        if (royalCount === 0) {
            if      (gamefile.whosTurn === 'white') return 'black allroyalscaptured'
            else if (gamefile.whosTurn === 'black') return 'white allroyalscaptured'
            else throw new Error("Cannot determine winning color by wincondition allroyalscaptured!")
        }

        return false;
    }

    function detectAllpiecescaptured(gamefile) {
        if (!isOpponentUsingWinCondition(gamefile, 'allpiecescaptured')) return false; // Not using this gamerule

        // If the player who's turn it is now has zero pieces left, win!
        const count = gamefileutility.getPieceCountOfColorFromPiecesByType(gamefile.ourPieces, gamefile.whosTurn)

        if (count === 0) {
            if      (gamefile.whosTurn === 'white') return 'black allpiecescaptured'
            else if (gamefile.whosTurn === 'black') return 'white allpiecescaptured'
            else throw new Error("Cannot determine winning color by wincondition allpiecescaptured!")
        }

        return false;
    }

    function detectThreecheck(gamefile) {
        if (!isOpponentUsingWinCondition(gamefile, 'threecheck')) return false; // Not using this gamerule

        // Was the last move a check?
        if (gamefile.inCheck) {
            if (gamefile.checksGiven == null) gamefile.checksGiven = { white: 0, black: 0 }
            
            if (gamefile.whosTurn === 'white') gamefile.checksGiven.white++;
            else if (gamefile.whosTurn === 'black') gamefile.checksGiven.black++;
            else throw new Error(`Whosturn is invalid when detecting threecheck! Value ${gamefile.whosTurn}`);

            if (gamefile.checksGiven[gamefile.whosTurn] === 3) {
                if      (gamefile.whosTurn === 'white') return 'black threecheck'
                else if (gamefile.whosTurn === 'black') return 'white threecheck'
                else throw new Error("Cannot determine winning color by wincondition threecheck!")
            }
        }

        return false;
    }

    function detectKoth(gamefile) {
        if (!isOpponentUsingWinCondition(gamefile, 'koth')) return false; // Not using this gamerule

        // Was the last move a king move?
        const lastMove = movesscript.getLastMove(gamefile.moves)
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
            if      (gamefile.whosTurn === 'white') return 'black koth'
            else if (gamefile.whosTurn === 'black') return 'white koth'
            else return console.log("Cannot determine winning color by wincondition koth!")
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
        if (gamefile.moveRuleState === gamefile.gameRules.moveRule) return 'draw moverule'
        return false;
    }

    

    // Tests if the player who JUST played a move
    // can win from specified win condition.
    function isOpponentUsingWinCondition(gamefile, winCondition) {
        const oppositeColor = math.getOppositeColor(gamefile.whosTurn)
        return gamefile.gameRules.winConditions[oppositeColor].includes(winCondition);
    }


    // Returns true if the very last move captured a royal piece.
    function wasLastMoveARoyalCapture(gamefile) {
        const lastMove = movesscript.getLastMove(gamefile.moves);
        if (!lastMove) return false;

        if (!lastMove.captured) return false; // Last move not a capture

        const trimmedTypeCaptured = math.trimWorBFromType(lastMove.captured)

        // Does the piece type captured equal any royal piece?
        return pieces.royals.includes(trimmedTypeCaptured)
    }

    /**
     * Calculates if the provided game conclusion is a decisive conclusion.
     * This is any conclusion that can happen after a move is made.
     * Excludes conclusions like resignation, time, aborted, and disconnect,
     * which can happen at any point in time.
     * @param {string} gameConclusion - The gameConclusion
     * @returns {boolean} *true* if the gameConclusion is decisive.
     */
    function isGameConclusionDecisive(gameConclusion) {
        if (gameConclusion === false) throw new Error("Should not be checking if gameConclusion is decisive when game isn't over.")
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
        return { victor, condition }
    }

    return Object.freeze({
        validWinConditions,
        getGameConclusion,
        detectThreecheck,
        isOpponentUsingWinCondition,
        isGameConclusionDecisive,
        getVictorAndConditionFromGameConclusion
    })

})();