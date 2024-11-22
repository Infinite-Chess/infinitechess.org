
/**
 * This script handles socket, upgrade connection requests, and creates new sockets
 */

import { DEV_BUILD } from '../config/config.js';
import { rateLimitWebSocket } from '../middleware/rateLimit.js';


/**
 * Type Definitions
 * @typedef {import('../game/TypeDefinitions.js').Socket} Socket
 * @typedef {import('../game/TypeDefinitions.js').WebsocketMessage} WebsocketMessage
 */

const maxSocketsAllowedPerIP = 10;
const maxSocketsAllowedPerMember = 5;



/**
 * The maximum age a websocket connection will live before auto terminating, in milliseconds.
 * Users have to provide authentication whenever they open a new socket.
 */
const maxWebSocketAgeMillis = 1000 * 60 * 15; // 15 minutes. 
// const maxWebSocketAgeMillis = 1000 * 10; // 10 seconds for dev testing






/**
 * 
 * @param {Socket} ws 
 * @param {Object} req
 */
function onConnectionRequest(ws, req) {
	// Make sure the connection is secure https
	const origin = req.headers.origin;
	if (!origin.startsWith('https')) {
		console.log('WebSocket connection request rejected. Reason: Not Secure. Origin:', origin);
		return ws.close(1009, "Not Secure");
	}

	// Make sure the origin is our website
	if (!DEV_BUILD && origin !== `https://${HOST_NAME}`) { // In DEV_BUILD, allow all origins.
		console.log(`WebSocket connection request rejected. Reason: Origin Error. Origin: ${origin}   Should be: https://${HOST_NAME}`);
		return ws.close(1009, "Origin Error");
	}

	// Parse cookies from the Upgrade http headers
	ws.cookies = getCookiesFromWebsocket(req);

	ws.metadata = {
		subscriptions: {}, // NEEDS TO BE INITIALIZED before we do anything it will crash because it's undefined!
		userAgent: req.headers['user-agent'],
	};

	// Rate Limit Here
	// A false could either mean:
	// 1. IP undefined
	// 2. Too many requests
	// 3. Message too big
	// In ALL these cases, we are terminating all the IPs sockets for now!
	if (!rateLimitWebSocket(req, ws)) { // Connection not allowed
		return terminateAllIPSockets(ws.metadata.IP);
	};

	// Check if ip has too many connections
	if (clientHasMaxSocketCount(ws.metadata.IP)) {
		console.log(`Client IP ${ws.metadata.IP} has too many sockets! Not connecting this one.`);
		return ws.close(1009, 'Too Many Sockets');
	}
	
	// Initialize who they are. Member? Browser ID?...
	verifyJWTWebSocket(req, ws); // Auto sets ws.metadata.memberInfo properties!

	if (ws.metadata.memberInfo.signedIn && memberHasMaxSocketCount(ws.metadata.memberInfo.username)) {
		console.log(`Member ${ws.metadata.memberInfo.username} has too many sockets! Not connecting this one.`);
		return ws.close(1009, 'Too Many Sockets');
	}

	if (!ws.metadata.memberInfo.signedIn && ws.cookies['browser-id'] === undefined) { // Terminate web socket connection request, they NEED authentication!
		console.log(`Authentication needed for WebSocket connection request!! Socket:`);
		wsutility.printSocket(ws);
		return ws.close(1008, 'Authentication needed'); // Code 1008 is Policy Violation
	}

	const id = giveWebsocketUniqueID(ws); // Sets the ws.metadata.id property of the websocket

	websocketConnections[id] = ws; // Add the connection to our list of all websocket connections
	addConnectionToConnectedIPs(ws.metadata.IP, id); // Add the conenction to THIS IP's list of connections (so we can cap on a per-IP basis)
	addConnectionToConnectedMembers(ws.metadata.memberInfo.username, id);

	// Log the request
	logWebsocketStart(req, ws);

	if (printIncomingAndClosingSockets) console.log(`New WebSocket connection established. Socket count: ${Object.keys(websocketConnections).length}. Metadata: ${wsutility.stringifySocketMetadata(ws)}`);

	ws.on('message', (message) => { executeSafely(onmessage, 'Error caught within websocket on-message event:', req, ws, message); });
	ws.on('close', (code, reason) => { executeSafely(onclose, 'Error caught within websocket on-close event:', ws, code, reason); });
	ws.on('error', (error) => { executeSafely(onerror, 'Error caught within websocket on-error event:', ws, error); });

	// We include the sendmessage function on the websocket to avoid circular dependancy with these scripts!
	ws.metadata.sendmessage = sendmessage;

	ws.metadata.clearafter = setTimeout(closeWebSocketConnection, maxWebSocketAgeMillis, ws, 1000, 'Connection expired'); // Code 1000 for normal closure

	// Send the current game vesion, so they will know whether to refresh.
	sendmessage(ws, 'general', 'gameversion', GAME_VERSION);
}



function onerror(ws, error) {
	const errText = `An error occurred in a websocket. ${wsutility.stringifySocketMetadata(ws)}\n${error.stack}`;
	logEvents(errText, 'errLog.txt', { print: true });
}

// Sets the metadata.id property of the websocket connection!
function giveWebsocketUniqueID(ws) {
	const id = genUniqueID(12, websocketConnections);
	ws.metadata.id = id;
	return id;
}


/**
 * Returns true if the given IP has the maximum number of websockets opened.
 * @param {number} IP - The IP address
 * @returns {boolean} *true* if they have too many sockets.
 */
function clientHasMaxSocketCount(IP) {
	return connectedIPs[IP]?.length >= maxSocketsAllowedPerIP;
}

function getCookiesFromWebsocket(req) { // req is the WEBSOCKET on-connection request!

	// req.cookies is only defined from our cookie parser for REGULAR requests,
	// NOT for websocket upgrade requests! We have to parse them manually!

	const rawCookies = req.headers.cookie; // In the format: "invite-tag=etg5b3bu; jwt=9732fIESLGIESLF"
	const cookies = {};
	if (!rawCookies || typeof rawCookies !== 'string') return cookies;

	try {
		rawCookies.split(';').forEach(cookie => {
			const parts = cookie.split('=');
			const name = parts[0].trim(); // What to do if parts[0] is undefined?
			const value = parts[1].trim(); // What to do if parts[0] is undefined?
			cookies[name] = value;
		});
	} catch (e) {
		const errText = `Websocket connection request contained cookies in an invalid format!! Cookies: ${ensureJSONString(rawCookies)}\n${e.stack}`;
		logEvents(errText, 'errLog.txt', { print: true });
	}

	return cookies;
}



export {
	onConnectionRequest
};