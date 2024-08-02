
/*
 * This script handles our Practice page, containing
 * our practice selection menu.
 */

"use strict";

const guipractice = (function(){

    // Variables

    const element_menuExternalLinks = document.getElementById('menu-external-links');

    const element_practiceSelection = document.getElementById('practice-selection')
    const element_practiceName = document.getElementById('practice-name')
    const element_practiceBack = document.getElementById('practice-back')
    const element_endgamePractice = document.getElementById('endgame-practice')
    const element_tacticsPractice = document.getElementById('tactics-practice')
    const element_practicePlay = document.getElementById('practice-play')

    let modeSelected; // endgame-practice / tactics-practice

    // Functions

    function getModeSelected() {
        return modeSelected;
    }

    function open() {
        gui.setScreen('title practice')
        style.revealElement(element_practiceSelection)
        style.revealElement(element_menuExternalLinks);
        changePracticeMode('endgame-practice')
        initListeners()
    }

    function close() {
        style.hideElement(element_practiceSelection)
        style.hideElement(element_menuExternalLinks);
        closeListeners()
    }

    function initListeners() {
        element_practiceBack.addEventListener('click', callback_practiceBack)
        element_endgamePractice.addEventListener('click', callback_endgamePractice)
        element_tacticsPractice.addEventListener('click', gui.callback_featurePlanned)
        element_practicePlay.addEventListener('click', callback_practicePlay)
    }

    function closeListeners() {
        element_practiceBack.removeEventListener('click', callback_practiceBack)
        element_endgamePractice.removeEventListener('click', callback_endgamePractice)
        element_tacticsPractice.removeEventListener('click', gui.callback_featurePlanned)
        element_practicePlay.removeEventListener('click', callback_practicePlay)
    }

    function changePracticeMode(mode) { // endgame-practice / tactics-practice
        modeSelected = mode
        if (mode === 'endgame-practice') {
            element_practiceName.textContent = translations["menu_endgame"]
            element_endgamePractice.classList.add('selected')
            element_tacticsPractice.classList.remove('selected')
            element_endgamePractice.classList.remove('not-selected')
            element_tacticsPractice.classList.add('not-selected')
            // callback_updateOptions()
        } else if (mode === 'tactics-practice') {
            // nothing yet
        }
    }

    function callback_practiceBack(event) {
        event = event || window.event;
        close()
        guititle.open()
    }

    function callback_endgamePractice(event) {
        event = event || window.event;
        changePracticeMode('endgame-practice')
    }

    function callback_practicePlay(event) {
        event = event || window.event;

        const gameOptions = {
            variant: "Classical",
            clock: "-",
            color: "White",
            rated: "casual",
            publicity: "private"
        }

        if (modeSelected === 'endgame-practice') {
            close()
            startEndgamePractice(gameOptions)
        } else if (modeSelected === 'tactics-practice') {
            // nothing yet
        }
    }

    /**
     * Starts a local game according to the options provided.
     * @param {Object} inviteOptions - An object that contains the invite properties `variant`, `clock`, `color`, `publicity`, `rated`.
     */
    function startEndgamePractice(inviteOptions) {
        gui.setScreen('endgame practice'); // Change screen location

        // [Event "Casual Space Classic infinite chess game"] [Site "https://www.infinitechess.org/"] [Round "-"]
        const gameOptions = {
            metadata: {
                Event: `Infinite chess endgame practice`,
                Site: "https://www.infinitechess.org/",
                Round: "-",
                Variant: inviteOptions.variant,
                TimeControl: inviteOptions.clock
            }
        }
        loadGame(gameOptions)
        clock.set(inviteOptions.clock)
        guigameinfo.hidePlayerNames();
    }

    /**
     * Starts a game according to the options provided.
     * @param {Object} gameOptions - An object that contains the properties `metadata`, `moves`, `gameConclusion`
     * The `metadata` property contains the properties `Variant`, `White`, `Black`, `TimeControl`, `UTCDate`, `UTCTime`.
     */
    function loadGame(gameOptions) {
        console.log("Loading practice with game options:")
        console.log(gameOptions);
        main.renderThisFrame();
        movement.eraseMomentum();
        options.disableEM();

        gameOptions.metadata.UTCDate = gameOptions.metadata.UTCDate || math.getCurrentUTCDate();
        gameOptions.metadata.UTCTime = gameOptions.metadata.UTCTime || math.getCurrentUTCTime();

        const newGamefile = new gamefile(gameOptions.metadata, { // Pass in the pre-existing moves
            moves: gameOptions.moves,
            variantOptions: gameOptions.variantOptions,
            gameConclusion: gameOptions.gameConclusion
        })
        game.loadGamefile(newGamefile);

        const centerArea = area.calculateFromUnpaddedBox(newGamefile.startSnapshot.box)
        movement.setPositionToArea(centerArea, "pidough")
        
        options.setNavigationBar(true)
        sound.playSound_gamestart()
    }

    /**
     * Returns *true* if we are on the practice page.
     * @returns {boolean}
     */
    function onPracticePage() {
        return gui.getScreen() === 'title practice'
    }

    return Object.freeze({
        getModeSelected,
        open,
        close,
        startEndgamePractice,
        onPracticePage
    })

})();