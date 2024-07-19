
const jwt = require('jsonwebtoken');

const { findMemberFromRefreshToken, getUsernameCaseSensitive, updateLastSeen } = require('./members');
const { logEvents } = require('../middleware/logEvents');
const { isBrowserIDBanned } = require('../middleware/banned');
const { generateID } = require("../game/math1")

/**
 * How long until the cookie containing their new access token
 * will last until expiring, in milliseconds.
 * This is NOT when the token itself expires, only the cookie.
 */
const expireTimeOfTokenCookieMillis = 1000 * 10; // 10 seconds
const expireOfBrowserIDCookieMillis = 1000 * 60 * 60 * 24 * 7; // 7 days

// Route
// Returns a new access token if refresh token hasn't expired.
// Called by a fetch(). ALWAYS RETURN a json!
const handleRefreshToken = (req, res) => {
    const cookies = req.cookies;
    // If we have cookies AND there's a jwt property..
    if (!cookies?.jwt) {
        assignOrRenewBrowserID(req, res);
        return res.status(401).json({'message' : "refresh_token_expired"});
    }
    const refreshToken = cookies.jwt;
    const foundMemberKey = findMemberFromRefreshToken(refreshToken);
    // This part allows us to invalidate a refresh token EVEN if the user logs out before the 5 days expires!
    // As soon as they log out, we will have removed the token from the database.
    if (!foundMemberKey) {
        assignOrRenewBrowserID(req, res);
        return res.status(403).json({'message': "refresh_token_not_found_logged_out"}); // Forbidden
    }

    // Evaluate jwt
    jwt.verify(
        refreshToken,
        process.env.REFRESH_TOKEN_SECRET,
        (err, decoded) => {
            // If the token is expired/wrong, or the payload is different
            if (err || foundMemberKey !== decoded.username) {
                assignOrRenewBrowserID(req, res);
                return res.status(403).json({'message' : "refresh_token_invalid"});
            }
            // Else verified. Send them new access token!
            const accessToken = jwt.sign(
                { "username": decoded.username },
                process.env.ACCESS_TOKEN_SECRET,
                { expiresIn: '15m' }
            );

            // SEND the token as a cookie!
            res.cookie('token', accessToken, { sameSite: 'None', secure: true, maxAge: expireTimeOfTokenCookieMillis }); // 10 second time limit. SAVE it in memory.
            res.json({ member: getUsernameCaseSensitive(foundMemberKey) })
            console.log(`Refreshed access token for member ${foundMemberKey}. --------`)

            // Update their last-seen variable
            updateLastSeen(foundMemberKey);
        }
    );
}

// ASSUMES they are not logged in
// If they have an existing browser id, it renews it for 7 more days.
// If they don't, it gives them a new browser id for 7 day.
function assignOrRenewBrowserID(req, res) {
    if (req.cookies['browser-id'] == null) giveBrowserID(res)
    else refreshBrowserID(req, res)
}

function giveBrowserID(res) {

    const id = generateID(12)

    //console.log(`Assigning new browser-id: ${id} --------`)

    const cookieName = 'browser-id'
    const age = expireOfBrowserIDCookieMillis; // 1 day

    // READABLE by the server with web socket connections, AND by javascript. MAX AGE IN MILLIS NOT SECS
    //res.cookie(cookieName, id, { sameSite: 'None', secure: true, maxAge: age }); // 60 second time limit. SAVE it in memory.
    // Readable by server with web socket connections, NOT by javascript: MAX AGE IN MILLIS NOT SECS
    res.cookie(cookieName, id, { httpOnly: true, sameSite: 'None', secure: true, maxAge: age }); // 60 second time limit. SAVE it in memory.
}

function refreshBrowserID(req, res) {

    const cookieName = 'browser-id'
    const id = req.cookies[cookieName]

    if (isBrowserIDBanned(id)) return makeBrowserIDPermanent(req, res, id)

    //console.log(`Renewing browser-id: ${id}`)

    const age = expireOfBrowserIDCookieMillis;

    // READABLE by the server with web socket connections, AND by javascript. MAX AGE IN MILLIS NOT SECS
    // res.cookie(cookieName, id, { sameSite: 'None', secure: true, maxAge: age }); // 60 second time limit. SAVE it in memory.
    // Readable by server with web socket connections, NOT by javascript: MAX AGE IN MILLIS NOT SECS
    res.cookie(cookieName, id, { httpOnly: true, sameSite: 'None', secure: true, maxAge: age }); // 60 second time limit. SAVE it in memory.
}

function makeBrowserIDPermanent(req, res, browserID) {

    const cookieName = 'browser-id'

    const age = Number.MAX_SAFE_INTEGER;

    // READABLE by the server with web socket connections, AND by javascript. MAX AGE IN MILLIS NOT SECS
    // res.cookie(cookieName, id, { sameSite: 'None', secure: true, maxAge: age }); // 60 second time limit. SAVE it in memory.
    // Readable by server with web socket connections, NOT by javascript: MAX AGE IN MILLIS NOT SECS
    res.cookie(cookieName, browserID, { httpOnly: true, sameSite: 'None', secure: true, maxAge: age }); // 60 second time limit. SAVE it in memory.

    const logThis = `Making banned browser-id PERMANENT: ${browserID} !!!!!!!!!!!!!!!!!!! ${req.headers.origin}   ${req.method}   ${req.url}   ${req.headers['user-agent']}`;
    logEvents(logThis, 'bannedIPLog.txt', { print: true });
}

module.exports = { handleRefreshToken }