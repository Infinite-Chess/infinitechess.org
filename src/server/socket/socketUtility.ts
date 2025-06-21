
// This script contains generalized methods for working with websocket objects.

import jsutil from '../../client/scripts/esm/util/jsutil.js';

// Type Definitions ---------------------------------------------------------------------------


import type { IncomingMessage } from 'http'; // Used for the socket upgrade http request TYPE

import type WebSocket from 'ws';
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
				id: number;
				/** The color they are playing as. @type {Player} */
				color: string;
			};
		};
		/** The parsed cookie object, this will contain the 'browser-id' cookie if they are not signed in */
		cookies: {
			/** This is ALWAYS present, even if signed in! */
			'browser-id'?: string;
			/** Their preferred language. For example, 'en-US'. This is determined by their `i18next` cookie. */
			i18next?: string;
			/** Their refresh/session token, if they are signed in. */
			jwt?: string;
		};
		/** The user-agent property of the original websocket upgrade's req.headers */
		userAgent?: string;
		memberInfo: {
			/** True if they are signed in, if not they MUST have a browser-id cookie! */
			signedIn: boolean;
			user_id?: number;
			username?: string;
			roles?: string[];
		};
		/** The account verification status of the user */
		verified: boolean;
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
function stringifySocketMetadata(ws: CustomWebSocket): string {
	// Removes the recursion from the metadata, making it safe to stringify.
	const simplifiedMetadata = getSimplifiedMetadata(ws);
	return jsutil.ensureJSONString(simplifiedMetadata, 'Error while stringifying socket metadata:');
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
		cookies: { "browser-id": ws.metadata.cookies['browser-id'], "i18next": ws.metadata.cookies["i18next"]}, // Only copy these 2 cookies, NOT their refresh token!!!
		verified: metadata.verified,
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
function getOwnerFromSocket(ws: CustomWebSocket): { member: string, user_id: number } | { browser: string } {
	const metadata = ws.metadata;
	if (metadata.memberInfo.signedIn) return { member: ws.metadata.memberInfo.username!, user_id: ws.metadata.memberInfo.user_id! };
	else return { browser: metadata.cookies['browser-id']! };
}

/**
 * Parses cookies from the WebSocket upgrade request headers.
 * @param req - The WebSocket upgrade request object
 * @returns An object with cookie names as keys and their corresponding values
 */
function getCookiesFromWebsocket(req: IncomingMessage): { [cookieName: string]: string } {
	// req.cookies is only defined from our cookie parser for regular requests,
	// NOT for websocket upgrade requests! We have to parse them manually!

	const rawCookies = req.headers.cookie;
	const cookies: { [cookieName: string]: string } = {};

	if (!rawCookies) return cookies;

	for (const cookie of rawCookies.split(';')) {
		const parts = cookie.split('=');
		if (parts.length < 2) continue; // Skip if no value part exists

		const name = parts[0]!.trim();
		const value = parts[1]!.trim();

		if (name && value) cookies[name] = value;
	}

	return cookies;
}

/**
 * Reads the IP address attached to the incoming websocket connection request,
 * and sets the websocket metadata's `IP` property to that value, then returns that IP.
 * @param req - The request object.
 * @param ws - The websocket object.
 * @returns The IP address of the websocket connection, or `undefined` if not present.
 */
function getIPFromWebsocketUpgradeRequest(req: IncomingMessage): string | undefined {
	// Check the headers for the forwarded IP (useful if behind a proxy like Cloudflare)
	const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress; // ws._socket.remoteAddress

	// If we didn't get a string IP, return undefined
	if (typeof clientIP !== 'string') return undefined;

	return clientIP;
}

/**
 * Extracts the signed-in status and identifier (username or browser ID) from the provided socket.
 * @param ws - The socket to extract the data from.
 * @returns An object containing the `signedIn` status and `identifier` (either username or browser ID).
 */
function getSignedInAndIdentifierOfSocket(ws: CustomWebSocket) {
	const signedIn = ws.metadata.memberInfo.signedIn;
	const identifier = signedIn ? ws.metadata.memberInfo.username : ws.metadata.cookies['browser-id'];
	return { signedIn, identifier };
}



export default {
	printSocket,
	stringifySocketMetadata,
	getOwnerFromSocket,
	getCookiesFromWebsocket,
	getIPFromWebsocketUpgradeRequest,
	getSignedInAndIdentifierOfSocket,
};

export type {
	CustomWebSocket,
};