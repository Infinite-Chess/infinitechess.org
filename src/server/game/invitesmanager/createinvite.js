
/**
 * This script handles invite creation, making sure that the invites have valid properties.
 * 
 * Here we also read allowinvites.js to see if we are currently allowing new invites or not.
 */



// Middleware imports
import { logEvents } from '../../middleware/logEvents.js';

// Custom imports
import wsutility from '../wsutility.js';
const { sendNotify, sendNotifyError } = wsutility;
import clockweb from '../clockweb.js';
import gameutility from '../gamemanager/gameutility.js';
const { getDisplayNameOfPlayer } = gameutility;
import { existingInviteHasID, userHasInvite, addInvite, IDLengthOfInvites } from './invitesmanager.js';
import { isSocketInAnActiveGame } from '../gamemanager/activeplayers.js';
import { printActiveGameCount } from '../gamemanager/gamecount.js';
import { getMinutesUntilServerRestart } from '../timeServerRestarts.js';
import { isServerRestarting } from '../updateServerRestart.js';
import uuid from '../../../client/scripts/esm/util/uuid.js';
import variant from '../../../client/scripts/esm/chess/variants/variant.js';

/**
 * Type Definitions
 * @typedef {import('./inviteutility.js').Invite} Invite
 * @typedef {import('../TypeDefinitions.js').Socket} Socket
 */

/**
 * Creates a new invite from their websocket message.
 * 
 * This is async because we need to read allowinvites.json to see
 * if new invites are allowed, before we create it.
 * @param {Socket} ws - Their socket
 * @param {*} messageContents - The incoming socket message that SHOULD contain the invite properties!
 * @param {number} replyto - The incoming websocket message ID, to include in the reply
 */
async function createInvite(ws, messageContents, replyto) { // invite: { id, owner, variant, clock, color, rated, publicity } 
	if (isSocketInAnActiveGame(ws)) return sendNotify(ws, 'server.javascript.ws-already_in_game', { replyto }); // Can't create invite because they are already in a game

	// Make sure they don't already have an existing invite
	if (userHasInvite(ws)) {
		ws.metadata.sendmessage(ws, 'general', 'printerror', "Can't create an invite when you have one already.", replyto);
		logEvents("Player already has existing invite, can't create another!", 'errLog.txt', { print: true });
		return;
	}

	// Are we restarting the server soon (invites not allowed)?
	if (!await isAllowedToCreateInvite(ws, replyto)) return; // Our response will have already been sent
    
	const invite = getInviteFromWebsocketMessageContents(ws, messageContents, replyto);
	if (!invite) return; // Message contained invalid invite parameters. Error already sent to the client.

	// Validate invite parameters, detect cheating
	if (isCreatedInviteExploited(invite)) return reportForExploitingInvite(ws, invite, replyto); // Our response will have already been sent

	// Invite has all legal parameters! Create the invite...

	// Who is the owner of the invite?
	const owner = ws.metadata.memberInfo.signedIn ? { member: ws.metadata.memberInfo.username } : { browser: ws.cookies["browser-id"] };
	invite.owner = owner;

	do { invite.id = uuid.generateID(5); } while (existingInviteHasID(invite.id));

	addInvite(ws, invite, replyto);
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
	if (typeof messageContents !== 'object' || messageContents === null) return ws.metadata.sendmessage(ws, "general", "printerror", "Cannot create invite when incoming socket message body is not an object!" , replyto);

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
	do { id = uuid.generateID(IDLengthOfInvites); } while (existingInviteHasID(messageContents.id));
	invite.id = id;

	const owner = ws.metadata.memberInfo.signedIn ? { member: ws.metadata.memberInfo.username } : { browser: ws.cookies["browser-id"] };
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

	if (!variant.isVariantValid(invite.variant)) return true;

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
 * @param {number} replyto - The incoming websocket message ID, to include in the reply
 */
function reportForExploitingInvite(ws, invite, replyto) {
	ws.metadata.sendmessage(ws, "general", "printerror", "You cannot modify invite parameters. If this was not intentional, try hard-refreshing the page.", replyto); // In order: socket, sub, action, value

	const logText = ws.metadata.memberInfo.signedIn ? `User ${ws.metadata.memberInfo.username} detected modifying invite parameters! Invite: ${JSON.stringify(invite)}`
                                     : `Browser ${ws.cookies["browser-id"]} detected modifying invite parameters! Invite: ${JSON.stringify(invite)}`;

	logEvents(logText, 'hackLog.txt', { print: true }); // Log the exploit to the hackLog!
}

/**
 * Returns true if the user is allowed to create a new invite at this time,
 * depending on whether the server is about to restart, or they have the owner role.
 * @param {Socket} ws - The socket attempting to create a new invite
 * @param {number} replyto - The incoming websocket message ID, to include in the reply
 * @returns {Promise<boolean>} true if invite creation is allowed
 */
async function isAllowedToCreateInvite(ws, replyto) {
	if (!await isServerRestarting()) return true; // Server not restarting, all new invites are allowed!

	// Server is restarting... Do we have admin perms to create an invite anyway?

	if (ws.metadata.memberInfo.roles.includes('owner')) return true; // They are allowed to make an invite!

	// Making an invite is NOT allowed...

	printActiveGameCount();
	const timeUntilRestart = getMinutesUntilServerRestart();
	const message = timeUntilRestart ? 'server.javascript.ws-server_restarting' : 'server.javascript.ws-server_under_maintenance'; 
	sendNotify(ws, message, { number: timeUntilRestart, replyto });

	return false; // NOT allowed to make an invite!
}


export {
	createInvite
};