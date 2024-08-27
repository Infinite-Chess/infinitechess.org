// Import Start
import { onlinegame } from '../misc/onlinegame.js'
import { style } from './style.js'
import { main } from '../main.js'
import { game } from '../chess/game.js'
import { arrows } from '../rendering/arrows.js'
import { clock } from '../misc/clock.js'
import { guinavigation } from './guinavigation.js'
import { statustext } from './statustext.js'
import { copypastegame } from '../chess/copypastegame.js'
import { drawoffers } from '../misc/drawoffers.js'
import { guititle } from './guititle.js'
// Import End


/*
 * This script handles our Pause menu
 */

"use strict";

// eslint-disable-next-line no-unused-vars
const guipause = (function() {

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

    /**
     * Update the draw offer button's text content to either say "Offer Draw"
     * or "Accept Draw", and update its transparency depending on whether it's legal.
     */
    function updateDrawOfferButton() {
        if (!isPaused) return; // Not paused, no point in updating button, because it's updated as soon as we pause the game
        // Should it say "offer draw" or "accept draw"?
        if (drawoffers.areWeAcceptingDraw()) {
            element_offerDraw.innerText = translations.accept_draw; // "Accept Draw"
            element_offerDraw.classList.remove('opacity-0_5');
            return;
        } else element_offerDraw.innerText = translations.offer_draw; // "Offer Draw"

        // Update transparency
        if (drawoffers.isOfferingDrawLegal()) element_offerDraw.classList.remove('opacity-0_5');
        else element_offerDraw.classList.add('opacity-0_5');
    }

    function onReceiveOpponentsMove() {
        updateTextOfMainMenuButton({ freezeResignButtonIfNoLongerAbortable: true });
        updateDrawOfferButton();
    }

    /**
     * Updates the text content of the Main Menu button to either say
     * "Main Menu", "Abort Game", or "Resign Game", whichever is relevant
     * in the situation.
     * @param {Object} options - Additional options
     * @param {boolean} [options.freezeResignButtonIfNoLongerAbortable] - If true, and the main menu changes from "Abort" to "Resign",
     * we will disable it and grey it out for 1 second so the player doesn't accidentally click resign when they wanted to abort.
     * This should only be true when called from onReceiveOpponentsMove(), not on open()
     */
    function updateTextOfMainMenuButton({ freezeResignButtonIfNoLongerAbortable } = {}) {
        if (!isPaused) return;

        if (!onlinegame.areInOnlineGame() || onlinegame.hasGameConcluded()) return element_mainmenu.textContent = translations.main_menu;

        if (movesscript.isGameResignable(game.getGamefile())) {
            // If the text currently says "Abort Game", freeze the button for 1 second in case the user clicked it RIGHT after it switched text! They may have tried to abort and actually not want to resign.
            if (freezeResignButtonIfNoLongerAbortable && element_mainmenu.textContent === translations.abort_game) {
                element_mainmenu.disabled = true;
                element_mainmenu.classList.add('opacity-0_5');
                setTimeout(() => {
                    element_mainmenu.disabled = false;
                    element_mainmenu.classList.remove('opacity-0_5');
                }, 1000);
            }
            element_mainmenu.textContent = translations.resign_game;
            return;
        }

        element_mainmenu.textContent = translations.abort_game;
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

    /** Called when the Offer Draw button is clicked in the pause menu */
    function callback_OfferDraw() {
        // Are we accepting a draw?
        if (drawoffers.areWeAcceptingDraw()) {
            drawoffers.callback_AcceptDraw();
            callback_Resume();
            return;
        }

        // Not accepting. Is it legal to extend, then?
        if (drawoffers.isOfferingDrawLegal()) {
            drawoffers.extendOffer();
            callback_Resume();
            return;
        }

        statustext.showStatus("Can't offer draw.");
    }

    function callback_TogglePointers() {
        main.renderThisFrame();
        let mode = arrows.getMode();
        mode++;
        if (mode > 2) mode = 0;
        arrows.setMode(mode);
        const text = mode === 0 ? translations.arrows_off
                   : mode === 1 ? translations.arrows_defense
                                : translations.arrows_all;
        element_pointers.textContent = text;
        if (!isPaused) statustext.showStatus(translations.toggled + " " + text);
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

export { guipause };