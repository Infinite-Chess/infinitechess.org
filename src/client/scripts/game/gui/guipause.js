
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

    // Whosturn
    const element_whosturn = document.querySelector('.whosturn')
    console.log("whosturn", element_whosturn)
    
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

    function getelement_perspective() {
        return element_perspective;
    }

    function open() {
        isPaused = true;
        changeTextOfMainMenuButton()
        updatePasteButtonTransparency()
        updateDrawOfferButtonTransparency()
        style.revealElement(element_pauseUI)
        if (!gamefile.LastDrawOfferMove) gamefile.LastDrawOfferMove = 0 // ugly fix, will work trust me
        initListeners()
    }

    function openDrawOffer() {
        isAcceptingDraw = true;
        style.revealElement(element_drawOfferUI)
        element_whosturn.classList.add('moveabovedrawoffer')
        sound.playSound_drawOffer()
        initDrawOfferListeners()
    }

    function closeDrawOffer() {
        isAcceptingDraw = false;
        style.hideElement(element_drawOfferUI)
        element_whosturn.classList.remove('moveabovedrawoffer')
        closeDrawOfferListeners()
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
        const movesLength = parseInt(moves.length)
        const lastOffer = gamefile.LastDrawOfferMove == undefined ? 0 : gamefile.LastDrawOfferMove
        const currentDrawOffers = gamefile.drawOffers == true

        const RecentDrawOffers = (movesLength == lastOffer)
        console.log(`Recent draw offers: ${RecentDrawOffers}`)

        if (!onlinegame.areInOnlineGame() || RecentDrawOffers || movesLength < 2 || currentDrawOffers) {
            element_offerDraw.classList.add('opacity-0_5')
        } else {
            console.log("allowed")
            element_offerDraw.classList.remove('opacity-0_5')
        }
    }

    function disableDrawOfferButton() {
        element_offerDraw.classList.add('opacity-0_5')
    }

    function changeTextOfMainMenuButton() {
        if (!isPaused) return;

        if (!onlinegame.areInOnlineGame() || game.getGamefile().gameConclusion) return element_mainmenu.textContent = "Main Menu";

        if (movesscript.isGameResignable(game.getGamefile())) return element_mainmenu.textContent = "Resign Game";

        return element_mainmenu.textContent = "Abort Game";
    }

    function initDrawOfferListeners() {
        element_acceptDraw.addEventListener('click', callback_AcceptDraw)
        element_declineDraw.addEventListener('click', callback_DeclineDraw)
    }

    function closeDrawOfferListeners() {
        element_acceptDraw.removeEventListener('click', callback_AcceptDraw)
        element_declineDraw.removeEventListener('click', callback_DeclineDraw)
    }

    function initListeners() {
        element_resume.addEventListener('click', callback_Resume)
        element_pointers.addEventListener('click', callback_TogglePointers)
        element_copygame.addEventListener('click', copypastegame.callbackCopy)
        element_pastegame.addEventListener('click', copypastegame.callbackPaste)
        element_mainmenu.addEventListener('click', callback_MainMenu)
        element_offerDraw.addEventListener('click', callback_OfferDraw)
        element_perspective.addEventListener('click', callback_Perspective)
    }

    function closeListeners() {
        element_resume.removeEventListener('click', callback_Resume)
        element_pointers.removeEventListener('click', callback_TogglePointers)
        element_copygame.removeEventListener('click', copypastegame.callbackCopy)
        element_pastegame.removeEventListener('click', copypastegame.callbackPaste)
        element_mainmenu.removeEventListener('click', callback_MainMenu)
        element_offerDraw.removeEventListener('click', callback_OfferDraw)
        element_perspective.removeEventListener('click', callback_Perspective)
    }

    function callback_Resume(event) {
        if (!isPaused && !isAcceptingDraw) return;
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

    async function callback_OfferDraw(event) {
        const gamefile = game.getGamefile()
        if (element_offerDraw.classList.contains('opacity-0_5')) return statustext.showStatus(`Can't offer draw!`, false, 2)
        onlinegame.offerDraw()
        callback_Resume()

        console.log(game.getGamefile().moves)
        if (game.getGamefile().moves) {
            gamefile.LastDrawOfferMove = game.getGamefile().moves.length
        }
        element_offerDraw.classList.add('opacity-0_5')
        statustext.showStatus(`Waiting for opponent to accept the draw...`, false, 3)
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
        gamefile.drawOffers = false
        closeDrawOffer()
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
        getelement_perspective,
        open,
        openDrawOffer,
        closeDrawOffer,
        toggle,
        changeTextOfMainMenuButton,
        disableDrawOfferButton,
        callback_Resume,
        callback_TogglePointers,
        callback_OfferDraw,
        callback_AcceptDraw,
        callback_DeclineDraw
    })

})();