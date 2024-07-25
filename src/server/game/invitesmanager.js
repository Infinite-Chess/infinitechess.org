// System imports
const fs = require('fs')
const path = require('path');

// Middleware imports
const { logEvents } = require('../middleware/logEvents.js');
const { readFile, writeFile } = require('../utility/lockFile.js');
const { getUsernameCaseSensitive } = require('../controllers/members.js')

// Custom imports
const { Socket } = require('./TypeDefinitions.js')
const wsfunctions = require('./wsfunctions.js');
const math1 = require('./math1.js')
const variant1 = require('./variant1.js')
const gamemanager = require('./gamemanager.js');
const clockweb = require('./clockweb.js');
const { writeFile_ensureDirectory } = require('../utility/fileUtils');


// List of active invites
let invites = []; // { id, owner, variant, clock, color, rated, publicity }  publicity: "public"/"private"

// List of clients currently subscribed to invites list events!
const subscribedClients = {}; // { id: ws }

const printNewAndClosedSubscriptions = false;
const printSubscriberCount = true;




const allowinvitesPath = path.resolve('database/allowinvites.json');
(function ensureAllowInvitesFileExists() {
    if (fs.existsSync(allowinvitesPath)) return; // Already exists

    const content = JSON.stringify({
        allowinvites: true,
        message: "ws-server_restarting",
        restartIn: false
    }, null, 2);
    writeFile_ensureDirectory(allowinvitesPath, content)
    console.log("Generated allowinvites file")
})()
let allowinvites = require('../../../database/allowinvites.json');

let restartingAt;
let timeLastReadAllowInvites = Date.now()
const intervalToReadAllowinviteMillis = 5000; // 5 seconds

// Time to allow the client to reconnect after socket closure before their flagged as disconnected!
const cushionToDisconnectMillis = 5000;

// Timers active to delete a player's invite from the list if they disconnect for too long.
const timersMember = {};
const timersBrowser = {};



// Get public invites with sensitive information REMOVED (such as browser-id)
// DOES NOT include private invites, not even your own--add that separately.
function getPublicInvitesListSafe() {
    const deepCopiedInvites = math1.deepCopyObject(invites)
    // Remove private invites, UNLESS it's ours
    for (let i = deepCopiedInvites.length - 1; i >= 0; i--) {
        const thisInvite = deepCopiedInvites[i]
        const isPrivate = thisInvite.publicity === 'private'
        if (isPrivate) deepCopiedInvites.splice(i, 1)
    }
    // Remove sensitive information
    return removeSensitiveInfoFromInvitesList(deepCopiedInvites);
}

// Removes guests' browser-id's, and makes members' usernames case-sensitive.
function removeSensitiveInfoFromInvitesList(copyOfInvitesList) {
    return copyOfInvitesList.map(function(thisInvite, index, copyOfInvitesList) {
        return makeInviteSafe(thisInvite);
    })
}

// MODIFIES the invite! Make sure it's a copy!
// Removes sensitive data such as their browser-id, and makes their username case-sensitive.
function makeInviteSafe(invite) {
    const memberName = invite.owner.member ? getUsernameCaseSensitive(invite.owner.member) : undefined;
    invite.name = memberName || "(Guest)"
    delete invite.owner;
    return invite;
}

// Makes a deep copy of provided invite, and removes sensitive data such as their browser-id!
function safelyCopyInvite(invite) {
    const inviteDeepCopy = math1.deepCopyObject(invite);
    return makeInviteSafe(inviteDeepCopy);
}

function addMyPrivateInviteToList(ws, copyOfInvitesList) {
    // Iterate through all invites.
    // CAREFUL NOT to modify the original!!
    for (let i = invites.length - 1; i >= 0; i--) {
        const thisInvite = invites[i]
        const isPublic = thisInvite.publicity === 'public'
        if (isPublic) continue; // Next invite, this one isn't private
        // Is it ours?
        if (isInviteOurs(ws, thisInvite)) {
            const inviteSafeCopy = safelyCopyInvite(thisInvite); // Makes a deep copy and removes sensitive information
            copyOfInvitesList.push(inviteSafeCopy)
        }
    }
    return copyOfInvitesList;
}

function isInviteOurs(ws, invite) {
    return ws.metadata.user && ws.metadata.user === invite.owner.member
        || ws.metadata['browser-id'] && ws.metadata['browser-id'] === invite.owner.browser
}

