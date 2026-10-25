// scripts/cheatdetection/build-corpus.ts

/**
 * Joins the engine passes with the snapshot into corpus.jsonl, one record per analysed game: the
 * production worker's positions, the players with the rating and deviation they held going into
 * it (rd.json, from reconstruct-rd.ts), think times from the clock stamps, and the cheater and
 * level-6 passes' choices. Then lists in pending.jsonl the simulated moves whose position-after the
 * offline pass still has to analyse: the cheater engine's top choice and the level-6 move, or with
 * --all-lines also its 2nd and 3rd choices (the "second" style). No engine runs here.
 *
 * Usage: npx tsx scripts/cheatdetection/build-corpus.ts --snapshot=<path> [--all-lines]
 */

import type {
	CheatPicks,
	DetectorRecord,
	GameData,
	PendingMove,
	PicksRecord,
} from './lib/corpus.js';

import { readFileSync, writeFileSync } from 'node:fs';

import timeutil from '../../src/shared/util/timeutil.js';
import icnconverter from '../../src/shared/chess/logic/icn/icnconverter.js';

import gameReplay from '../../src/server/game/cheatdetection/gameReplay.js';
import ratingCalculation from '../../src/server/utility/ratingCalculation.js';

import corpus from './lib/corpus.js';
import snapshot from './lib/snapshot.js';

// Corpus ----------------------------------------------------------------------

/** Each player's think time per ply, from the clock stamps: their previous stamp, plus the increment, minus this one. */
function thinkTimes(icn: string, incrementSeconds: number): (number | undefined)[] {
	const moves = icnconverter.ShortToLong_Format(icn).moves ?? [];
	return moves.map((move, ply) => {
		const previous = moves[ply - 2]?.clockStamp;
		if (previous === undefined || move.clockStamp === undefined) return undefined;
		return Math.max(0, previous + incrementSeconds * 1000 - move.clockStamp);
	});
}

/** One game's record, if the detector analysed it. */
function buildGame(
	detector: DetectorRecord,
	cheater: PicksRecord | undefined,
	level6: PicksRecord | undefined,
	rds: Record<string, number>,
): GameData | undefined {
	const { reply } = detector;
	if (reply.outcome !== 'analysed') return undefined;
	const row = snapshot.game(detector.gameId);
	return {
		gameId: row.game_id,
		date: timeutil.sqliteToTimestamp(row.date),
		players: snapshot.players(row.game_id).map((p) => ({
			userId: p.user_id,
			parity: gameReplay.parityOf(row.icn, p.player_number),
			elo: p.elo_at_game ?? ratingCalculation.DEFAULT_LEADERBOARD_ELO,
			rd: rds[`${row.game_id}/${p.user_id}`] ?? ratingCalculation.DEFAULT_LEADERBOARD_RD,
			score: p.score,
		})),
		moves: reply.moves,
		thinks: thinkTimes(row.icn, row.increment_seconds ?? 0),
		positions: reply.positions,
		cheat:
			cheater &&
			reply.moves.map((_, ply): CheatPicks | undefined => {
				const lines = cheater.plies[ply];
				if (!Array.isArray(lines)) return undefined;
				const level = level6?.plies[ply];
				return { lines, level6: typeof level === 'string' ? level : undefined };
			}),
	};
}

// Pending ---------------------------------------------------------------------

/** The simulated moves outside the detector's lines that the offline pass hasn't analysed yet. */
function pending(games: GameData[], allLines: boolean): PendingMove[] {
	const done = corpus.loadAfterPositions();
	const out = new Map<string, PendingMove>();
	for (const game of games) {
		game.cheat?.forEach((picks, ply) => {
			const position = game.positions[ply]!;
			if (!picks || position.refused) return;
			const moves = [
				...picks.lines.slice(0, allLines ? 3 : 1).map((l) => l.move),
				picks.level6,
			];
			for (const move of moves) {
				if (move === undefined || position.lines.some((l) => l.move === move)) continue; // prettier-ignore
				const key = corpus.afterKey(game.gameId, ply, move);
				if (!done.has(key)) out.set(key, { gameId: game.gameId, ply, move });
			}
		});
	}
	return [...out.values()];
}

// Main ------------------------------------------------------------------------

const byGame = (prefix: string): Map<number, PicksRecord> => new Map(corpus.readRecords<PicksRecord>(prefix).map((r) => [r.gameId, r])); // prettier-ignore
const cheaters = byGame('cheater-');
const level6s = byGame('level6-');
const rds: Record<string, number> = JSON.parse(readFileSync(corpus.file('rd.json'), 'utf8'));

const games = corpus
	.readRecords<DetectorRecord>('detector-')
	.map((d) => buildGame(d, cheaters.get(d.gameId), level6s.get(d.gameId), rds))
	.filter((g): g is GameData => g !== undefined)
	.sort((a, b) => a.gameId - b.gameId);
writeFileSync(corpus.file('corpus.jsonl'), games.map((g) => JSON.stringify(g)).join('\n') + '\n');

const missing = pending(games, process.argv.includes('--all-lines'));
writeFileSync(
	corpus.file('pending.jsonl'),
	missing.map((p) => JSON.stringify(p)).join('\n') + '\n',
);
console.log(`${games.length} games (${games.filter((g) => g.cheat).length} with cheater choices); ${missing.length} moves pending off-line analysis`); // prettier-ignore
