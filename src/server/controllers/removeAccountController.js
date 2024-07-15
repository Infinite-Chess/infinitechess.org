/**
 * This module handles account deletion.
 */

const { removeMember, getAllUsernames, getVerified, getJoinDate, getHashedPassword, getUsernameCaseSensitive } = require('../controllers/members');
const { removeAllRoles } = require('../controllers/roles');
const { logEvents } = require('../middleware/logEvents');
const bcrypt = require('bcrypt');

// Automatic deletion of accounts...

/** The maximum time an account is allowed to remain unverified before the server will delete it from DataBase. */
const maxExistenceTimeForUnverifiedAccountMillis = 1000 * 60 * 60 * 24 * 3; // 3 days
/** The interval for how frequent to check for unverified account that exists more than `maxExistenceTimeForUnverifiedAccount` */
const intervalForRemovalOfOldUnverifiedAccountsMillis = 1000 * 60 * 60 * 24 * 1; // 1 days



/**
 * Route that removes a user account if they request to delete it.
 * @param {object} req - The request object.
 * @param {object} res - The response object.
 */
async function removeAccount(req, res) {
    const usernameLowercase = req.params.member.toLowerCase();
    const usernameCaseSensitive = getUsernameCaseSensitive(usernameLowercase); // False if the member doesn't exist

    // Check to make sure they're logged in
    if (req.user !== usernameLowercase) return res.status(403).json({'message' : 'Forbidden. This is not your account.'});

		// Check that the password is correct
		const hashedPassword = getHashedPassword(usernameLowercase);
		const match = await bcrypt.compare(req.body.password, hashedPassword);
		if (!match) {
        logEvents(`Incorrect password for user ${usernameCaseSensitive} attempting to remove account!`, "loginAttempts.txt", { print: true });
        return res.status(401).json({'message' : 'Incorrect password.'});
		}

    removeAllRoles(req.user); // Remove roles
    if (removeMember(req.user)) {
        logEvents(`User ${usernameLowercase} deleted their account.`, "deletedAccounts.txt", { print: true })
        return res.status(301).redirect('/createaccount');
    } else {
        logEvents(`User ${req.user} attempted to delete '${usernameLowercase}'s account!`, 'hackLog.txt', { print: true });
        return res.status(404).json({'message' : 'Failed to delete account. Account not found.'});
    }
}

/**
 * Remove a user account by username.
 * @param {string} usernameLowercase - The username of the account to remove, in lowercase.
 * @param {string} reason - The reason for account deletion.
 */
function removeAccountByUsername(usernameLowercase, reason) {
    removeAllRoles(usernameLowercase);
    if (removeMember(usernameLowercase)) {
        logEvents(`User ${usernameLowercase} was deleted for '${reason}'`, "deletedAccounts.txt", { print: true })
    } else {
        logEvents(`User ${usernameLowercase} was attempted to be removed for '${reason}' but failed`, 'hackLog.txt', { print: true });
    }
}

// Automatic deletion of old, unverified accounts...

/**
 * This function is run every {@link intervalForRemovalOfOldUnverifiedAccountsMillis}.
 * It checkes for old unverified account and removes them from the database
 */
function removeOldUnverifiedMembers() {
    const now = new Date();
    const millisecondsInADay = 1000 * 60 * 60 * 24;

    const allUserNames = getAllUsernames(); // An array of all usernames

    for (const username of allUserNames) {
        if(getVerified(username) !== false) continue;  // Are verified, or they don't exist
        // Are not verified...
        
        // Calculate the time since the user joined
        const timeJoined = getJoinDate(username); // A date object
        const timeSinceJoined = now - timeJoined; // Milliseconds (Date - Date = number)

        if(timeSinceJoined < maxExistenceTimeForUnverifiedAccountMillis) continue; // Account isn't old enough.

        // Delete account...
        removeAccountByUsername(username, `Unverified for more than ${maxExistenceTimeForUnverifiedAccountMillis / millisecondsInADay} days`)
    }
}

removeOldUnverifiedMembers(); // Call once on startup.
setInterval(removeOldUnverifiedMembers, intervalForRemovalOfOldUnverifiedAccountsMillis); // Repeatedly call once a day


module.exports = {
    removeAccount,
    removeAccountByUsername
};
