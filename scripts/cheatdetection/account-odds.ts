// scripts/cheatdetection/account-odds.ts

/**
 * How fast a full-engine cheater is caught by the account they cheat on: a new one, or established
 * at a rating. Each simulated cheater plays games drawn from the corpus' simulated full-engine games,
 * each scored by the model held out from it, and wins every one against an opponent of their own
 * rating, their rating moved by the site's Glicko code after each. Reports the share caught within
 * N games.
 *
 * Usage: npx tsx scripts/cheatdetection/account-odds.ts [--ceiling=…] [--fractions=…] [--case-line=…]
 */

import type { BetModel } from '../../src/server/game/cheatdetection/bettingScore.js';
import type { RatingData } from '../../src/server/utility/ratingCalculation.js';
import type { MoveEvidence } from '../../src/server/game/cheatdetection/moveEvidence.js';

import { players as p } from '../../src/shared/chess/util/typeutil.js';

import bettingScore from '../../src/server/game/cheatdetection/bettingScore.js';
import ratingCalculation from '../../src/server/utility/ratingCalculation.js';

import models from './lib/models.js';
import settings from './lib/settings.js';
import simulate from './lib/simulate.js';

// Types -----------------------------------------------------------------------

/** One simulated full-engine game: the cheater's evidence, and the model held out from its game. */
interface EngineGame {
	evidence: MoveEvidence[];
	model: BetModel;
}

// Constants -------------------------------------------------------------------

/** An established account's rating deviation, near Glicko's floor of 50. */
const ESTABLISHED_RD = 60;
/** The accounts cheated on: their starting rating and deviation. */
const ACCOUNTS = [
	{ name: 'new', elo: ratingCalculation.DEFAULT_LEADERBOARD_ELO, rd: ratingCalculation.DEFAULT_LEADERBOARD_RD }, // prettier-ignore
	...[1700, 2200, 2500, 2800, 3100].map((elo) => ({
		name: 'established',
		elo,
		rd: ESTABLISHED_RD,
	})),
];
/** Every opponent's rating deviation. */
const OPPONENT_RD = 80;
const GAME_COUNTS = [3, 5, 7, 10, 15, 20];
const CHEATERS = 4000;

// Simulation ------------------------------------------------------------------

/** The game, from 1, at which a cheater starting at `elo` ± `rd` is caught, or Infinity if never. */
function caughtAt(pool: EngineGame[], elo: number, rd: number, random: () => number): number {
	const history: number[][] = [];
	let [rating, deviation] = [elo, rd];
	for (let game = 1; game <= GAME_COUNTS.at(-1)!; game++) {
		const { evidence, model } = pool[Math.floor(random() * pool.length)]!;
		history.push(bettingScore.gameLogRatios(evidence, model, bettingScore.skillCeiling(model, rating, deviation))); // prettier-ignore
		if (bettingScore.bestRunLogScore(history) >= settings.CASE_LOG_SCORE) return game;
		// A null last update leaves the deviation undecayed: games are back to back.
		const ratings: RatingData = {
			[p.WHITE]: { elo_at_game: rating, rating_deviation_at_game: deviation, rd_last_update_date: null }, // prettier-ignore
			[p.BLACK]: { elo_at_game: rating, rating_deviation_at_game: OPPONENT_RD, rd_last_update_date: null }, // prettier-ignore
		};
		ratingCalculation.computeChanges(ratings, p.WHITE);
		rating = ratings[p.WHITE]!.elo_after_game!;
		deviation = ratings[p.WHITE]!.rating_deviation_after_game!;
	}
	return Infinity;
}

// Main ------------------------------------------------------------------------

const { after, playerGames, modelFor } = models.fitCorpus();
const pool: EngineGame[] = playerGames.flatMap((pg, i) => {
	if (!pg.game.cheat) return [];
	const cheated = simulate.cheat(pg.game, pg.parity, 'full', i, after, pg.evidence);
	return cheated.missing.length ? [] : [{ evidence: cheated.evidence, model: modelFor(pg) }];
});

console.log(`${settings.describe()}; ${pool.length} full-engine games, ${CHEATERS} cheaters per account`); // prettier-ignore
for (const { name, elo, rd } of ACCOUNTS) {
	const random = simulate.rng(5);
	const caught = Array.from({ length: CHEATERS }, () => caughtAt(pool, elo, rd, random));
	const shares = GAME_COUNTS.map((n) => `${n}g ${Math.round((100 * caught.filter((at) => at <= n).length) / CHEATERS)}%`); // prettier-ignore
	console.log(`${`${name} ${elo} ± ${rd}`.padEnd(22)} ${shares.join(' | ')}`);
}
