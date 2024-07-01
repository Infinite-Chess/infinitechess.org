const { logEvents } = require('./logEvents');
const { getClientIP, getClientIP_Websocket } = require("./IP")

const { isIPBanned } = require('../middleware/banned');
const { DEV_BUILD, ARE_RATE_LIMITING } = require('../config/config');
const { Socket } = require("../game/TypeDefinitions")

// For rate limiting a client...

/** The maximum number of requests/messages allowed per IP address, per minute. */
const maxRequestsPerMinute = DEV_BUILD ? 400 : 200; // Default: 400 / 200
const minuteInMillis = 60000;

/**
 * Interval to forget recently connected IP addresses, if they
 * haven't connected within the last minute.
 */
const rateToClearDeadConnectionsMillis = 60000;

/**
 * The object containing IP addresses for the key, and for the value-
 * the number of times they have sent a request the past minute.
 * `{ "192.538.1.1": 7 }`
 */
const rateLimitHash = {};

// For detecting if we're under a DDOS attack...

/** Interval to check if we think we're experiencing a DDOS */
const requestWindowToToggleAttackModeMillis = 2000;
/**
 * The number of requests we can receive in our {@link requestWindowToToggleAttackModeMillis}
 * before thinking there's a DDOS attack happening.
 */
const requestCapToToggleAttackMode = 200;

/**
 * Whether or not we think we're currently experiencing a DDOS.
 * When true, in the future we can strictly limit what actions users can request/perform!
 * 
 * Ideas:
 * 1. All htmls, or statically served file items, should only be served once per minute to each IP.
 * 2. Don't rate limit player's websocket messages who are currently in a game.
 * 3. Temporarily disallow account creation.
 */
let underAttackMode = false;

/**
 * An ordered array of timestamps of recent connections,
 * up to {@link requestWindowToToggleAttackModeMillis} ago.
 * The length of this is how many total requests we have
 * received during the past {@link requestWindowToToggleAttackModeMillis}.
 * `[ 521521521, 521521578 ]`
 */
let recentRequests = []; // List of times of recent connections

/**
 * The maximum size of an incoming websocket message, in bytes.
 * Above this will be rejected, and an error sent to the client.
 */
const maxWebsocketMessageSizeBytes = 60000;
/**
 * How many requests should an over-sized incoming websocket message
 * stand for? Increase this to make them be rate limited sooner when sending over-sized messages.
 */
const connectionsLargeMessageCountsFor = 34;



/**
 * Middleware that counts this IP address's recent connections,
 * and rejects this request if they've sent too many.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The function to call, when finished, to continue the middleware waterfall.
 */
function rateLimit(req, res, next) {
    if (!ARE_RATE_LIMITING) return next(); // Not rate limiting
    
    countRecentRequests();
    
    const clientIP = getClientIP(req);
    if (!clientIP) {
        console.log('Unable to identify client IP address')
        return res.status(500).json({ message: 'Unable to identify client IP address' });
    }

    if (isIPBanned(clientIP)) {
        const logThis = `Banned IP ${clientIP} tried to connect! ${req.headers.origin}   ${clientIP}   ${req.method}   ${req.url}   ${req.headers['user-agent']}`;
        logEvents(logThis, 'bannedIPLog.txt', { print: true });
        return res.status(403).json({ message: 'You are banned' });
    }

    if (rateLimitHash[clientIP] > maxRequestsPerMinute) { // Rate limit them (too many requests sent)
        console.log(`IP ${clientIP} has too many requests! Count: ${rateLimitHash[clientIP]}`);
        return res.status(429).json({ message: 'Too Many Requests. Try again soon.' });
    }

    // Increment their recent connection count,
    // and set a timer to decrement their recent connection count after 1 min
    incrementClientConnectionCount(clientIP)

    next(); // Continue the middleware waterfall
}

// Returns true if the connection is allowed. False if too many.

/**
 * Counts this IP address's recent connections,
 * and returns false if they've sent too many requests/messages.
 * @param {Object} req - The request object
 * @param {Socket} ws - The websocket object
 * @returns {boolean} false if they've sent too many requests/messages.
 */
