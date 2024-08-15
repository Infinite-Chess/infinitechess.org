
/**
 * This script handles invite creation, making sure that the invites have valid properties.
 * 
 * Here we also read allowinvites.js to see if we are currently allowing new invites or not.
 */


// System imports
const fs = require('fs')
const path = require('path');

// Middleware imports
const { logEvents } = require('../../middleware/logEvents.js');
const { readFile, writeFile } = require('../../utility/lockFile.js');

// Custom imports
// eslint-disable-next-line no-unused-vars
const { Socket } = require('../TypeDefinitions.js')
// eslint-disable-next-line no-unused-vars
const { Invite } = require('./inviteutility.js')
const wsutility = require('../wsutility.js');
const sendNotify = wsutility.sendNotify;
const sendNotifyError = wsutility.sendNotifyError;
const math1 = require('../math1.js')
const variant1 = require('../variant1.js')
const clockweb = require('../clockweb.js');
const { writeFile_ensureDirectory } = require('../../utility/fileUtils');
const { setTimeServerRestarting, cancelServerRestart, getTimeServerRestarting } = require('../serverrestart.js');
const { isSocketInAnActiveGame, broadCastGameRestarting } = require('../gamemanager/gamemanager.js');
const { getDisplayNameOfPlayer } = require('../gamemanager/gameutility.js');

const { printActiveGameCount } = require('../gamemanager/gamecount')


const { existingInviteHasID, userHasInvite, addInvite, IDLengthOfInvites } = require('./invitesmanager.js')



/** The path to the allowinvites.json file in the "database" */
const allowinvitesPath = path.resolve('database/allowinvites.json');
/**
 * Generates the allowinvites.json file inside the "database", on
 * initial startup, if it isn't alread
 */
(function ensureAllowInvitesFileExists() {
    if (fs.existsSync(allowinvitesPath)) return; // Already exists

    const content = JSON.stringify({
        allowinvites: true,
        restartIn: false
    }, null, 2);
    writeFile_ensureDirectory(allowinvitesPath, content)
    console.log("Generated allowinvites file")
})()

/**
 * The allowinvites.json file in the "database". This needs to periodically be re-read
 * in order to see our changes made to it. This is typcailly
 * done when a new invite is attempted to be created.
 */
let allowinvites = require(allowinvitesPath);
/**
 * The minimum time required between new reads of allowinvites.json.
 * 
 * Typically this file is re-read every time someone generates an invite
 */
const intervalToReadAllowinviteMillis = 5000; // 5 seconds



/**
 * Creates a new invite from their websocket message.
 * 
 * This is async because we need to read allowinvites.json to see
 * if new invites are allowed, before we create it.
 * @param {Socket} ws - Their socket
 * @param {*} messageContents - The incoming socket message that SHOULD contain the invite properties!
 * @param {number} messageID - The ID of the incoming socket message. This is used for the replyto properties on ther reponse.
 */
async function createInvite (ws, messageContents, messageID) { // invite: { id, owner, variant, clock, color, rated, publicity } 
    if (isSocketInAnActiveGame(ws)) return sendNotify(ws, 'server.javascript.ws-already_in_game'); // Can't create invite because they are already in a game


    // Make sure they don't already have an existing invite
    if (userHasInvite(ws)) return sendNotify(ws, 'server.javascript.ws-player_already_has_invite')
    // This allows them to spam the button without receiving errors.
    // if (userHasInvite(ws)) return;

    // Are we restarting the server soon (invites not allowed)?
    if (!await areInvitesAllowed(ws)) return;
    
    const invite = getInviteFromWebsocketMessageContents(ws, messageContents, messageID);
    if (!invite) return; // Message contained invalid invite parameters. Error already sent to the client.

    // Validate invite parameters, detect cheating
    if (isCreatedInviteExploited(invite)) return reportForExploitingInvite(ws, invite)

    // Invite has all legal parameters! Create the invite...

    // Who is the owner of the invite?
    const owner = ws.metadata.user ? { member: ws.metadata.user } : { browser: ws.metadata["browser-id"] }
    invite.owner = owner;

    do { invite.id = math1.generateID(5) } while (existingInviteHasID(invite.id))

    addInvite(ws, invite);
}

