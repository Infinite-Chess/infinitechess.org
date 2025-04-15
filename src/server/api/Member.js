
// Route
// Fetched by member script.
// Sends the client the information about the member they are currently profile viewing.

import locale from 'date-fns/locale/index.js';
import { format, formatDistance } from 'date-fns';

import { getMemberDataByCriteria, updateMemberColumns } from "../database/memberManager.js";
import { getPlayerLeaderboardRating, Leaderboards } from '../database/leaderboardsManager.js';
import { getTranslationForReq } from "../utility/translate.js";
import { logEvents } from '../middleware/logEvents.js';
import timeutil from '../../client/scripts/esm/util/timeutil.js';

// SHOULD ONLY ever return a JSON.
const getMemberData = async(req, res) => { // route: /member/:member/data

	// What member are we getting data from?
	const claimedUsername = req.params.member;

	// eslint-disable-next-line prefer-const
	let { user_id, username, email, joined, verification, last_seen, checkmates_beaten } = getMemberDataByCriteria(['user_id', 'username', 'email', 'joined', 'verification', 'last_seen', 'checkmates_beaten'], 'username', claimedUsername, { skipErrorLogging: true });
	if (user_id === undefined) return res.status(404).json({ message: getTranslationForReq("server.javascript.ws-member_not_found", req) }); // Member not found
	verification = JSON.parse(verification);

	// Get the player's rating values
	const rating_values = getPlayerLeaderboardRating(user_id, Leaderboards.INFINITY); // { user_id, elo, rating_deviation, last_rated_game_date } | undefined
	if (!rating_values) {
		logEvents(`Error getting rating values for member "${claimedUsername}" on INFINITY leaderboard. Not found.`, 'errLog.txt', { print: true });
		return res.status(500).send('Internal Server Error');
	}
	const ranked_elo = rating_values.elo;


	// What data are we going to send?
	// Case-sensitive username, elo rating, joined date, last seen...


	// Load their data
	const joinedPhrase = format(new Date(joined), 'PP');
	let localeStr = req.i18n.resolvedLanguage.replace('-', '');
	if (!(localeStr in locale)) localeStr = req.i18n.resolvedLanguage.split('-')[0];
	const lastSeenDate = new Date(timeutil.sqliteToISO(last_seen));
	const seenPhrase = formatDistance(new Date(), lastSeenDate, { locale: locale[localeStr] });
	const sendData = {
		user_id,
		username,
		joined: joinedPhrase,
		seen: seenPhrase,
		checkmates_beaten,
		ranked_elo,
	};

	// If they are the same person as who their requesting data, also include these.
	if (req.memberInfo === undefined) {
		logEvents("req.memberInfo must be defined when requesting member data from API!", 'errLog.txt', { print: true });
		res.status(500).send('Internal Server Error');
	}
	if (req.memberInfo.signedIn && req.memberInfo.username.toLowerCase() === claimedUsername.toLowerCase()) { // Their page
		
		sendData.email = email; // This is their account, include their email with the response

		if (verification !== null) {
			sendData.verified = verification.verified;

			// They have now seen the message that their account has been verified. Mark there verification notified as true.
			if (verification.verified && !verification.notified) {
				console.log(`Thanking member ${claimedUsername} for verifying their account!`);
				// verification.notified = true;
				verification = null; // Just delete the verification from their member information in the database, it's no longer needed.
				updateMemberColumns(user_id, { verification });
			} else if (!verification.verified) console.log(`Requesting member ${claimedUsername} to verify their account!`);
		}
	}

	// Return data
	res.json(sendData);
};

export {
	getMemberData,
};