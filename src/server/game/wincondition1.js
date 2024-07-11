
const wincondition1 = (function() {

    /** Valid win conditions in the gamerules. */
    const validWinConditions = ['checkmate','royalcapture','allroyalscaptured','allpiecescaptured','threecheck','koth'];
    
    /**
     * List of all win conditions that happen after a move being made.
     * This excludes conclusions such as resignation, time, aborted, and disconnect,
     * which can happen at any point in time.
     */
    const decisiveGameConclusions = [...validWinConditions, 'stalemate', 'repetition', 'moverule', 'insuffmat']

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
        return { victor, condition }
    }

    return Object.freeze({
        isGameConclusionDecisive,
        getVictorAndConditionFromGameConclusion
    })

})();

module.exports = wincondition1;