
/*
 * This script handles our Pause menu
 */

"use strict";

const guipause = (function(){

    // Variables

    // Pause UI
    let isPaused = false
    const element_pauseUI = document.getElementById('pauseUI')
    const element_resume = document.getElementById('resume')
    const element_pointers = document.getElementById('togglepointers')
    const element_copygame = document.getElementById('copygame')
    const element_pastegame = document.getElementById('pastegame')
    const element_mainmenu = document.getElementById('mainmenu')
    const element_perspective = document.getElementById('toggleperspective')
    
    // Functions

    /**
     * Returns *true* if the game is currently paused.
     * @returns {boolean}
     */
    function areWePaused() { return isPaused; }

    function gelement_perspective() {
        return element_perspective;
    }

    function open() {
        isPaused = true;
        changeTextOfMainMenuButton()
        updatePasteButtonTransparency()
        style.revealElement(element_pauseUI)
        initListeners()
    }

    function toggle() {
        if (!isPaused) open();
        else callback_Resume()
    }

    function updatePasteButtonTransparency() {
        const moves = game.getGamefile().moves;
        const movesLength = moves.length;
        const legalInPrivateMatch = onlinegame.getIsPrivate() && (movesLength === 0 || moves[0].length === 1 && moves[0][0] == null);

        if (onlinegame.areInOnlineGame() && !legalInPrivateMatch) element_pastegame.classList.add('opacity-0_5')
        else                                                  element_pastegame.classList.remove('opacity-0_5')
    }

    function changeTextOfMainMenuButton() {
        if (!isPaused) return;

        if (!onlinegame.areInOnlineGame() || game.getGamefile().gameConclusion) return element_mainmenu.textContent = translations["main_menu"];

        if (movesscript.isGameResignable(game.getGamefile())) return element_mainmenu.textContent = translations["resign_game"];

        return element_mainmenu.textContent = translations["abort_game"];
    }

    function initListeners() {
        element_resume.addEventListener('click', callback_Resume)
        element_pointers.addEventListener('click', callback_TogglePointers)
        element_copygame.addEventListener('click', copypastegame.callbackCopy)
        element_pastegame.addEventListener('click', copypastegame.callbackPaste)
        element_mainmenu.addEventListener('click', callback_MainMenu)
        element_perspective.addEventListener('click', callback_Perspective)
    }

    function closeListeners() {
        element_resume.removeEventListener('click', callback_Resume)
        element_pointers.removeEventListener('click', callback_TogglePointers)
        element_copygame.removeEventListener('click', copypastegame.callbackCopy)
        element_pastegame.removeEventListener('click', copypastegame.callbackPaste)
        element_mainmenu.removeEventListener('click', callback_MainMenu)
        element_perspective.removeEventListener('click', callback_Perspective)
    }

    function callback_Resume(event) {
        if (!isPaused) return;
        event = event || window.event;
        isPaused = false;
        style.hideElement(element_pauseUI)
        closeListeners()
        main.renderThisFrame();
    }

    async function callback_MainMenu(event) {
        event = event || window.event;
        onlinegame.onMainMenuPress()
        onlinegame.closeOnlineGame()
        callback_Resume()
        game.unloadGame()
        clock.reset();
        guinavigation.close()
        guititle.open()
    }

    function callback_TogglePointers (event) {
        event = event || window.event;
        main.renderThisFrame();
        let mode = arrows.getMode();
        mode++;
        if (mode > 2) mode = 0;
        arrows.setMode(mode);
        const text = mode === 0 ? translations["arrows_off"]
                        : mode === 1 ? translations["arrows_defense"]
                        : translations["arrows_all"];
        element_pointers.textContent = text;
        if (!isPaused) statustext.showStatus(translations["toggled"] + " " + text)
    }

    function callback_Perspective(event) {
        event = event || window.event;
        perspective.toggle()
    }
    
    return Object.freeze({
        areWePaused,
        gelement_perspective,
        open,
        toggle,
        changeTextOfMainMenuButton,
        callback_Resume,
        callback_TogglePointers,
    })

})();