// When a PUBLIC invite is added or removed..
function onPublicInvitesChange(messageID) { // The message that this broadcast is the reply to
    broadcastInvites(messageID);
}

function broadcastInvites(messageID) {
    const newInvitesList = getPublicInvitesListSafe();
    const currentGameCount = gamemanager.getActiveGameCount();

    const subbedClientsKeys = Object.keys(subscribedClients); // []
    for (let id of subbedClientsKeys) {
        const newInvitesListCopy = math1.deepCopyObject(newInvitesList);
        sendClientInvitesList(subscribedClients[id], newInvitesListCopy, currentGameCount, messageID);
    }
}

function sendClientInvitesList(ws, invitesList = getPublicInvitesListSafe(), currentGameCount = gamemanager.getActiveGameCount(), replyto) {
    invitesList = addMyPrivateInviteToList(ws, invitesList)
    const message = { invitesList, currentGameCount }
    ws.metadata.sendmessage(ws, "invites", "inviteslist", message, replyto) // In order: socket, sub, action, value
}

function broadcastActiveGameCount() {
    gamecount = gamemanager.getActiveGameCount();
    const subbedClientsKeys = Object.keys(subscribedClients); // []
    for (let id of subbedClientsKeys) {
        sendClientActiveGameCount(subscribedClients[id], gamecount);
    }
}
gamemanager.setOnActiveGameCountChange(broadcastActiveGameCount);

function sendClientActiveGameCount(ws, gamecount) {
    ws.metadata.sendmessage(ws, "invites", "gamecount", gamecount) // In order: socket, sub, action, value
}

// Similar to connect(), but this does not log the users connection until they are given a browser ID.
async function createNewInvite (ws, invite, messageID) { // invite: { id, owner, variant, clock, color, rated, publicity } 
    if (gamemanager.isSocketInAnActiveGame(ws)) return ws.metadata.sendmessage(ws, "general", "notify", { text: "ws-already_in_game" })
    
    // Verify their invite contains the required properties...
    // ...

    // It is defined?
    if (invite == null) return ws.metadata.sendmessage(ws, "general", "printerror", "Create invite message was sent without an invite for the value property!" , messageID)

    // Are we currently allowing invite creation?
    // Is the server restarting?

    await readAllowInvites()
    
    // If so, sends a message to the socket informing them of that!
    if (areUnderMaintenance(ws)) return;

    // Make sure they don't already have an existing invite
    if (userHasInvite(ws)) return ws.metadata.sendmessage(ws, "general", "notify", { text: "ws-player_already_has_invite" }, messageID)
    // This allows them to spam the button without receiving errors.
    // if (userHasInvite(ws)) return;

    // Validate invite parameters, detect cheating
    if (isCreatedInviteExploited(invite)) return reportForExploitingInvite(ws, invite)

    // Invite has all legal parameters! Create the invite...

    // Who is the owner of the invite?
    const owner = ws.metadata.user ? { member: ws.metadata.user } : { browser: ws.metadata["browser-id"] }
    invite.owner = owner;

    do { invite.id = math1.generateID(5) } while (existingInviteHasID(invite.id))

    invites.push(invite)

    if (invite.publicity === 'private') console.log(`Created PRIVATE invite for user ${JSON.stringify(invite.owner)}`)
    else                              console.log(`Created invite for user ${JSON.stringify(invite.owner)}`)

    if (invite.publicity === 'public') onPublicInvitesChange(messageID);
    else sendClientInvitesList(ws, undefined, undefined, messageID) // Send them the new list after their invite creation!
}

// Reads the new allowinvites.json file if it's been atleast 5 seconds since the last read.
async function readAllowInvites() {
    // How long has it been since the last read?
    const timePassed = Date.now() - timeLastReadAllowInvites;
    const itIsTime = timePassed >= intervalToReadAllowinviteMillis;
    if (!itIsTime) return;

    //console.log("Reading allowinvites.json!")
    timeLastReadAllowInvites = Date.now();

    // If this is not called with 'await', it returns a promise.
    const nameOfFile = 'allowinvites.json'
    const newAllowInvitesValue = await readFile(
        path.join(__dirname, '..', '..', '..', 'database', nameOfFile),
        `Error locking & reading file ${nameOfFile} after receiving a created invite!`
    )

    // Update the value!
    updateAllowInvites(newAllowInvitesValue)
}

