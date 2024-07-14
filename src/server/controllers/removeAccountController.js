/**
 * This module handles account deletion.
 */

const { removeMember } = require('../controllers/members')
const { removeAllRoles } = require('../controllers/roles');
const { logEvents } = require('../middleware/logEvents');
const { members } = require('../controllers/members');

const removeAccount = async (req, res) => {
    const usernameLowercase = req.params.member.toLowerCase();

    // Check to make sure they're logged in
    if (req.user !== usernameLowercase) return res.status(403).json({'message' : 'Forbidden. This is not your account.'});

    removeAllRoles(req.user); // Remove roles
    if (removeMember(req.user)) {
        logEvents(`User ${usernameLowercase} deleted their account.`, "deletedAccounts.txt", { print: true })
        return res.status(301).redirect('/createaccount');
    } else {
        logEvents(`User ${req.user} attempted to delete '${usernameLowercase}'s account!`, 'hackLog.txt', { print: true });
        return res.status(404).json({'message' : 'Failed to delete account. Account not found.'});
    }
}

const removeAccountByUsername = async (usernameLowercase, reason) => {
    removeAllRoles(usernameLowercase);
    if (removeMember(usernameLowercase)) {
        logEvents(`User ${usernameLowercase} was deleted for '${reason}'`, "deletedAccounts.txt", { print: true })
    } else {
        logEvents(`User ${usernameLowercase} was attempted to be removed for '${reason}' but failed`, 'hackLog.txt', { print: true });
    }
}

/**
 * The maximum time an account is allowed to remain unverified before the server will delete it from DataBase.
 */
const maxExistenceTimeForUnverifiedAccount = 3 * 24 * 60 * 60 * 1000; // 3 days
/**
 * The interval for how frequent to check for unverified account that exists more than `maxExistenceTimeForUnverifiedAccount`
 */
const intervalForRemovalOfOldUnverifiedAccounts = 1 * 24 * 60 * 60 * 1000; // 1 days

/**
 * This function is run every `intervalForRemovalOfOldUnverifiedAccounts`ms.
 * It checkes for old unverified account and removes them from the DataBase
 */
function removeOldUnverifiedMembers() {    
    const now = new Date();

    for (username in members) {
        if(members[username].verified[0] == undefined) continue;
        
        if((now - new Date(members[username].joined)) > maxExistenceTimeForUnverifiedAccount && !members[username].verified[0]) {
            removeAccountByUsername(username, `Unverified for more than ${maxExistenceTimeForUnverifiedAccount / (24 * 60 * 60 * 1000)} days`)
        }
    }
}

setInterval(removeOldUnverifiedMembers, intervalForRemovalOfOldUnverifiedAccounts);

module.exports = {
    removeAccount,
    removeAccountByUsername
};