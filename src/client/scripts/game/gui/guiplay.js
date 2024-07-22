
/*
 * This script handles our Play page, containing
 * our invite creation menu.
 */

"use strict";

const guiplay = (function(){

    // Variables

    const element_menuExternalLinks = document.getElementById('menu-external-links');

    const element_PlaySelection = document.getElementById('play-selection')
    const element_playName = document.getElementById('play-name')
    const element_playBack = document.getElementById('play-back')
    const element_online = document.getElementById('online')
    const element_local = document.getElementById('local')
    const element_computer = document.getElementById('computer')
    const element_createInvite = document.getElementById('create-invite')

    const element_optionCardColor = document.getElementById('option-card-color')
    const element_optionCardPrivate = document.getElementById('option-card-private')
    const element_optionCardRated = document.getElementById('option-card-rated')
    const element_optionVariant = document.getElementById('option-variant')
    const element_optionClock = document.getElementById('option-clock')
    const element_optionColor = document.getElementById('option-color')
    const element_optionPrivate = document.getElementById('option-private')
    const element_optionRated = document.getElementById('option-rated')

    const element_joinPrivate = document.getElementById('join-private')
    const element_inviteCode = document.getElementById('invite-code')
    const element_copyInviteCode = document.getElementById('copy-button')
    const element_joinPrivateMatch = document.getElementById('join-button')
    const element_textboxPrivate = document.getElementById('textbox-private')

    let modeSelected; // online / local / computer

    const indexOf10m = 5
    const indexOfInfiniteTime = 12

    // Functions

    function getModeSelected() {
        return modeSelected;
    }

    function getElement_joinPrivate() {
        return element_joinPrivate;
    }

    function getElement_inviteCode() {
        return element_inviteCode;
    }

    function open() {
        gui.setScreen('title play')
        style.revealElement(element_PlaySelection)
        style.revealElement(element_menuExternalLinks);
        changePlayMode('online')
        initListeners()
        invites.subscribeToInvites(); // Subscribe to the invites list subscription service!
    }

    function close() {
        style.hideElement(element_PlaySelection)
        style.hideElement(element_menuExternalLinks);
        closeListeners()
        // This will auto-cancel our existing invite
        // IT ALSO clears the existing invites in the document!
        websocket.unsubFromInvites();
    }

    function initListeners() {
        element_playBack.addEventListener('click', callback_playBack)
        element_online.addEventListener('click', callback_online)
        element_local.addEventListener('click', callback_local)
        element_computer.addEventListener('click', gui.callback_featurePlanned)
        element_createInvite.addEventListener('click', callback_createInvite)
        element_optionColor.addEventListener('change', callback_updateOptions)
        element_optionClock.addEventListener('change', callback_updateOptions)
        element_joinPrivateMatch.addEventListener('click', callback_joinPrivate)
        element_copyInviteCode.addEventListener('click', callback_copyInviteCode)
        element_textboxPrivate.addEventListener('keyup', callback_textboxPrivateEnter)
    }

    function closeListeners() {
        element_playBack.removeEventListener('click', callback_playBack)
        element_online.removeEventListener('click', callback_online)
        element_local.removeEventListener('click', callback_local)
        element_computer.removeEventListener('click', gui.callback_featurePlanned)
        element_createInvite.removeEventListener('click', callback_createInvite)
        element_optionColor.removeEventListener('change', callback_updateOptions)
        element_optionClock.removeEventListener('change', callback_updateOptions)
        element_joinPrivateMatch.removeEventListener('click', callback_joinPrivate)
        element_copyInviteCode.removeEventListener('click', callback_copyInviteCode)
        element_textboxPrivate.removeEventListener('keyup', callback_textboxPrivateEnter)
    }

    function changePlayMode(mode) { // online / local / computer
        modeSelected = mode
        if (mode === 'online') {
            element_playName.textContent = translations["menu_online"]
            element_online.classList.add('selected')
            element_local.classList.remove('selected')
            element_online.classList.remove('not-selected')
            element_local.classList.add('not-selected')
            element_createInvite.textContent = "Create Invite"
            element_optionCardColor.classList.remove('hidden')
            element_optionCardRated.classList.remove('hidden')
            element_optionCardPrivate.classList.remove('hidden')
            const localStorageClock = localstorage.loadItem('clock_online');
            element_optionClock.selectedIndex = localStorageClock != null ? localStorageClock : indexOf10m; // 10m+4s
            element_joinPrivate.classList.remove('hidden')
            // callback_updateOptions()
        } else if (mode === 'local') {
            guiplay.setElement_CreateInviteEnabled(true);
            invites.cancel()
            element_playName.textContent = translations["menu_local"]
            element_online.classList.remove('selected')
            element_local.classList.add('selected')
            element_online.classList.add('not-selected')
            element_local.classList.remove('not-selected')
            element_createInvite.textContent = "Start Game"
            element_optionCardColor.classList.add('hidden')
            element_optionCardRated.classList.add('hidden')
            element_optionCardPrivate.classList.add('hidden')
            const localStorageClock = localstorage.loadItem('clock_local');
            element_optionClock.selectedIndex = localStorageClock != null ? localStorageClock : indexOfInfiniteTime; // Infinite Time
            element_joinPrivate.classList.add('hidden')
            element_inviteCode.classList.add('hidden')
        }
    }

    function callback_playBack(event) {
        event = event || window.event;
        close()
        guititle.open()
    }

    function callback_online(event) {
        event = event || window.event;
        changePlayMode('online')
    }

    function callback_local(event) {
        event = event || window.event;
        changePlayMode('local')
    }

    // Also starts local games
    function callback_createInvite(event) {
        event = event || window.event;

        const gameOptions = {
            variant: element_optionVariant.value,
            clock: element_optionClock.value,
            color: element_optionColor.value,
            rated: element_optionRated.value,
            publicity: element_optionPrivate.value
        }

        if (modeSelected === 'local') {
            close()
            startLocalGame(gameOptions)
        } else if (modeSelected === 'online') {
            if (invites.doWeHave()) invites.cancel(undefined, true)
            else                      invites.create(gameOptions)
        }
    }

    // Call whenever the Clock or Color inputs change, or play mode changes
    function callback_updateOptions(event) {
        event = event || window.event;
        
        savePreferredClockOption(element_optionClock.selectedIndex);
        
        if (modeSelected !== 'online') return;

        const clockValue = element_optionClock.value
        const colorValue = element_optionColor.value
        if (clockValue === "0" || colorValue !== "Random") element_optionRated.disabled = true;
        else                                               element_optionRated.disabled = false;

    }

    function savePreferredClockOption(clockIndex) {
        const localOrOnline = modeSelected;
        localstorage.saveItem(`clock_${localOrOnline}`, clockIndex, math.getTotalMilliseconds({ days: 7 }))
    }

    function callback_joinPrivate(event) {
        event = event || window.event;

        const code = element_textboxPrivate.value.toLowerCase()

        if (code.length !== 5) return statustext.showStatus(translations["invite_error_digits"])

        element_joinPrivateMatch.disabled = true; // Re-enable when the code is changed
        
        const isPrivate = true;
        invites.accept(code, isPrivate)
    }

    function callback_textboxPrivateEnter(event) {
        event = event || window.event;

        // 13 is the key code for Enter key
        if (event.keyCode === 13) {
            if (!element_joinPrivateMatch.disabled) callback_joinPrivate(event)
        } else element_joinPrivateMatch.disabled = false; // Re-enable when the code is changed
    }

    function callback_copyInviteCode(event) {
        event = event || window.event;

        if (!modeSelected.includes('online')) return;
        if (!invites.doWeHave()) return;
        
        // Copy our private invite code.

        const code = invites.gelement_iCodeCode().textContent;
        
        main.copyToClipboard(code)
        statustext.showStatus(translations["invite_copied"])
    }

    function initListeners_Invites() {
        const invites = document.querySelectorAll('.invite');

        invites.forEach(element => {
            element.addEventListener('mouseenter', callback_inviteMouseEnter)
            element.addEventListener('mouseleave', callback_inviteMouseLeave)
            element.addEventListener('click', callback_inviteClicked)
        });
    }

    function closeListeners_Invites() {
        const invites = document.querySelectorAll('.invite');

        invites.forEach(element => {
            element.removeEventListener('mouseenter', callback_inviteMouseEnter)
            element.removeEventListener('mouseleave', callback_inviteMouseLeave)
            element.removeEventListener('click', callback_inviteClicked)
        });
    }

    function callback_inviteMouseEnter(event) {
        event = event || window.event;

        event.target.classList.add('hover')

    }

    function callback_inviteMouseLeave(event) {
        event = event || window.event;

        event.target.classList.remove('hover')
    }

    function callback_inviteClicked(event) {
        event = event || window.event;

        invites.click(event.currentTarget)
    }

    /**
     * Starts a local game according to the options provided.
     * @param {Object} inviteOptions - An object that contains the invite properties `variant`, `clock`, `color`, `publicity`, `rated`.
     */
    function startLocalGame(inviteOptions) {
        // console.log("Starting local game with invite options:")
        // console.log(inviteOptions);
        gui.setScreen('game local'); // Change screen location

        const untimedGame = clock.isClockValueInfinite(inviteOptions.clock);
        const gameOptions = {
            metadata: {
                Variant: inviteOptions.variant,
                Clock: untimedGame ? "Infinite" : inviteOptions.clock
            }
        }
        loadGame(gameOptions)
        clock.set(inviteOptions.clock)
        guigameinfo.hidePlayerNames();
    }

    /**
     * Starts an online game according to the options provided by the server.
     * @param {Object} gameOptions - An object that contains the properties
     * `metadata`, `id`, `publicity`, `youAreColor`, `moves`, `timerWhite`,
     * `timerBlack`, `timeNextPlayerLosesAt`, `autoAFKResignTime`,
     * `disconnect`, `gameConclusion`, `serverRestartingAt`
     * 
     * The `metadata` property contains the properties `Variant`, `White`, `Black`, `Clock`, `Date`, `Rated`.
     */
    function startOnlineGame(gameOptions) {
        gui.setScreen('game online') // Change screen location
        // Must be set BEFORE loading the game, because the mesh generation relies on the color we are.
        onlinegame.setColorAndGameID(gameOptions)
        gameOptions.variantOptions = generateVariantOptionsIfReloadingPrivateCustomGame();
        loadGame(gameOptions)
        onlinegame.initOnlineGame(gameOptions);
        clock.set(gameOptions.clock, { timerWhite: gameOptions.timerWhite, timerBlack: gameOptions.timerBlack, timeNextPlayerLosesAt: gameOptions.timeNextPlayerLosesAt })
        guigameinfo.revealPlayerNames(gameOptions)
    }

    function generateVariantOptionsIfReloadingPrivateCustomGame() {
        if (!onlinegame.getIsPrivate()) return; // Can't play/paste custom position in public matches.
        const gameID = onlinegame.getGameID();
        if (gameID == null) return console.error("Can't generate variant options when reloading private custom game because gameID isn't defined yet.")
        return localstorage.loadItem(gameID)

        // The variant options passed into the variant loader needs to contain the following properties:
        // `turn`, `fullMove`, `enpassant`, `moveRule`, `positionString`, `startingPosition`, `specialRights`, `gameRules`.
        // const variantOptions = {
        //     turn: longformat.turn,
        //     fullMove: longformat.fullMove,
        //     enpassant: longformat.enpassant,
        //     moveRule: longformat.moveRule,
        //     positionString: longformat.shortposition,
        //     startingPosition: longformat.startingPosition,
        //     specialRights: longformat.specialRights,
        //     gameRules: longformat.gameRules
        // }
    }

    /**
     * Starts a game according to the options provided.
     * @param {Object} gameOptions - An object that contains the properties `metadata`, `moves`, `gameConclusion`

     * The `metadata` property contains the properties `Variant`, `White`, `Black`, `Clock`, `Date`.
     */
    function loadGame(gameOptions) {
        console.log("Loading game with game options:")
        console.log(gameOptions);
        main.renderThisFrame();
        movement.eraseMomentum();
        options.disableEM();

        gameOptions.metadata.Date = gameOptions.metadata.Date || math.getUTCDateTime();

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

    function setElement_CreateInviteEnabled(value) {
        element_createInvite.disabled = !value;
    }

    function setElement_CreateInviteTextContent(text) {
        element_createInvite.textContent = text;
    }

    /**
     * Returns *true* if we are on the play page.
     * @returns {boolean}
     */
    function onPlayPage() {
        return gui.getScreen() === 'title play'
    }

    return Object.freeze({
        getElement_joinPrivate,
        getElement_inviteCode,
        getModeSelected,
        open,
        close,
        startOnlineGame,
        setElement_CreateInviteEnabled,
        setElement_CreateInviteTextContent,
        initListeners_Invites,
        closeListeners_Invites,
        onPlayPage
    })

})();