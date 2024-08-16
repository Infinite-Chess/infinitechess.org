
/*
 * This script handles our promotion menu, when
 * pawns reach the promotion line.
 */

"use strict";

const guipromotion = (function() {

    // Variables

    // Promotion
    const element_Promote = document.getElementById('promote');
    const element_PromoteWhite = document.getElementById('promotewhite');
    const element_PromoteBlack = document.getElementById('promoteblack');

    const element_amazonsW = document.getElementById('amazonsW');
    const element_queensW = document.getElementById('queensW');
    const element_knightridersW = document.getElementById('knightridersW');
    const element_chancellorsW = document.getElementById('chancellorsW');
    const element_archbishopsW = document.getElementById('archbishopsW');
    const element_rooksW = document.getElementById('rooksW');
    const element_bishopsW = document.getElementById('bishopsW');
    const element_rosesW = document.getElementById('rosesW');
    const element_hawksW = document.getElementById('hawksW');
    const element_giraffesW = document.getElementById('giraffesW');
    const element_zebrasW = document.getElementById('zebrasW');
    const element_camelsW = document.getElementById('camelsW');
    const element_centaursW = document.getElementById('centaursW');
    const element_knightsW = document.getElementById('knightsW');
    const element_guardsW = document.getElementById('guardsW');

    const element_amazonsB = document.getElementById('amazonsB');
    const element_queensB = document.getElementById('queensB');
    const element_knightridersB = document.getElementById('knightridersB');
    const element_chancellorsB = document.getElementById('chancellorsB');
    const element_archbishopsB = document.getElementById('archbishopsB');
    const element_rooksB = document.getElementById('rooksB');
    const element_bishopsB = document.getElementById('bishopsB');
    const element_rosesB = document.getElementById('rosesB');
    const element_hawksB = document.getElementById('hawksB');
    const element_giraffesB = document.getElementById('giraffesB');
    const element_zebrasB = document.getElementById('zebrasB');
    const element_camelsB = document.getElementById('camelsB');
    const element_centaursB = document.getElementById('centaursB');
    const element_knightsB = document.getElementById('knightsB');
    const element_guardsB = document.getElementById('guardsB');

    let selectionOpen = false; // True when promotion GUI visible. Do not listen to navigational controls in the mean time

    // Functions

    function isUIOpen() { return selectionOpen; }
    
    function open(color) {
        selectionOpen = true;
        style.revealElement(element_Promote);
        if (color === 'white') {
            style.hideElement(element_PromoteBlack);
            style.revealElement(element_PromoteWhite);
        } else {
            style.hideElement(element_PromoteWhite);
            style.revealElement(element_PromoteBlack);
        }
        initListeners_promotion();
        perspective.unlockMouse();
    }

    /** Closes the promotion UI */
    function close() {
        selectionOpen = false;
        style.hideElement(element_Promote);
        closeListeners_promotion();
    }

    function initListeners_promotion() {
        element_amazonsW.addEventListener('click', callback_promote);
        element_queensW.addEventListener('click', callback_promote);
        element_knightridersW.addEventListener('click', callback_promote);
        element_chancellorsW.addEventListener('click', callback_promote);
        element_archbishopsW.addEventListener('click', callback_promote);
        element_rooksW.addEventListener('click', callback_promote);
        element_bishopsW.addEventListener('click', callback_promote);
        element_rosesW.addEventListener('click', callback_promote);
        element_hawksW.addEventListener('click', callback_promote);
        element_giraffesW.addEventListener('click', callback_promote);
        element_zebrasW.addEventListener('click', callback_promote);
        element_camelsW.addEventListener('click', callback_promote);
        element_centaursW.addEventListener('click', callback_promote);
        element_knightsW.addEventListener('click', callback_promote);
        element_guardsW.addEventListener('click', callback_promote);

        element_amazonsB.addEventListener('click', callback_promote);
        element_queensB.addEventListener('click', callback_promote);
        element_knightridersB.addEventListener('click', callback_promote);
        element_chancellorsB.addEventListener('click', callback_promote);
        element_archbishopsB.addEventListener('click', callback_promote);
        element_rooksB.addEventListener('click', callback_promote);
        element_bishopsB.addEventListener('click', callback_promote);
        element_rosesB.addEventListener('click', callback_promote);
        element_hawksB.addEventListener('click', callback_promote);
        element_giraffesB.addEventListener('click', callback_promote);
        element_zebrasB.addEventListener('click', callback_promote);
        element_camelsB.addEventListener('click', callback_promote);
        element_centaursB.addEventListener('click', callback_promote);
        element_knightsB.addEventListener('click', callback_promote);
        element_guardsB.addEventListener('click', callback_promote);
    }

    function closeListeners_promotion() {
        element_amazonsW.removeEventListener('click', callback_promote);
        element_queensW.removeEventListener('click', callback_promote);
        element_knightridersW.removeEventListener('click', callback_promote);
        element_chancellorsW.removeEventListener('click', callback_promote);
        element_archbishopsW.removeEventListener('click', callback_promote);
        element_rooksW.removeEventListener('click', callback_promote);
        element_bishopsW.removeEventListener('click', callback_promote);
        element_rosesW.removeEventListener('click', callback_promote);
        element_hawksW.removeEventListener('click', callback_promote);
        element_giraffesW.removeEventListener('click', callback_promote);
        element_zebrasW.removeEventListener('click', callback_promote);
        element_camelsW.removeEventListener('click', callback_promote);
        element_centaursW.removeEventListener('click', callback_promote);
        element_knightsW.removeEventListener('click', callback_promote);
        element_guardsW.removeEventListener('click', callback_promote);

        element_amazonsB.removeEventListener('click', callback_promote);
        element_queensB.removeEventListener('click', callback_promote);
        element_knightridersB.removeEventListener('click', callback_promote);
        element_chancellorsB.removeEventListener('click', callback_promote);
        element_archbishopsB.removeEventListener('click', callback_promote);
        element_rooksB.removeEventListener('click', callback_promote);
        element_bishopsB.removeEventListener('click', callback_promote);
        element_rosesB.removeEventListener('click', callback_promote);
        element_hawksB.removeEventListener('click', callback_promote);
        element_giraffesB.removeEventListener('click', callback_promote);
        element_zebrasB.removeEventListener('click', callback_promote);
        element_camelsB.removeEventListener('click', callback_promote);
        element_centaursB.removeEventListener('click', callback_promote);
        element_knightsB.removeEventListener('click', callback_promote);
        element_guardsB.removeEventListener('click', callback_promote);
    }

    /**
     * Inits the promotion UI. Hides promotions not allowed, reveals promotions allowed.
     * @param {Object} promotionsAllowed - An object that contains the information about what promotions are allowed.
     * It contains 2 properties, `white` and `black`, both of which are arrays which may look like `['queens', 'bishops']`.
     */
    function initUI(promotionsAllowed) { // {  }
        const white = promotionsAllowed.white; // ['queens','bishops']
        const black = promotionsAllowed.black;

        if (white.includes('amazons')) style.revealElement(element_amazonsW); else style.hideElement(element_amazonsW);
        if (white.includes('queens')) style.revealElement(element_queensW); else style.hideElement(element_queensW);
        if (white.includes('knightriders')) style.revealElement(element_knightridersW); else style.hideElement(element_knightridersW);
        if (white.includes('chancellors')) style.revealElement(element_chancellorsW); else style.hideElement(element_chancellorsW);
        if (white.includes('archbishops')) style.revealElement(element_archbishopsW); else style.hideElement(element_archbishopsW);
        if (white.includes('rooks')) style.revealElement(element_rooksW); else style.hideElement(element_rooksW);
        if (white.includes('bishops')) style.revealElement(element_bishopsW); else style.hideElement(element_bishopsW);
        if (white.includes('roses')) style.revealElement(element_rosesW); else style.hideElement(element_rosesW);
        if (white.includes('hawks')) style.revealElement(element_hawksW); else style.hideElement(element_hawksW);
        if (white.includes('giraffes')) style.revealElement(element_giraffesW); else style.hideElement(element_giraffesW);
        if (white.includes('zebras')) style.revealElement(element_zebrasW); else style.hideElement(element_zebrasW);
        if (white.includes('camels')) style.revealElement(element_camelsW); else style.hideElement(element_camelsW);
        if (white.includes('centaurs')) style.revealElement(element_centaursW); else style.hideElement(element_centaursW);
        if (white.includes('knights')) style.revealElement(element_knightsW); else style.hideElement(element_knightsW);
        if (white.includes('guards')) style.revealElement(element_guardsW); else style.hideElement(element_guardsW);

        if (black.includes('amazons')) style.revealElement(element_amazonsB); else style.hideElement(element_amazonsB);
        if (black.includes('queens')) style.revealElement(element_queensB); else style.hideElement(element_queensB);
        if (black.includes('knightriders')) style.revealElement(element_knightridersB); else style.hideElement(element_knightridersB);
        if (black.includes('chancellors')) style.revealElement(element_chancellorsB); else style.hideElement(element_chancellorsB);
        if (black.includes('archbishops')) style.revealElement(element_archbishopsB); else style.hideElement(element_archbishopsB);
        if (black.includes('rooks')) style.revealElement(element_rooksB); else style.hideElement(element_rooksB);
        if (black.includes('bishops')) style.revealElement(element_bishopsB); else style.hideElement(element_bishopsB);
        if (black.includes('roses')) style.revealElement(element_rosesB); else style.hideElement(element_rosesB);
        if (black.includes('hawks')) style.revealElement(element_hawksB); else style.hideElement(element_hawksB);
        if (black.includes('giraffes')) style.revealElement(element_giraffesB); else style.hideElement(element_giraffesB);
        if (black.includes('zebras')) style.revealElement(element_zebrasB); else style.hideElement(element_zebrasB);
        if (black.includes('camels')) style.revealElement(element_camelsB); else style.hideElement(element_camelsB);
        if (black.includes('centaurs')) style.revealElement(element_centaursB); else style.hideElement(element_centaursB);
        if (black.includes('knights')) style.revealElement(element_knightsB); else style.hideElement(element_knightsB);
        if (black.includes('guards')) style.revealElement(element_guardsB); else style.hideElement(element_guardsB);
    }

    function callback_promote(event) {
        event = event || window.event;

        const type = event.srcElement.classList[1];
        selection.promoteToType(type);
        close();
    }

    return Object.freeze({
        isUIOpen,
        open,
        close,
        initUI
    });

})();