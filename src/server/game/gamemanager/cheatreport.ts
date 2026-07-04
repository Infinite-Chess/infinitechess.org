// src/server/game/gamemanager/cheatreport.ts

/**
 * This script handles cheat reports, aborting games when they come in.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { ServerGame } from './gameutility.js';

import * as z from 'zod';

import typeutil from '../../../shared/chess/util/typeutil.js';

import gameutility from './gameutility.js';
import { logEvents } from '../../middleware/logEvents.js';
import { setGameConclusion } from './gamemanager.js';

/** The zod schema for validating the contents of the cheatreport message. */
const reportschem = z.strictObject({
	/** The client's reason they reported their opponent. */
	reason: z.string(),
	opponentsMoveNumber: z.int(),
});

type ReportMessage = z.infer<typeof reportschem>;

/**
 *
 * @param servergame - The game they belong in.
 * @param ourRole - The color the socket is playing as.
 * @param messageContents - The contents of the socket report message
 */
function onReport(servergame: ServerGame, ourRole: Player, messageContents: ReportMessage): void {
	// { reason, opponentsMoveNumber }
	console.log('Received cheat report! - Check hackLog.txt for more details.');

	const opponentColor = typeutil.invertPlayer(ourRole);

	// Once the game is finalized its result is locked in and can no longer be overturned.
	if (servergame.match.finalized) {
		gameutility.sendMessageToSocketOfColor(
			servergame.match,
			ourRole,
			'general',
			'printerror',
			'Cannot report opponent: this game has already been finalized.',
		);
		return;
	}

	// Cheat reports are only valid in games that are not instantly deleted on conclusion.
	// (i.e. games without server-side move validation AND are public)
	if (servergame.validateMoves) {
		const errString = `Player tried to report cheating in a game that doesn't support cheat reports. Variant: ${servergame.match.variant}. Report message: ${JSON.stringify(messageContents)}. Reporter color: ${ourRole}. Game ID: ${servergame.match.id}`;
		logEvents(errString, 'hackLog');
		gameutility.sendMessageToSocketOfColor(
			servergame.match,
			ourRole,
			'general',
			'printerror',
			'Cannot report opponent in this game.',
		);
		return;
	}

	const perpetratingMoveIndex = servergame.moves.length - 1;
	const colorThatPlayedPerpetratingMove = gameutility.getColorThatPlayedMoveIndex(
		servergame,
		perpetratingMoveIndex,
	);
	if (colorThatPlayedPerpetratingMove === ourRole) {
		const errString = `Silly goose player tried to report themselves for cheating. Report message: ${JSON.stringify(messageContents)}. Reporter color: ${ourRole}.\nThe game: ${gameutility.getSimplifiedGameString(servergame)}`;
		logEvents(errString, 'hackLog');
		gameutility.sendMessageToSocketOfColor(
			servergame.match,
			ourRole,
			'general',
			'printerror',
			"Silly goose. You can't report yourself for cheating! You played that move!",
		);
		return;
	}
	// Remove the last move played.
	const perpetratingMove = servergame.moves.pop();
	if (!perpetratingMove) return;

	const opponentsMoveNumber = messageContents.opponentsMoveNumber;

	const errText = `Cheating reported! Perpetrating move: ${perpetratingMove.token}. Move number: ${opponentsMoveNumber}. The report description: ${messageContents.reason} Color who reported: ${ourRole}. Probably cheater color: ${opponentColor}.\nThe game: ${gameutility.getSimplifiedGameString(servergame)}`;
	console.error(errText);
	logEvents(errText, 'hackLog');

	for (const playerStr in servergame.match.playerData) {
		const player: Player = Number(playerStr) as Player;
		const isSuspectedCheater = player === opponentColor;
		if (isSuspectedCheater) {
			gameutility.sendMessageToSocketOfColor(
				servergame.match,
				player,
				'general',
				'notifyerror',
				'server.javascript.ws-you_cheated',
			);
		} else {
			gameutility.sendMessageToSocketOfColor(
				servergame.match,
				player,
				'general',
				'notify',
				'server.javascript.ws-opponent_cheated',
			);
		}
	}
	// Cheating report was valid, terminate the game..

	setGameConclusion(servergame, { condition: 'aborted' });
}

export { onReport, reportschem };
