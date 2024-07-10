
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
    const element_offerDraw = document.getElementById('offerdraw')
    const element_perspective = document.getElementById('toggleperspective')

    // Draw Offer UI
    let isAcceptingDraw = false
    const element_drawOfferUI = document.getElementById('drawOfferUI')
    const element_acceptDraw = document.getElementById('acceptdraw')
    const element_declineDraw = document.getElementById('declinedraw')
    
    // Functions

    /**
     * Returns *true* if the game is currently paused.
     * @returns {boolean}
     */
    function areWePaused() { return isPaused; }

    /**
     * Returns *true* if the user is deciding on accepting draw.
     * @returns {boolean}
     */
    function areWeAcceptingDraw() { return isAcceptingDraw; }

    function gelement_perspective() {
        return element_perspective;
    }

    function open() {
        isPaused = true;
        changeTextOfMainMenuButton()
        updatePasteButtonTransparency()
        updateDrawOfferButtonTransparency()
        style.revealElement(element_pauseUI)
        initListeners()
    }

    function openDrawOffer() {
        isAcceptingDraw = true;
        style.revealElement(element_drawOfferUI)
        sound.playSound_drawOffer()
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
        else                                                      element_pastegame.classList.remove('opacity-0_5')
    }

    function updateDrawOfferButtonTransparency() {
        const gamefile = game.getGamefile()
        const moves = gamefile.moves;
        const movesLength = moves.length;
        
        const RecentDrawOffers = movesLength > gamefile.LastDrawOfferMove ? false : true

        if (!onlinegame.areInOnlineGame() || RecentDrawOffers) element_pastegame.classList.add('opacity-0_5')
        else                                                   element_pastegame.classList.remove('opacity-0_5')
    }

    function changeTextOfMainMenuButton() {
        if (!isPaused) return;

        if (!onlinegame.areInOnlineGame() || game.getGamefile().gameConclusion) return element_mainmenu.textContent = "Main Menu";

        if (movesscript.isGameResignable(game.getGamefile())) return element_mainmenu.textContent = "Resign Game";

        return element_mainmenu.textContent = "Abort Game";
    }

    function initListeners() {
        element_resume.addEventListener('click', callback_Resume)
        element_pointers.addEventListener('click', callback_TogglePointers)
        element_copygame.addEventListener('click', copypastegame.callbackCopy)
        element_pastegame.addEventListener('click', copypastegame.callbackPaste)
        element_mainmenu.addEventListener('click', callback_MainMenu)
        element_offerDraw.addEventListener('click', callback_OfferDraw)
        element_perspective.addEventListener('click', callback_Perspective)

        element_acceptDraw.addEventListener('click', callback_AcceptDraw)
        element_declineDraw.addEventListener('click', callback_DeclineDraw)
    }

    function closeListeners() {
        element_resume.removeEventListener('click', callback_Resume)
        element_pointers.removeEventListener('click', callback_TogglePointers)
        element_copygame.removeEventListener('click', copypastegame.callbackCopy)
        element_pastegame.removeEventListener('click', copypastegame.callbackPaste)
        element_mainmenu.removeEventListener('click', callback_MainMenu)
        element_offerDraw.removeEventListener('click', callback_OfferDraw)
        element_perspective.removeEventListener('click', callback_Perspective)

        element_acceptDraw.removeEventListener('click', callback_AcceptDraw)
        element_declineDraw.removeEventListener('click', callback_DeclineDraw)
    }

    function callback_Resume(event) {
        if (!isPaused && !isAcceptingDraw) return;
        event = event || window.event;
        isPaused = false;
        isAcceptingDraw = false;
        style.hideElement(element_pauseUI)
        style.hideElement(element_drawOfferUI)
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

    async function callback_OfferDraw(event) {
        onlinegame.offerDraw()
        callback_Resume()
        statustext.showStatus(`Waiting for opponent to accept draw...`, false, 3)
    }

    async function callback_AcceptDraw(event) {
        onlinegame.acceptDraw()
        // gamefile.gameConclusion = 'draw agreement'
        // gamefileutility.concludeGame(gamefile)
        callback_Resume()

        const gamefile = game.getGamefile();
        gamefile.gameConclusion = 'draw agreement';
        clock.stop()
        if (gamefile.gameConclusion) gamefileutility.concludeGame(gamefile);
    }

    async function callback_DeclineDraw(event) {
        onlinegame.declineDraw()
        callback_Resume()
        statustext.showStatus(`Draw declined`, false, 2)
    }

    function callback_TogglePointers (event) {
        event = event || window.event;
        main.renderThisFrame();
        let mode = arrows.getMode();
        mode++;
        if (mode > 2) mode = 0;
        arrows.setMode(mode);
        const text = mode === 0 ? "Arrows: Off"
                        : mode === 1 ? "Arrows: Defense"
                        : "Arrows: All";
        element_pointers.textContent = text;
        if (!isPaused) statustext.showStatus('Toggled ' + text)
    }

    function callback_Perspective(event) {
        event = event || window.event;
        perspective.toggle()
    }
    
    return Object.freeze({
        areWePaused,
        areWeAcceptingDraw,
        gelement_perspective,
        open,
        toggle,
        changeTextOfMainMenuButton,
        callback_Resume,
        callback_TogglePointers,
        callback_OfferDraw,
        callback_AcceptDraw,
        callback_DeclineDraw,
        openDrawOffer
    })

})();