function updateAllowInvites(newAllowInvitesValue) { // { allowInvites, message, restartIn }
    if (newAllowInvitesValue == null) { // Not defined
        console.log(`There was an error reading allowinvites.json. Not updating it in memory.`)
        return; // Quit if not defined. (File is still locked)
    }

    // Set the new allowinvites value as long as its not undefined
    allowinvites = newAllowInvitesValue

    // Stop server restarting if we're allowing invites again!
    if (allowinvites.allowinvites) restartingAt = undefined;
    else initServerRestart(allowinvites)
}

// Call when we have newly read allowinvites.json,
// this asks if its "restartIn" property is a number in minutes instead of false,
// if so, this updates variables that tell the users when we are going to restart!
async function initServerRestart(newAllowInvitesValue) { // { allowInvites, message, restartIn: minutes }
    if (!newAllowInvitesValue.restartIn) return; // We have not changed the value to indicate we're restarting. Return.

    const now = Date.now() // Current time in milliseconds
    // restartIn is in minutes, convert to milliseconds!
    const millisecondsUntilRestart = newAllowInvitesValue.restartIn * 60 * 1000;

    const value = now + millisecondsUntilRestart;
    restartingAt = value;

    console.log(`Will be restarting the server in ${newAllowInvitesValue.restartIn} minutes!`)

    // Set our restartIn variable to undefined, so we don't repeat this next time we load the file!
    newAllowInvitesValue.restartIn = false;

    // Save the file
    const nameOfFile = 'allowinvites.json'
    await writeFile(
        path.join(__dirname, '../database', nameOfFile),
        newAllowInvitesValue,
        `Error locking & writing file ${nameOfFile} after receiving a created invite! Didn't save. Retrying after atleast 5 seconds when the next invite created.`
    )

    // Alert all people on the invite screen that we will be restarting soon
    // ...

    // Alert all people in a game that we will be restarting soon
    // ...
    gamemanager.broadCastGameRestarting(restartingAt)
}

// Returns true if the server is under maintenance,
// and sends a message to the socket informing them of that!
// Call when they attempt to create an invite.
function areUnderMaintenance(ws) {
    // If allowinvites is false, disallow invite creation
    const isOwner = ws.metadata.role === 'owner'
    if (allowinvites.allowinvites || isOwner || ws.metadata.IP === "98.202.60.22") return false; // They are allowed to make an invite!

    // Making an invite is NOT allowed...

    gamemanager.printActiveGameCount();
    const message = allowinvites.message;
    const timeUntilRestart = getMinutesUntilRestart();
    ws.metadata.sendmessage(ws, "general", "notify", {text: message, number: timeUntilRestart});
    return true; // NOT allowed to make na invite!
}

function getMinutesUntilRestart() {
    if (!restartingAt) return; // Not restarting

    const now = Date.now(); // Current time in milliseconds
    const millisLeft = restartingAt - now;

    const minutesLeft = millisLeft / (1000 * 60)
    const ceiled = Math.ceil(minutesLeft)
    const returnThis = ceiled > 0 ? ceiled : 0;

    return returnThis; // Convert to minutes
}

function userHasInvite(ws) {
    // invites: [ { owner, variant, clock, color, rated }, ... ]
    for (let i = 0; i < invites.length; i++) if (isInviteOurs(ws, invites[i])) return true;
    return false; // Player doesn't have an existing invite
}

// Returns true if they specified invalid parameters for their invite!
function isCreatedInviteExploited(invite) {  // { variant, clock, color, rated, publicity }

    if (typeof invite.variant !== 'string') return true;
    if (typeof invite.clock !== 'string') return true;
    if (typeof invite.color !== 'string') return true;
    if (typeof invite.rated !== 'string') return true;
    if (typeof invite.publicity !== 'string') return true;

    if (!variant1.isVariantValid(invite.variant)) return true;

    if (!clockweb.isClockValueValid(invite.clock)) return true;

    if (invite.color !== "White" && invite.color !== "Black" && invite.color !== "Random") return true;
    if (invite.rated !== 'casual') return true;
    if (invite.publicity !== 'public' && invite.publicity !== 'private') return true;

    return false;
}

function reportForExploitingInvite(ws, invite) {
    ws.metadata.sendmessage(ws, "general", "printerror", "You cannot modify invite parameters (try refreshing).") // In order: socket, sub, action, value

    let logText;
    if (ws.metadata.user) logText = `User ${ws.metadata.user} detected modifying invite parameters! Invite: ${JSON.stringify(invite)}`
    else logText = `Browser ${ws.metadata["browser-id"]} detected modifying invite parameters! Invite: ${JSON.stringify(invite)}`

    logEvents(logText, 'hackLog.txt') // Log the exploit to the hackLog!
    console.log(logText)
}

