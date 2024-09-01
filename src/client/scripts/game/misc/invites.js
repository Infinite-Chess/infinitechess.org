
/*
 * This script manages the invites on the Play page.
 */

// Import Start
import websocket from '../websocket.js';
import localstorage from './localstorage.js';
import sound from './sound.js';
import clock from './clock.js';
import guiplay from '../gui/guiplay.js';
import loadbalancer from './loadbalancer.js';
import math from './math.js';
import style from '../gui/style.js';
import input from '../input.js';
import statustext from '../gui/statustext.js';
// Import End

"use strict";

/**
 * @typedef {Object} Invite - The invite object. NOT an HTML object.
 * @property {string} name - Who owns the invite. If it's a guest, then "(Guest)". If it's us, we like to change this to "(You)"
 * @property {string} id - A unique identifier
 * @property {string} tag - Used to verify if an invite is your own.
 * @property {string} variant - The name of the variant
 * @property {string} clock - The clock value
 * @property {string} color - white/black
 * @property {string} publicity - public/private
 * @property {string} rated - rated/casual
 */

const invites = (function() {

    const invitesContainer = document.getElementById('invites');
    const ourInviteContainer = document.getElementById('our-invite');

    /** The invites list. @type {Invite[]} */
    let activeInvites; // Invites list

    let weHaveInvite = false;
    let ourInviteID;

    const element_joinExisting = document.getElementById('join-existing');
    const element_inviteCodeCode = document.getElementById('invite-code-code');


    function gelement_iCodeCode() {
        return element_inviteCodeCode;
    }

    function update() {
        if (!guiplay.onPlayPage()) return; // Not on the play screen
        if (loadbalancer.gisHibernating()) statustext.showStatus(translations.invites.move_mouse, false, 0.1);
    }

    function unsubIfWeNotHave() {
        if (!weHaveInvite) websocket.unsubFromInvites();
    }


    // Update invites list according to new data!
    // Should be called by websocket script when it receives a
    // message that the server says is for the "invites" subscription
    function onmessage(data) { // { sub, action, value, id }
        // Any incoming message will have no effect if we're not on the invites page.
        // This can happen if we have slow network and leave the invites screen before the server sends us an invites-related message.
        if (!guiplay.isOpen()) return;

        switch (data.action) {
            case "inviteslist":
                // Update the list in the document
                updateInviteList(data.value.invitesList);
                updateActiveGameCount(data.value.currentGameCount);
                break;
            case "gamecount":
                updateActiveGameCount(data.value);
                break;
            default:
                statustext.showStatus(`${translations.invites.unknown_action_received_1} ${data.action} ${translations.invites.unknown_action_received_2}`, true);
                break;
        }
    }

    function create(inviteOptions) { // { variant, clock, color, rated, publicity }
        if (weHaveInvite) return console.error("We already have an existing invite, can't create more.");

        generateTagForInvite(inviteOptions);

        guiplay.lockCreateInviteButton();

        // The function to execute when we hear back the server's response
        const onreplyFunc = guiplay.unlockCreateInviteButton;

        websocket.sendmessage("invites", "createinvite", inviteOptions, true, onreplyFunc);
    }

    function cancel(id = ourInviteID) {
        if (!weHaveInvite) return;
        if (!id) return statustext.showStatus(translations.invites.cannot_cancel, true);

        deleteInviteTagInLocalStorage();

        guiplay.lockCreateInviteButton();

        // The function to execute when we hear back the server's response
        const onreplyFunc = guiplay.unlockCreateInviteButton;

        websocket.sendmessage("invites", "cancelinvite", id, true, onreplyFunc);
    }

    // Generates a tag id for the invite parameters before we send off action "createinvite" to the server
    function generateTagForInvite(inviteOptions) {
        // Create and send invite with a tag so we know which ones ours
        const tag = math.generateID(8);

        // NEW browser storage method!
        localstorage.saveItem('invite-tag', tag);

        inviteOptions.tag = tag;
    }
    
    function deleteInviteTagInLocalStorage() {
        localstorage.deleteItem('invite-tag');
    }

    /**
     * Updates the invite elements on the invite creation screen according to the new list provided.
     * @param {Invite[]} list - The latest invite list
     */
    function updateInviteList(list) { // { invitesList, currentGameCount }
        if (!list) return;
        
        activeInvites = list;
        const alreadySeenOurInvite = weHaveInvite;
        let alreadyPlayedSound = false;

        // Close all previous event listeners and delete invites from the document
        clear();

        // Append latest invites to the document and re-init event listeners.
        let foundOurs = false;
        let privateInviteID = undefined;
        ourInviteID = undefined;
        for (let i = 0; i < list.length; i++) { // { name, variant, clock, color, publicity }
            const invite = list[i];

            // Is this our own invite?
            const ours = foundOurs ? false : isInviteOurs(invite);
            if (ours) {
                foundOurs = true;
                ourInviteID = invite.id;
                if (!alreadySeenOurInvite) {
                    sound.playSound_marimba();
                    alreadyPlayedSound = true;
                }
            }

            const classes = ['invite', 'button', 'unselectable'];
            const isPrivate = invite.publicity === 'private';
            if (isPrivate) privateInviteID = invite.id;
            if (ours && !isPrivate) classes.push('ours');
            else if (ours && isPrivate) classes.push('private');

            const newInvite = createDiv(classes, undefined, invite.id);

            // <div class="invite-child">Playername (elo)</div>
            // <div class="invite-child">Standard</div>
            // <div class="invite-child">15m+15s</div>
            // <div class="invite-child">Random</div>
            // <div class="invite-child">Casual</div>
            // <div class="invite-child accept">Accept</div>

            const n = ours ? translations.invites.you_indicator : invite.name;
            const name = createDiv(['invite-child'], n);
            newInvite.appendChild(name);

            const variant = createDiv(['invite-child'], translations[invite.variant]);
            newInvite.appendChild(variant);

            const time = clock.getClockFromKey(invite.clock);
            const cloc = createDiv(['invite-child'], time);
            newInvite.appendChild(cloc);

            const uColor = ours ? invite.color === 'White' ? translations.invites.you_are_white : invite.color === 'Black' ? translations.invites.you_are_black : translations.invites.random
                                : invite.color === 'White' ? translations.invites.you_are_black : invite.color === 'Black' ? translations.invites.you_are_white : translations.invites.random;
            const color = createDiv(['invite-child'], uColor);
            newInvite.appendChild(color);

            const rated = createDiv(['invite-child'], translations[invite.rated]);
            newInvite.appendChild(rated);

            const a = ours ? translations.invites.cancel : translations.invites.accept;
            const accept = createDiv(['invite-child', 'accept'], a);
            newInvite.appendChild(accept);

            const targetCont = ours ? ourInviteContainer : invitesContainer; 
            targetCont.appendChild(newInvite, targetCont);
        }

        if (!alreadyPlayedSound) playBaseIfNewInvite(list);

        weHaveInvite = foundOurs;
        updateCreateInviteButton();
        updatePrivateInviteCode(privateInviteID);

        guiplay.initListeners_Invites();

        // If we are on "Local" and have an existing invite, IMMEDIATELY cancel it! This can happen with slow network.
        if (weHaveInvite && guiplay.getModeSelected() !== 'online') cancel();
    }

    /**
     * Plucks base C2 (audio cue) if the new invites list contains an invite from a new person!
     * @param {Object} invitesList - The new invites list
     */
    const playBaseIfNewInvite = (() => {
        const cooldownSecs = 10;
        const recentUsers = {};
        let IDsInLastList = {};

        return function(inviteList) {
            let playedSound = false;
            const newIDsInList = {};
            inviteList.forEach((invite) => {
                const name = invite.name;
                const id = invite.id;
                newIDsInList[id] = true;
                if (IDsInLastList[id]) return; // Not a new invite, was there last update.
                if (recentUsers[name]) return; // We recently played a sound for this user
                if (isInviteOurs(invite)) return;
                recentUsers[name] = true;
                setTimeout(() => { delete recentUsers[name]; }, cooldownSecs * 1000);
                if (playedSound) return;
                playSoundNewOpponentInvite();
                playedSound = true;
            });
            IDsInLastList = newIDsInList;
        };
    })();

    function playSoundNewOpponentInvite() {
        if (input.isMouseSupported()) sound.playSound_base();
        else sound.playSound_viola_c3();
        
    }

    // Close all previous event listeners and delete invites from the document
    function clear({ recentUsersInLastList = false } = {}) {
        guiplay.closeListeners_Invites();
        ourInviteContainer.innerHTML = ''; // Deletes all contained invite elements
        invitesContainer.innerHTML = ''; // Deletes all contained invite elements
        activeInvites = undefined;
        weHaveInvite = false;
        ourInviteID = undefined;
        element_inviteCodeCode.textContent = '';
        // Passing in an empty list resets the local scope variables for next time.
        if (recentUsersInLastList) playBaseIfNewInvite([]);
    }

    // Deletes all invites and resets create invite button if on play page
    function clearIfOnPlayPage() {
        if (!guiplay.onPlayPage()) return; // Not on the play screen
        clear();
        updateCreateInviteButton();
    }

    /**
     * Tests if an invite belongs to us.
     * @param {Invite} invite - The invite object, NOT HTML element.
     * @returns {boolean} true if it is our
     */
    function isInviteOurs(invite) {
        if (memberHeader.getMember() === invite.name) return true;

        if (!invite.tag) return invite.id === ourInviteID; // Tag not present (invite converted from an HTML element), compare ID instead.

        // Compare the tag..

        const localStorageTag = localstorage.loadItem('invite-tag');
        if (!localStorageTag) return false;
        if (invite.tag === localStorageTag) return true;
        return false;
    }

    /**
     * Creates an invite object from the given HTML element.
     * @param {HTMLElement} inviteElement - The invite, as an element.
     * @returns {Invite} The invite object, parsed from an HTML element.
     */
    function getInviteFromElement(inviteElement) {
        const childrenTextContent = style.getChildrenTextContents(inviteElement);
        const id = inviteElement.getAttribute('id');
        
        /**
         * Starting from the first child, the order goes:
         * Name, Variant, TimeControl, Color, Publicity, Rated
         * (see the {@link Invite} object)
         */

        return {
            name: childrenTextContent[0],
            variant: childrenTextContent[1],
            clock: childrenTextContent[2],
            color: childrenTextContent[3],
            publicity: childrenTextContent[4],
            rated: childrenTextContent[5],
            id
        };
    }

    function createDiv(classes, textContent, id) {

        const element = document.createElement('div');
        for (let i = 0; i < classes.length; i++) {
            element.classList.add(classes[i]);
        }
        if (textContent) element.textContent = textContent;
        if (id) element.id = id;
        return element;
    }

    function accept(inviteID, isPrivate) {
        const inviteinfo = { id: inviteID, isPrivate };

        guiplay.lockAcceptInviteButton();

        // The function to execute when we hear back the server's response
        const onreplyFunc = guiplay.unlockAcceptInviteButton;

        websocket.sendmessage("invites", "acceptinvite", inviteinfo, true, onreplyFunc);
    }

    // A callback that gui fires when an invite document element is clicked!
    function click(element) {
        const invite = getInviteFromElement(element);
        const isOurs = isInviteOurs(invite);

        if (isOurs) {
            // Only cancel if the Create Invite button isn't disabled
            if (!guiplay.isCreateInviteButtonLocked()) cancel(invite.id);
        } else { // Not our invite, accept the one we clicked
            if (!guiplay.isAcceptInviteButtonLocked()) accept(invite.id, true);
        }
    }

    function getInviteFromID(id) {
        if (!id) return console.error('Cannot find the invite with undefined id!');

        for (let i = 0; i < activeInvites.length; i++) {
            const invite = activeInvites[i];
            if (invite.id === id) return invite;
        }

        console.error(`Could not find invite with id ${id} in the document!`);
    }

    function updateCreateInviteButton() {
        if (guiplay.getModeSelected() !== 'online') return;
        if (weHaveInvite) guiplay.setElement_CreateInviteTextContent(translations.invites.cancel_invite);
        else              guiplay.setElement_CreateInviteTextContent(translations.invites.create_invite);
    }

    function updatePrivateInviteCode(privateInviteID) { // If undefined, we know we don't have a "private" invite
        if (guiplay.getModeSelected() === 'local') return;

        if (!weHaveInvite) {
            guiplay.showElement_joinPrivate();
            guiplay.hideElement_inviteCode();
            return;
        }

        // We have an invite...

        // If the classlist of our private invite contains a "private" property of "private",
        // then display our invite code text!

        if (privateInviteID) {
            guiplay.hideElement_joinPrivate();
            guiplay.showElement_inviteCode();
            element_inviteCodeCode.textContent = privateInviteID.toUpperCase();
            return;
        }

        // Else our invite is NOT private, only show the "Private Invite:" display.

        guiplay.showElement_joinPrivate();
        guiplay.hideElement_inviteCode();
    }

    function updateActiveGameCount(newCount) {
        if (newCount == null) return;
        element_joinExisting.textContent = `${translations.invites.join_existing_active_games} ${newCount}`;
    }

    function doWeHave() {
        return weHaveInvite;
    }

    /** Subscribes to the invites list. We will receive updates
     * for incoming and deleted invites from other players.
     * @param {ignoreAlreadySubbed} *true* If the socket closed unexpectedly and we need to resub. subs.invites will already be true so we ignore that.
     * */
    async function subscribeToInvites(ignoreAlreadySubbed) { // Set to true when we are restarting the connection and need to resub to everything we were to before.
        if (!guiplay.onPlayPage()) return; // Don't subscribe to invites if we're not on the play page!
        const subs = websocket.getSubs();
        if (!ignoreAlreadySubbed && subs.invites) return;
        // console.log("Subbing to invites!");
        subs.invites = true;
        websocket.sendmessage("general", "sub", "invites");
    }


    return Object.freeze({
        gelement_iCodeCode,
        onmessage,
        update,
        create,
        cancel,
        clear,
        accept,
        click,
        doWeHave,
        clearIfOnPlayPage,
        unsubIfWeNotHave,
        deleteInviteTagInLocalStorage,
        subscribeToInvites
    });

})();

export default invites;