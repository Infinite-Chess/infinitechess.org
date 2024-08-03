
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
    const element_checkmatePractice = document.getElementById('checkmate-practice')
    const element_tacticsPractice = document.getElementById('tactics-practice')
    const element_practicePlay = document.getElementById('practice-play')

    const elements_checkmates = document.getElementsByClassName('checkmate');

    let modeSelected; // checkmate-practice / tactics-practice
    let checkmateSelectedID; // id of selected checkmate

    // Functions

    function getModeSelected() {
        return modeSelected;
    }

    function open() {
        gui.setScreen('title practice')
        style.revealElement(element_practiceSelection)
        style.revealElement(element_menuExternalLinks);
        changePracticeMode('checkmate-practice')
        changeCheckmateSelected('2Q-1k')
        updateCheckmatesBeaten()
        initListeners()
    }

    function close() {
        style.hideElement(element_practiceSelection)
        style.hideElement(element_menuExternalLinks);
        closeListeners()
    }

    function initListeners() {
        element_practiceBack.addEventListener('click', callback_practiceBack)
        element_checkmatePractice.addEventListener('click', callback_checkmatePractice)
        element_tacticsPractice.addEventListener('click', gui.callback_featurePlanned)
        element_practicePlay.addEventListener('click', callback_practicePlay)
        for (let element of elements_checkmates) {
            element.addEventListener('click', callback_checkmateList);
        }
    }

    function closeListeners() {
        element_practiceBack.removeEventListener('click', callback_practiceBack)
        element_checkmatePractice.removeEventListener('click', callback_checkmatePractice)
        element_tacticsPractice.removeEventListener('click', gui.callback_featurePlanned)
        element_practicePlay.removeEventListener('click', callback_practicePlay)
        for (let element of elements_checkmates) {
            element.removeEventListener('click', callback_checkmateList);
        }
    }

    function changePracticeMode(mode) { // checkmate-practice / tactics-practice
        modeSelected = mode
        if (mode === 'checkmate-practice') {
            element_practiceName.textContent = translations["menu_checkmate"]
            element_checkmatePractice.classList.add('selected')
            element_tacticsPractice.classList.remove('selected')
            element_checkmatePractice.classList.remove('not-selected')
            element_tacticsPractice.classList.add('not-selected')
            // callback_updateOptions()
        } else if (mode === 'tactics-practice') {
            // nothing yet
        }
    }

    function changeCheckmateSelected(checkmateid) {
        for (let element of elements_checkmates){
            if (checkmateid === element.id) {
                element.classList.remove('not-selected')
                element.classList.add('selected')
                checkmateSelectedID = checkmateid;
            } else {
                element.classList.remove('selected')
                element.classList.add('not-selected')
            }
        }
    }

    // TODO: implement beaten checkmate list
    function updateCheckmatesBeaten() {
        for (let element of elements_checkmates){
            element.classList.remove('beaten')
            element.classList.add('unbeaten')
        }

        // elements_checkmates[2].classList.add('beaten')
        // elements_checkmates[2].classList.remove('unbeaten')
    }

    function callback_practiceBack(event) {
        event = event || window.event;
        close()
        guititle.open()
    }

    function callback_checkmatePractice(event) {
        event = event || window.event;
        changePracticeMode('checkmate-practice')
    }

    function callback_checkmateList(event){
        event = event || window.event;
        changeCheckmateSelected(event.currentTarget.id)
    }

    function callback_practicePlay(event) {
        event = event || window.event;

        if (modeSelected === 'checkmate-practice') {
            close()
            startCheckmatePractice()
        } else if (modeSelected === 'tactics-practice') {
            // nothing yet
        }
    }

    /**
     * Starts a checkmate practice game according to the options provided.
     */
    function startCheckmatePractice() {
        gui.setScreen('checkmate practice'); // Change screen location

        const startingPosition = checkmatepractice.generateCheckmateStartingPosition(checkmateSelectedID);
        const gameOptions = {
            metadata: {
                Event: `Infinite chess checkmate practice`,
                Site: "https://www.infinitechess.org/",
                Round: "-",
                Variant: "Classical",
                TimeControl: "-",
                White: "(You)",
                Black: "Engine"
            },
            youAreColor: 'white',
            clock: "-",
            variantOptions: {
                turn: "white",
                fullMove: "1",
                startingPosition: startingPosition,
                specialRights: {},
                gameRules: {
                    promotionRanks: null,
                    promotionsAllowed: {"white":[],"black":[]},
                    winConditions: {"white": ["checkmate"], "black": ["checkmate"]}
                }
            }
        }
        enginegame.setColorAndGameID(gameOptions)
        loadGame(gameOptions)
        enginegame.initEngineGame(gameOptions)
        clock.set(gameOptions.clock)
        guigameinfo.revealPlayerNames(gameOptions)
    }

    /**
     * Starts a game according to the options provided.
     * @param {Object} gameOptions - An object that contains the properties `metadata`, `moves`, `gameConclusion`
     * The `metadata` property contains the properties `Variant`, `White`, `Black`, `TimeControl`, `UTCDate`, `UTCTime`.
     */
    function loadGame(gameOptions) {
        console.log("Loading practice checkmate with game options:")
        console.log(gameOptions);
        main.renderThisFrame();
        movement.eraseMomentum();
        options.disableEM();

        gameOptions.metadata.UTCDate = gameOptions.metadata.UTCDate || math.getCurrentUTCDate();
        gameOptions.metadata.UTCTime = gameOptions.metadata.UTCTime || math.getCurrentUTCTime();

        const variantOptions = gameOptions.variantOptions
        const newGamefile = new gamefile(gameOptions.metadata, { moves: undefined, variantOptions})
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
        startCheckmatePractice,
        onPracticePage
    })

})();