const { getTranslation } = require('../config/setupTranslations');

const wincondition1 = (function() {

    /** Valid win conditions in the gamerules. */
    const validWinConditions = ['checkmate','royalcapture','allroyalscaptured','allpiecescaptured','threecheck','koth'];
    
    /**
     * List of all win conditions that happen after a move being made.
     * This excludes conclusions such as resignation, time, aborted, and disconnect,
     * which can happen at any point in time.
     */
    const decisiveGameConclusions = [...validWinConditions, 'stalemate', 'repetition', 'moverule', 'insuffmat'];

    /**
     * Calculates if the provided game conclusion is a decisive conclusion.
     * This is any conclusion that can happen after a move is made.
     * Excludes conclusions like resignation, time, aborted, and disconnect,
     * which can happen at any point in time.
     * @param {string} gameConclusion - The gameConclusion (e.g. "checkmate", "stalemate", etc.)
     * @returns {boolean} *true* if the gameConclusion is decisive.
     */
    function isGameConclusionDecisive(gameConclusion) {
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
     * Returns the termination of the game in english language.
     * @param {gamefile} gamefile
     * @param {string} condition - The 2nd half of the gameConclusion: checkmate/stalemate/repetition/moverule/insuffmat/allpiecescaptured/royalcapture/allroyalscaptured/resignation/time/aborted/disconnect
     */
    function getTerminationInEnglish(condition) {
        switch (condition) {
            case "checkmate":
                return getTranslation('play.javascript.termination.checkmate');
            case "stalemate":
                return getTranslation('play.javascript.termination.stalemate');
            case "repetition":
                return getTranslation('play.javascript.termination.repetition');
            case "moverule":
                return `${getTranslation('play.javascript.termination.moverule.0')}50${getTranslation('play.javascript.termination.moverule.1')}`;
            case "insuffmat":
                return getTranslation('play.javascript.termination.insuffmat');
            case "royalcapture":
                return getTranslation('play.javascript.termination.royalcapture');
            case "allroyalscaptured":
                return getTranslation('play.javascript.termination.allroyalscaptured');
            case "allpiecescaptured":
                return getTranslation('play.javascript.termination.allpiecescaptured');
            case "threecheck":
                return getTranslation('play.javascript.termination.threecheck');
            case "koth":
                return getTranslation('play.javascript.termination.koth');
            // Non-decisive "decisive" conclusions
            case "resignation":
                return getTranslation('play.javascript.termination.resignation');
            case "time":
                return getTranslation('play.javascript.termination.time');
            case "aborted": // Happens within the first 2 moves
                return getTranslation('play.javascript.termination.aborted');
            case "disconnect": // Happens when a player leaves
                return getTranslation('play.javascript.termination.disconnect');
            default:
                console.error(`Cannot return English termination for unknown condition "${condition}"!`);
                return 'Unknown';
        }
    }


    return Object.freeze({
        isGameConclusionDecisive,
        getVictorAndConditionFromGameConclusion,
        getTerminationInEnglish,
    });

})();

module.exports = wincondition1;