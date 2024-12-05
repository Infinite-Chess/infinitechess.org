
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



export {
	getClientIP,
};