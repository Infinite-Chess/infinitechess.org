// scripts/cheatdetection/evaluate.ts

/**
 * The detector's evaluation, on production's own evidence and scoring code, with every player and
 * game scored by a model held out from it (lib/models.ts):
 *   - honest players: the highest score each reaches, checked after every game as production does;
 *   - simulated cheaters, one per style on each real player's games: the share reaching the case
 *     line within N games, overall and by the average rating the player played at.
 *
 * Usage: npx tsx scripts/cheatdetection/evaluate.ts [honest] [--ceiling=…] [--fractions=…] [--case-line=…]
 * (`honest` stops after the honest players.)
 */

import type { PlayerGame } from './lib/models.js';

import models from './lib/models.js';
import settings from './lib/settings.js';
import simulate from './lib/simulate.js';

// Constants -------------------------------------------------------------------

const GAME_COUNTS = [1, 3, 5, 10, 20];
const BANDS = ['<1400', '1400-1699', '1700-1999', '2000+'];

// Evaluation ------------------------------------------------------------------

/** A player's rating band, by the average rating they played at. */
function bandOf(games: PlayerGame[]): string {
	const elo = games.reduce((sum, pg) => sum + pg.game.players.find((p) => p.userId === pg.userId)!.elo, 0) / games.length; // prettier-ignore
	return elo < 1400 ? BANDS[0]! : elo < 1700 ? BANDS[1]! : elo < 2000 ? BANDS[2]! : BANDS[3]!;
}

/** The share of `scores` at or over the case line, as a percentage. */
function caught(scores: number[]): string {
	if (scores.length === 0) return '-';
	return `${Math.round((100 * scores.filter((s) => s >= settings.CASE_LOG_SCORE).length) / scores.length)}%`; // prettier-ignore
}

const { after, byPlayer, peakScore, engineMoves } = models.fitCorpus();

const honest = [...byPlayer].map(([userId, games]) => ({ userId, games: games.length, peak: peakScore(games.map((pg) => ({ pg, evidence: pg.evidence }))) })); // prettier-ignore
honest.sort((a, b) => b.peak - a.peak);
console.log(`${settings.describe()}; ${honest.length} honest players, ${engineMoves} judged engine moves; ${caught(honest.map((h) => h.peak))} of honest players reach the case line`); // prettier-ignore
for (const h of honest.slice(0, 3)) console.log(`  highest honest: user ${h.userId}, peak score ${Math.exp(h.peak).toFixed(1)}, ${h.games} games`); // prettier-ignore

if (!settings.positional().includes('honest')) {
	for (const style of simulate.STYLES) {
		const row: string[] = [];
		for (const n of GAME_COUNTS) {
			const scores: { band: string; peak: number }[] = [];
			for (const games of byPlayer.values()) {
				const cheated = games
					.filter((pg) => pg.game.cheat)
					.map((pg, i) => ({
						pg,
						cheated: simulate.cheat(pg.game, pg.parity, style, i, after, pg.evidence),
					}))
					.filter((x) => x.cheated.missing.length === 0);
				if (cheated.length < n) continue;
				scores.push({ band: bandOf(games), peak: peakScore(cheated.slice(0, n).map((x) => ({ pg: x.pg, evidence: x.cheated.evidence }))) }); // prettier-ignore
			}
			if (scores.length < 5) continue;
			const byBand = BANDS.map((b) => caught(scores.filter((s) => s.band === b).map((s) => s.peak))).join('/'); // prettier-ignore
			row.push(`${n}g ${caught(scores.map((s) => s.peak))} [${byBand}] (n${scores.length})`);
		}
		console.log(`${style.padEnd(10)} ${row.join(' | ')}`);
	}
	console.log(
		`caught within N games [by average rating: ${BANDS.join(' / ')}] (players simulated)`,
	);
}
