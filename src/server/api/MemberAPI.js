
// src/server/api/MemberAPI.js

// Route
// Fetched by member script.
// Sends the client the information about the member they are currently profile viewing.

import locale from 'date-fns/locale/index.js';
import { format, formatDistance } from 'date-fns';

import { getMemberDataByCriteria, updateMemberColumns } from "../database/memberManager.js";
import { Leaderboards } from '../../shared/chess/variants/validleaderboard.js';
import { getPlayerLeaderboardRating, getEloOfPlayerInLeaderboard, getPlayerRankInLeaderboard } from '../database/leaderboardsManager.js';
import { getTranslationForReq } from "../utility/translate.js";
import { logEventsAndPrint } from '../middleware/logEvents.js';
import timeutil from '../../shared/util/timeutil.js';
import metadata from '../../shared/chess/util/metadata.js';

/**
 * API route: /member/:member/data
 * This is fetched from the profile page,
 * and serves info about the requested member.
 * 
 * SHOULD ONLY ever return a JSON.
 */
const getMemberData = async(req, res) => {
	// What member are we getting data from?
	const claimedUsername = req.params.member;

	const {
		user_id, username, email, joined, last_seen, checkmates_beaten,
		is_verified, is_verification_notified
	} = getMemberDataByCriteria(
		[
			'user_id', 'username', 'email', 'joined', 'is_verified',
			'is_verification_notified', 'last_seen', 'checkmates_beaten',
		],
		'username',
		claimedUsername,
		{ skipErrorLogging: true }
	);

	if (user_id === undefined) return res.status(404).json({ message: 'Member not found' });


	// Get the player's display elo string from the INFINITY leaderboard
	const ranked_elo = getEloOfPlayerInLeaderboard(user_id, Leaderboards.INFINITY); // { value: number, confident: boolean }
	
	// Get the player's position from the INFINITY leaderboard
	const infinity_leaderboard_position = getPlayerRankInLeaderboard(user_id, Leaderboards.INFINITY);
	
	// Get the player's RD from the INFINITY leaderboard
	let infinity_leaderboard_rating_deviation = getPlayerLeaderboardRating(user_id, Leaderboards.INFINITY)?.rating_deviation;
	if (infinity_leaderboard_rating_deviation !== undefined) infinity_leaderboard_rating_deviation = Math.round(infinity_leaderboard_rating_deviation);

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
		ranked_elo: metadata.getWhiteBlackElo(ranked_elo),
		infinity_leaderboard_position,
		infinity_leaderboard_rating_deviation,
	};

	// If they are the same person as who their requesting data, also include these.
	if (req.memberInfo === undefined) {
		logEventsAndPrint("req.memberInfo must be defined when requesting member data from API!", 'errLog.txt');
		return res.status(500).send('Internal Server Error');
	}
	if (req.memberInfo.signedIn && req.memberInfo.username.toLowerCase() === claimedUsername.toLowerCase()) { // Their page
		sendData.email = email; // This is their account, include their email with the response

		sendData.verified = is_verified === 1;
		sendData.verified_notified = is_verification_notified === 1;

		// If they are verified but haven't been notified yet, this is the moment to do so.
		if (is_verified === 1 && is_verification_notified === 0) {
			console.log(`Thanking member ${username} for verifying their account!`);
			// Mark them as notified in the database.
			updateMemberColumns(user_id, { is_verification_notified: 1 });
		} else if (is_verified === 0) {
			console.log(`Requesting member ${username} to verify their account!`);
		}
	}

	// Return data
	res.json(sendData);
};

export {
	getMemberData,
};