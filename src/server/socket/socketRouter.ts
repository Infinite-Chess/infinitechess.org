
// src/server/socket/socketRouter.ts

/**
 * This script receives routes incoming socket messages them where they need to go.
 * 
 * 
 * It also handles subbing to subscription lists.
 */

// Package imports
import * as z from 'zod';

import { sendSocketMessage } from './sendSocketMessage.js';
import socketUtility from './socketUtility.js';
import jsutil from '../../client/scripts/esm/util/jsutil.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import { subToInvitesList } from '../game/invitesmanager/invitesmanager.js';


import type { CustomWebSocket } from './socketUtility.js';

// Message routes -----------------------------------------------------------------------------

import { createInvite, createinviteschem } from '../game/invitesmanager/createinvite.js';
import { cancelInvite, cancelinviteschem } from '../game/invitesmanager/cancelinvite.js';
import { acceptInvite, acceptinviteschem } from '../game/invitesmanager/acceptinvite.js';
import { unsubMessage, unsubschem } from './socketManager.js';
import { abortGame } from '../game/gamemanager/abortresigngame.js';
import { resyncToGame } from '../game/gamemanager/resync.js';
import { onAFK, onAFK_Return } from '../game/gamemanager/onAFK.js';
import { acceptDraw, declineDrawRoute, offerDraw } from '../game/gamemanager/onOfferDraw.js';
import { onJoinGame } from '../game/gamemanager/joingame.js';
import { resignGame } from '../game/gamemanager/abortresigngame.js';
import { onRequestRemovalFromPlayersInActiveGames } from '../game/gamemanager/gamemanager.js';
import { onPaste } from '../game/gamemanager/pastereport.js';
import { onReport, reportschem } from '../game/gamemanager/cheatreport.js';
import { submitMove, submitmoveschem } from '../game/gamemanager/movesubmission.js';

const subschem = z.literal(['invites']);

function handleSubbing(ws: CustomWebSocket, value: any) {
	if (typeof value !== 'string') {
		const errText = `Websocket received sub is invalid! "${value}". Socket: ${socketUtility.stringifySocketMetadata(ws)}`;
		logEventsAndPrint(errText, 'hackLog.txt');
		sendSocketMessage(ws, 'general', 'printerror', `Websocket received sub is invalid.`);
	}

	// What are they wanting to subscribe to for updates?
	switch (value) {
		case "invites":
			// Subscribe them to the invites list
			subToInvitesList(ws);
			break;
		default: { // Surround this case in a block so that it's variables are not hoisted
			const errText = `Cannot subscribe user to strange new subscription list ${value}! Socket: ${socketUtility.stringifySocketMetadata(ws)}`;
			logEventsAndPrint(errText, 'hackLog.txt');
			sendSocketMessage(ws, 'general', 'printerror', `Cannot subscribe to "${value}" list!`);
			return;
		}
	}
}

const FNSschem = z.any();

function handleFeatureNotSupported(ws: CustomWebSocket, description: any) {
	const errText = `Client unsupported feature: ${jsutil.ensureJSONString(description)}   Socket: ${socketUtility.stringifySocketMetadata(ws)}\nBrowser info: ${ws.metadata.userAgent}`;
	logEventsAndPrint(errText, 'featuresUnsupported.txt');
}

const ignoreschem = z.void();

