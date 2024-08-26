
/**
 * The module serves member data when requested,
 * commonly requested when visiting a user profile.
 * 
 * And we resend requests account verification emails.
 */

import locale from 'date-fns/locale/index.js';
import { format, formatDistance } from 'date-fns';
import { getVerified, setVerified, getInfo, getUsernameCaseSensitive, getJoinDate, getLastSeen, getElo, getEmail } from './members.js';
import { sendEmailConfirmation } from './sendMail.js';
import { logEvents } from '../middleware/logEvents.js';
import { getTranslationForReq } from '../utility/translate.js';

// Route
// Fetched by member script.
// Sends the client the information about the member they are currently profile viewing.
// SHOULD ONLY ever return a JSON.
const getMemberData = async(req, res) => {

    // What member are we getting data from?
    const usernameLowercase = req.params.member.toLowerCase();

    // What data are we going to send?
    // Case-sensitive username, elo rating, joined date, last seen...

    // Load their case sensitive username
    const username = getUsernameCaseSensitive(usernameLowercase);
    if (!username) return res.status(404).json({ message: getTranslationForReq("server.javascript.ws-member_not_found", req) });

    // Load their data
    const joinDate = getJoinDate(usernameLowercase);
    const joined = format(new Date(joinDate), 'PP');
    const lastSeen = getLastSeen(usernameLowercase);
    let localeStr = req.i18n.resolvedLanguage.replace('-','');
    if (!(localeStr in locale)) localeStr = req.i18n.resolvedLanguage.split('-')[0];
    const seen = formatDistance(new Date(), new Date(lastSeen), { locale: locale[localeStr] });
    const sendData = {
        username,
        elo: getElo(usernameLowercase),
        joined,
        seen
    };

    // If they are the same person as who their requesting data, also include these.
    if (req.user === usernameLowercase) {
        const verified = getVerified(usernameLowercase); // true, false, or 0 if doesn't exist (already verified)
        if (verified !== 0) sendData.verified = verified;
        // If they just verified, we want to delete the verified parameter from their name!
        // because we just sent the confirmation success message.
        if (verified === true) {
            setVerified(usernameLowercase, 0);
            console.log(`Thanking member ${usernameLowercase} for verifying their account!`);
        } else if (verified === false) console.log(`Requesting member ${usernameLowercase} to verify their account!`);

        sendData.email = getEmail(usernameLowercase);
    }

    // Return data
    res.json(sendData);
};

// Resend confirmation email. Called by script in member page
const requestConfirmEmail = (req, res) => {
    const usernameLowercase = req.params.member.toLowerCase();

    // Check to make sure they're logged in, then resend the email!
    if (req.user === usernameLowercase) {

        const memberInfo = getInfo(usernameLowercase);

        // ONLY send email if they haven't already verified!
        if (!memberInfo.verified || memberInfo.verified[0] === true) {
            const hackText = `User "${usernameLowercase}" tried requesting another verification email after they've already verified!`;
            logEvents(hackText, 'hackLog.txt', { print: true });
            return res.status(401).json({sent: false});
        }

        // SEND EMAIL CONFIRMATION
        sendEmailConfirmation(memberInfo);

        return res.json({sent: true});
    } else {
        const errText = `User ${req.user} attempted to send verification email for user ${usernameLowercase}!`;
        logEvents(errText, 'hackLog.txt', { print: true });
        return res.status(401).json({sent: false});
    }
};

export {
    getMemberData,
    requestConfirmEmail
};