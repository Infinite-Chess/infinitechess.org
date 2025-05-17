
/**
 * This script handles invite creation, making sure that the invites have valid properties.
 * 
 * Here we also read allowinvites.js to see if we are currently allowing new invites or not.
 */



// Middleware imports
import { logEvents } from '../../middleware/logEvents.js';

// Custom imports
import clockweb from '../clockweb.js';
import { existingInviteHasID, userHasInvite, addInvite, IDLengthOfInvites } from './invitesmanager.js';
import { isSocketInAnActiveGame } from '../gamemanager/activeplayers.js';
import { printActiveGameCount } from '../gamemanager/gamecount.js';
import { getMinutesUntilServerRestart } from '../timeServerRestarts.js';
import { isServerRestarting } from '../updateServerRestart.js';
import uuid from '../../../client/scripts/esm/util/uuid.js';
import variant from '../../../client/scripts/esm/chess/variants/variant.js';
import { sendNotify, sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { players } from '../../../client/scripts/esm/chess/util/typeutil.js';
import { Leaderboards, VariantLeaderboards } from '../../../client/scripts/esm/chess/variants/leaderboard.js';
import { getTranslation } from '../../utility/translate.js'; 
import { getDisplayEloOfPlayerInLeaderboard } from '../../database/leaderboardsManager.js';

/**
 * Type Definitions
 * @typedef {import('./inviteutility.js').Invite} Invite
 */

/** @typedef {import("../../socket/socketUtility.js").CustomWebSocket} CustomWebSocket */

/**
 * Creates a new invite from their websocket message.
 * 
 * This is async because we need to read allowinvites.json to see
 * if new invites are allowed, before we create it.
 * @param {CustomWebSocket} ws - Their socket
 * @param {*} messageContents - The incoming socket message that SHOULD contain the invite properties!
 * @param {number} replyto - The incoming websocket message ID, to include in the reply
 */
async function createInvite(ws, messageContents, replyto) { // invite: { id, owner, variant, clock, color, rated, publicity } 
	if (isSocketInAnActiveGame(ws)) return sendNotify(ws, 'server.javascript.ws-already_in_game', { replyto }); // Can't create invite because they are already in a game

	// Make sure they don't already have an existing invite
	if (userHasInvite(ws)) {
		sendSocketMessage(ws, 'general', 'printerror', "Can't create an invite when you have one already.", replyto);
		logEvents("Player already has existing invite, can't create another!", 'errLog.txt', { print: true });
		return;
	}

	// Are we restarting the server soon (invites not allowed)?
	if (!await isAllowedToCreateInvite(ws, replyto)) return; // Our response will have already been sent
    
	const invite = getInviteFromWebsocketMessageContents(ws, messageContents, replyto);
	if (!invite) return; // Message contained invalid invite parameters. Error already sent to the client.

	// Validate invite parameters, detect cheating
	if (isCreatedInviteExploited(invite)) return reportForExploitingInvite(ws, invite, replyto); // Our response will have already been sent

	// Invite has all legal parameters!

	// Check if user tries creating a rated game despite not being allowed to
	if (invite.rated === 'rated' && !(ws.metadata.memberInfo.signedIn && ws.metadata.verified)) {
		const message = getTranslation("server.javascript.ws-rated_invite_verification_needed", ws.metadata.cookies?.i18next);
		return sendSocketMessage(ws, "general", "notify", message, replyto);
	}

	// Create the invite now ...

	addInvite(ws, invite, replyto);
}

/**
 * Makes sure the socket message is an object, and strips it of all non-variant related properties.
 * STILL DO EXPLOIT checks on the specific invite values after this!!
 * @param {CustomWebSocket} ws
 * @param {*} messageContents - The incoming websocket message contents (separate from route and action)
 * @param {number} replyto - The incoming websocket message ID, to include in the reply
 * @returns {Invite | undefined} The Invite object, or undefined it the message contents were invalid.
 */
function getInviteFromWebsocketMessageContents(ws, messageContents, replyto) {

	// Verify their invite contains the required properties...

	// Is it an object? (This may pass if it is an array, but arrays won't crash when accessing property names, so it doesn't matter. It will be rejected because it doesn't have the required properties.)
	// We have to separately check for null because JAVASCRIPT has a bug where  typeof null => 'object'
	if (typeof messageContents !== 'object' || messageContents === null) return sendSocketMessage(ws, "general", "printerror", "Cannot create invite when incoming socket message body is not an object!" , replyto);

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
     * usernamecontainer
     */

	const invite = {};

	let id;
	do { id = uuid.generateID_Base36(IDLengthOfInvites); } while (existingInviteHasID(id));
	invite.id = id;

	const owner = ws.metadata.memberInfo.signedIn ? { member: ws.metadata.memberInfo.username, user_id: ws.metadata.memberInfo.user_id } : { browser: ws.metadata.cookies["browser-id"] };
	invite.owner = owner;
	invite.usernamecontainer = {};
	invite.usernamecontainer.username = owner.member || "(Guest)"; // Protect browser's browser-id cookie
	if (ws.metadata.memberInfo.signedIn) invite.usernamecontainer.displayrating = getDisplayEloOfPlayerInLeaderboard(ws.metadata.memberInfo.user_id, VariantLeaderboards[messageContents.variant] ?? Leaderboards.INFINITY);

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
	if (typeof invite.color !== 'number') return true;
	if (typeof invite.rated !== 'string') return true;
	if (typeof invite.publicity !== 'string') return true;
	if (typeof invite.tag !== 'string') return true;

	if (!variant.isVariantValid(invite.variant)) return true;

	if (!clockweb.isClockValueValid(invite.clock)) return true;

	if (invite.color !== players.WHITE && invite.color !== players.BLACK && invite.color !== players.NEUTRAL) return true;
	if (invite.rated !== 'casual' && invite.rated !== 'rated') return true;
	if (invite.publicity !== 'public' && invite.publicity !== 'private') return true;
	if (invite.tag.length !== 8) return true; // Invite tags must be 8 characters long.

	// Check if invite is allowed to be rated
	if (invite.rated === 'rated') {
		if (!(invite.variant in VariantLeaderboards)) return true;
		if (invite.clock === "-") return true;
		if (!(invite.color === players.NEUTRAL || invite.publicity === "private")) return true;
	}

	return false;
}

/**
 * Logs an incident of exploiting invite properties to the hack log.
 * @param {CustomWebSocket} ws - The socket that exploited invite creation
 * @param {Invite} invite - The exploited invite
 * @param {number} replyto - The incoming websocket message ID, to include in the reply
 */
function reportForExploitingInvite(ws, invite, replyto) {
	sendSocketMessage(ws, "general", "printerror", "You cannot modify invite parameters. If this was not intentional, try hard-refreshing the page.", replyto); // In order: socket, sub, action, value

	const logText = ws.metadata.memberInfo.signedIn ? `User ${ws.metadata.memberInfo.username} detected modifying invite parameters! Invite: ${JSON.stringify(invite)}`
                                     : `Browser ${ws.metadata.cookies["browser-id"]} detected modifying invite parameters! Invite: ${JSON.stringify(invite)}`;

	logEvents(logText, 'hackLog.txt', { print: true }); // Log the exploit to the hackLog!
}

/**
 * Returns true if the user is allowed to create a new invite at this time,
 * depending on whether the server is about to restart, or they have the owner role.
 * @param {CustomWebSocket} ws - The socket attempting to create a new invite
 * @param {number} replyto - The incoming websocket message ID, to include in the reply
 * @returns {Promise<boolean>} true if invite creation is allowed
 */
async function isAllowedToCreateInvite(ws, replyto) {
	if (!await isServerRestarting()) return true; // Server not restarting, all new invites are allowed!

	// Server is restarting... Do we have admin perms to create an invite anyway?

	if (ws.metadata.memberInfo.signedIn && ws.metadata.memberInfo.roles?.includes('owner')) return true; // They are allowed to make an invite!

	// Making an invite is NOT allowed...

	printActiveGameCount();
	const timeUntilRestart = getMinutesUntilServerRestart();
	const message = timeUntilRestart ? 'server.javascript.ws-server_restarting' : 'server.javascript.ws-server_under_maintenance'; 
	sendNotify(ws, message, { customNumber: timeUntilRestart, replyto });

	return false; // NOT allowed to make an invite!
}

export {
	createInvite
};