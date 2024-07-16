
/*
 * This module handles create account form data,
 * verifying the data, creating the account,
 * and sending them a verification email.
 * 
 * It also answers requests for whether
 * a specific username or email is available.
 */

const bcrypt = require('bcrypt');

const { handleLogin } = require('./authController')
const { sendEmailConfirmation } = require('./sendMail')
const { addMember, getMemberData, doesMemberExist, isEmailAvailable } = require('./members.js')
const { logEvents } = require('../middleware/logEvents');
const { isEmailBanned } = require('../middleware/banned')

/**
 * Usernames that are reserved. New members cannot use these are their name.
 * 
 * However, the following have been used:
 * admin, amazon, google, tesla, epic, epicgames, usa, america
 */
const reservedUsernames = [
    'infinitechess',
    'support', 'infinitechesssupport',
    'admin', 'administrator',
    'amazon', 'amazonsupport', 'aws', 'awssupport',
    'apple', 'applesupport',
    'microsoft', 'microsoftsupport',
    'google', 'googlesupport',
    'adobe', 'adobesupport',
    'youtube', 'facebook', 'tiktok', 'twitter', 'x', 'instagram', 'snapchat',
    'tesla', 'elonmusk', 'meta',
    'walmart', 'costco',
    'valve', 'valvesupport',
    'github',
    'nvidia', 'amd', 'intel', 'msi', 'tsmc', 'gigabyte',
    'roblox',
    'minecraft',
    'fortnite',
    'teamfortress2',
    'amongus', 'innersloth', 'henrystickmin',
    'halflife', 'halflife2', 'gordonfreeman',
    'epic', 'epicgames', 'epicgamessupport',
    'taylorswift', 'kimkardashian', 'tomcruise', 'keanureeves', 'morganfreeman', 'willsmith',
    'office', 'office365',
    'usa', 'america',
    'donaldtrump', 'joebiden'
];
/** Any username cannot contain these words */
const profainWords = [
    'fuck',
    'fuk',
    'shit',
    'piss',
    // 'ass', // Can't enable because "pass" wouldn't be allowed.
    'penis',
    'bitch',
    'bastard',
    'cunt',
    'penis',
    'vagina',
    'boob',
    'nigger',
    'niger',
    'pussy',
    'buthole',
    'butthole',
    'ohmygod',
    'poop'
];

// Called when create account form submitted
const createNewMember = async (req, res) => {
    if (!req.body) {
        console.log(`User sent a bad create account request missing the whole body!`)
        return res.status(400).send('Bad Request'); // 400 Bad request
    }
    // First make sure we have all 3 variables.
    let { username, email, password } = req.body;
    if (!username || !email || !password) {
        console.error('We received request to create new member without all supplied username, email, and password!')
        return res.status(400).redirect('/400') // Bad request
    }

    // Make the email lowercase, so we don't run into problems with seeing if capitalized emails are taken!
    email = email.toLowerCase();
    const usernameLowercase = username.toLowerCase();

    // First we make checks on the username...
    // These 'return's are so that we don't send duplicate responses, AND so we don't create the member anyway.
    if (doUsernameFormatChecks(username, res) !== true) return;
    if (doEmailFormatChecks(email, res) !== true) return;
    if (doPasswordFormatChecks(password, res) !== true) return;

    await generateAccount({ username, email, password })

    // SEND EMAIL CONFIRMATION
    const memberData = getMemberData(usernameLowercase)
    sendEmailConfirmation(memberData);

    // GENERATE ACCESS AND REFRESH TOKENS! They just created an account, so log them in!
    // This will handle our response/redirect
    handleLogin(req, res);
}

/**
 * Generate an account only from the provided username, email, and password.
 * Regex tests are skipped.
 * @param {Object} param0 - The object containing account information.
 * @param {string} param0.username - The username for the new account.
 * @param {string} param0.email - The email for the new account.
 * @param {string} param0.password - The password for the new account.
 * @param {boolean} param0.autoVerify - Whether to auto-verify this account.
 */
async function generateAccount({ username, email, password, autoVerify }) {
    const usernameLowercase = username.toLowerCase();

    // Use bcrypt to hash & salt password
    const hashedPassword = await bcrypt.hash(password, 10); // Passes 10 salt rounds. (standard)
    const date = new Date();

    const newMember = {
        username,
        email,
        password: hashedPassword,
        refreshTokens: [],
        joined: date,
        logins: 0,
        seen: date,
        elo: 1200,
        // , bio: ''
    };
    if (!autoVerify) newMember.verified = [false, generateID(24)]
    
    // Without 'await' this returns a promise.
    const success = addMember(usernameLowercase, newMember)
    if (!success) return res.status(500).redirect('/500') // Server error (username already exists)
    
    const logTxt = `Created new member: ${newMember.username}`
    logEvents(logTxt, 'newMemberLog.txt', { print: true });
}

