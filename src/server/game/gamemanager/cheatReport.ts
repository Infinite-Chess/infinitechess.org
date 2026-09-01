// src/server/game/gamemanager/cheatReport.ts

/**
 * Handles the `report` game action: a player claiming their opponent's
 * last move was illegal, which overturns the game to an abort.
 *
 * Runs its own conclusion instead of `gameLifecycle.ts`'s, because a report accepted
 * after the game was already logged must overturn the database record too. Finalizing
 * the game — stage 3 of the life cycle — is what closes the reporting window.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { ServerGame } from './serverGameTypes.js';
import type { ReportMessage } from '../../../shared/transport/serverbound.js';
import type { GameConclusion } from '../../../shared/chess/util/typeschemas.js';
import type { GameStateMessage } from '../../../shared/transport/clientbound.js';

import typeutil from '../../../shared/chess/util/typeutil.js';
import moveutil from '../../../shared/chess/logic/moveutil.js';

import logEvents from '../../utility/logEvents.js';
import gameLogger from './gameLogger.js';
import socketsend from '../../socket/socketSend.js';
import gameSockets from './gameSockets.js';
import gameUtility from './gameUtility.js';
import gameLifecycle from './gameLifecycle.js';
import gameStateBuilder from './gameStateBuilder.js';

/**
 * A client reports their opponent's last move as illegal. A valid report pops
 * that move and aborts the game; an invalid one is refused and logged to hackLog.
 */
function onReport(servergame: ServerGame, ourRole: Player, messageContents: ReportMessage): void {
	if (gameUtility.isEngineGame(servergame)) return;
	console.log('Received cheat report! - Check hackLog.txt for more details.');

	const opponentColor = typeutil.invertPlayer(ourRole);

	// Once the game is finalized its result is locked in and can no longer be overturned.
	if (servergame.match.finalized) {
		gameSockets.sendToColor(
			servergame.match,
			ourRole,
			'general',
			'print-error',
			'Cannot report opponent: this game has already been finalized.',
		);
		return;
	}

	// Cheat reports are only valid in games that are not instantly deleted on conclusion.
	// (i.e. games without server-side move validation AND are public)
	if (servergame.validateMoves) {
		const errString = `Player tried to report cheating in a game that doesn't support cheat reports. Variant: ${gameUtility.getVariantCode(servergame.match.variant) ?? 'Custom'}. Report message: ${JSON.stringify(messageContents)}. Reporter color: ${ourRole}. Game ID: ${servergame.match.id}`;
		logEvents.add(errString, 'hackLog');
		gameSockets.sendToColor(
			servergame.match,
			ourRole,
			'general',
			'print-error',
			'Cannot report opponent in this game.',
		);
		return;
	}

	const perpetratingMoveIndex = servergame.moves.length - 1;
	const colorThatPlayedPerpetratingMove = moveutil.getColorThatPlayedMoveIndex(
		servergame,
		perpetratingMoveIndex,
	);
	if (colorThatPlayedPerpetratingMove === ourRole) {
		const errString = `Silly goose player tried to report themselves for cheating. Report message: ${JSON.stringify(messageContents)}. Reporter color: ${ourRole}.\nThe game: ${gameUtility.getSimplifiedGameString(servergame)}`;
		logEvents.add(errString, 'hackLog');
		gameSockets.sendToColor(
			servergame.match,
			ourRole,
			'general',
			'print-error',
			"Silly goose. You can't report yourself for cheating! You played that move!",
		);
		return;
	}
	// Remove the last move played.
	const perpetratingMove = servergame.moves.pop();
	if (!perpetratingMove) return;

	// Cheating report was valid, terminate the game..

	const opponentsMoveNumber = messageContents.opponentsMoveNumber;

	const errText = `Cheating reported! Perpetrating move: ${perpetratingMove.token}. Move number: ${opponentsMoveNumber}. The report description: ${messageContents.reason} Color who reported: ${ourRole}. Probably cheater color: ${opponentColor}.\nThe game: ${gameUtility.getSimplifiedGameString(servergame)}`;
	logEvents.add(errText, 'hackLog');

	// Notify all players a cheat was detected
	for (const [colorStr, { socket: ws }] of Object.entries(servergame.match.playerData)) {
		if (!ws) continue; // Not connected, can't send message
		if (Number(colorStr) === opponentColor) {
			socketsend.send(ws, 'general', 'toast-error', ws.t.responses.game.you_cheated);
		} else {
			socketsend.send(ws, 'general', 'toast', ws.t.responses.game.opponent_cheated);
		}
	}
	for (const ws of servergame.spectators) {
		socketsend.send(ws, 'general', 'toast', ws.t.responses.game.cheat_detected);
	}

	concludeReportedGame(servergame, { condition: 'aborted' }, colorThatPlayedPerpetratingMove);
}

/**
 * Concludes a game after a valid cheat report.
 * Custom version of gameLifecycle.conclude
 * @param cheaterColor - The color whose (now-popped) perpetrating move triggered the report.
 */
function concludeReportedGame(
	servergame: ServerGame,
	conclusion: GameConclusion,
	cheaterColor: Player,
): void {
	// If the game already concluded before this report, it was already logged
	// to the permanent database — the overturn must update that record below.
	const wasLogged = servergame.match.freed;
	const originalConclusion = servergame.gameConclusion;

	gameLifecycle.applyConclusion(servergame, conclusion);

	// Everyone gets the full state, not just the conclusion, because the popped move may still be
	// sitting on their board: the cheater played it, so they're a move ahead of the server (whosTurn
	// included), and any spectator who joined after it was played has it too — an initial load
	// replays the move list unvalidated, so they never ran the check that refuses it live.
	const base = gameStateBuilder.buildStateBase(servergame);
	for (const [color, data] of Object.entries(servergame.match.playerData)) {
		if (data.socket === undefined) continue; // Not connected, can't send message
		const message: GameStateMessage = {
			...base,
			participantState: gameStateBuilder.getParticipantState(
				servergame,
				Number(color) as Player,
			),
		};
		socketsend.send(data.socket, 'game', 'gamestate', message);
	}

	// Spectators get the same state, minus the participant overlay.
	gameSockets.broadcastToSpectators(servergame, 'gamestate', base);

	gameLifecycle.free(servergame);

	// Update the already-logged game record to reflect the overturn (aborted, one fewer move...).
	if (wasLogged) gameLogger.updateOverturned(servergame, originalConclusion!, cheaterColor);
}

// Exports ---------------------------------------------------------------------

export default { onReport };
