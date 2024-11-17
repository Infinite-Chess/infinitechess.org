


/*
 * This script should contain utility methods regarding
 * sockets that both the CLIENT and server can use.
 */



// Variables ---------------------------------------------------------------------------------



// Possible websocket closure reasons:

// Server closure reasons:
// 1000 "Connection expired"  (This can say this even if in dev tools we disable our network)
// 1008 "Unable to identify client IP address"
// 1008 "Authentication needed"
// 1008 "Logged out"
// 1009 "Too Many Requests. Try again soon."
// 1009 "Message Too Big"
// 1009 "Too Many Sockets"
// 1009 "Origin Error"
// 1014 "No echo heard"  (Client took too long to respond)

// Client closure reasons:
// 1000 "Connection closed by client"
// 1000 "Connection closed by client. Renew."

// Other:
// 1006 "" Network error
// 1001 "" Endpoint going away. (Closed tab without performing cleanup)



// All client-side closure codes:

// 1000: Normal closure.
// 1001: Endpoint going away.
// 1002: Protocol error.
// 1003: Unsupported data.
// 1005: No status code received (reserved).
// 1006: Abnormal closure, no further detail available (reserved). This is usually a network interruption, OR the server is down.
// 1007: Invalid data received.
// 1008: Policy violation.
// 1009: Message too big.
// 1010: Missing extension.
// 1011: Internal server error.
// 1012: Service restart.
// 1013: Try again later.
// 1014: Bad gateway.
// 1015: TLS handshake failure (reserved).

// Possible closure reasons (pairings of code and reason):

// 1000 "Connection expired"  (This can say this even if in dev tools we disable our network)
// 1000 "Connection closed by client"
// 1000 "Connection closed by client. Renew."
// 1008 "Unable to identify client IP address"
// 1008 "Authentication needed"
// 1008 "Logged out" (Happens when we click log out button)
// 1009 "Too Many Requests. Try again soon."
// 1009 "Message Too Big"
// 1009 "Too Many Sockets"
// 1009 "Origin Error"
// 1014 "No echo heard"  (Client took too long to respond)



// These are the closure reasons where we will RETAIN their invite for a set amount of time before deleting it by disconnection!
// We will also give them 5 seconds to reconnect before we tell their opponent they have disconnected.
// If the closure code is NOT one of the ones below, it means they purposefully closed the socket (like closed the tab),
// so IMMEDIATELY tell their opponent they disconnected!
const closureCodesNotByChoice = [1006];
const closureReasonsNotByChoice = ["Connection expired", "Logged out", "Message Too Big", "Too Many Sockets", "No echo heard", "Connection closed by client. Renew."];



// Functions ---------------------------------------------------------------------------------



/**
 * Determines if the WebSocket closure was not initiated by the client (i.e., they had no control over the closure).
 * If this returns `true`, the client is allowed 5 seconds to reconnect before notifying their opponent of the disconnection.
 * @param {number} code - The WebSocket closure code.
 * @param {string} reason - The reason provided for the WebSocket closure.
 * @returns {boolean} - Returns `true` if the closure was not initiated by the client, otherwise `false`.
 */
function wasSocketClosureNotByTheirChoice(code, reason) {
	return closureCodesNotByChoice.includes(code) || closureReasonsNotByChoice.includes(reason.trim());
}



export default {
	wasSocketClosureNotByTheirChoice,
};