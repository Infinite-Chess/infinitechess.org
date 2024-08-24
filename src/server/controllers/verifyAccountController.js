
import { getTranslationForReq } from '../utility/translate.js';
import { logEvents } from '../middleware/logEvents.js';
import { getUsernameCaseSensitive, getVerified, setVerified, doesVerificationIDMatch } from './members.js';

// Called when clicked on verification link in email.
// CAN redirect!
const verifyAccount = async function(req, res) {
    // Get the parameters out of the url
    const usernameLowercase = req.params.member.toLowerCase();
    const ID = req.params.id;

    // First check if the member exists
    const username = getUsernameCaseSensitive(usernameLowercase);
    if (!username) {
        const hackTxt = `Invalid account verification link! User '${usernameLowercase}' DOESN'T EXIST. id '${ID}'`;
        logEvents(hackTxt, 'hackLog.txt', { print: true });
        res.status(400).redirect(`/400`); // Bad request
        return;
    }

    if (!req.user) {
        console.log(`Forwarding user '${username}' to login before they can verify!`);
        // Redirect them to the login page,
        // BUT add a query parameter with the original verification url they were visiting!
        const redirectTo = encodeURIComponent(req.originalUrl);
        return res.redirect(`/login?redirectTo=${redirectTo}`);
    }

    if (req.user !== usernameLowercase) { // Forbid them if they are logged in and NOT who they're wanting to verify!
        const errText = `User ${req.user} attempted to verify ${usernameLowercase}!`;
        logEvents(errText, 'hackLog.txt', { print: true });
        res.status(403).send(getTranslationForReq("server.javascript.ws-forbidden_wrong_account", req));
        return;
    }

    // Then check if the id parameter matches their id in the verify parameter of their profile!
    const verified = getVerified(usernameLowercase);
    if (verified === true || verified === 0) { // Bad request, member already verified
        console.log(`Member '${username}' is already verified!`);
        res.redirect(`/member/${usernameLowercase}`);
        return;
    }

    if (!doesVerificationIDMatch(usernameLowercase, ID)) {
        const hackTxt = `Invalid account verification link! User '${username}', id '${ID}' INCORRECT`;
        logEvents(hackTxt, 'hackLog.txt', { print: true });
        res.status(400).redirect(`/400`);
        return;
    }

    // VERIFY THEM..
    // The next time they view their profile, a confirmation should be displayed that their account has been verified!
    const success = setVerified(usernameLowercase, true);
    if (!success) return res.status(500).redirect(`/500`); // Server error, unable to update member's verified parameter.

    console.log(`Verified member ${username}'s account!`);
    res.redirect(`/member/${usernameLowercase}`);
};

export { verifyAccount };