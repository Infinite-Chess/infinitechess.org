
/*
 * This script handles our Puzzle page, containing
 * our puzzle selection menu.
 */

"use strict";

const guipuzzle = (function(){

    // Variables

    const element_menuExternalLinks = document.getElementById('menu-external-links');

    const element_PuzzleSelection = document.getElementById('puzzle-selection')
    const element_PuzzleName = document.getElementById('puzzle-name')
    const element_puzzleBack = document.getElementById('puzzle-back')
    const element_endgamePuzzle = document.getElementById('endgame-puzzle')
    const element_tacticsPuzzle = document.getElementById('tactics-puzzle')
    const element_puzzlePlay = document.getElementById('puzzle-play')

    let modeSelected; // endgame-puzzle / tactics-puzzle

    // Functions

    function getModeSelected() {
        return modeSelected;
    }

    function open() {
        gui.setScreen('title puzzle')
        style.revealElement(element_PuzzleSelection)
        style.revealElement(element_menuExternalLinks);
        changePuzzleMode('endgame-puzzle')
        initListeners()
    }

    function close() {
        style.hideElement(element_PuzzleSelection)
        style.hideElement(element_menuExternalLinks);
        closeListeners()
    }

    function initListeners() {
        element_puzzleBack.addEventListener('click', callback_puzzleBack)
        element_endgamePuzzle.addEventListener('click', callback_endgamePuzzle)
        element_tacticsPuzzle.addEventListener('click', gui.callback_featurePlanned)
        element_puzzlePlay.addEventListener('click', callback_puzzlePlay)
    }

    function closeListeners() {
        element_puzzleBack.removeEventListener('click', callback_puzzleBack)
        element_endgamePuzzle.removeEventListener('click', callback_endgamePuzzle)
        element_tacticsPuzzle.removeEventListener('click', gui.callback_featurePlanned)
        element_puzzlePlay.removeEventListener('click', callback_puzzlePlay)
    }

    function changePuzzleMode(mode) { // endgame-puzzle / tactics-puzzle
        modeSelected = mode
        if (mode === 'endgame-puzzle') {
            element_PuzzleName.textContent = translations["menu_endgame"]
            element_endgamePuzzle.classList.add('selected')
            element_tacticsPuzzle.classList.remove('selected')
            element_endgamePuzzle.classList.remove('not-selected')
            element_tacticsPuzzle.classList.add('not-selected')
            // callback_updateOptions()
        } else if (mode === 'tactics-puzzle') {
            // nothing yet
        }
    }

    function callback_puzzleBack(event) {
        event = event || window.event;
        close()
        guititle.open()
    }

    function callback_endgamePuzzle(event) {
        event = event || window.event;
        changePuzzleMode('endgame-puzzle')
    }

    function callback_puzzlePlay(event) {
        event = event || window.event;

        const gameOptions = {
            variant: "Classical",
            clock: "-",
            color: "White",
            rated: "casual",
            publicity: "private"
        }

        if (modeSelected === 'endgame-puzzle') {
            close()
            startEndgamePuzzle(gameOptions)
        } else if (modeSelected === 'tactics-puzzle') {
            // nothing yet
        }
    }

    /**
     * Starts a local game according to the options provided.
     * @param {Object} inviteOptions - An object that contains the invite properties `variant`, `clock`, `color`, `publicity`, `rated`.
     */
    function startEndgamePuzzle(inviteOptions) {
        gui.setScreen('endgame puzzle'); // Change screen location

        // [Event "Casual Space Classic infinite chess game"] [Site "https://www.infinitechess.org/"] [Round "-"]
        const gameOptions = {
            metadata: {
                Event: `Infinite chess endgame puzzle`,
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
        console.log("Loading puzzle with game options:")
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
     * Returns *true* if we are on the puzzle page.
     * @returns {boolean}
     */
    function onPuzzlePage() {
        return gui.getScreen() === 'title puzzle'
    }

    return Object.freeze({
        getModeSelected,
        open,
        close,
        startEndgamePuzzle,
        onPuzzlePage
    })

})();