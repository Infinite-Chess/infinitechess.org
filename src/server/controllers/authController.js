
/**
 * This controller is used when a client submits login form data.
 * This generates an access token, and a refresh cookie for them,
 * and updates basic variables in their profile after logging in.
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { getUsernameCaseSensitive, getHashedPassword, addRefreshToken, incrementLoginCount, updateLastSeen } = require('./members');
const { getClientIP } = require('../middleware/IP');
const { logEvents } = require('../middleware/logEvents');

const accessTokenExpiryMillis = 1000 * 60 * 15; // 15 minutes
const refreshTokenExpiryMillis = 1000 * 60 * 60 * 24 * 5; // 5 days
const accessTokenExpirySecs = accessTokenExpiryMillis / 1000;
const refreshTokenExpirySecs = refreshTokenExpiryMillis / 1000;

// Rate limiting stuff...

/** Maximum consecutive login attempts allowed for each username-IP
 * combination before they will be locked out temporarily. */
const maxLoginAttempts = 3;
/** The amount of time the cooldown is incremented by, after failing by {@link maxLoginAttempts} *again*... */
const loginCooldownIncrementorSecs = 5;
/**
 * A hash that stores login attempts for each ip and user.
 * `{
 *  "username_IP": {
*      attempts: 0,
*      cooldownTimeSecs: 0,
*      lastAttemptTime: 0,
       deleteTimeoutID,
 *  }
 * }`
 */
const loginAttemptData = {};
/** The time, in milliseconds, to delete a browser agent from the
 * login attempt data, if they have stopped trying to login. */
const timeToDeleteBrowserAgentAfterNoAttemptsMillis = 1000 * 60 * 5; // 5 minutes

/**
 * Called when the login page submits login form data.
 * Tests their username and password. If correct, it logs
 * them in, generates tokens for them, and updates their member variables.
 * THIS SHOULD ALWAYS send a json response, because the errors we send are displayed on the page.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 */
async function handleLogin(req, res) {
    if (!(await testPasswordForRequest(req, res, true))) return; // Incorrect password, it will have already sent a response.
    // Correct password...

    let username = req.body.username; // We already know this property is present on the request
    const usernameLowercase = username.toLowerCase();
    const usernameCaseSensitive = getUsernameCaseSensitive(usernameLowercase); // False if the member doesn't exist

    // The payload can be an object with their username and their roles.
    const payload = { "username": usernameLowercase };
    const { accessToken, refreshToken } = signTokens(payload);
    
    // Save the refresh token with current user so later when they log out we can invalidate it.
    addRefreshToken(usernameLowercase, refreshToken);
    
    createRefreshTokenCookie(res, refreshToken)
    
    // Update our member's statistics in their data file!
    updateMembersInfo(usernameLowercase);
    
    // Finally, send the access token! On front-end, don't store it anywhere except memory.
    res.json({ accessToken });

    logEvents(`Logged in member ${usernameCaseSensitive}`, "loginAttempts.txt", { print: true });
}

/**
 * Called when any fetch request submits login form data.
 * The req body needs to have the `username` and `password` properties.
 * If the req body does not have `username`, req.params must have the `member` property.
 * If the password is correct, this returns true.
 * Otherwise this sends a response to the client saying it was incorrect.
 * This is also rate limited.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {boolean} log - `true` to log
 * @returns {boolean} true if the password was correct
 */
async function testPasswordForRequest(req, res, log) {
    if (!verifyBodyHasLoginFormData(req)) return false; // If false, it will have already sent a response.
    
    let { username, password } = req.body;
    if (!username) username = req.params.member;
    const usernameLowercase = username.toLowerCase();
    const usernameCaseSensitive = getUsernameCaseSensitive(usernameLowercase); // False if the member doesn't exist
    const hashedPassword = getHashedPassword(usernameLowercase);

    if (!usernameCaseSensitive || !hashedPassword) {
        res.status(401).json({ 'message': 'Username is invalid'}); // Unauthorized, username not found
        return false;
    }
    
    const browserAgent = getBrowserAgent(req, usernameLowercase);
    if (!rateLimitLogin(res, browserAgent)) {
        return false; // They are being rate limited from enterring incorrectly too many times
    }

    // Test the password
    const match = await bcrypt.compare(password, hashedPassword);
    if (!match) {
        if (log) logEvents(`Incorrect password for user ${usernameCaseSensitive}!`, "loginAttempts.txt", { print: true });
        res.status(401).json({ 'message': 'Password is incorrect'}); // Unauthorized, password not found
        if (autoRespond) onIncorrectPassword(browserAgent, usernameCaseSensitive);
        return false;
    }

    onCorrectPassword(browserAgent);

    return true;
}