// This function returns info for creating an account.
// Requested by a fetch in script in createaccount page.
// In the future we can use our HTMLScriptInjector to insert it
// into the createaccount html instead.
function getRegisterData(req, res) {
    res.json({
        profainWords
    });
}

/**
 * Generates a random string of the specified length,
 * containing number 0-9 and letters a-z.
 * @param {number} length - The length of the desired random string
 * @returns {string} The random ID
 */
const generateID = function (length) {
    let result = '';
    const characters = '0123456789abcdefghijklmnopqrstuvwxyz';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.random() * charactersLength);
    }
    return result;
}

// Route
// Returns whether the email parameter is associated with an account. Called from inside the createaccount script.
// True = open. false = in-use
const checkEmailAssociated = (req, res) => {
    if (isEmailAvailable(req.params.email.toLowerCase())) res.json([true]);
    else res.json([false]);
}

/**
 * Route handler to check if a username is available to use (not taken, reserved, or baaaad word).
 * The request parameters MUST contain the username to test! (different from the body)
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} An object containing the properties `allowed` and `reason`.
 */
function checkUsernameAvailable(req, res) {
    const usernameLowercase = req.params.username.toLowerCase();

    let allowed = true;
    let reason = '';

    if (doesMemberExist(usernameLowercase)) { allowed = false; reason = 'That username is taken'; }
    if (checkProfanity(usernameLowercase)) { allowed = false; reason = 'That username contains a word that is not allowed'; }
    if (reservedUsernames.includes(usernameLowercase)) { allowed = false; reason = 'That username is taken'; } // Code for reserved (but the users don't know that!)

    return res.json({
        allowed,
        reason
    });
}

const doUsernameFormatChecks = function (username, res) {
    // First we check the username's length
    if (username.length < 3 || username.length > 20) return res.status(400).json({ 'message': 'Username must be between 3-20 characters'});
    // Then the format
    if (!onlyLettersAndNumbers(username)) return res.status(400).json({ 'message': 'Username must only contain letters A-Z and numbers 0-9'});
    // Then check if the name's taken
    const usernameLowercase = username.toLowerCase();

    // Make sure the username isn't taken!!

    if (doesMemberExist(usernameLowercase)) return res.status(409).json({ 'conflict': 'That username is taken'});
    
    // Then check if the name's reserved
    if (reservedUsernames.includes(usernameLowercase)) return res.status(409).json({ 'conflict': 'That username is taken'}); // Code for reserved (but the users don't know that!)
    // Lastly check for profain words
    if (checkProfanity(usernameLowercase)) return res.status(409).json({ 'conflict': 'That username contains a word that is not allowed'});
    return true; // Everything's good, no conflicts!
}

const onlyLettersAndNumbers = function (string) {
    if (!string) return true;
    return /^[a-zA-Z0-9]+$/.test(string);
}

// Returns true if bad word is found
const checkProfanity = function (string) {
    for (let i = 0; i < profainWords.length; i++) {
        profanity = profainWords[i];
        if (string.includes(profanity)) return true;
    }
    return false;
}

const doEmailFormatChecks = function (string, res) {
    if (string.length > 320) return res.status(400).json({ 'message': 'Your email is too looooooong.'}); // Max email length
    if (!isValidEmail(string)) return res.status(400).json({ 'message': 'This is not a valid email'});
    if(!isEmailAvailable(string.toLowerCase())) return res.status(409).json({ 'conflict': 'This email is already in use'});
    if (isEmailBanned(string)) {
        const errMessage = `Banned user with email ${string.toLowerCase()} tried to recreate their account!`;
        logEvents(errMessage, 'bannedIPLog.txt', { print: true })
        return res.status(409).json({ 'conflict': 'You are banned.'});
    }
    return true;
}

const isValidEmail = function (string) {
    // Credit for the regex: https://stackoverflow.com/a/201378
    const regex = /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;
    return regex.test(string);
}

const doPasswordFormatChecks = function (password, res) {
    // First we check password length
    if (password.length < 6 || password.length > 72) return res.status(400).json({ 'message': 'Password must be 6-72 characters long'});
    if (!isValidPassword(password)) return res.status(400).json({ 'message': 'Password is in an incorrect format'});
    if (password.toLowerCase() === 'password') return res.status(400).json({ 'message': "Password must not be 'password'"});
    return true;
}

const isValidPassword = function (string) {
    const regex = /^[a-zA-Z0-9!@#$%^&*\?]+$/;
    if (regex.test(string) === true) return true;
    return false;
}

module.exports = {
    createNewMember,
    getRegisterData,
    checkEmailAssociated,
    checkUsernameAvailable,
    generateID,
    generateAccount
};