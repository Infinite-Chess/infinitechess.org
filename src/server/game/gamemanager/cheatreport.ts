/**
 * This script handles cheat reports, aborting games when they come in.
 */

import * as z from 'zod';

// Middleware imports
import { logEvents, logEventsAndPrint } from '../../middleware/logEvents.js';

// Custom imports
import gameutility from './gameutility.js';
import { setGameConclusion } from './gamemanager.js';
import typeutil from '../../../shared/chess/util/typeutil.js';

import type { ServerGame } from './gameutility.js';
import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';

/** The zod schema for validating the contents of the cheatreport message. */
const reportschem = z.strictObject({
	/** The client's reason they reported their opponent. */
	reason: z.string(),
	opponentsMoveNumber: z.int(),
});

type ReportMessage = z.infer<typeof reportschem>;

/**
 *
 * @param ws - The socket
 * @param servergame - The game they belong in.
 * @param messageContents - The contents of the socket report message
 */
function onReport(
	ws: CustomWebSocket,
	servergame: ServerGame,
	messageContents: ReportMessage,
): void {
	// { reason, opponentsMoveNumber }
	console.log('Client reported hacking!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');

	const ourColor =
		ws.metadata.subscriptions.game?.color ||
		gameutility.doesSocketBelongToGame_ReturnColor(servergame.match, ws)!;
	const opponentColor = typeutil.invertPlayer(ourColor);

	if (servergame.match.publicity === 'private') {
		const errString = `Player tried to report cheating in a private game! Report message: ${JSON.stringify(messageContents)}. Reporter color: ${ourColor}.\nThe game: ${gameutility.getSimplifiedGameString(servergame)}`;
		logEventsAndPrint(errString, 'hackLog.txt');
		gameutility.sendMessageToSocketOfColor(
			servergame.match,
			ourColor,
			'general',
			'printerror',
			'Cannot report your friend for cheating in a private match!',
		);
		return;
	}

	const perpetratingMoveIndex = servergame.basegame.moves.length - 1;
	const colorThatPlayedPerpetratingMove = gameutility.getColorThatPlayedMoveIndex(
		servergame.basegame,
		perpetratingMoveIndex,
	);
	if (colorThatPlayedPerpetratingMove === ourColor) {
		const errString = `Silly goose player tried to report themselves for cheating. Report message: ${JSON.stringify(messageContents)}. Reporter color: ${ourColor}.\nThe game: ${gameutility.getSimplifiedGameString(servergame)}`;
		logEventsAndPrint(errString, 'hackLog.txt');
		gameutility.sendMessageToSocketOfColor(
			servergame.match,
			ourColor,
			'general',
			'printerror',
			"Silly goose. You can't report yourself for cheating! You played that move!",
		);
		return;
	}
	// Remove the last move played.
	const perpetratingMove = servergame.basegame.moves.pop();
	if (!perpetratingMove) return;

	const opponentsMoveNumber = messageContents.opponentsMoveNumber;

	const errText = `Cheating reported! Perpetrating move: ${perpetratingMove.compact}. Move number: ${opponentsMoveNumber}. The report description: ${messageContents.reason}. Color who reported: ${ourColor}. Probably cheater color: ${opponentColor}.\nThe game: ${gameutility.getSimplifiedGameString(servergame)}`;
	console.error(errText);
	logEvents(errText, 'hackLog.txt');

	for (const player in servergame.match.playerData) {
		gameutility.sendMessageToSocketOfColor(
			servergame.match,
			Number(player) as Player,
			'general',
			'notify',
			'server.javascript.ws-game_aborted_cheating',
		);
	}
	// Cheating report was valid, terminate the game..

	setGameConclusion(servergame, 'aborted');
	gameutility.broadcastGameUpdate(servergame);
}

export { onReport, reportschem };
