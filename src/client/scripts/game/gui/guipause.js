
/*
 * This script handles our Pause menu
 */

"use strict";

// eslint-disable-next-line no-unused-vars
const guipause = (function() {

    /** The number of half moves allowed before we can make an additional draw offer. */
    const movesBetweenDrawOffers = 2;

    // Pause UI
    let isPaused = false;
    const element_pauseUI = document.getElementById('pauseUI');
    const element_resume = document.getElementById('resume');
    const element_pointers = document.getElementById('togglepointers');
    const element_copygame = document.getElementById('copygame');
    const element_pastegame = document.getElementById('pastegame');
    const element_mainmenu = document.getElementById('mainmenu');
    const element_offerDraw = document.getElementById('offerdraw');
    const element_perspective = document.getElementById('toggleperspective');
    
    // Functions

    /**
     * Returns *true* if the game is currently paused.
     * @returns {boolean}
     */
    function areWePaused() { return isPaused; }

    function getelement_perspective() {
        return element_perspective;
    }

    function open() {
        isPaused = true;
        updateTextOfMainMenuButton();
        updatePasteButtonTransparency();
        updateDrawOfferButton();
        style.revealElement(element_pauseUI);
        initListeners();
    }

    function toggle() {
        if (!isPaused) open();
        else callback_Resume();
    }

    function updatePasteButtonTransparency() {
        const moves = game.getGamefile().moves;
        const legalInPrivateMatch = onlinegame.getIsPrivate() && moves.length === 0;

        if (onlinegame.areInOnlineGame() && !legalInPrivateMatch) element_pastegame.classList.add('opacity-0_5');
        else                                                      element_pastegame.classList.remove('opacity-0_5');
    }

    function updateDrawOfferButton() {
        if (!isPaused) return; // Not paused, no point in updating button, because it's updated as soon as we pause the game

        // Should it say "offer draw" or "accept draw"?
        if (guidrawoffer.areWeAcceptingDraw()) element_offerDraw.innerText = translations.accept_draw;
        else element_offerDraw.innerText = translations.offer_draw;

        // Update transparency...

        const gamefile = game.getGamefile();

        if (guidrawoffer.areWeAcceptingDraw()) {
            if (!gamefileutility.isGameOver(gamefile)) element_offerDraw.classList.remove('opacity-0_5');
            return;
        }

        if (isNaN(parseInt(gamefile.drawOfferWhite))) gamefile.drawOfferWhite = 0;
        if (isNaN(parseInt(gamefile.drawOfferBlack))) gamefile.drawOfferBlack = 0;

        if (isOfferingDrawLegal()) element_offerDraw.classList.remove('opacity-0_5');
        else element_offerDraw.classList.add('opacity-0_5');
    }

    function isOfferingDrawLegal() {
        const gamefile = game.getGamefile();
        const ourDrawOfferMove = onlinegame.getOurColor() === "white" ? gamefile.drawOfferWhite : gamefile.drawOfferBlack;
        const movesLength = gamefile.moves.length;
        const ourRecentOffers = movesLength - ourDrawOfferMove < movesBetweenDrawOffers;
        return onlinegame.areInOnlineGame() && !ourRecentOffers && movesscript.isGameResignable(gamefile) && !gamefileutility.isGameOver(gamefile);
    }

    function onReceiveOpponentsMove() {
        updateTextOfMainMenuButton();
        updateDrawOfferButton();
    }

    /**
     * Updates the text content of the Main Menu button to either say
     * "Main Menu", "Abort Game", or "Resign Game", whichever is relevant
     * in the situation.
     */
    function updateTextOfMainMenuButton() {
        if (!isPaused) return;

        if (!onlinegame.areInOnlineGame() || onlinegame.hasGameConcluded()) return element_mainmenu.textContent = translations["main_menu"];

        if (movesscript.isGameResignable(game.getGamefile())) {
            // If the text currently says "Abort Game", freeze the button for 0.5 seconds in case the user clicked it RIGHT after it switched text! They may have tried to abort and actually not want to resign.
            if (element_mainmenu.textContent === translations["abort_game"]) {
                element_mainmenu.disabled = true;
                element_mainmenu.classList.add('opacity-0_5');
                setTimeout(() => {
                    element_mainmenu.disabled = false;
                    element_mainmenu.classList.remove('opacity-0_5');
                }, 1000);
            }
            element_mainmenu.textContent = translations["resign_game"];
            return;
        }

        element_mainmenu.textContent = translations["abort_game"];
    }

    function initListeners() {
        element_resume.addEventListener('click', callback_Resume);
        element_pointers.addEventListener('click', callback_TogglePointers);
        element_copygame.addEventListener('click', copypastegame.callbackCopy);
        element_pastegame.addEventListener('click', copypastegame.callbackPaste);
        element_mainmenu.addEventListener('click', callback_MainMenu);
        element_offerDraw.addEventListener('click', callback_OfferDraw);
        element_perspective.addEventListener('click', callback_Perspective);
    }

    function closeListeners() {
        element_resume.removeEventListener('click', callback_Resume);
        element_pointers.removeEventListener('click', callback_TogglePointers);
        element_copygame.removeEventListener('click', copypastegame.callbackCopy);
        element_pastegame.removeEventListener('click', copypastegame.callbackPaste);
        element_mainmenu.removeEventListener('click', callback_MainMenu);
        element_offerDraw.removeEventListener('click', callback_OfferDraw);
        element_perspective.removeEventListener('click', callback_Perspective);
    }

    function callback_Resume() {
        if (!isPaused) return;
        isPaused = false;
        style.hideElement(element_pauseUI);
        closeListeners();
        main.renderThisFrame();
    }

    function callback_MainMenu() {
        onlinegame.onMainMenuPress();
        onlinegame.closeOnlineGame();
        callback_Resume();
        game.unloadGame();
        clock.reset();
        guinavigation.close();
        guititle.open();
    }

    // Called when the draw offer button is clicked
    function callback_OfferDraw() {
        if (!movesscript.isGameResignable(game.getGamefile())) return statustext.showStatus("Can't offer draw.");

        // Do we need to extend a draw offer or accept one?
        if (!guidrawoffer.areWeAcceptingDraw() && isOfferingDrawLegal()) guidrawoffer.extendDrawOffer();
        else if (guidrawoffer.areWeAcceptingDraw()) guidrawoffer.callback_AcceptDraw();
        else statustext.showStatus("Can't offer draw.");
    }

    function callback_TogglePointers() {
        main.renderThisFrame();
        let mode = arrows.getMode();
        mode++;
        if (mode > 2) mode = 0;
        arrows.setMode(mode);
        const text = mode === 0 ? translations["arrows_off"]
            : mode === 1 ? translations["arrows_defense"]
                : translations["arrows_all"];
        element_pointers.textContent = text;
        if (!isPaused) statustext.showStatus(translations["toggled"] + " " + text);
    }

    function callback_Perspective() {
        perspective.toggle();
    }
    
    return Object.freeze({
        areWePaused,
        getelement_perspective,
        open,
        toggle,
        updateDrawOfferButton,
        onReceiveOpponentsMove,
        updateTextOfMainMenuButton,
        callback_Resume,
        callback_TogglePointers,
    });

})();