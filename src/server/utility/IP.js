
/**
 * This module reads the IP address attached to incoming
 * requests and websocket connection requests.
 */

/** @typedef {import('../game/TypeDefinitions.js').Socket} Socket // The type definition for websocket objects */ 



/**
 * Reads the IP address attached to the incoming request.
 * @param {Object} req - The request object
 * @returns {string|undefined} The IP address of the request, or `undefined` if not present.
 */
function getClientIP(req) {
	//const clientIP = req.ip; // This DOES work... but it still often changes.
	const clientIP = req.headers['x-forwarded-for'] || req.ip; // "x-forwarded-for" is Cloudflare's forwarded ip.

	if (typeof clientIP !== 'string') return undefined;
	return clientIP;
}

/**
 * Reads the IP address attached to the incoming websocket connection request,
 * and sets the websocket metadata's `IP` property to that value, then returns that IP.
 * @param {Object} req - The request object.
 * @param {Socket} ws - The websocket object.
 * @returns {string|undefined} The IP address of the websocket connection, or `undefined` if not present.
 */
function getClientIP_Websocket(req, ws) {
	if (ws.metadata.IP) return ws.metadata.IP; // Return their socket's ip if we have already read it!

	//const clientIP = req.ip; // Undefined
	//const clientIP = ws._socket.remoteAddress; // Changes every request
	const clientIP = req.headers['x-forwarded-for'] || ws._socket.remoteAddress; // "x-forwarded-for" is Cloudflare's forwarded ip.

	if (typeof clientIP !== 'string') return undefined;

	ws.metadata.IP = clientIP; // Set their ip so we don't have to keep finding it with future socket messaes
	return clientIP;
}



export {
	getClientIP,
	getClientIP_Websocket
};