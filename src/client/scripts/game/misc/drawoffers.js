
/**
 * This script stores the logic surrounding draw extending and acceptance
 * in online games, client-side.
 * 
 * It also keeps track of the last ply (half-move) we extended a draw offer,
 * if we have done so, in the current online game.
 */

'use strict';

// eslint-disable-next-line no-unused-vars
const drawoffers = (function() {

    /**
     * Minimum number of plies (half-moves) that
     * must span between 2 consecutive draw offers
     * by the same player!
     * 
     * THIS MUST ALWAYS MATCH THE SERVER-SIDE!!!!
     */
    const movesBetweenDrawOffers = 2;

    /** The last move we extended a draw, if we have, otherwise undefined. */
    let plyOfLastOfferedDraw;

    /** Whether we have an open draw offer FROM OUR OPPONENT */
    let isAcceptingDraw = false;


    /**
     * Returns true if us extending a dropper to our opponent is legal.
     * @returns {boolean}
     */
    function isOfferingDrawLegal() {
        const gamefile = game.getGamefile();
        if (!movesscript.isGameResignable(gamefile)) return false; // Not atleast 2+ moves
        if (isTooSoonToOfferDraw()) return false; // It's been too soon since our last offer
        return true; // Is legal to EXTEND
    }

    /**
     * Returns true if it's been too soon since our last draw offer extension
     * for us to extend another one. We cannot extend them too rapidly.
     * @returns {boolean}
     */
    function isTooSoonToOfferDraw() {
        const gamefile = game.getGamefile();
        if (plyOfLastOfferedDraw === undefined) return false; // We have made zero offers so far this game

        const movesSinceLastOffer = gamefile.moves.length - plyOfLastOfferedDraw;
        if (movesSinceLastOffer < movesBetweenDrawOffers) return true;
        return false;
    }

    /**
     * Returns *true* if we have an open draw offer from our OPPONENT.
     * @returns {boolean}
     */
    function areWeAcceptingDraw() { return isAcceptingDraw; }

    /** Is called when we receive a draw offer from our opponent */
    function onOpponentExtendedOffer() {
        guidrawoffer.open();
        sound.playSound_base(); //playSound_drawOffer()
        isAcceptingDraw = true;
    }

    /**
     * Extends a draw offer in our current game.
     * All legality checks have already passed!
     */
    function extendOffer() {
        websocket.sendmessage('game', 'offerdraw');
        const gamefile = game.getGamefile();
        plyOfLastOfferedDraw = gamefile.moves.length;
        statustext.showStatus(`Waiting for opponent to accept...`);
    }

    /**
     * This fires when we click the checkmark in
     * the draw offer UI on the bottom navigation bar.
     */
    function callback_AcceptDraw() {
        websocket.sendmessage('game', 'acceptdraw');
        guidrawoffer.close();
        isAcceptingDraw = false;
    }

    /**
     * This fires when we click the X-mark in
     * the draw offer UI on the bottom navigation bar,
     * or when we click "Accept Draw" in the pause menu,
     * OR when we make a move while there's an open offer!
    * @param {Object} [options] - Optional settings.
    * @param {boolean} [options.informServer=true] - If true, the server will be informed that the draw offer has been declined.
    * We'll want to set this to false if we call this after making a move, because the server auto-declines it.
    */
    function callback_declineDraw({ informServer = true } = {}) {
        if (!isAcceptingDraw) return; // No open draw offer from our opponent

        if (informServer) {
            websocket.sendmessage('game', 'declinedraw');
            statustext.showStatus(`Draw declined`);
        }
        guidrawoffer.close();
        isAcceptingDraw = false;
    }

    return Object.freeze({
        isOfferingDrawLegal,
        areWeAcceptingDraw,
        callback_AcceptDraw,
        callback_declineDraw,
        onOpponentExtendedOffer,
        extendOffer,
    });

})();