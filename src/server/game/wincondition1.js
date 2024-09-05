import { getTranslation } from '../utility/translate.js';

const wincondition1 = (function() {

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
            case "agreement":
                return getTranslation('play.javascript.termination.agreement');
            default:
                console.error(`Cannot return English termination for unknown condition "${condition}"!`);
                return 'Unknown';
        }
    }


    return Object.freeze({
        getTerminationInEnglish,
    });

})();

export default wincondition1;