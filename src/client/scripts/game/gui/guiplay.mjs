// Import Start
import { websocket } from '../websocket.mjs'
import { guigameinfo } from './guigameinfo.mjs'
import { area } from '../rendering/area.mjs'
import { onlinegame } from '../misc/onlinegame.mjs'
import { localstorage } from '../misc/localstorage.mjs'
import { main } from '../main.mjs'
import { math } from '../misc/math.mjs'
import { style } from './style.mjs'
import { game } from '../chess/game.mjs'
import { sound } from '../misc/sound.mjs'
import { clock } from '../misc/clock.js'
import { movement } from '../rendering/movement.mjs'
import { options } from '../rendering/options.mjs'
import { statustext } from './statustext.mjs'
import { invites } from '../misc/invites.mjs'
import { gui } from './gui.mjs'
import { gamefile } from '../chess/gamefile.mjs'
import { guititle } from './guititle.mjs'
// Import End


/*
 * This script handles our Play page, containing
 * our invite creation menu.
 */

"use strict";

// eslint-disable-next-line no-unused-vars
const guiplay = (function() {

    // Variables

    const element_menuExternalLinks = document.getElementById('menu-external-links');

    const element_PlaySelection = document.getElementById('play-selection');
    const element_playName = document.getElementById('play-name');
    const element_playBack = document.getElementById('play-back');
    const element_online = document.getElementById('online');
    const element_local = document.getElementById('local');
    const element_computer = document.getElementById('computer');
    const element_createInvite = document.getElementById('create-invite');

    const element_optionCardColor = document.getElementById('option-card-color');
    const element_optionCardPrivate = document.getElementById('option-card-private');
    const element_optionCardRated = document.getElementById('option-card-rated');
    const element_optionVariant = document.getElementById('option-variant');
    const element_optionClock = document.getElementById('option-clock');
    const element_optionColor = document.getElementById('option-color');
    const element_optionPrivate = document.getElementById('option-private');
    const element_optionRated = document.getElementById('option-rated');

    const element_joinPrivate = document.getElementById('join-private');
    const element_inviteCode = document.getElementById('invite-code');
    const element_copyInviteCode = document.getElementById('copy-button');
    const element_joinPrivateMatch = document.getElementById('join-button');
    const element_textboxPrivate = document.getElementById('textbox-private');

    /** Whether the play screen is open */
    let pageIsOpen = false;

    /** Whether we've selected "online", "local", or a "computer" game. @type {string} */
    let modeSelected;

    const indexOf10m = 5;
    const indexOfInfiniteTime = 12;

    /**
     * Whether the create invite button is currently locked.
     * When we create an invite, the button is disabled until we hear back from the server.
     */
    let createInviteButtonIsLocked = false;
    /**
     * Whether the *virtual* accept invite button is currently locked.
     * When we click invites to accept them. We have to temporarily disable
     * accepting invites so that we have spam protection and don't get the
     * "You are already in a game" server error.
     */
    let acceptInviteButtonIsLocked = false;

    // Functions

    /**
     * Whether or not the play page is currently open, and the invites are visible.
     * @returns {boolean}
     */
    function isOpen() { return pageIsOpen; }

    /**
     * Returns whether we've selected "online", "local", or a "computer" game.
     * @returns {boolean}
     */
    function getModeSelected() { return modeSelected; }

    function hideElement_joinPrivate() { style.hideElement(element_joinPrivate); }
    function showElement_joinPrivate() { style.revealElement(element_joinPrivate); }
    function hideElement_inviteCode() { style.hideElement(element_inviteCode); }
    function showElement_inviteCode() { style.revealElement(element_inviteCode); }

    function open() {
        pageIsOpen = true;
        gui.setScreen('title play');
        style.revealElement(element_PlaySelection);
        style.revealElement(element_menuExternalLinks);
        changePlayMode('online');
        initListeners();
        invites.subscribeToInvites(); // Subscribe to the invites list subscription service!
    }

    function close() {
        pageIsOpen = false;
        style.hideElement(element_PlaySelection);
        style.hideElement(element_menuExternalLinks);
        hideElement_inviteCode();
        closeListeners();
        // This will auto-cancel our existing invite
        // IT ALSO clears the existing invites in the document!
        websocket.unsubFromInvites();
    }

    function initListeners() {
        element_playBack.addEventListener('click', callback_playBack);
        element_online.addEventListener('click', callback_online);
        element_local.addEventListener('click', callback_local);
        element_computer.addEventListener('click', gui.callback_featurePlanned);
        element_createInvite.addEventListener('click', callback_createInvite);
        element_optionColor.addEventListener('change', callback_updateOptions);
        element_optionClock.addEventListener('change', callback_updateOptions);
        element_joinPrivateMatch.addEventListener('click', callback_joinPrivate);
        element_copyInviteCode.addEventListener('click', callback_copyInviteCode);
        element_textboxPrivate.addEventListener('keyup', callback_textboxPrivateEnter);
    }

    function closeListeners() {
        element_playBack.removeEventListener('click', callback_playBack);
        element_online.removeEventListener('click', callback_online);
        element_local.removeEventListener('click', callback_local);
        element_computer.removeEventListener('click', gui.callback_featurePlanned);
        element_createInvite.removeEventListener('click', callback_createInvite);
        element_optionColor.removeEventListener('change', callback_updateOptions);
        element_optionClock.removeEventListener('change', callback_updateOptions);
        element_joinPrivateMatch.removeEventListener('click', callback_joinPrivate);
        element_copyInviteCode.removeEventListener('click', callback_copyInviteCode);
        element_textboxPrivate.removeEventListener('keyup', callback_textboxPrivateEnter);
    }

    function changePlayMode(mode) { // online / local / computer
        if (mode === 'online' && createInviteButtonIsLocked) disableCreateInviteButton(); // Disable it immediately, it's still locked from the last time we clicked it (we quickly clicked "Local" then "Online" again before we heard back from the server)
        if (mode !== 'online' && invites.doWeHave()) element_createInvite.click(); // Simulate clicking to cancel our invite, BEFORE we switch modes (because if the mode is local it will just start the game)

        modeSelected = mode;
        if (mode === 'online') {
            element_playName.textContent = translations["menu_online"];
            element_online.classList.add('selected');
            element_local.classList.remove('selected');
            element_online.classList.remove('not-selected');
            element_local.classList.add('not-selected');
            element_createInvite.textContent = translations["invites"]["create_invite"];
            element_optionCardColor.classList.remove('hidden');
            element_optionCardRated.classList.remove('hidden');
            element_optionCardPrivate.classList.remove('hidden');
            const localStorageClock = localstorage.loadItem('preferred_online_clock_invite_value');
            element_optionClock.selectedIndex = localStorageClock !== undefined ? localStorageClock : indexOf10m; // 10m+4s
            element_joinPrivate.classList.remove('hidden');
            // callback_updateOptions()
        } else if (mode === 'local') {
            // Enabling the button doesn't necessarily unlock it. It's enabled for "local" so that we
            // can click "Start Game" at any point. But it will be re-disabled if we click "online" rapidly,
            // because it was still locked from us still waiting for the server's repsponse to our last create/cancel command.
            enableCreateInviteButton();
            element_playName.textContent = translations["menu_local"];
            element_online.classList.remove('selected');
            element_local.classList.add('selected');
            element_online.classList.add('not-selected');
            element_local.classList.remove('not-selected');
            element_createInvite.textContent = translations["invites"]["start_game"];
            element_optionCardColor.classList.add('hidden');
            element_optionCardRated.classList.add('hidden');
            element_optionCardPrivate.classList.add('hidden');
            const localStorageClock = localstorage.loadItem('preferred_local_clock_invite_value');
            element_optionClock.selectedIndex = localStorageClock !== undefined ? localStorageClock : indexOfInfiniteTime; // Infinite Time
            element_joinPrivate.classList.add('hidden');
            element_inviteCode.classList.add('hidden');
        }
    }

    function callback_playBack() {
        close();
        guititle.open();
    }

    function callback_online() {
        changePlayMode('online');
    }

    function callback_local() {
        changePlayMode('local');
    }

    // Also starts local games
    function callback_createInvite() {

        const gameOptions = {
            variant: element_optionVariant.value,
            clock: element_optionClock.value,
            color: element_optionColor.value,
            rated: element_optionRated.value,
            publicity: element_optionPrivate.value
        };

        if (modeSelected === 'local') {
            close();
            startLocalGame(gameOptions);
        } else if (modeSelected === 'online') {
            if (invites.doWeHave()) invites.cancel();
            else invites.create(gameOptions);
        }
    }

    // Call whenever the Clock or Color inputs change, or play mode changes
    function callback_updateOptions() {
        
        savePreferredClockOption(element_optionClock.selectedIndex);
        
        if (modeSelected !== 'online') return;

        const clockValue = element_optionClock.value;
        const colorValue = element_optionColor.value;
        if (clockValue === "0" || colorValue !== "Random") element_optionRated.disabled = true;
        else element_optionRated.disabled = false;

    }

    function savePreferredClockOption(clockIndex) {
        const localOrOnline = modeSelected;
        // For search results: preferred_local_clock_invite_value preferred_online_clock_invite_value
        localstorage.saveItem(`preferred_${localOrOnline}_clock_invite_value`, clockIndex, math.getTotalMilliseconds({ days: 7 }));
    }

    function callback_joinPrivate() {

        const code = element_textboxPrivate.value.toLowerCase();

        if (code.length !== 5) return statustext.showStatus(translations["invite_error_digits"]);

        element_joinPrivateMatch.disabled = true; // Re-enable when the code is changed
        
        const isPrivate = true;
        invites.accept(code, isPrivate);
    }

    function callback_textboxPrivateEnter() {

        // 13 is the key code for Enter key
        if (event.keyCode === 13) {
            if (!element_joinPrivateMatch.disabled) callback_joinPrivate(event);
        } else element_joinPrivateMatch.disabled = false; // Re-enable when the code is changed
    }

    function callback_copyInviteCode() {

        if (!modeSelected.includes('online')) return;
        if (!invites.doWeHave()) return;
        
        // Copy our private invite code.

        const code = invites.gelement_iCodeCode().textContent;
        
        main.copyToClipboard(code);
        statustext.showStatus(translations["invite_copied"]);
    }

    function initListeners_Invites() {
        const invites = document.querySelectorAll('.invite');

        invites.forEach(element => {
            element.addEventListener('mouseenter', callback_inviteMouseEnter);
            element.addEventListener('mouseleave', callback_inviteMouseLeave);
            element.addEventListener('click', callback_inviteClicked);
        });
    }

    function closeListeners_Invites() {
        const invites = document.querySelectorAll('.invite');

        invites.forEach(element => {
            element.removeEventListener('mouseenter', callback_inviteMouseEnter);
            element.removeEventListener('mouseleave', callback_inviteMouseLeave);
            element.removeEventListener('click', callback_inviteClicked);
        });
    }

    function callback_inviteMouseEnter() {
        event.target.classList.add('hover');

    }

    function callback_inviteMouseLeave() {
        event.target.classList.remove('hover');
    }

    function callback_inviteClicked(event) {
        invites.click(event.currentTarget);
    }

    /**
     * Starts a local game according to the options provided.
     * @param {Object} inviteOptions - An object that contains the invite properties `variant`, `clock`, `color`, `publicity`, `rated`.
     */
    function startLocalGame(inviteOptions) {
        // console.log("Starting local game with invite options:")
        // console.log(inviteOptions);
        gui.setScreen('game local'); // Change screen location

        // [Event "Casual Space Classic infinite chess game"] [Site "https://www.infinitechess.org/"] [Round "-"]
        const gameOptions = {
            metadata: {
                Event: `Casual local ${translations[inviteOptions.variant]} infinite chess game`,
                Site: "https://www.infinitechess.org/",
                Round: "-",
                Variant: inviteOptions.variant,
                TimeControl: inviteOptions.clock
            }
        };
        loadGame(gameOptions);
        clock.set(inviteOptions.clock);
        guigameinfo.hidePlayerNames();
    }

    /**
     * Starts an online game according to the options provided by the server.
     * @param {Object} gameOptions - An object that contains the properties
     * `metadata`, `id`, `publicity`, `youAreColor`, `moves`, `timerWhite`,
     * `timerBlack`, `timeNextPlayerLosesAt`, `autoAFKResignTime`,
     * `disconnect`, `gameConclusion`, `serverRestartingAt`, `drawOffer`
     * 
     * The `metadata` property contains the properties `Variant`, `White`, `Black`, `TimeControl`, `UTCDate`, `UTCTime`, `Rated`.
     */
    function startOnlineGame(gameOptions) {
        gui.setScreen('game online'); // Change screen location
        // Must be set BEFORE loading the game, because the mesh generation relies on the color we are.
        onlinegame.setColorAndGameID(gameOptions);
        gameOptions.variantOptions = generateVariantOptionsIfReloadingPrivateCustomGame();
        loadGame(gameOptions);
        onlinegame.initOnlineGame(gameOptions);
        clock.set(gameOptions.clock, { timerWhite: gameOptions.timerWhite, timerBlack: gameOptions.timerBlack, timeNextPlayerLosesAt: gameOptions.timeNextPlayerLosesAt });
        guigameinfo.revealPlayerNames(gameOptions);
        drawoffers.set(gameOptions.drawOffer);
    }

    function generateVariantOptionsIfReloadingPrivateCustomGame() {
        if (!onlinegame.getIsPrivate()) return; // Can't play/paste custom position in public matches.
        const gameID = onlinegame.getGameID();
        if (!gameID) return console.error("Can't generate variant options when reloading private custom game because gameID isn't defined yet.");
        return localstorage.loadItem(gameID);

        // The variant options passed into the variant loader needs to contain the following properties:
        // `fullMove`, `enpassant`, `moveRule`, `positionString`, `startingPosition`, `specialRights`, `gameRules`.
        // const variantOptions = {
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
     * The `metadata` property contains the properties `Variant`, `White`, `Black`, `TimeControl`, `UTCDate`, `UTCTime`.
     */
    function loadGame(gameOptions) {
        console.log("Loading game with game options:");
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
        });
        game.loadGamefile(newGamefile);

        const centerArea = area.calculateFromUnpaddedBox(newGamefile.startSnapshot.box);
        movement.setPositionToArea(centerArea, "pidough");
        
        options.setNavigationBar(true);
        sound.playSound_gamestart();
    }

    /**
     * Locks the create invite button to disable it.
     * When we hear the response from the server, we will re-enable it.
     */
    function lockCreateInviteButton() {
        createInviteButtonIsLocked = true;
        // ONLY ACTUALLY disabled the button if we're on the "online" screen
        if (modeSelected !== 'online') return;
        element_createInvite.disabled = true;
        // console.log('Locked create invite button.');
    }

    /**
     * Unlocks the create invite button to re-enable it.
     * We have heard a response from the server, and are allowed
     * to try to cancel/create an invite again.
     */
    function unlockCreateInviteButton() {
        createInviteButtonIsLocked = false;
        element_createInvite.disabled = false;
        // console.log('Unlocked create invite button.');
    }
    
    function disableCreateInviteButton() { element_createInvite.disabled = true; }
    function enableCreateInviteButton() { element_createInvite.disabled = false; }
    function setElement_CreateInviteTextContent(text) { element_createInvite.textContent = text;  }

    /**
     * Whether the Create Invite button is locked.
     * @returns {boolean}
     */
    function isCreateInviteButtonLocked() { return createInviteButtonIsLocked; }

    /**
     * Locks the *virtual* accept invite button to disable clicking other people's invites.
     * When we hear the response from the server, we will re-enable this.
     */
    function lockAcceptInviteButton() {
        acceptInviteButtonIsLocked = true;
        // console.log('Locked accept invite button.');
    }

    /**
     * Unlocks the accept invite button to re-enable it.
     * We have heard a response from the server, and are allowed
     * to try to cancel/create an invite again.
     */
    function unlockAcceptInviteButton() {
        acceptInviteButtonIsLocked = false;
        // console.log('Unlocked accept invite button.');
    }
    
    /**
     * Whether the *virtual* Accept Invite button is locked.
     * If it's locked, this means we temporarily cannot click other people's invites.
     * @returns {boolean}
     */
    function isAcceptInviteButtonLocked() { return acceptInviteButtonIsLocked; }

    /**
     * Call when the socket closes, whether or not it was unexpected.
     * This unlocks the create invite and *virtual* accept invite buttons,
     * because we can't hope to receive their reply anytime soon, which
     * replyto number is what we look for to unlock these buttons,
     * we would never be able to click them again otherwise.
     */
    function onSocketClose() {
        unlockCreateInviteButton();
        unlockAcceptInviteButton();
    }

    /**
     * Returns *true* if we are on the play page.
     * @returns {boolean}
     */
    function onPlayPage() {
        return gui.getScreen() === 'title play';
    }

    return Object.freeze({
        isOpen,
        hideElement_joinPrivate,
        showElement_joinPrivate,
        hideElement_inviteCode,
        showElement_inviteCode,
        getModeSelected,
        open,
        close,
        startOnlineGame,
        setElement_CreateInviteTextContent,
        initListeners_Invites,
        closeListeners_Invites,
        onPlayPage,
        lockCreateInviteButton,
        unlockCreateInviteButton,
        isCreateInviteButtonLocked,
        lockAcceptInviteButton,
        unlockAcceptInviteButton,
        isAcceptInviteButtonLocked,
        onSocketClose,
    });

})();

export { guiplay };