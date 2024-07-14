/**
 * This module handles account deletion.
 */

const { removeMember } = require('../controllers/members')
const { removeAllRoles } = require('../controllers/roles');
const { logEvents } = require('../middleware/logEvents');

const removeAccount = async (req, res) => {
    const usernameLowercase = req.params.member.toLowerCase();

    // Check to make sure they're logged in
    if (req.user !== usernameLowercase) return res.status(403).json({'message' : 'Forbidden. This is not your account.'});

    removeAllRoles(req.user); // Remove roles
    if (removeMember(req.user)) {
        logEvents(`User ${usernameLowercase} deleted their account.`, "deletedAccounts.txt", { print: true})
        return res.status(301).redirect('/createaccount');
    } else {
        logEvents(`User ${req.user} attempted to delete '${usernameLowercase}'s account!`, 'hackLog.txt', { print: true });
        return res.status(404).json({'message' : 'Failed to delete account. Account not found.'});
    }
}

module.exports = {
    removeAccount
};