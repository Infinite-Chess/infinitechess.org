// scripts/cheatdetection/false-case-rate.ts

/**
 * Estimates the per-player false-case rate at any case line from the tail of honest players' peak
 * scores: an exponential fit to the log-peak excess over a threshold (so a power law in the score),
 * bootstrapped over players for its uncertainty. Best-run scoring has no guaranteed bound, so this
 * estimate is the false-case rate's only measure; it is extrapolated past the highest honest
 * score, so the bootstrap interval is the part to trust.
 *
 * Usage: npx tsx scripts/cheatdetection/false-case-rate.ts [--ceiling=…] [--fractions=…]
 */

import models from './lib/models.js';
import settings from './lib/settings.js';
import simulate from './lib/simulate.js';

// Types -----------------------------------------------------------------------

/** P(log-peak ≥ t) = share × e^(−rate × (t − TAIL_START)), for t ≥ TAIL_START. */
interface TailFit {
	share: number;
	rate: number;
}

// Constants -------------------------------------------------------------------

/** Log-peaks above this form the tail the fit is made on. */
const TAIL_START = Math.log(2);
/** The per-player false-case rate the precision floor allows: 95% precision at a 1% prevalence. */
const TARGET_RATE = 0.0004;
const BOOTSTRAP_RUNS = 2000;

// Fitting ---------------------------------------------------------------------

/** The maximum-likelihood exponential tail of `logPeaks`. */
function fitTail(logPeaks: number[]): TailFit {
	const tail = logPeaks.filter((x) => x >= TAIL_START);
	const meanExcess =
		tail.reduce((sum, x) => sum + (x - TAIL_START), 0) / Math.max(1, tail.length);
	return { share: tail.length / logPeaks.length, rate: 1 / Math.max(meanExcess, 1e-6) };
}

/** The case line (a score) where a fitted tail falls to `target`. */
function lineFor(fit: TailFit, target: number): number {
	return Math.exp(TAIL_START + Math.log(fit.share / target) / fit.rate);
}

/** A fitted tail's per-player rate at a case line (a score). */
function rateAt(fit: TailFit, line: number): number {
	return fit.share * Math.exp(-fit.rate * (Math.log(line) - TAIL_START));
}

/** The `p` quantile of `xs`. */
function quantile(xs: number[], p: number): number {
	return [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))]!;
}

// Main ------------------------------------------------------------------------

const { byPlayer, peakScore } = models.fitCorpus();
const peaks = [...byPlayer.values()].map((games) => ({ peak: peakScore(games.map((pg) => ({ pg, evidence: pg.evidence }))), games: games.length })); // prettier-ignore

const logPeaks = peaks.map((p) => p.peak);
const fit = fitTail(logPeaks);
const line = Math.exp(settings.CASE_LOG_SCORE);
console.log(`${settings.describe()}: ${logPeaks.length} honest players, ${logPeaks.filter((x) => x >= TAIL_START).length} with a peak ≥ 2; their tail falls as score^-${fit.rate.toFixed(2)}`); // prettier-ignore
const observed = [2, 5, 10, 20, 50].map((x) => `≥${x}: ${((100 * logPeaks.filter((l) => l >= Math.log(x)).length) / logPeaks.length).toFixed(1)}% (fit ${(100 * rateAt(fit, x)).toFixed(1)}%)`); // prettier-ignore
console.log(`  observed vs fit: ${observed.join(', ')}`);

const random = simulate.rng(11);
const boot = Array.from({ length: BOOTSTRAP_RUNS }, () => fitTail(logPeaks.map(() => logPeaks[Math.floor(random() * logPeaks.length)]!))); // prettier-ignore
const lines = boot.map((f) => lineFor(f, TARGET_RATE));
console.log(`  line for ${100 * TARGET_RATE}% per player: ${lineFor(fit, TARGET_RATE).toFixed(0)} (90% interval ${quantile(lines, 0.05).toFixed(0)}–${quantile(lines, 0.95).toFixed(0)})`); // prettier-ignore
console.log(`  rate at the case line ${Math.round(line)}: ${(100 * rateAt(fit, line)).toExponential(1)}% (90% interval up to ${(100 * quantile(boot.map((f) => rateAt(f, line)), 0.95)).toExponential(1)}%)`); // prettier-ignore
for (const minGames of [10, 20]) {
	const regulars = peaks.filter((p) => p.games >= minGames).map((p) => p.peak);
	if (regulars.length < 10) continue;
	const regularFit = fitTail(regulars);
	console.log(`  players with ${minGames}+ games (${regulars.length}): tail score^-${regularFit.rate.toFixed(2)}, rate at ${Math.round(line)}: ${(100 * rateAt(regularFit, line)).toExponential(1)}%`); // prettier-ignore
}