/**
 * Tests if the request body has valid `username` and `password` properties.
 * If not, this auto-sends a response to the client with an error.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @returns {boolean} true if the body is valid
 */
function verifyBodyHasLoginFormData(req, res) {
    if (!req.body) { // Missing body
        console.log(`User sent a bad login request missing the body!`)
        res.status(400).send('Bad Request'); // 400 Bad request
        return false;
    }

    let { username, password } = req.body;
	if (!username) username = req.params.member;
    
    if (!username || !password) {
        console.log(`User ${username} sent a bad login request missing either username or password!`)
        res.status(400).json({ 'message': 'Username and password are required.'}); // 400 Bad request
        return false;
    }

    if (typeof username !== "string" || typeof password !== "string") {
        console.log(`User ${username} sent a bad login request with either username or password not a string!`)
        res.status(400).json({ 'message': 'Username and password must be a string.'}); // 400 Bad request
        return false;
    }

    return true;
}

/**
 * Signs and generates access and refresh tokens for the user.
 * These are forms of user identification issued after logging in.
 * 
 * ACCESS TOKEN: A browser should NOT store it in local storage or cookie, only memory. Expiry 5-15m.
 * 
 * REFRESH TOKEN: Issued in httpOnly cookie--not accesible wth JS. Expires in hours or days.
 * @param {Object} payload - The payload for the tokens, typically an object containing the username and roles.
 * @returns {Object} - An object containing the properties `accessToken` and `refreshToken`.
 */
function signTokens(payload) {
    const accessToken = jwt.sign(
        payload, // Username is the payload, should NOT be password
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: accessTokenExpirySecs } // Good for as long as u stay on 1 page (stored in memory of script)
    );
    const refreshToken = jwt.sign(
        payload, // Payload can contain roles
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: refreshTokenExpirySecs }
    );

    return { accessToken, refreshToken }
}

/**
 * Creates and sets an HTTP-only cookie containing the refresh token.
 * @param {Object} res - The response object.
 * @param {string} refreshToken - The refresh token to be stored in the cookie.
 */
function createRefreshTokenCookie(res, refreshToken) {
    // Cross-site usage requires we set sameSite to none! Also requires secure (https) true
    res.cookie('jwt', refreshToken, { httpOnly: true, sameSite: 'None', secure: true, maxAge: refreshTokenExpiryMillis });
}

/**
 * Updates the member's common info after logging in.
 * @param {string} usernameLowercase - Their username, in lowercase
 */
function updateMembersInfo(usernameLowercase) {
    incrementLoginCount(usernameLowercase);
    updateLastSeen(usernameLowercase);
}

// Rate limiting stuff...

/**
 * Prevents a user-IP combination from entering login attempts too fast.
 * @returns {boolean} true if the attempt is allowed
 */
function rateLimitLogin(res, browserAgent) {
    const now = new Date();
    loginAttemptData[browserAgent] = loginAttemptData[browserAgent] || {
        attempts: 0,
        cooldownTimeSecs: 0,
        lastAttemptTime: now
    }
    
    const timeSinceLastAttemptsSecs = (now - loginAttemptData[browserAgent].lastAttemptTime) / 1000;

    if (loginAttemptData[browserAgent].attempts < maxLoginAttempts) {
        incrementBrowserAgentLoginAttemptCounter(browserAgent, now);
        return true; // Attempt allowed
    }

    // Too many attempts!

    if (timeSinceLastAttemptsSecs <= loginAttemptData[browserAgent].cooldownTimeSecs) { // Still on cooldown
        res.status(401).json({ 'message': `Failed to login, try again in ${Math.floor(loginAttemptData[browserAgent].cooldownTimeSecs - timeSinceLastAttemptsSecs)} seconds.`});
        // Reset the timer to auto-delete them from the login attempt data
        // if they haven't tried in a while.
        // This is so it doesn't get cluttered over time
        // as more and more people try to login and fail.
        resetTimerToDeleteBrowserAgent(browserAgent);
        return false; // Attempt not allowed
    }

    // No longer on cooldown
    resetBrowserAgentLoginAttemptCounter(browserAgent);
    incrementBrowserAgentLoginAttemptCounter(browserAgent, now);
    return true; // Attempt allowed
}