function rateLimitWebSocket(req, ws) {

    countRecentRequests();

    const clientIP = getClientIP_Websocket(req, ws);
    if (!clientIP) {
        console.log('Unable to identify client IP address from web socket connection')
        ws.close(1008, 'Unable to identify client IP address') // Code 1008 is Policy Violation
        return false;
    }

    if (rateLimitHash[clientIP] > maxRequestsPerMinute) {
        console.log(`IP ${clientIP} has too many requests! Count: ${rateLimitHash[clientIP]}`);
        ws.close(1009, 'Too Many Requests. Try again soon.')
        return false;
    }

    // Test if the message is too big here. People could DDOS this way
    // THIS MAY NOT WORK if the bytes get read before we reach this part of the code, it could still DDOS us before we reject them.
    // Then again.. Unless their initial http websocket upgrade request contains a massive amount of bytes, this will immediately reject them anyway!
    const messageSize = ws._socket.bytesRead;
    if (messageSize > maxWebsocketMessageSizeBytes) {
        ws.close(1009, 'Message Too Big')
        incrementClientConnectionCount(clientIP, connectionsLargeMessageCountsFor)
        return false;
    }

    incrementClientConnectionCount(clientIP)

    return true; // Connection allowed!
}

/**
 * Increment the provided IP address's recent connection count,
 * and set a timer to decrement their recent connection count after 1 min.
 * Only call if we haven't already rejected them for too many requests.
 * @param {string} clientIP - The client's IP address
 * @param {number|undefined} [amount=1] The weight of this request. Default: 1. Higher => rate limit sooner.
 */
function incrementClientConnectionCount(clientIP, amount = 1) {
    if (rateLimitHash[clientIP] === undefined) rateLimitHash[clientIP] = amount;
    else rateLimitHash[clientIP] += amount; // Will only increment if we haven't already rejected them for too many requests.

    setTimeout(() => { rateLimitHash[clientIP] -= amount; }, minuteInMillis);
}

/**
 * Set an interval to every so often,
 * clear {@link rateLimitHash} of IP addresses
 * with 0 recent connections.
 */
setInterval(() => {
    const hashKeys = Object.keys(rateLimitHash);
    for (const ip of hashKeys) {
        if (rateLimitHash[ip] !== 0) continue;
        delete rateLimitHash[ip]
    }
}, rateToClearDeadConnectionsMillis)

/**
 * Adds the current timestamp to {@link recentRequests}.
 * This should always be called with any request/message,
 * EVEN if they are rate limited.
 */
function countRecentRequests() {
    const currentTimeMillis = Date.now()
    recentRequests.push(currentTimeMillis);
}

/**
 * Set an interval to repeatedly strip {@link recentRequests}
 * of timestamps that are longer than {@link requestWindowToToggleAttackModeMillis} ago.
 * This uses binary search to quickly find the splice point, so that
 * we don't potentially have to check hundreds of timestamps.
 * 
 * This also activates {@link underAttackMode} if it thinks we have had SO
 * many recent connections that it must be a DDOS attack.
 */
setInterval(() => {
    // Delete recent requests longer than 2 seconds ago
    const twoSecondsAgo = Date.now() - requestWindowToToggleAttackModeMillis;
    const indexToSplitAt = binarySearch_findValue(recentRequests, twoSecondsAgo)
    recentRequests.splice(0, indexToSplitAt + 1);

    if (recentRequests.length > requestCapToToggleAttackMode) {
        //console.log(`Probable DDOS attack happening now. The past ${requestWindowToToggleAttackModeMillis} milliseconds contained ${recentRequests.length} reqests!`)
        if (!underAttackMode) { // Toggle on
            underAttackMode = true;
            logAttackBegin();
        }
    } else if (underAttackMode) {
        underAttackMode = false;
        logAttackEnd();
    }
}, requestWindowToToggleAttackModeMillis);

/**
 * Calculates the index at which you could insert the given value
 * and keep the array organized, OR returns the index of the given value.
 * @param {number[]} sortedArray - An Array of NUMBERS. If not all numbers, this will crash.
 * @param {number} value - The number to find the split point of, or exact index position of.
 * @returns {number} The index
 */
function binarySearch_findValue(sortedArray, value) {
    let left = 0;
    let right = sortedArray.length - 1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const midValue = sortedArray[mid];

        if (value < midValue) right = mid - 1;
        else if (value > midValue) left = mid + 1;
        else if (midValue === value) return mid;
    }

    // The left is the index at which you could insert the new value at the correct location!
    return left;
}

function logAttackBegin() {
    const logText = `Probable DDOS attack happening now. Initial recent request count: ${recentRequests.length}`;
    logEvents(logText, 'hackLog.txt', { print: true });
}

function logAttackEnd() {
    const logText = `DDOS attack has ended.`;
    logEvents(logText, 'hackLog.txt', { print: true });
}

module.exports = {
    rateLimit,
    rateLimitWebSocket
};