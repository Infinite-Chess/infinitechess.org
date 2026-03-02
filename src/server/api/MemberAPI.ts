// src/server/api/MemberAPI.ts

import type { Request, Response } from 'express';

import { format, formatDistance } from 'date-fns';

import timeutil from '../../shared/util/timeutil.js';
import metadata from '../../shared/chess/util/metadata.js';
import { Leaderboards } from '../../shared/chess/variants/validleaderboard.js';

import { localeMap } from '../config/dateLocales.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import { getLanguageToServe } from '../utility/translate.js';
import { getMemberDataByCriteria, updateMemberColumns } from '../database/memberManager.js';
import {
	getPlayerLeaderboardRating,
	getEloOfPlayerInLeaderboard,
	getPlayerRankInLeaderboard,
} from '../database/leaderboardsManager.js';

// Define the structure of the JSON response body
interface MemberResponse {
	user_id: number;
	username: string;
	joined: string;
	seen: string;
	checkmates_beaten: string;
	ranked_elo: string;
	infinity_leaderboard_position: number | undefined;
	infinity_leaderboard_rating_deviation: number | undefined;
	email?: string;
	verified?: boolean;
	verified_notified?: boolean;
}

/**
 * API route: /member/:member/data
 * This is fetched from the profile page,
 * and serves info about the requested member.
 *
 * SHOULD ONLY ever return a JSON.
 */
const getMemberData = async (req: Request, res: Response): Promise<Response> => {
	// What member are we getting data from?
	const claimedUsername = req.params['member'];
	if (!claimedUsername) {
		logEventsAndPrint('No member username provided to MemberAPI.getMemberData', 'errLog.txt');
		return res.status(400).json({ message: 'No member username provided' });
	}

	const record = getMemberDataByCriteria(
		[
			'user_id',
			'username',
			'email',
			'joined',
			'is_verified',
			'is_verification_notified',
			'last_seen',
			'checkmates_beaten',
		],
		'username',
		claimedUsername,
	);

	if (record === undefined) return res.status(404).json({ message: 'Member not found' });

	// Get the player's display elo string from the INFINITY leaderboard
	const ranked_elo = getEloOfPlayerInLeaderboard(record.user_id, Leaderboards.INFINITY); // { value: number, confident: boolean }

	// Get the player's position from the INFINITY leaderboard
	const infinity_leaderboard_position = getPlayerRankInLeaderboard(
		record.user_id,
		Leaderboards.INFINITY,
	);

	// Get the player's RD from the INFINITY leaderboard
	let infinity_leaderboard_rating_deviation = getPlayerLeaderboardRating(
		record.user_id,
		Leaderboards.INFINITY,
	)?.rating_deviation;
	if (infinity_leaderboard_rating_deviation !== undefined) {
		infinity_leaderboard_rating_deviation = Math.round(infinity_leaderboard_rating_deviation);
	}

	// Load their data
	const joinedPhrase = format(new Date(record.joined), 'PP');

	const lastSeenDate = new Date(timeutil.sqliteToISO(record.last_seen));
	const language = getLanguageToServe(req);
	// Use type assertion here since we check for localeStr's existence in locales
	const seenPhrase = formatDistance(lastSeenDate, new Date(), {
		locale: localeMap[language],
		addSuffix: true,
	});

	const sendData: MemberResponse = {
		user_id: record.user_id,
		username: record.username,
		joined: joinedPhrase,
		seen: seenPhrase,
		checkmates_beaten: record.checkmates_beaten,
		ranked_elo: metadata.getWhiteBlackElo(ranked_elo),
		infinity_leaderboard_position,
		infinity_leaderboard_rating_deviation,
	};

	// If they are the same person as who their requesting data, also include these.
	if (req.memberInfo === undefined) {
		logEventsAndPrint(
			'req.memberInfo must be defined when requesting member data from API!',
			'errLog.txt',
		);
		return res.status(500).send('Internal Server Error');
	}

	if (
		req.memberInfo.signedIn &&
		req.memberInfo.username.toLowerCase() === claimedUsername.toLowerCase()
	) {
		// Their page
		sendData.email = record.email; // This is their account, include their email with the response

		sendData.verified = record.is_verified === 1;
		sendData.verified_notified = record.is_verification_notified === 1;

		// If they are verified but haven't been notified yet, this is the moment to do so.
		if (record.is_verified === 1 && record.is_verification_notified === 0) {
			console.log(`Thanking member ${record.username} for verifying their account!`);
			try {
				// Mark them as notified in the database.
				updateMemberColumns(record.user_id, { is_verification_notified: 1 });
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logEventsAndPrint(
					`Failed to update member of ID "${record.user_id}" verification notified status: ${message}`,
					'errLog.txt',
				);
			}
		} else if (record.is_verified === 0) {
			console.log(`Requesting member ${record.username} to verify their account!`);
		}
	}

	// Return data
	return res.json(sendData);
};

export { getMemberData };
