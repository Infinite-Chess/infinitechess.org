
/*
 * This script manages the invites on the Play page.
 */

"use strict";

const invites = (function(){

    const invitesContainer = document.getElementById('invites')
    const ourInviteContainer = document.getElementById('our-invite')

    let activeInvites; // Invites list

    let weHaveInvite = false;
    let ourInviteID;

    const element_joinExisting = document.getElementById('join-existing')
    const element_inviteCodeCode = document.getElementById('invite-code-code')


    function gelement_iCodeCode() {
        return element_inviteCodeCode;
    }

    function update() {
        if (!guiplay.onPlayPage()) return; // Not on the play screen
        if (loadbalancer.gisHibernating()) statustext.showStatus(translations["invites"]["move_mouse"], false, 0.1)
    }

    function unsubIfWeNotHave() {
        if (!weHaveInvite) websocket.unsubFromInvites();
    }


    // Update invites list according to new data!
    // Should be called by websocket script when it receives a
    // message that the server says is for the "invites" subscription
    function onmessage(data) { // { sub, action, value, id }

        switch(data.action) {
            case "inviteslist":
                // Update the list in the document
                updateInviteList(data.value.invitesList);
                updateActiveGameCount(data.value.currentGameCount)
                break;
            case "gamecount":
                updateActiveGameCount(data.value)
                break;
            default:
                statustext.showStatus(`${translations["invites"]["unknown_action_received_1"]} ${data.action} ${translations["invites"]["unknown_action_received_2"]}`, true)
                break;
        }
    }

    function create(inviteOptions) { // { variant, clock, color, rated, publicity }
        if (weHaveInvite) return console.error("We already have an existing invite, can't create more.")

        generateTagForInvite(inviteOptions)

        // Lock the create invite button
        guiplay.setElement_CreateInviteEnabled(false);
        const idToCancelButtonEnabling = setTimeout(() => { guiplay.setElement_CreateInviteEnabled(true) })

        const onreplyFunc = () => {
            // Unlock
            guiplay.setElement_CreateInviteEnabled(true);
            clearTimeout(idToCancelButtonEnabling);
        }

        websocket.sendmessage("invites", "createinvite", inviteOptions, true, onreplyFunc)
    }

    // Generates a tag id for the invite parameters before we send off action "createinvite" to the server
    function generateTagForInvite(inviteOptions) {
        // Create and send invite with a tag so we know which ones ours
        const tag = math.generateID(8)

        // NEW browser storage method!
        localstorage.saveItem('invite-tag', tag)

        inviteOptions.tag = tag;
    }

    function cancel(id = ourInviteID, isUserAction = false) {
        if (!weHaveInvite) return;
        if (!id) return statustext.showStatus(translations["invites"]["cannot_cancel"], true)

        deleteInviteTagInLocalStorage();

        // Lock the create invite button
        guiplay.setElement_CreateInviteEnabled(false);
        const idToCancelButtonEnabling = setTimeout(() => { guiplay.setElement_CreateInviteEnabled(true) })

        const onreplyFunc = () => {
            // Unlock
            guiplay.setElement_CreateInviteEnabled(true);
            clearTimeout(idToCancelButtonEnabling);
        }

        // Request server to delete current invite
        websocket.sendmessage("invites", "cancelinvite", id, isUserAction, onreplyFunc)
    }
    
    function deleteInviteTagInLocalStorage() {
        localstorage.deleteItem('invite-tag')
    }

    function updateInviteList(list) { // { invitesList, currentGameCount }
        if (!list) return;

        activeInvites = list
        const alreadySeenOurInvite = weHaveInvite;
        let alreadyPlayedSound = false;

        // Close all previous event listeners and delete invites from the document
        clear()

        // Append latest invites to the document and re-init event listeners.
        let foundOurs = false;
        let privateInviteID = undefined;
        ourInviteID = undefined;
        for (let i = 0; i < list.length; i++) {
            const invite = list[i]

            // Is this our own invite?
            const ours = foundOurs ? false : isInviteOurs(invite)
            if (ours) {
                foundOurs = true;
                ourInviteID = invite.id;
                if (!alreadySeenOurInvite) {
                    sound.playSound_marimba();
                    alreadyPlayedSound = true;
                }
            }

            const c = ['invite', 'button'];
            const isPrivate = invite.publicity === 'private'
            if (isPrivate) privateInviteID = invite.id;
            if (ours && !isPrivate) c.push('ours')
            else if (ours && isPrivate) c.push('private')

            const newInvite = createDiv(c, undefined, invite.id);

            // <div class="invite-child">Playername (elo)</div>
            // <div class="invite-child">Standard</div>
            // <div class="invite-child">15m+15s</div>
            // <div class="invite-child">Random</div>
            // <div class="invite-child">Unrated</div>
            // <div class="invite-child accept">Accept</div>

            const n = ours ? translations["invites"]["you_indicator"] : invite.name
            const name = createDiv(['invite-child'], n)
            newInvite.appendChild(name)

            const variant = createDiv(['invite-child'], invite.variant)
            newInvite.appendChild(variant)

            const time = clock.getClockFromKey(invite.clock)
            const cloc = createDiv(['invite-child'], time)
            newInvite.appendChild(cloc)

            const uColor = ours ? invite.color === 'White' ? translations["invites"]["you_are_white"] : invite.color === 'Black' ? translations["invites"]["you_are_black"] : translations["invites"]["random"]
                                : invite.color === 'White' ? translations["invites"]["you_are_black"] : invite.color === 'Black' ? translations["invites"]["you_are_white"] : translations["invites"]["random"]
            const color = createDiv(['invite-child'], uColor)
            newInvite.appendChild(color)

            const rated = createDiv(['invite-child'], invite.rated)
            newInvite.appendChild(rated)

            const a = ours ? translations["invites"]["cancel"] : translations["invites"]["accept"]
            const accept = createDiv(['invite-child', 'accept'], a)
            newInvite.appendChild(accept)

            const targetCont = ours ? ourInviteContainer : invitesContainer; 
            targetCont.appendChild(newInvite, targetCont)
        }

        if (!alreadyPlayedSound) playBaseIfNewInvite(list)

        weHaveInvite = foundOurs;
        updateCreateInviteButton()
        updatePrivateInviteCode(privateInviteID)

        guiplay.initListeners_Invites()
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
                setTimeout(() => { delete recentUsers[name]}, cooldownSecs * 1000)
                if (playedSound) return;
                playSoundNewOpponentInvite();
                playedSound = true;
            })
            IDsInLastList = newIDsInList;
        }
    })();

    function playSoundNewOpponentInvite() {
        if (input.isMouseSupported()) sound.playSound_base();
        else sound.playSound_viola_c3();
        
    }

    // Close all previous event listeners and delete invites from the document
    function clear({ recentUsersInLastList = false } = {}) {
        guiplay.closeListeners_Invites()
        ourInviteContainer.innerHTML = ''; // Deletes all contained invite elements
        invitesContainer.innerHTML = ''; // Deletes all contained invite elements
        activeInvites = undefined;
        weHaveInvite = false;
        ourInviteID = undefined;
        // Passing in an empty list resets the local scope variables for next time.
        if (recentUsersInLastList) playBaseIfNewInvite([]);
    }

    // Deletes all invites and resets create invite button if on play page
    function clearIfOnPlayPage() {
        if (!guiplay.onPlayPage()) return; // Not on the play screen
        clear();
        updateCreateInviteButton()
    }

    function isInviteOurs(invite) {
        if (validation.getMember() === invite.name) return true;

        // OLD cookie method.
        // const cookieTag = validation.getCookieValue('invite-tag')
        // if (!cookieTag) return false;
        // if (invite.tag === cookieTag) return true;
        // return false;

        // NEW browser storage method!
        const localStorageTag = localstorage.loadItem('invite-tag')
        if (!localStorageTag) return false;
        if (invite.tag === localStorageTag) return true;
        return false;
    }

    function createDiv(classes, textContent, id) {

        const element = document.createElement('div');
        for (let i = 0; i < classes.length; i++) {
            element.classList.add(classes[i])
        }
        if (textContent) element.textContent = textContent
        if (id) element.id = id;
        return element;
    }

    function accept(inviteID, isPrivate) {
        const inviteinfo = { id: inviteID, isPrivate }
        websocket.sendmessage("invites", "acceptinvite", inviteinfo, true)
    }

    // A callback that gui fires when an invite document element is clicked!
    function click(element) {
        // const invite = getInviteFromID(element.id)

        // Are we doing an accept, or cancel command?
        const command = element.querySelectorAll('.accept')[0].textContent

        if      (command === 'Cancel') cancel(element.id, true)
        else if (command === 'Accept') accept(element.id)
        else return console.error(`Unknown command ${command} when clicking invite.`)
    }

    function getInviteFromID(id) {
        if (!id) return console.error('Cannot find the invite with undefined id!')

        for (let i = 0; i < activelength; i++) {
            const invite = activeInvites[i]
            if (invite.id === id) return invite;
        }

        console.error(`Could not find invite with id ${id} in the document!`)
    }

    function updateCreateInviteButton() {
        if (guiplay.getModeSelected() !== 'online') return;
        if (weHaveInvite) guiplay.setElement_CreateInviteTextContent(translations["invites"]["cancel_invite"])
        else              guiplay.setElement_CreateInviteTextContent(translations["invites"]["create_invite"])
    }

    function updatePrivateInviteCode(privateInviteID) { // If undefined, we know we don't have a "private" invite
        if (guiplay.getModeSelected() === 'local') return;

        if (!weHaveInvite) {
            guiplay.getElement_joinPrivate().classList.remove('hidden')
            guiplay.getElement_inviteCode().classList.add('hidden')
            return;
        }

        // We have an invite...

        // If the classlist of our private invite contains a "private" property of "private",
        // then display our invite code text!

        if (privateInviteID) {
            guiplay.getElement_joinPrivate().classList.add('hidden')
            guiplay.getElement_inviteCode().classList.remove('hidden')
            element_inviteCodeCode.textContent = privateInviteID.toUpperCase();
            return;
        }

        // Else our invite is NOT private, only show the "Private Invite:" display.

        guiplay.getElement_joinPrivate().classList.remove('hidden')
        guiplay.getElement_inviteCode().classList.add('hidden')
    }

    function updateActiveGameCount(newCount) {
        if (newCount == null) return;
        element_joinExisting.textContent = `${translations["invites"]["join_existing_active_games"]} ${newCount}`
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
        const subs = websocket.getSubs()
        if (!ignoreAlreadySubbed && subs.invites) return;
        // console.log("Subbing to invites!");
        subs.invites = true;
        websocket.sendmessage("general", "sub", "invites")
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
    })

})();