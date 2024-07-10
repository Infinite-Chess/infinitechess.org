
/**
 * This controller is used when a client submits login form data.
 * This generates an access token, and a refresh cookie for them,
 * and updates basic variables in their profile after logging in.
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { getUsernameCaseSensitive, getHashedPassword, addRefreshToken, incrementLoginCount, updateLastSeen } = require('./members');
const { getClientIP } = require('../middleware/IP');

const accessTokenExpiryMillis = 1000 * 60 * 15; // 15 minutes
const refreshTokenExpiryMillis = 1000 * 60 * 60 * 24 * 5; // 5 days
const accessTokenExpirySecs = accessTokenExpiryMillis / 1000;
const refreshTokenExpirySecs = refreshTokenExpiryMillis / 1000;

let ipTimeoutMap = {};

/**
 * Called when the login page submits login form data.
 * Tests their username and password. If correct, it logs
 * them in, generates tokens for them, and updates their member variables.
 * THIS SHOULD ALWAYS send a json response, because the errors we send are displayed on the page.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 */
async function handleLogin(req, res) {
    if (!verifyBodyHasLoginFormData(req)) return; // If false, it will have already sent a response.

    const clientIP = getClientIP(req);
    if (!(clientIP in ipTimeoutMap)) {
        ipTimeoutMap[clientIP] = { attempts: 1, timeout: 0 };
    }

    if (ipTimeoutMap[clientIP].attempts > 3) {
        return res.status(401).json({ 'message': 'You are timed out, Please try again later.'});
    }

    let { username, password } = req.body;
    const usernameLowercase = username.toLowerCase();
    const usernameCaseSensitive = getUsernameCaseSensitive(usernameLowercase); // False if the member doesn't exist
    const hashedPassword = getHashedPassword(usernameLowercase);

    if (!usernameCaseSensitive || !hashedPassword) return res.status(401).json({ 'message': 'Username or password is incorrect'}); // Unauthorized, username not found

    // Test the password
    const match = await bcrypt.compare(password, hashedPassword);
    if (!match) {
        ipTimeoutMap[clientIP].attempts += 1
        if(ipTimeoutMap[clientIP].attempts === 3) {
            ipTimeoutMap[clientIP].timeout += 5
            setTimeout(() => {
                ipTimeoutMap[clientIP].attempts = 1; 
            }, ipTimeoutMap[clientIP].timeout * 1000)
        }

        console.log(`Incorrect password for user ${usernameCaseSensitive}!`)
        res.status(401).json({ 'message': 'Username or password is incorrect'}); // Unauthorized, password not found
        return;
    }
 
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

    console.log("Logged in member " + usernameCaseSensitive);
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

    const { username, password } = req.body;
    
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

module.exports = { handleLogin };