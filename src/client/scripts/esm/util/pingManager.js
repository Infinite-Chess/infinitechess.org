
/**
 * PingManager
 * Manages the current ping value and handles events related to ping updates and socket closures.
 * 
 * This script is only used for subtracting the ping value from the clock values the server reported.
 */

const MAX_PING_HISTORY = 3; // Maximum number of ping history entries to store

let currentPing = undefined; // Stores the current ping value
const pingHistory = []; // Stores the last 'MAX_PING_HISTORY' ping values



// Initialize event listeners for ping and socket-closed events
(function init() {
	document.addEventListener('ping', handlePingUpdate);
	document.addEventListener('socket-closed', handleSocketClosed);
})();



/**
 * Event handler for the 'ping' event.
 * Updates the current ping value and appends it to the history.
 * @param {CustomEvent} event - The 'ping' event with the new ping value in event.detail.
 */
function handlePingUpdate(event) {
	currentPing = event.detail;
	updatePingHistory(currentPing);
}

/**
 * Event handler for the 'socket-closed' event.
 * Resets the current ping value without clearing the ping history.
 * @param {CustomEvent} event - The 'socket-closed' event.
 */
function handleSocketClosed(event) {
	currentPing = undefined;
}

/**
 * Updates the ping history with the latest ping value.
 * Ensures that only the last 'MAX_PING_HISTORY' ping values are kept in the history.
 * @param {number} ping - The latest ping value.
 */
function updatePingHistory(ping) {
	pingHistory.push(ping);
	if (pingHistory.length > MAX_PING_HISTORY) pingHistory.shift(); // Remove the oldest value if history exceeds MAX_PING_HISTORY
}

/**
 * Getter for the current ping value.
 * @returns {number|undefined} The current ping value or undefined if no ping is stored.
 */
function getPing() {
	return currentPing;
}

/**
 * Getter for the average ping value over the last 'MAX_PING_HISTORY' pings.
 * @returns {number} The average ping value or 0 if there is no history.
 */
function getAveragePing() {
	if (pingHistory.length === 0) return 0;
	const sum = pingHistory.reduce((acc, ping) => acc + ping, 0);
	return sum / pingHistory.length;
}

export default {
	getPing,
	getAveragePing,
};