function existingInviteHasID(id) {
    for (let i = 0; i < invites.length; i++) if (invites[i].id === id) return true;
    return false;
}

function cancelInvite (ws, value, messageID) { // Value should be the ID of the invite to cancel!
    const id = value; // id of invite to delete

    const inviteAndIndex = getInviteByID(id) // { invite, index }
    if (!inviteAndIndex) return ws.metadata.sendmessage(ws, "general", "notify", { text: "ws-invite_cancelled" }, messageID);
    // This allows them to spam the button without receiving errors.
    //if (!inviteAndIndex) return;
    
    const invite = inviteAndIndex.invite;

    // Make sure they are the owner.
    if (!isInviteOurs(ws, invite)) {
        const errText = `Player tried to delete an invite that wasn't theirs! Invite ID: ${id} Socket: ${wsfunctions.stringifySocketMetadata(ws)}`
        console.error(errText);
        logEvents(errText, 'hackLog.txt')
        return ws.metadata.sendmessage(ws, "general", "printerror", "You are forbidden to delete this invite.", messageID)
    }

    invites.splice(inviteAndIndex.index, 1) // Delete the invite
    console.log(`Deleted invite for user ${JSON.stringify(invite.owner)}`)

    if (invite.publicity === 'public') onPublicInvitesChange(messageID);
    else sendClientInvitesList(ws, undefined, undefined, messageID) // Send them the new list after their invite cancellation!
}

// Returns  { invite, index }
function getInviteByID(id) {
    for (let i = 0; i < invites.length; i++) {
        if (id === invites[i].id) return { invite: invites[i], index: i }
    }
}

function acceptInvite(ws, inviteinfo) { // { id, isPrivate }
    if (gamemanager.isSocketInAnActiveGame(ws)) return ws.metadata.sendmessage(ws, "general", "notify", { text: "ws-already_in_game" })
    
    // Verify their invite contains the required properties...
    // ...

    // It is defined?
    if (inviteinfo == null) return ws.metadata.sendmessage(ws, "general", "printerror", "Accept invite message was sent without invite info for the value property!")
    
    const id = inviteinfo.id
    if (id == null) return ws.metadata.sendmessage(ws, "general", "printerror", "Invite info must contain an id property.") // Hacking

    // Does the invite still exist?
    const inviteAndIndex = getInviteByID(id) // { invite, index }
    if (!inviteAndIndex) return informThemGameAborted(ws, inviteinfo.isPrivate, id);

    const invite = inviteAndIndex.invite;

    // Make sure they are not accepting their own.
    if (isInviteOurs(ws, invite)) {
        const errString = `Player tried to accept their own invite! Socket: ${wsfunctions.stringifySocketMetadata(ws)}`
        console.error(errString);
        logEvents(errString, 'hackLog.txt') // Log the exploit to the hackLog!
        // return ws.metadata.sendmessage(ws, "general", "notify", "Cannot accept our own invite.");
        return ws.metadata.sendmessage(ws, "general", "notify", { text: "ws-accept_own_invite"});
    }

    // Make sure it's legal for them to accept. (Not legal if they are a guest and the invite is RATED)
    // ...

    // Accept the invite!

    // Delete the invite accepted.
    invites.splice(inviteAndIndex.index, 1)

    // Delete their existing invites
    const hadPublicInvite = deleteUsersExistingInvite(ws)

    // Start the game! Notify both players and tell them they've been subscribed to a game!

    const player1Socket = findSocketFromOwner(invite.owner); // Could be undefined occasionally
    const player2Socket = ws;
    gamemanager.createGame(invite, player1Socket, player2Socket)

    // Unsubscribe them both from the invites subscription list.
    unsubClientFromListNoInvite(player1Socket);
    unsubClientFromListNoInvite(player2Socket);

    // Broadcast the invites list change after creating the game,
    // because the new game ups the game count.
    if (invite.publicity === 'public' || hadPublicInvite) onPublicInvitesChange(); // Broadcast to all invites list subscribers!
}