/**
 * Generates a unique browser agent string using the request object and username.
 * @param {Object} req - The request object.
 * @param {string} usernameLowercase - The lowercase username.
 * @returns {string} - The browser agent string, `${usernameLowercase}${clientIP}`
 */
function getBrowserAgent(req, usernameLowercase) {
    const clientIP = getClientIP(req);
    return `${usernameLowercase}${clientIP}`;
}

/**
 * Increments the login attempt counter in the login attempt data for a browser agent.
 * @param {string} browserAgent - The browser agent string.
 * @param {Date} now - The current date and time.
 */
function incrementBrowserAgentLoginAttemptCounter(browserAgent, now) {
    loginAttemptData[browserAgent].attempts += 1;
    loginAttemptData[browserAgent].lastAttemptTime = now;
    // Reset the timer to auto-delete them from the login attempt data
    // if they haven't tried in a while.
    // This is so it doesn't get cluttered over time
    // as more and more people try to login and fail.
    resetTimerToDeleteBrowserAgent(browserAgent);
}

/**
 * Resets the login attempt counter in the login attempt data for a browser agent.
 * @param {string} browserAgent - The browser agent string.
 */
function resetBrowserAgentLoginAttemptCounter(browserAgent) {
    loginAttemptData[browserAgent].attempts = 0;
}

/**
 * Resets the timer to delete a browser agent from the login attempt data.
 * @param {string} browserAgent - The browser agent string.
 */
function resetTimerToDeleteBrowserAgent(browserAgent) {
    cancelTimerToDeleteBrowserAgent(browserAgent);
    startTimerToDeleteBrowserAgent(browserAgent);
}

/**
 * Cancels the timer to delete a browser agent from the login attempt data.
 * @param {string} browserAgent - The browser agent string.
 */
function cancelTimerToDeleteBrowserAgent(browserAgent) {
    clearTimeout(loginAttemptData[browserAgent].deleteTimeoutID);
    delete loginAttemptData[browserAgent].deleteTimeoutID;
}

/**
 * Starts the timer that will delete a browser agent from the login attempt data
 * after they have given up on trying passwords.
 * @param {string} browserAgent - The browser agent string.
 */
function startTimerToDeleteBrowserAgent(browserAgent) {
    loginAttemptData[browserAgent].deleteTimeoutID = setTimeout(() => {
        delete loginAttemptData[browserAgent];
        console.log(`Allowing browser agent "${browserAgent}" to login without cooldown again!`)
    }, timeToDeleteBrowserAgentAfterNoAttemptsMillis)
}

/**
 * Handles the rate limiting scenario when an incorrect password is entered.
 * Temporarily locks them out if they've entered too many incorrect passwords.
 * @param {string} browserAgent - The browser agent string.
 * @param {string} usernameCaseSensitive - The case-sensitive username.
 */
function onIncorrectPassword(browserAgent, usernameCaseSensitive) {
    if(loginAttemptData[browserAgent].attempts < maxLoginAttempts) return; // Don't lock them yet
    // Lock them!
    loginAttemptData[browserAgent].cooldownTimeSecs += loginCooldownIncrementorSecs;
    logEvents(`${usernameCaseSensitive} got login locked for ${loginAttemptData[browserAgent].cooldownTimeSecs} seconds`, "loginAttempts.txt", { print: true });
}

/**
 * Handles the rate limiting scenario when a correct password is entered.
 * Deletes their browser agent from the login attempt data.
 * @param {string} browserAgent - The browser agent string.
 */
function onCorrectPassword(browserAgent) {
    cancelTimerToDeleteBrowserAgent(browserAgent)
    // Delete now
    delete loginAttemptData[browserAgent];
}

module.exports = {
    handleLogin,
    testPasswordForRequest
};