/**
 * Makes sure the socket message is an object, and strips it of all non-variant related properties.
 * STILL DO EXPLOIT checks on the specific invite values after this!!
 * @param {Socket} ws
 * @param {*} messageContents - The incoming websocket message contents (separate from route and action)
 * @param {number} replyto - The incoming websocket message ID, to include in the reply
 * @returns {Invite | undefined} The Invite object, or undefined it the message contents were invalid.
 */
function getInviteFromWebsocketMessageContents(ws, messageContents, replyto) {

    // Verify their invite contains the required properties...

    // Is it an object? (This may pass if it is an array, but arrays won't crash when accessing property names, so it doesn't matter. It will be rejected because it doesn't have the required properties.)
    // We have to separately check for null because JAVASCRIPT has a bug where  typeof null => 'object'
    if (typeof messageContents !== 'object' || messageContents === null) return ws.metadata.sendmessage(ws, "general", "printerror", "Cannot create invite when incoming socket message body is not an object!" , replyto)

    /**
     * What properties should the invite have from the incoming socket message?
     * variant
     * clock
     * color
     * rated
     * publicity
     * tag
     * 
     * We further need to manually add the properties:
     * id
     * owner
     * name
     */

    const invite = {};

    let id;
    do { id = math1.generateID(IDLengthOfInvites) } while (existingInviteHasID(messageContents.id))
    invite.id = id;

    const owner = ws.metadata.user ? { member: ws.metadata.user } : { browser: ws.metadata["browser-id"] }
    invite.owner = owner;
    invite.name = getDisplayNameOfPlayer(owner);

    invite.variant = messageContents.variant;
    invite.clock = messageContents.clock;
    invite.color = messageContents.color;
    invite.rated = messageContents.rated;
    invite.publicity = messageContents.publicity;
    invite.tag = messageContents.tag;
    
    return invite;
}

/**
 * Tests if a provided invite's properties have illegal values.
 * If so, they should be reported, and don't create the invite.
 * @param {Invite} invite 
 * @returns {boolean} true if it's illegal, false if it's normal
 */
function isCreatedInviteExploited(invite) {  // { variant, clock, color, rated, publicity }

    if (typeof invite.variant !== 'string') return true;
    if (typeof invite.clock !== 'string') return true;
    if (typeof invite.color !== 'string') return true;
    if (typeof invite.rated !== 'string') return true;
    if (typeof invite.publicity !== 'string') return true;
    if (typeof invite.tag !== 'string') return true;

    if (!variant1.isVariantValid(invite.variant)) return true;

    if (!clockweb.isClockValueValid(invite.clock)) return true;

    if (invite.color !== "White" && invite.color !== "Black" && invite.color !== "Random") return true;
    if (invite.rated !== 'casual') return true;
    if (invite.publicity !== 'public' && invite.publicity !== 'private') return true;
    if (invite.tag.length !== 8) return true; // Invite tags must be 8 characters long.

    return false;
}

/**
 * Logs an incident of exploiting invite properties to the hack log.
 * @param {Socket} ws - The socket that exploited invite creation
 * @param {Invite} invite - The exploited invite
 */
function reportForExploitingInvite(ws, invite) {
    ws.metadata.sendmessage(ws, "general", "printerror", "You cannot modify invite parameters (try refreshing).") // In order: socket, sub, action, value

    let logText;
    if (ws.metadata.user) logText = `User ${ws.metadata.user} detected modifying invite parameters! Invite: ${JSON.stringify(invite)}`
    else logText = `Browser ${ws.metadata["browser-id"]} detected modifying invite parameters! Invite: ${JSON.stringify(invite)}`

    logEvents(logText, 'hackLog.txt', { print: true }) // Log the exploit to the hackLog!
}