// Call after creating game with them, we already deleted their invite.
function unsubClientFromListNoInvite(ws) {
    if (ws == null) return; // Need this because occasionally gamesweb calls this when creating a new game and player1's socket is undefined
    delete subscribedClients[ws.metadata.id];
    //math.removeObjectFromArray(ws.metadata.subscriptions, "invites")
    delete ws.metadata.subscriptions.invites
    if (printNewAndClosedSubscriptions) console.log(`Unsubscribed client from invites list. Metadata: ${wsfunctions.stringifySocketMetadata(ws)}`)
    if (printSubscriberCount) console.log(`Invites subscriber count: ${Object.keys(subscribedClients).length}`)
}

function informThemGameAborted(ws, isPrivate, inviteID) {
    const errString = isPrivate ? "ws-invalid_code" : "ws-game_aborted";
    if (isPrivate) console.log(`User entered incorrect invite code! Code: ${inviteID}   Socket: ${wsfunctions.stringifySocketMetadata(ws)}`)
    return ws.metadata.sendmessage(ws, "general", "notify", { text: errString });
}

// Returns true if atleast 1 public invite was changed
function deleteUsersExistingInvite(ws) { // Set dontBroadcastChange to true if you broadcast the change outside of this.
    let deleted1PublicInvite = false;
    if (ws.metadata.user) {
        const member = ws.metadata.user;
        for (let i = invites.length - 1; i >= 0; i--) {
            const thisInvite = invites[i]
            if (member !== thisInvite.owner.member) continue;
            const inviteIsPublic = thisInvite.publicity === 'public'
            if (inviteIsPublic) deleted1PublicInvite = true;
            invites.splice(i, 1) // Delete the invite.
            console.log(`Deleted members invite. Metadata: ${wsfunctions.stringifySocketMetadata(ws)}`)
        }
    } else /*ws.metadata['browser-id']*/ {
        const browser = ws.metadata['browser-id'];
        for (let i = invites.length - 1; i >= 0; i--) {
            const thisInvite = invites[i]
            if (browser !== thisInvite.owner.browser) continue;
            const inviteIsPublic = thisInvite.publicity === 'public'
            if (inviteIsPublic) deleted1PublicInvite = true;
            invites.splice(i, 1) // Delete the invite.
            console.log(`Deleted browsers invite. Metadata: ${wsfunctions.stringifySocketMetadata(ws)}`)
        }
    }
    return deleted1PublicInvite;
}

// Returns true if 1 public invite was deleted
function deleteMembersExistingInvite(ws) {
    const member = ws.metadata.user;
    if (!member) return; // No username (guest), no invite!
    let deleted1PublicInvite = false;
    for (let i = invites.length - 1; i >= 0; i--) {
        const thisInvite = invites[i]
        if (member !== thisInvite.owner.member) continue;
        const inviteIsPublic = thisInvite.publicity === 'public'
        if (inviteIsPublic) deleted1PublicInvite = true;
        invites.splice(i, 1) // Delete the invite.
        console.log(`Deleted members invite from disconnection. Metadata: ${wsfunctions.stringifySocketMetadata(ws)}`)
    }
    return deleted1PublicInvite;
}

// Returns true if 1 public invite was deleted
function deleteBrowsersExistingInvite(ws) {
    const browser = ws.metadata['browser-id'];
    if (!browser) return; // No browser-id (logged in), no invite!
    let deleted1PublicInvite = false;
    for (let i = invites.length - 1; i >= 0; i--) {
        const thisInvite = invites[i]
        if (browser !== thisInvite.owner.member) continue;
        const inviteIsPublic = thisInvite.publicity === 'public'
        if (inviteIsPublic) deleted1PublicInvite = true;
        invites.splice(i, 1) // Delete the invite.
        console.log(`Deleted browsers invite from disconnection. Metadata: ${wsfunctions.stringifySocketMetadata(ws)}`)
    }
    return deleted1PublicInvite;
}

// Returns the first socket, if there is one, that owns the invite.
function findSocketFromOwner(owner) { // { member/browser }
    // Iterate through all sockets, until you find one that matches the authentication of our invite owner
    const subbedClientsKeys = Object.keys(subscribedClients); // []

    if (owner.member) {
        for (let id of subbedClientsKeys) {
            const thisSocket = subscribedClients[id];
            if (thisSocket.metadata.user === owner.member) return thisSocket;
        }
    } else if (owner.browser) {
        for (let id of subbedClientsKeys) {
            const thisSocket = subscribedClients[id];
            if (thisSocket.metadata['browser-id'] === owner.browser) return thisSocket;
        }
    } else return console.error(`Cannot find socket from owner of invite when owner does not have a member nor browser property! Owner: ${JSON.stringify(owner)}`)

    console.log(`Unable to find socket from owner ${JSON.stringify(owner)}`)
}


