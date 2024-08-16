
// This is the parent gui script of all gui scripts.
// Here we remember what page we're on,
// and we have a reference to the overlay element above the entire canvas.

"use strict";

const gui = (function() {

    // Variables

    let screen = ''; // Current screen location in the game.  title/online/computer/local/board  

    const element_overlay = document.getElementById('overlay');

    element_overlay.addEventListener('click', callback_CancelPromotionIfUIOpen);

    function callback_CancelPromotionIfUIOpen(event) {
        event = event || window.event;
        if (!guipromotion.isUIOpen()) return;
        selection.unselectPiece();
        main.renderThisFrame();
    }

    // Functions

    function getScreen() {
        return screen;
    }

    function setScreen(value) {
        screen = value;
    }
    
    // Fades-in the overlay element over 1 second
    function fadeInOverlay1s() {
        style.fadeIn1s(element_overlay);
    }

    function callback_featurePlanned(event) {
        event = event || window.event;

        statustext.showStatus(translations["planned_feature"]);
    }

    function makeOverlayUnselectable() {
        element_overlay.classList.add('unselectable');
    }

    function makeOverlaySelectable() {
        element_overlay.classList.remove('unselectable');
    }

    return Object.freeze({
        fadeInOverlay1s,
        getScreen,
        setScreen,
        callback_featurePlanned,
        makeOverlayUnselectable,
        makeOverlaySelectable
    });

})();