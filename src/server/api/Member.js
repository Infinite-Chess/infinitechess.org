
// Route
// Fetched by member script.
// Sends the client the information about the member they are currently profile viewing.

import locale from 'date-fns/locale/index.js';
import { format, formatDistance } from 'date-fns';

import { getMemberDataByCriteria, updateMemberColumns } from "../database/controllers/memberController.js";
import { getTranslationForReq } from "../utility/translate.js";
import { logEvents } from '../middleware/logEvents';

// SHOULD ONLY ever return a JSON.
const getMemberData = async(req, res) => { // route: /member/:member/data

	// What member are we getting data from?
	const claimedUsername = req.params.member;

	// eslint-disable-next-line prefer-const
	let { user_id, username, email, joined, verification, last_seen } = getMemberDataByCriteria(['user_id','username','email','joined','last_seen'], 'username', claimedUsername);
	if (user_id === undefined) return res.status(404).json({ message: getTranslationForReq("server.javascript.ws-member_not_found", req) }); // Remember not found

	// What data are we going to send?
	// Case-sensitive username, elo rating, joined date, last seen...


	// Load their data
	const joinedPhrase = format(new Date(joined), 'PP');
	let localeStr = req.i18n.resolvedLanguage.replace('-','');
	if (!(localeStr in locale)) localeStr = req.i18n.resolvedLanguage.split('-')[0];
	const seenPhrase = formatDistance(new Date(), new Date(last_seen), { locale: locale[localeStr] });
	const sendData = {
		user_id,
		username,
		joined: joinedPhrase,
		seen: seenPhrase,
	};

	// If they are the same person as who their requesting data, also include these.
	if (req.memberInfo === undefined) {
		logEvents("req.memberInfo must be defined when requesting member data from API!", 'errLog.txt', { print: true });
		res.status(500).send('Internal Server Error');
	}
	if (req.memberInfo.signedIn && req.memberInfo.username.toLowerCase() === claimedUsername.toLowerCase()) {

		// They have now seen the message that their account has been verified. Mark there verification notified as true.
		if (verification !== null && verification.verified && !verification.notified) {
			console.log(`Thanking member ${claimedUsername} for verifying their account!`);
			// verification.notified = true;
			verification = null; // Just delete the verification from their member information in the database, it's no longer needed.
			updateMemberColumns(user_id, { verification });
		} else if (verification !== null && !verification.verified) console.log(`Requesting member ${claimedUsername} to verify their account!`);

		sendData.email = email; // This is their account, include their email with the response
	}

	// Return data
	res.json(sendData);
};

export {
	getMemberData,
};