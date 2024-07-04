const path = require('path');
const fs = require('fs');

const { writeFile } = require('../utility/lockFile.js');
const { logEvents } = require('../middleware/logEvents');
const { writeFile_ensureDirectory } = require('../utility/fileUtils.js');

const membersFilePath = path.resolve('./database/members.json');
(function ensureMembersFileExists() {
    if (fs.existsSync(membersFilePath)) return; // Already exists
    const content = JSON.stringify({});
    writeFile_ensureDirectory(membersFilePath, content)
    console.log("Generated members file")
})()
const members = require('../database/members.json');

/**
 * An object with refresh tokens for the keys, and for
 * the values- the member that token belongs to.
 * This can be used for quickly testing if a claimed
 * refresh token is valid.
 * Otherwise, we would have to search through every
 * single member for a match.
 * 
 * When users log out, we delete the token from this
 * list to invalidate it.
 */
const refreshTokenHash = (function constructRefreshTokenList() {
    const newRefreshTokenList = {};
    for (let key in members) {
        const member = members[key]
        for (let i = 0; i < member.refreshTokens.length; i++) {
            newRefreshTokenList[member.refreshTokens[i]] = key
        }
    }
    return newRefreshTokenList;
})();

/** The maximum number of login sessions a user can have at once. */
const sessionsCap = 3;

/**
 * Whether or not there has been a recent change to the members data.
 * It is periodically saved.
 */
let membersHasBeenEdited = false;
/** The interval of which to save the members data, if a change has been made. */
const intervalToSaveMembersMillis = 30000; // 30 seconds


/**
 * Tests if the user exists in our member data.
 * @param {string} username - Their username, in lowercase.
 * @returns {boolean} true if the member exists
 */
const doesMemberExist = (username) => {
    return members[username] != null;
}

/**
 * Returns the provided members case-sensitive username,
 * otherwise *undefined* if they don't exist.
 * @param {string} username - Their username, in lowercase.
 * @returns {string|undefined} Their case-sensitive username, if they exist, otherwise undefined.
 */
const getUsernameCaseSensitive = (username) => {
    return members[username]?.username;
}

/**
 * Returns the member's hashed password, if they exist, otherwise undefined.
 * @param {string} username - Their username, in lowercase.
 * @returns {string|undefined} Their hashed password, if they exist, otherwise undefined.
 */
function getHashedPassword(username) {
    return members[username]?.password;
}

const getEmail = (memberKey) => {
    return members[memberKey]?.email;
}

function getJoinDate(username) {
    return members[username]?.joined;
}

function getLastSeen(username) {
    return members[username]?.seen;
}

function getElo(username) {
    return members[username]?.elo;
}

/**
 * Returns a deep copy of the provided member's data.
 * @param {string} username - Their username in lowercase
 * @returns {Object} Their member data, deep copied.
 */
function getMemberData(username) {
    return structuredClone(members[username]);
}

/**
 * Searches {@link refreshTokenHash} for the provided refreshToken,
 * returning the member's username it belongs to if it is found.
 * @param {string} refreshToken - Their claimed refresh token
 * @returns {string|undefined} - The member's username that owns that refreshToken, or undefined if it's invalid.
 */
const findMemberFromRefreshToken = (refreshToken) => {
    return refreshTokenHash[refreshToken]
}

/**
 * Adds the provided member, including their data, to the members file,
 * then flags it to be saved.
 * ASSUMES that the member data has already been validated.
 * @param {string} username - The member's username, **in lowercase**.
 * @param {Object} newMember - An object containing the properties `username`, `email`, `password`, `refreshTokens`, `joined`, `logins`, `seen`, and `elo`.
 * @returns {boolean} true if the creation was a success (if false, it means they already exist).
 */
function addMember(username, newMember) {
    if (doesMemberExist(username)) {
        const errString = `Error creating new member. ${getUsernameCaseSensitive(username)} already exists!`
        logEvents(errString, 'errLog.txt', { print: true });
        return false;
    }
    members[username] = newMember;
    membersHasBeenEdited = true; // Flag it to be saved
    return true; // Success
}

/**
 * Increments the login count of the user, if found,
 * then flags the members file to be saved.
 * @param {string} username - Their username, in lowercase.
 * @returns {boolean} true if the member was found, and successfully incremented their login count.
 */
function incrementLoginCount(username) {
    if (!doesMemberExist(username)) {
        const errText = `Could not increment login count of non-existent member "${username}"!`
        logEvents(errText, 'errLog.txt', { print: true });
        return false;
    }
    members[username].logins++;
    membersHasBeenEdited = true; // Flag it to be saved
    return true; // Success
}

/**
 * Updates the last-seen property of the user, if found,
 * then flags the members file to be saved.
 * @param {string} username - Their username, in lowercase.
 * @returns {boolean} true if the member was found, and successfully updated their last-seen property.
 */
function updateLastSeen(username) {
    if (!doesMemberExist(username)) {
        const errText = `Could not update last-seen date of non-existent member "${username}"!`
        logEvents(errText, 'errLog.txt', { print: true });
        return false;
    }
    members[username].seen = new Date();
    membersHasBeenEdited = true; // Flag it to be saved
    return true; // Success
}

/**
 * Adds the provided refreshToken to the {@link refreshTokenHash},
 * and to the member's data, then flags the members file to be saved.
 * Call after generating a new refresh token for a user after logging in.
 * @param {string} username - Their username, in lowercase
 * @param {string} refreshToken - The refresh token to add
 * @returns {boolean} true if it was a success (if false, it means the member doesn't exist).
 */
