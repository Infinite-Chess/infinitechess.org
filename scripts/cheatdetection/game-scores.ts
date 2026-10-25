// scripts/cheatdetection/game-scores.ts

/**
 * Every player-game's log score, honest and under each simulated style, each scored by the model
 * held out from it. `save` writes them for the current code; `compare` pairs two saved runs game by
 * game, with intervals bootstrapped over players. The most sensitive test of a detector change:
 * catch-rate tables move in steps of whole players, so they hide gains this shows.
 *
 * Usage: npx tsx scripts/cheatdetection/game-scores.ts save <name> [--ceiling=…] [--fractions=…]
 *        npx tsx scripts/cheatdetection/game-scores.ts compare <baseline> <name>
 * (refit the ceiling with honest-margins.ts for each run first.)
 */

import type { MoveEvidence } from '../../src/server/game/cheatdetection/moveEvidence.js';

import { readFileSync, writeFileSync } from 'node:fs';

import bettingScore from '../../src/server/game/cheatdetection/bettingScore.js';

import corpus from './lib/corpus.js';
import models from './lib/models.js';
import settings from './lib/settings.js';
import simulate from './lib/simulate.js';

// Types -----------------------------------------------------------------------

/** One player-game's log score per {@link KINDS}: null where a style's simulation is incomplete. */
interface GameScores {
	userId: number;
	gameId: number;
	scores: (number | null)[];
}

// Constants -------------------------------------------------------------------

const STYLES = ['full', 'alternating', 'rescue', 'level6', 'partial40'] as const;
/** The real game, then each simulated style. */
const KINDS = ['honest', ...STYLES];
const BOOTSTRAP_RUNS = 1000;

// Saving ----------------------------------------------------------------------

/** Every player-game's log scores under the current code: one game's averaged bets, unclipped at 0. */
function save(name: string): void {
	const { after, playerGames, modelFor } = models.fitCorpus();
	const rows: GameScores[] = playerGames
		.filter((pg) => pg.game.cheat)
		.map((pg, i) => {
			const model = modelFor(pg);
			const player = pg.game.players.find((p) => p.userId === pg.userId)!;
			const ceiling = bettingScore.skillCeiling(model, player.elo, player.rd);
			const score = (evidence: MoveEvidence[]): number => bettingScore.averageLogRatio(bettingScore.gameLogRatios(evidence, model, ceiling)); // prettier-ignore
			const styles = STYLES.map((style) => {
				const cheated = simulate.cheat(pg.game, pg.parity, style, i, after, pg.evidence);
				return cheated.missing.length ? null : score(cheated.evidence);
			});
			return { userId: pg.userId, gameId: pg.game.gameId, scores: [score(pg.evidence), ...styles] }; // prettier-ignore
		});
	writeFileSync(corpus.file(`scores-${name}.json`), JSON.stringify(rows));
	console.log(`${settings.describe()}: ${rows.length} player-games saved as ${name}`);
}

// Comparing -------------------------------------------------------------------

/** Each kind's mean change per game from `baseline` to `name`, paired by player-game. */
function compare(baseline: string, name: string): void {
	const load = (n: string): GameScores[] => JSON.parse(readFileSync(corpus.file(`scores-${n}.json`), 'utf8')); // prettier-ignore
	const base = new Map(load(baseline).map((r) => [`${r.userId}/${r.gameId}`, r.scores]));
	const rows = load(name);
	KINDS.forEach((kind, k) => {
		const byPlayer = new Map<number, number[]>();
		let baseTotal = 0;
		for (const row of rows) {
			const now = row.scores[k]!;
			const then = base.get(`${row.userId}/${row.gameId}`)![k]!;
			if (now === null || then === null) continue;
			byPlayer.set(row.userId, [...(byPlayer.get(row.userId) ?? []), now - then]);
			baseTotal += then;
		}
		const players = [...byPlayer.keys()];
		const mean = (ids: number[]): number => { const xs = ids.flatMap((id) => byPlayer.get(id)!); return xs.reduce((a, b) => a + b, 0) / xs.length; }; // prettier-ignore
		const random = simulate.rng(1);
		const boot = Array.from({ length: BOOTSTRAP_RUNS }, () => mean(players.map(() => players[Math.floor(random() * players.length)]!))).sort((a, b) => a - b); // prettier-ignore
		const change = mean(players);
		const games = players.reduce((n, id) => n + byPlayer.get(id)!.length, 0);
		console.log(`${kind.padEnd(12)} ${(baseTotal / games).toFixed(3).padStart(7)} → ${change >= 0 ? '+' : ''}${change.toFixed(3)} per game (95% ${boot[Math.floor(0.025 * BOOTSTRAP_RUNS)]!.toFixed(3)} to ${boot[Math.floor(0.975 * BOOTSTRAP_RUNS)]!.toFixed(3)})`); // prettier-ignore
	});
}

// Main ------------------------------------------------------------------------

const [mode, a, b] = settings.positional();
if (mode === 'save' && a) save(a);
else if (mode === 'compare' && a && b) compare(a, b);
else throw Error('Usage: game-scores.ts save <name> | compare <baseline> <name>');
