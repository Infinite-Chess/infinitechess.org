// scripts/cheatdetection/inspect-player.ts

/**
 * One player's rated games, game by game, against the corpus average: their rating going in, how
 * often they found good moves, the first line, and hard moves, and each game's log ratio per cheat
 * fraction, for vetting an honest outlier.
 *
 * Usage: npx tsx scripts/cheatdetection/inspect-player.ts <userId> [--ceiling=…] [--fractions=…]
 */

import type {
	MoveEvidence,
	MoveOutcome,
} from '../../src/server/game/cheatdetection/moveEvidence.js';

import bettingScore from '../../src/server/game/cheatdetection/bettingScore.js';

import models from './lib/models.js';
import settings from './lib/settings.js';

// Rates -----------------------------------------------------------------------

/** The share of `evidence` with one of `outcomes`, as a percentage. */
function rate(evidence: MoveEvidence[], outcomes: MoveOutcome[]): string {
	if (evidence.length === 0) return '-';
	return `${Math.round((100 * evidence.filter((e) => outcomes.includes(e.outcome)).length) / evidence.length)}%`; // prettier-ignore
}

/** Whether a move was hard to find: at most two good moves, none a shallow search finds. */
function isHard(evidence: MoveEvidence): boolean {
	return evidence.difficulty.goodMoves <= 2 && !evidence.difficulty.shallowFinds;
}

// Main ------------------------------------------------------------------------

const userId = Number(settings.positional()[0]);
const { playerGames, byPlayer, modelFor } = models.fitCorpus();
const history = byPlayer.get(userId);
if (!history) throw Error(`User ${userId} has no rated games in the corpus.`);

const all = playerGames.flatMap((pg) => pg.evidence);
console.log(`${settings.describe()}; corpus: good ${rate(all, ['top', 'good'])}, top ${rate(all, ['top'])}, hard found ${rate(all.filter((e) => isHard(e)), ['top', 'good'])}`); // prettier-ignore
for (const pg of history) {
	const player = pg.game.players.find((p) => p.userId === userId)!;
	const opponent = pg.game.players.find((p) => p.userId !== userId)!;
	const model = modelFor(pg);
	const ratios = bettingScore.gameLogRatios(pg.evidence, model, bettingScore.skillCeiling(model, player.elo, player.rd)); // prettier-ignore
	const hard = pg.evidence.filter((e) => isHard(e));
	console.log(`game ${pg.game.gameId} elo ${player.elo.toFixed(0)} rd ${player.rd.toFixed(0)} vs ${opponent.elo.toFixed(0)} result ${player.score} | scored ${pg.evidence.length} good ${rate(pg.evidence, ['top', 'good'])} top ${rate(pg.evidence, ['top'])} hard ${hard.filter((e) => e.outcome !== 'miss').length}/${hard.length} | log ratios ${ratios.map((r) => r.toFixed(1)).join(' ')}`); // prettier-ignore
}
