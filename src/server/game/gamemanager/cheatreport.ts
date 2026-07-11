// src/server/game/gamemanager/cheatreport.ts

/**
 * This script handles cheat reports, aborting games when they come in.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { ServerGame } from './gameutility.js';
import type { GameConclusion } from '../../../shared/chess/util/winconutil.js';
import type { GameStateMessage } from '../../../shared/types.js';

import * as z from 'zod';

import typeutil from '../../../shared/chess/util/typeutil.js';

import gamelogger from './gamelogger.js';
import gameutility from './gameutility.js';
import { logEvents } from '../../middleware/logEvents.js';
import { applyConclusion, freeGame } from './gamemanager.js';
import { sendNotify, sendSocketMessage } from '../../socket/sendSocketMessage.js';

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
		gameutility.sendMessageToColor(
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
		gameutility.sendMessageToColor(
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
		gameutility.sendMessageToColor(
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

	// Cheating report was valid, terminate the game..

	const opponentsMoveNumber = messageContents.opponentsMoveNumber;

	const errText = `Cheating reported! Perpetrating move: ${perpetratingMove.token}. Move number: ${opponentsMoveNumber}. The report description: ${messageContents.reason} Color who reported: ${ourRole}. Probably cheater color: ${opponentColor}.\nThe game: ${gameutility.getSimplifiedGameString(servergame)}`;
	console.error(errText);
	logEvents(errText, 'hackLog');

	// Notify all players a cheat was detected
	for (const playerStr in servergame.match.playerData) {
		const player: Player = Number(playerStr) as Player;
		const isSuspectedCheater = player === opponentColor;
		if (isSuspectedCheater) {
			gameutility.sendMessageToColor(servergame.match, player, 'general', 'notifyerror', 'server.javascript.ws-you_cheated'); // prettier-ignore
		} else {
			gameutility.sendMessageToColor(servergame.match, player, 'general', 'notify', 'server.javascript.ws-opponent_cheated'); // prettier-ignore
		}
	}
	for (const ws of servergame.spectators) {
		sendNotify(ws, 'server.javascript.ws-cheat_detected');
	}

	concludeReportedGame(servergame, { condition: 'aborted' }, colorThatPlayedPerpetratingMove);
}

/**
 * Concludes a game after a valid cheat report. The full game state is sent to all participants,
 * but not spectators, this is because illegal moves are not forwarded in the game. However, the
 * cheater and whosTurn may be desynced, so they need the full state.
 * Custom version of gamemanager.onGameConclusion
 * @param cheaterColor - The color whose (now-popped) perpetrating move triggered the report.
 */
function concludeReportedGame(
	servergame: ServerGame,
	conclusion: GameConclusion,
	cheaterColor: Player,
): void {
	// If the game already concluded before this report, it was already logged to the permanent
	// database — the overturn must update that record below. If it was still ongoing, the freeGame
	// call at the end logs it fresh (as aborted), so no update is needed.
	const wasLogged = servergame.match.freed;
	const originalConclusion = servergame.gameConclusion;

	applyConclusion(servergame, conclusion);

	// Send participants the full state
	const base = gameutility.buildGameStateBase(servergame);
	for (const [color, data] of Object.entries(servergame.match.playerData)) {
		if (data.socket === undefined) continue; // Not connected, can't send message
		const message: GameStateMessage = {
			...base,
			participantState: gameutility.getParticipantState(servergame, Number(color) as Player),
		};
		sendSocketMessage(data.socket, 'game', 'gamestate', message);
	}

	// Send spectators the conclusion message
	const conclusionMessage = gameutility.buildGameConclusionMessage(servergame);
	gameutility.broadcastToSpectators(servergame, 'gameconclusion', conclusionMessage);

	// Update the already-logged permanent record to reflect the overturn (aborted, one fewer move).
	if (wasLogged && originalConclusion !== undefined)
		gamelogger.updateOverturnedGame(servergame, originalConclusion, cheaterColor);

	freeGame(servergame);
}

export { onReport, reportschem };
