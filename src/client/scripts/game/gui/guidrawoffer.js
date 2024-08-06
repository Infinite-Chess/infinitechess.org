
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
    const element_whosturn = document.getElementById('whosturn')

    // Functions

    /**
     * Returns *true* if the user is deciding on accepting draw.
     * @returns {boolean}
     */
    function areWeAcceptingDraw() { return isAcceptingDraw; }

    /** Open a draw offer from our opponent */
    function openDrawOffer() {
        isAcceptingDraw = true;
        style.revealElement(element_draw_offer_ui)
        style.hideElement(element_whosturn)
        sound.playSound_base() //playSound_drawOffer()
        initDrawOfferListeners()
        guipause.updateDrawOfferButton()
    }

    function closeDrawOffer() {
        guipause.updateDrawOfferButton();
        isAcceptingDraw = false;
        style.hideElement(element_draw_offer_ui)
        style.revealElement(element_whosturn)
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

    function extendDrawOffer() {
        onlinegame.offerDraw()
        guipause.callback_Resume()
        statustext.showStatus(`Waiting for opponent to accept...`)
    }

    function callback_AcceptDraw(event) {
        if (gamefileutility.isGameOver()) return; // Can't accept draw when game over
        onlinegame.acceptDraw()
        closeDrawOffer()
    }

    function callback_DeclineDraw(event) {
        onlinegame.declineDraw()
        const gamefile = game.getGamefile();
        closeDrawOffer()
        statustext.showStatus(`Draw declined`, false, 2)
    }

    return Object.freeze({
        areWeAcceptingDraw,
        openDrawOffer,
        closeDrawOffer,
        extendDrawOffer,
        callback_AcceptDraw,
        callback_DeclineDraw
    })

})();