
/**
 * This script stores the logic surrounding draw extending and acceptance
 * in online games, client-side.
 * 
 * It also keeps track of the last ply (half-move) we extended a draw offer,
 * if we have done so, in the current online game.
 */

'use strict';

const drawoffers = (function() {

    /**
     * Minimum number of plies (half-moves) that
     * must span between 2 consecutive draw offers
     * by the same player!
     * 
     * THIS MUST ALWAYS MATCH THE SERVER-SIDE!!!!
     */
    const movesBetweenDrawOffers = 2;

    const plyOfLastOfferedDraw = undefined;

    /**
     * Returns true if it's been too soon since our last draw offer extension
     * for us to extend another one. We cannot extend them too rapidly.
     * @param {gamefile} gamefile 
     */
    function isTooSoonToOfferDraw(gamefile) {
        if (plyOfLastOfferedDraw !== undefined) { // They have made atleast 1 offer this game
            const movesSinceLastOffer = gamefile.moves.length - plyOfLastOfferedDraw;
            if (movesSinceLastOffer < movesBetweenDrawOffers) return true;
        }
        return false;
    }

    return Object.freeze({
        
    })

})();