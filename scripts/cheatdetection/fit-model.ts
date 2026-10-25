// scripts/cheatdetection/fit-model.ts

/**
 * Fits the betting score's model on all the data, no folds held out, and prints it as the MODEL
 * constant of src/server/game/cheatdetection/bettingScore.ts: what production ships.
 *
 * Usage: npx tsx scripts/cheatdetection/fit-model.ts [--ceiling=…] [--fractions=…]
 */

import models from './lib/models.js';

/** Numbers as a TypeScript array literal, rounded. */
function literal(xs: number[], digits = 3): string {
	return `[${xs.map((x) => Number(x.toFixed(digits))).join(', ')}]`;
}

const { full, playerGames, engineMoves } = models.fitCorpus();
const { base, perRating, margin } = full.skillCeiling;
console.log(`// Fitted on ${playerGames.reduce((n, pg) => n + pg.evidence.length, 0)} honest moves (${new Set(playerGames.map((pg) => pg.userId)).size} players) and ${engineMoves} judged engine moves.`); // prettier-ignore
console.log(`const MODEL: BetModel = {
	skillCeiling: { base: ${base}, perRating: ${perRating}, margin: ${margin} },
	cheatFractions: ${literal(full.cheatFractions, 2)},
	honestGoodWeights: ${literal(full.honestGoodWeights)},
	honestTopRates: ${literal(full.honestTopRates)},
	honestTopMargin: ${full.honestTopMargin},
	engineGoodWeights: ${literal(full.engineGoodWeights)},
	engineTopWeights: ${literal(full.engineTopWeights)},
};`);