const MessageRoutes: {
	[subgroup: string]: {
		[action: string]: {
			schema: z.core.$ZodType,
			// eslint-disable-next-line no-unused-vars
			route: (ws: CustomWebSocket, value: any, replyto?: number) => void
		}
	}
} = {
	invites: {
		createinvite: {
			schema: createinviteschem,
			route: createInvite,
		},
		cancelinvite: {
			schema: cancelinviteschem,
			route: cancelInvite,
		},
		acceptinvite: {
			schema: acceptinviteschem,
			route: acceptInvite,
		}
	},
	general: {
		'feature-not-supported': {
			schema: FNSschem,
			route: handleFeatureNotSupported,
		},
		sub: {
			schema: subschem,
			route: handleSubbing,
		},
		unsub: {
			schema: unsubschem,
			route: unsubMessage,
		}
	},
	game: {
		abort: {
			schema: ignoreschem,
			route: abortGame,
		},
		resync: {
			schema: z.int(),
			route: resyncToGame,
		},
		AFK: {
			schema: ignoreschem,
			route: onAFK
		},
		'AFK-Return': {
			schema: ignoreschem,
			route: onAFK_Return
		},
		offerdraw: {
			schema: ignoreschem,
			route: offerDraw
		},
		acceptdraw: {
			schema: ignoreschem,
			route: acceptDraw
		},
		declinedraw: {
			schema: ignoreschem,
			route: declineDrawRoute
		},
		joingame: {
			schema: ignoreschem,
			route: onJoinGame
		},
		resign: {
			schema: ignoreschem,
			route: resignGame
		},
		removefromplayersinactivegames: {
			schema: ignoreschem,
			route: onRequestRemovalFromPlayersInActiveGames
		},
		paste: {
			schema: ignoreschem,
			route: onPaste
		},
		report: {
			schema: reportschem,
			route: onReport,
		},
		submitmove: {
			schema: submitmoveschem,
			route: submitMove,
		}
	}	
} as const;

// Type Definitions ---------------------------------------------------------------------------

/**
 * Represents an incoming WebSocket server message.
 */
interface WebsocketInMessage {
	/** The route to forward the message to (e.g., "general", "invites", "game"). */
	route: string;
	/** The action to perform with the message's data (e.g., "sub", "unsub", "createinvite"). */
	action: string;
	/** The contents of the message. */
	value: any;
	/** The ID of the message to echo, indicating the connection is still active.
	 * Or undefined if this message itself is an echo. */
	id?: number;
}

// Functions ---------------------------------------------------------------------------


function routeIncomingSocketMessage(ws: CustomWebSocket, message: WebsocketInMessage, rawMessage: string): void {
	// Route them to their specified location
	if (MessageRoutes[message.route] === undefined) {
		// Bad subgroup
		logEventsAndPrint(`BAD ROUTE  User tried to use sub group "${message.route}" which does not exist! Message: ${rawMessage} Websocket: ${socketUtility.stringifySocketMetadata(ws)}`, 'routerLog.txt');
		sendSocketMessage(ws, 'general', 'printerror', `Unknown routing group "${message.route}"`);
		return;
	}

	if (MessageRoutes[message.route]![message.action] === undefined) {
		// Bad action
		logEventsAndPrint(`BAD ROUTE  User tried to call action "${message.action}" which does not exist! Message: ${rawMessage} Websocket: ${socketUtility.stringifySocketMetadata(ws)}`, 'routerLog.txt');
		sendSocketMessage(ws, 'general', 'printerror', `Unknown action "${message.action}" in routing group "${message.route}"`);
		return;
	}

	const { route, schema } = MessageRoutes[message.route]![message.action]!;
	try {
		message.value = z.parse(schema, message.value);
	} catch (e) {
		if (!(e instanceof z.ZodError)) {
			console.warn("Failed zod parsing without proper error. VERY UNEXPECTED! Could be rejecting legimate requests...");
			return;
		}
		// Bad format
		logEventsAndPrint(`INVALID PARAMETERS  User submitted invalid parameters for "${message.route}:${message.action}"! Errors: ${jsutil.ensureJSONString(z.treeifyError(e))} Request data: ${jsutil.ensureJSONString(message.value)} Websocket: ${socketUtility.stringifySocketMetadata(ws)}`, 'routerLog.txt');
		sendSocketMessage(ws, 'general', 'printerror', "You cannot modify message parameters, if this is unintentional please hard-refresh the page.", message.id);

		console.log(z.prettifyError(e));
		return;
	}
	route(ws, message.value, message.id);
}

export {
	routeIncomingSocketMessage,
};

export type { WebsocketInMessage };