function addRefreshToken(username, refreshToken) {
    if (!doesMemberExist(username)) {
        const errText = `Cannot add the refresh token to the hash for a non-existent member "${username}"!`;
        logEvents(errText, "errLog.txt", { print: true });
        return false;
    }
    // Update the hash
    refreshTokenHash[refreshToken] = username
    // Update the member data
    const refreshTokens = members[username].refreshTokens;
    refreshTokens.push(refreshToken);
    while (refreshTokens.length > sessionsCap) {
        const deletedToken = refreshTokens.shift();
        // Invalidate it from the hash
        delete refreshTokenHash[deletedToken]
    }

    membersHasBeenEdited = true; // Flag it to be saved
    return true; // Success
}

/**
 * Deletes the provided refreshToken from the {@link refreshTokenHash},
 * and deletes from the member's data, then flags the members file to be saved.
 * Call after a user manually logs out
 * @param {string} username - Their username, in lowercase
 * @param {string} refreshToken - The refresh token to add
 * @returns {boolean} true if it was a success (if false, it means the member doesn't exist).
 */
const deleteRefreshToken = async (username, token) => {
    if (!doesMemberExist(username)) {
        const errText = `Cannot delete the refresh token from non-existent member "${username}"!`;
        logEvents(errText, "errLog.txt", { print: true });
        return false;
    }
    // Delete from the hash
    delete refreshTokenHash[token]
    // Delete from the member data
    const thisMember = members[username];
    index = thisMember.refreshTokens.indexOf(token)
    thisMember.refreshTokens.splice(index, 1)

    membersHasBeenEdited = true; // Flag it to be saved
    return true; // Success
}

/**
 * Returns the `verified` property of the member.
 * @param {string} username - Their username, in lowercase
 * @returns {boolean|0} - The verified property, if it exists, otherwise 0 (already verified, or member doesn't exist).
 */
const getVerified = (username) => {
    if (!doesMemberExist(username)) {
        const errText = `Cannot get the verified property of non-existent member "${username}"!`;
        logEvents(errText, "errLog.txt", { print: true });
        return 0;
    }
    const verified = members[username].verified;
    if (verified) return verified[0]
    return 0;
}

/**
 * Tests if the provided account verification ID matches their data.
 * Called when a new user clicks verify account in their verification email.
 * @param {string} username - Their username, in lowercase
 * @param {string} verificationID - The verification ID from their verification link.
 * @returns {boolean} true if the provided verification ID matches their data.
 */
const doesVerificationIDMatch = (username, verificationID) => {
    if (!doesMemberExist(username)) {
        const errText = `Cannot verify verification ID of non-existent member "${username}"!`;
        logEvents(errText, "errLog.txt", { print: true });
        return false;
    }
    return members[username].verified[1] === verificationID;
}

/**
 * Sets the `verified` property of the member data.
 * @param {string} username - Their username, in lowercase
 * @param {true|0} value - The new value of the `verified` property, either true or 0, 0 meaning they are verified and we have told them they are.
 * @returns {boolean} true if it was a success
 */
const setVerified = (username, value) => {
    if (!doesMemberExist(username)) {
        const errText = `Cannot set verification property of non-existent member "${username}"!`;
        logEvents(errText, "errLog.txt", { print: true });
        return false;
    }
    if (value !== true && value !== 0) {
        const errText = `Cannot set member ${getUsernameCaseSensitive(username)}'s verified parameter to any value besides true or 0! Received value: ${value}`
        logEvents(errText, "errLog.txt", { print: true });
        return false;
    }
    members[username].verified[0] = value;
    if (value === 0) delete members[username].verified; // Already verified (and they have seen that fact)
    membersHasBeenEdited = true; // Flag it to be saved
    return true; // Success
}

/**
 * Returns the member's username, email, and verified properties.
 * Called by our member controller when preparing to send a verification email.
 * @param {string} username - Their username, in lowercase. 
 * @returns {Object|undefined} An object containing their `username`, `email`, and `verified` properties, deep copied, or undefined if the member doesn't exist.
 */
function getInfo(username) {
    if (!doesMemberExist(username)) return;
    return {
        username: members[username].username,
        email: members[username].email,
        verified: structuredClone(members[username].verified)
    }
}

async function save() {
    console.log("Saving members file..");
    return await writeFile(
        path.join(__dirname, '..', 'database', 'members.json'),
        members,
        "Failed to lock/write members.json after periodically saving! Members should still be accurate in RAM, but not database."
    )
}

setInterval(saveMembersIfChangesMade, intervalToSaveMembersMillis)

async function saveMembersIfChangesMade() {
    if (!membersHasBeenEdited) return; // No change made, don't save the file!
    if (await save()) membersHasBeenEdited = false;
}

function constructEmailHash() { // Constructs an object with each used email as the key.
    const newEmailList = {};
    for (let key in members) {
        newEmailList[members[key].email] = true;
    }
    return newEmailList;
}



module.exports = {
    doesMemberExist,
    getUsernameCaseSensitive,
    getHashedPassword,
    getMemberData,
    findMemberFromRefreshToken,
    getVerified,
    doesVerificationIDMatch,
    addMember,
    addRefreshToken,
    deleteRefreshToken,
    setVerified,
    getInfo,
    getEmail,
    incrementLoginCount,
    updateLastSeen,
    saveMembersIfChangesMade,
    constructEmailHash,
    getJoinDate,
    getLastSeen,
    getElo
}