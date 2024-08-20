
/*
 * This script opens and closes our Draw Offer UI
 * on the bottom navigation bar.
 * 
 * It does NOT calculate if extending an offer is legal,
 * nor does it keep track of our current offers!
 */

"use strict";

// eslint-disable-next-line no-unused-vars
const guidrawoffer = (function() {

    const element_draw_offer_ui = document.getElementById('draw_offer_ui');
    const element_acceptDraw = document.getElementById('acceptdraw');
    const element_declineDraw = document.getElementById('declinedraw');
    const element_whosturn = document.getElementById('whosturn');

    
    /** Reveals the draw offer UI on the bottom navigation bar */
    function open() {
        style.revealElement(element_draw_offer_ui);
        style.hideElement(element_whosturn);
        initDrawOfferListeners();
    }

    /** Hides the draw offer UI on the bottom navigation bar */
    function close() {
        style.hideElement(element_draw_offer_ui);
        style.revealElement(element_whosturn);
        closeDrawOfferListeners();
    }

    function initDrawOfferListeners() {
        element_acceptDraw.addEventListener('click', drawoffers.callback_AcceptDraw);
        element_declineDraw.addEventListener('click', drawoffers.callback_declineDraw);
    }

    function closeDrawOfferListeners() {
        element_acceptDraw.removeEventListener('click', drawoffers.callback_AcceptDraw);
        element_declineDraw.removeEventListener('click', drawoffers.callback_declineDraw);
    }

    return Object.freeze({
        open,
        close,
    });

})();