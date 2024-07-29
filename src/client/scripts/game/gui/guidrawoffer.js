
/*
 * This script handles our Draw offer menu
 */

"use strict";

const guidrawoffer = (function(){

    // Variables
    // Draw Offer UI
    let isAcceptingDraw = false
    const element_draw_offer_ui = document.getElementById('draw_offer_ui')
    const element_acceptDraw = document.getElementById('acceptdraw')
    const element_declineDraw = document.getElementById('declinedraw')

    // Functions

    /**
     * Returns *true* if the user is deciding on accepting draw.
     * @returns {boolean}
     */
    function areWeAcceptingDraw() { return isAcceptingDraw; }

    function openDrawOffer() {
        isAcceptingDraw = true;
        style.revealElement(element_draw_offer_ui)
        // style.hideElement(element_whosturn)
        sound.playSound_drawOffer()
        initDrawOfferListeners()
    }

    function closeDrawOffer() {
        isAcceptingDraw = false;
        style.hideElement(element_draw_offer_ui)
        //style.revealElement(element_whosturn)
        closeDrawOfferListeners()
    }

    function initDrawOfferListeners() {
        element_acceptDraw.addEventListener('click', callback_AcceptDraw)
        element_declineDraw.addEventListener('click', callback_DeclineDraw)
    }

    function closeDrawOfferListeners() {
        element_acceptDraw.removeEventListener('click', callback_AcceptDraw)
        element_declineDraw.removeEventListener('click', callback_DeclineDraw)
    }

    async function callback_AcceptDraw(event) {
        onlinegame.acceptDraw()
        closeDrawOffer()

        const gamefile = game.getGamefile();
        gamefile.gameConclusion = 'draw agreement';
        clock.stop()
        gamefileutility.concludeGame(gamefile);
    }

    async function callback_DeclineDraw(event) {
        onlinegame.declineDraw()
        const gamefile = game.getGamefile();
        closeDrawOffer()
        statustext.showStatus(`Draw declined`, false, 2)
    }

    return Object.freeze({
        areWeAcceptingDraw,
        openDrawOffer,
        closeDrawOffer,
        callback_AcceptDraw,
        callback_DeclineDraw
    })

})();