const invitesmanager = (function(){

    function subClientToList(ws) { // data: { route, action, value, id }
        // if (ws.metadata.subscriptions.invites) return console.log(`CANNOT double-subscribe this socket to the invites list!! They should not have requested this! Metadata: ${wsfunctions.stringifySocketMetadata(ws)}`)
        if (ws.metadata.subscriptions.invites) return; // Already subscribed
        
        subscribedClients[ws.metadata.id] = ws;
        ws.metadata.subscriptions.invites = true;
        if (printNewAndClosedSubscriptions) console.log(`Subscribed client to invites list! Metadata: ${wsfunctions.stringifySocketMetadata(ws)}`)
        if (printSubscriberCount) console.log(`Invites subscriber count: ${Object.keys(subscribedClients).length}`)

        sendClientInvitesList(ws)

        // Cancel any existing timer set to delete their invite!
        // ...

        if (ws.metadata.user) {
            clearTimeout(timersMember[ws.metadata.user])
            delete timersMember[ws.metadata.user]
        } if (ws.metadata['browser-id']) {
            clearTimeout(timersBrowser[ws.metadata['browser-id']])
            delete timersBrowser[ws.metadata['browser-id']]
        }
    }

    // Set closureNotByChoice to true if you don't immediately want to delete their invite, but say after 5 seconds.
    function unsubClientFromList(ws, closureNotByChoice) { // data: { route, action, value, id }
        delete subscribedClients[ws.metadata.id];
        //math.removeObjectFromArray(ws.metadata.subscriptions, "invites")
        delete ws.metadata.subscriptions.invites
        if (printNewAndClosedSubscriptions) console.log(`Unsubscribed client from invites list. Metadata: ${wsfunctions.stringifySocketMetadata(ws)}`)
        if (printSubscriberCount) console.log(`Invites subscriber count: ${Object.keys(subscribedClients).length}`)

        // One day this could be modified to not delete their existing invite
        // IF THEY have another socket connected!
        if (!closureNotByChoice) {
            // Delete their existing invites
            if (deleteUsersExistingInvite(ws)) onPublicInvitesChange();
            return;
        }

        // The closure WASN'T by choice! Set a 5s timer to give them time to reconnect before deleting their invite!

        if (ws.metadata.user) timersMember[ws.metadata.user] = setTimeout(deleteMembersExistingInvite, cushionToDisconnectMillis, ws)
        if (ws.metadata['browser-id']) timersBrowser[ws.metadata['browser-id']] = setTimeout(deleteBrowsersExistingInvite, cushionToDisconnectMillis, ws)
    }

    function handleIncomingMessage(ws, data) { // data: { route, action, value, id }
        // What is their action? Create invite? Cancel invite? Accept invite?

        switch (data.action) {
            case "createinvite":
                createNewInvite(ws, data.value, data.id)
                break;
            case "cancelinvite":
                cancelInvite(ws, data.value, data.id)
                break;
            case "acceptinvite":
                acceptInvite(ws, data.value);
                break;
            default:
                console.log(`Client sent unknown action "${data.action}" for invites route! Metadata: ${wsfunctions.stringifySocketMetadata(ws)}`)
                console.log(`Data: ${JSON.stringify(data)}`)
                return;
        }
    }

    function deleteAllInvitesOfMember(usernameLowercase) {
        if (usernameLowercase == null) return console.error("Cannot delete all invites of member without their username.")

        let publicInviteDeleted = false;
        invites = invites.filter((invite) => { // { id, owner, variant, clock, color, rated, publicity }
            const inviteMatches = invite.owner.member === usernameLowercase
            if (inviteMatches && invite.publicity === 'public') publicInviteDeleted = true;
            return !inviteMatches;
        })
        if (publicInviteDeleted) onPublicInvitesChange();
    }

    /**
     * Attaches a hasInvite() method to the socket's metadata
     * @param {Socket} ws - The socket
     */
    function giveSocketMetadataHasInviteFunc(ws) {
        ws.metadata.hasInvite = () => userHasInvite(ws)
    }

    return Object.freeze({
        subClientToList,
        unsubClientFromList,
        handleIncomingMessage,
        deleteAllInvitesOfMember,
        giveSocketMetadataHasInviteFunc,
    })

})();



module.exports = invitesmanager;
