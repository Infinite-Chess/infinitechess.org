// scripts/cheatdetection/engine-pass.ts

/**
 * Runs one engine pass over the snapshot's corpus games, writing one record per game (per position,
 * for `offline`) to the data directory. Resumable: rerun to continue where it stopped.
 *
 *   detector   the production engine worker itself, on every position
 *   cheater    a cheater's engine: MultiPV 3 at 800,000 nodes
 *   level6     the site's level-6 bot's move (250 ms each)
 *   offline    the detector's search of each position after a substituted move that
 *              build-corpus.ts listed as pending
 *
 * Every pass is node-limited except level6, which is time-limited: heavy machine use while it
 * runs weakens its moves. With --shards=N it splits the games over N processes, one per core.
 *
 * Usage: npx tsx scripts/cheatdetection/engine-pass.ts <pass> --snapshot=<path> [--shards=N]
 */

import type { GameAtStart } from '../../src/server/game/cheatdetection/gameReplay.js';
import type { PositionAnalysis } from '../../src/server/game/cheatdetection/cheatDetectionTypes.js';
import type { DetectorRecord, OffLineRecord, PendingMove, PicksRecord } from './lib/corpus.js';

import { existsSync, readFileSync } from 'node:fs';

import icnmoves from '../../src/shared/chess/logic/icn/icnmoves.js';

import gameReplay from '../../src/server/game/cheatdetection/gameReplay.js';

import corpus from './lib/corpus.js';
import shards from './lib/shards.js';
import snapshot from './lib/snapshot.js';
import settings from './lib/settings.js';
import researchengine from './lib/researchengine.js';
import detectorworker from './lib/detectorworker.js';

// Types -----------------------------------------------------------------------

type Pass = 'detector' | 'cheater' | 'level6' | 'offline';

// Constants -------------------------------------------------------------------

/** A cheater's engine: deeper than the detector, and differently configured, as a real one would be. */
const CHEATER_SEARCH = { multiPv: 3, nodes: 800_000 };
const LEVEL = 6;
const LEVEL_MS = 250;

const PASSES: Pass[] = ['detector', 'cheater', 'level6', 'offline'];

// Passes ----------------------------------------------------------------------

/** The detector pass: the production worker's analysis of every position of each game. */
async function detectorPass(
	output: string,
	done: Set<number>,
	mine: (id: number) => boolean,
): Promise<void> {
	const worker = await detectorworker.start();
	for (const row of snapshot.corpus().filter((r) => mine(r.game_id) && !done.has(r.game_id))) {
		const reply = await detectorworker.analyse(worker, { gameId: row.game_id, icn: row.icn });
		corpus.append(output, { gameId: row.game_id, reply } satisfies DetectorRecord);
		console.log(`game ${row.game_id}: ${reply.outcome}`);
	}
	await worker.terminate();
}

/** The cheater or level6 pass: the engine's choices at every ply a player moves from. */
async function picksPass(
	pass: 'cheater' | 'level6',
	output: string,
	done: Set<number>,
	mine: (id: number) => boolean,
): Promise<void> {
	for (const row of snapshot.corpus().filter((r) => mine(r.game_id) && !done.has(r.game_id))) {
		const game = await gameReplay.loadAtStart(row.icn);
		const moves = game.longformat.moves ?? [];
		const session = new researchengine.Session();
		const plies: PicksRecord['plies'] = moves.map((_, ply) => {
			const icn = gameReplay.engineIcn(game, moves.slice(0, ply));
			if (pass === 'level6') return researchengine.levelMove(icn, LEVEL, LEVEL_MS) ?? null;
			return session.search(icn, CHEATER_SEARCH.multiPv, CHEATER_SEARCH.nodes)?.lines ?? null;
		});
		session.free();
		corpus.append(output, { gameId: row.game_id, plies } satisfies PicksRecord);
		console.log(`game ${row.game_id}: ${moves.length} plies`);
	}
}

/** The offline pass: the detector's search of each pending position after a substituted move. */
async function offlinePass(output: string, mine: (id: number) => boolean): Promise<void> {
	const done = new Set(corpus.readRecords<{ key: string }>('offline-').map((r) => r.key));
	const pendingPath = corpus.file('pending.jsonl');
	if (!existsSync(pendingPath))
		throw Error('Run build-corpus.ts first: it lists the pending moves.');
	const byGame = new Map<number, PendingMove[]>();
	for (const line of readFileSync(pendingPath, 'utf8').split('\n')) {
		if (!line) continue;
		const pending: PendingMove = JSON.parse(line);
		if (!mine(pending.gameId) || done.has(corpus.afterKey(pending.gameId, pending.ply, pending.move))) continue; // prettier-ignore
		byGame.set(pending.gameId, [...(byGame.get(pending.gameId) ?? []), pending]);
	}
	for (const [gameId, pendings] of byGame) {
		const game: GameAtStart = await gameReplay.loadAtStart(snapshot.game(gameId).icn);
		const moves = game.longformat.moves ?? [];
		const session = new researchengine.Session();
		for (const { ply, move } of pendings) {
			const icn = gameReplay.engineIcn(game, [
				...moves.slice(0, ply),
				icnmoves.parseTokenMove(move),
			]);
			const searched = session.search(icn, settings.SEARCH.multiPv, settings.SEARCH.positionNodes); // prettier-ignore
			// Only what judging a move outside the lines reads: legal moves, check, and the top line's score.
			const position: PositionAnalysis = searched
				? { legal: searched.legal, inCheck: searched.inCheck, repeated: false, lines: searched.lines.slice(0, 1).map((l) => ({ ...l, captures: false })), topByDepth: [] } // prettier-ignore
				: { refused: true };
			corpus.append(output, {
				key: corpus.afterKey(gameId, ply, move),
				position,
			} satisfies OffLineRecord);
		}
		session.free();
		console.log(`game ${gameId}: ${pendings.length} positions`);
	}
}

// Main ------------------------------------------------------------------------

const pass = PASSES.find((p) => p === settings.positional()[0]);
if (!pass) throw Error(`Pass must be one of ${PASSES.join(', ')}.`);
const processes = shards.requested();
if (processes > 1) await shards.run(pass, processes);
else {
	const [shard, count] = shards.current();
	const mine = (id: number): boolean => id % count === shard;
	const output = `${pass}-${shard}.jsonl`;
	const done = new Set(corpus.readRecords<{ gameId: number }>(`${pass}-`).map((r) => r.gameId));
	if (pass !== 'detector') await researchengine.load(16); // The detector pass's worker loads its own.
	if (pass === 'detector') await detectorPass(output, done, mine);
	else if (pass === 'offline') await offlinePass(output, mine);
	else await picksPass(pass, output, done, mine);
	console.log('finished');
}