/** Makes sure {@link allowinvites} is up-to-date with any changes we've made. */
const updateAllowInvites = (function() {

    /**
     * The time, in millis since the Unix Epoch, we last read allowinvites.json to see if
     * we've modified it to disallow new invite creation or init a server restart.
     * 
     * Typically this file is re-read every time someone generates an invite, but we
     * will not read it again if it has been read in the last {@link intervalToReadAllowinviteMillis}
     */
    let timeLastReadAllowInvites = Date.now()

    return async () => {
        // How long has it been since the last read?
        const timePassedMillis = Date.now() - timeLastReadAllowInvites;
        const isTimeToReadAgain = timePassedMillis >= intervalToReadAllowinviteMillis;
        if (!isTimeToReadAgain) return; // Hasn't been over 5 seconds since last read
    
        //console.log("Reading allowinvites.json!")
    
        // If this is not called with 'await', it returns a promise.
        const newAllowInvitesValue = await readFile(
            allowinvitesPath,
            `Error locking & reading allowinvites.json after receiving a created invite!`
        )

        timeLastReadAllowInvites = Date.now();
    
        if (newAllowInvitesValue == null) { // Not defined, error in reading. Probably file is locked
            console.error(`There was an error reading allowinvites.json. Not updating it in memory.`)
            return;
        }

        allowinvites = newAllowInvitesValue

        // Stop server restarting if we're allowing invites again!
        if (allowinvites.allowinvites) cancelServerRestart();
        else initServerRestart(allowinvites)
    }
})()


/**
 * Call when we've read allowinvites.json and it's `allowInvites` property is false.
 * This will, if it's `restartIn` property is a number of minutes, init a server
 * restart, calculate the time the server should restart (even though we restart it manually),
 * and broadcast to all clients in a game that the server's about to restart. We only broadcast once,
 * then the clients remember the time it will restart
 * periodically informing the user when it gets closer.
 * @param {Object} newAllowInvitesValue - The newly read allowinvites.json file.
 */
async function initServerRestart(newAllowInvitesValue) { // { allowInvites, restartIn: minutes }
    if (!newAllowInvitesValue.restartIn) return; // We have not changed the value to indicate we're restarting. Return.

    const now = Date.now() // Current time in milliseconds
    // restartIn is in minutes, convert to milliseconds!
    const millisecondsUntilRestart = newAllowInvitesValue.restartIn * 60 * 1000;

    const value = now + millisecondsUntilRestart;
    setTimeServerRestarting(value)

    console.log(`Will be restarting the server in ${newAllowInvitesValue.restartIn} minutes!`)

    // Set our restartIn variable to undefined, so we don't repeat this next time we load the file!
    newAllowInvitesValue.restartIn = false;

    // Save the file
    await writeFile(
        allowinvitesPath,
        newAllowInvitesValue,
        `Error locking & writing allowinvites.json after receiving a created invite! Didn't save. Retrying after atleast 5 seconds when the next invite created.`
    )


    // Alert all people on the invite screen that we will be restarting soon
    // ...

    // Alert all people in a game that we will be restarting soon
    broadCastGameRestarting()
}

// Returns true if invites not allowed currently, server under maintenance
// and sends a message to the socket informing them of that!
// Call when they attempt to create an invite.

/**
 * Asks if invite creation is currently allowed by reading the allowinvites.json file
 * in the "database", if it hasn't been read the last 5 seconds, and observing
 * it's `allowInvites` property.
 * @param {Socket} ws - The socket attempting to create a new invite
 * @returns {Promise<boolean>} true if invite creation is allowed
 */
async function areInvitesAllowed(ws) {
    await updateAllowInvites()

    // If allowinvites is false, disallow invite creation
    const isOwner = ws.metadata.role === 'owner'
    if (allowinvites.allowinvites || isOwner) return true; // They are allowed to make an invite!

    // Making an invite is NOT allowed...

    printActiveGameCount();
    const timeUntilRestart = getMinutesUntilRestart();
    const message = timeUntilRestart ? 'server.javascript.ws-server_restarting' : 'server.javascript.ws-server_under_maintenance'; 
    sendNotify(ws, message, timeUntilRestart)
    return false; // NOT allowed to make an invite!
}

/**
 * Calculates the number of minutes, rounded up, the server will restart in,
 * if it is restarting. It does not restart automatically, but we manually do so.
 * The script just keeps track of the time we *plan* on restarting.
 * @returns {number} Minutes until restart, rounded up.
 */
function getMinutesUntilRestart() {
    const restartingAt = getTimeServerRestarting()
    if (!restartingAt) return; // Not restarting

    const now = Date.now(); // Current time in milliseconds
    const millisLeft = restartingAt - now;

    const minutesLeft = millisLeft / (1000 * 60)
    const ceiled = Math.ceil(minutesLeft)
    const returnThis = ceiled > 0 ? ceiled : 0;

    return returnThis; // Convert to minutes
}


module.exports = {
    createInvite
}