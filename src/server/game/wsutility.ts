
// This script contains generalized methods for working with websocket objects.

import { getTranslation } from '../utility/translate.js';
import { ensureJSONString } from '../utility/JSONUtils.js';
import jsutil from '../../client/scripts/esm/util/jsutil.js';


// Type Definitions ---------------------------------------------------------------------------


/** @typedef {import('./TypeDefinitions.js').Socket} Socket */

import WebSocket from 'ws';
/** The socket object that contains all properties a normal socket has,
 * plus an additional `metadata` property that we define ourselves. */
interface CustomWebSocket extends WebSocket {
	/** Our custom-entered information about this websocket.
     * To my knowledge (Naviary), the `metadata` property isn't already in use. */
	metadata: {
		/** What subscription lists they are subscribed to. Possible: "invites" / "game" */
		subscriptions: {
			/** Whether they are subscribed to the invites list. */
			invites?: boolean;
			/** Will be defined if they are subscribed to, or in, a game. */
			game?: {
				/** The id of the game they're in. @type {string} */
				id?: string;
				/** The color they are playing as. @type {string} */
				color?: string;
			};
		};
		/** The parsed cookie object, this will contain the 'browser-id' cookie if they are not signed in */
		cookies: {
			/** This is ALWAYS present, even if signed in! */
			'browser-id': string;
			/** Their preferred language. For example, 'en-US'. This is determined by their `i18next` cookie. */
			i18next: string;
		};
		/** The user-agent property of the original websocket upgrade's req.headers */
		userAgent: string;
		memberInfo: {
			/** True if they are signed in, if not they MUST have a browser-id cookie! */
			signedIn: boolean;
			user_id?: string;
			username?: string;
			roles?: string[];
		};
		/** The id of their websocket. */
		id: string;
		/** The socket's IP address. */
		IP: string;
		/** The timeout ID that can be used to cancel the timer that will
         * expire the socket connection. This is useful if it closes early. */
		clearafter?: NodeJS.Timeout;
		/** The timeout ID to cancel the timer that will send an empty
         * message to this socket just to verify they are alive and thinking. */
		renewConnectionTimeoutID?: NodeJS.Timeout;
		/** A function that when called, returns true if this socket has an open invite. @type {Function} */
		hasInvite?: () => boolean;
	};
}


// Functions ---------------------------------------------------------------------------


/**
 * Prints the websocket to the console, temporarily removing self-referencing first.
 * @param ws - The websocket
 */
function printSocket(ws: CustomWebSocket) { console.log(stringifySocketMetadata(ws)); }

/**
 * Simplifies the websocket's metadata and stringifies it.
 * @param ws - The websocket object
 * @returns The stringified simplified websocket metadata.
 */
function stringifySocketMetadata(ws: CustomWebSocket) {
	// Removes the recursion from the metadata, making it safe to stringify.
	const simplifiedMetadata = getSimplifiedMetadata(ws);
	return ensureJSONString(simplifiedMetadata, 'Error while stringifying socket metadata:');
}

/**
 * Creates a new object with simplified metadata information from the websocket,
 * and removes recursion. This can be safely be JSON.stringified() afterward.
 * Excludes the stuff like the sendmessage() function and clearafter timer.
 * 
 * BE CAREFUL not to modify the return object, for it will modify the original socket!
 * @param ws - The websocket object
 * @returns A new object containing simplified metadata.
 */
function getSimplifiedMetadata(ws: CustomWebSocket) {
	const metadata = ws.metadata;
	// Using Partial takes an existing type and makes all of its properties optional
	const metadataCopy: Partial<typeof metadata> = {
		memberInfo: jsutil.deepCopyObject(metadata.memberInfo),
		cookies: jsutil.deepCopyObject(metadata.cookies),
		id: metadata.id,
		IP: metadata.IP,
		subscriptions: jsutil.deepCopyObject(metadata.subscriptions),
	};

	return metadataCopy;
}

/**
 * Returns the owner of the websocket.
 * @param ws - The websocket
 * @returns An object that contains either the `member` or `browser` property.
 */
function getOwnerFromSocket(ws: CustomWebSocket): { member: string } | { browser: string } {
	const metadata = ws.metadata;
	if (metadata.memberInfo.signedIn) return { member: ws.metadata.memberInfo.username! };
	else return { browser: metadata.cookies['browser-id']};
}



export default {
	printSocket,
	stringifySocketMetadata,
	getOwnerFromSocket,
};

export type {
	CustomWebSocket,
}