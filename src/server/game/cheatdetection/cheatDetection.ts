// src/server/game/cheatdetection/cheatDetection.ts

/**
 * Engine-assistance detection: assesses every finished rated game on the engine worker, one at
 * a time, then re-scores both players over their latest games, opening a case on any whose
 * score crosses the case line.
 *
 * The entry point and the queue. `moveEvidence.ts` judges each move, and `bettingScore.ts`
 * scores a player's moves.
 */

import type { ServerGame } from '../gamemanager/serverGameTypes.js';
import type { MoveEvidence } from './moveEvidence.js';
import type { CheatAssessmentsRecord } from '../../database/cheatAssessmentsManager.js';

import jsutil from '../../../shared/util/jsutil.js';

import logEvents from '../../utility/logEvents.js';
import gameReplay from './gameReplay.js';
import moveEvidence from './moveEvidence.js';
import bettingScore from './bettingScore.js';
import gamesManager from '../../database/gamesManager.js';
import engineAnalysis from './engineAnalysis.js';
import cheatCasesManager from '../../database/cheatCasesManager.js';
import playerGamesManager from '../../database/playerGamesManager.js';
import cheatAssessmentsManager from '../../database/cheatAssessmentsManager.js';

// State -----------------------------------------------------------------------

/** Games waiting for the engine worker, in the order they finished. */
const queue: number[] = [];
/** Whether {@link drain} is working through {@link queue}. */
let draining = false;

// Queue -----------------------------------------------------------------------

/** Re-queues the games a restart left queued. Call once at startup. */
function start(): void {
	try {
		queue.push(...cheatAssessmentsManager.getQueuedGameIds());
	} catch {
		return; // Already logged. New games still queue as they finish.
	}
	void drain();
}

/** Queues a finalized game for assessment, if it's one detection judges: rated, played out and logged. */
function onFinalized(servergame: ServerGame): void {
	if (!servergame.match.rated || servergame.gameConclusion!.victor === undefined) return;
	const game_id = servergame.match.id;
	try {
		if (!gamesManager.isLogged(game_id)) return; // Its logging failed, which the logger already reported.
		const user_ids = playerGamesManager.getOfGame(game_id, ['user_id']).map((p) => p.user_id);
		cheatAssessmentsManager.queueGame(game_id, user_ids, Date.now());
	} catch {
		return; // Already logged.
	}
	queue.push(game_id);
	void drain();
}

/**
 * Assesses queued games one at a time, so the engine worker is never asked for two at once,
 * then stops the worker until the next game.
 */
async function drain(): Promise<void> {
	if (draining) return;
	draining = true;
	while (queue.length > 0) {
		const game_id = queue.shift()!;
		try {
			await assessGame(game_id);
		} catch (error) {
			if (error instanceof engineAnalysis.EngineLoadError) {
				// The build is broken until a redeploy restarts the server, whose start re-queues these.
				void logEvents.addAndPrint(`Cheat assessment paused, the engine can't load: ${error.message}`, 'errLog'); // prettier-ignore
				queue.length = 0;
				break;
			}
			void logEvents.addAndPrint(`Cheat assessment of game ${game_id} failed: ${jsutil.getErrorMessage(error)}`, 'errLog'); // prettier-ignore
			try {
				cheatAssessmentsManager.markFailed(game_id, Date.now());
			} catch {
				// Already logged. Still queued, so the next restart retries it.
			}
		}
	}
	engineAnalysis.stop();
	draining = false;
}

// Assessment ------------------------------------------------------------------

/**
 * Analyses a game, records each player's evidence from it, then re-scores both.
 * @throws If a database error occurs, the engine worker can't load, dies or wedges,
 * or a score isn't a finite number.
 */
async function assessGame(game_id: number): Promise<void> {
	const game = gamesManager.getData(game_id, ['icn', 'move_count']);
	if (!game) return; // Deleted while queued: its rows went with it.
	const players = playerGamesManager.getOfGame(game_id, ['user_id', 'player_number']);
	const reply = await engineAnalysis.analyse({ gameId: game_id, icn: game.icn }, game.move_count);

	const updated_at = Date.now();
	const records: CheatAssessmentsRecord[] = players.map(({ user_id, player_number }) => {
		if (reply.outcome !== 'analysed') return { game_id, user_id, updated_at, outcome: reply.outcome, evidence: null }; // prettier-ignore
		const parity = gameReplay.parityOf(game.icn, player_number);
		const evidence = moveEvidence.gather(reply.positions, reply.moves, parity);
		return {
			game_id,
			user_id,
			updated_at,
			outcome: 'analysed',
			evidence: JSON.stringify(evidence),
		};
	});
	if (reply.outcome === 'failed') void logEvents.addAndPrint(`Engine could not analyse game ${game_id}: ${reply.reason}`, 'errLog'); // prettier-ignore
	cheatAssessmentsManager.recordGame(records);

	if (reply.outcome === 'analysed') for (const { user_id } of players) reviewPlayer(user_id);
}

/**
 * Re-scores a player over their recent games, opening a case if the score crosses the line.
 * @throws If a database error occurs, or the score isn't a finite number.
 */
function reviewPlayer(user_id: number): void {
	if (cheatCasesManager.isOpen(user_id)) return;
	const since = Date.now() - bettingScore.MAX_EVIDENCE_AGE_MS;
	const games = cheatAssessmentsManager.getRecentEvidence(user_id, since).map((row) => {
		const evidence: MoveEvidence[] = JSON.parse(row.evidence);
		// Each game is judged against the rating the player held going into it.
		const ceiling = bettingScore.skillCeiling(bettingScore.MODEL, row.elo_at_game, row.rating_deviation_at_game); // prettier-ignore
		return bettingScore.gameLogRatios(evidence, bettingScore.MODEL, ceiling);
	});
	const logScore = bettingScore.bestRunLogScore(games);
	// Load-bearing: a NaN score compares false against the line, so the player could never be flagged.
	if (!Number.isFinite(logScore)) throw Error(`User ${user_id}'s score is ${logScore}`);
	if (logScore >= bettingScore.CASE_LOG_SCORE) cheatCasesManager.open(user_id, Date.now());
}

// Exports ---------------------------------------------------------------------

export default { start, onFinalized };
