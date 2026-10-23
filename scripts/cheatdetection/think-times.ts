// scripts/cheatdetection/think-times.ts

/**
 * How Lichess's flat-think-time flag would behave here: how often it fires on honest rated games,
 * whether any honest player trips it repeatedly, and how often it fires on simulated engine users
 * under an assumed timing (each engine move a lognormal time, median 6 s, at several spreads; their
 * own moves keep their real times). The timing is a guess, not data.
 *
 * Usage: npx tsx scripts/cheatdetection/think-times.ts --snapshot=<path>
 */

import corpus from './lib/corpus.js';
import snapshot from './lib/snapshot.js';
import simulate from './lib/simulate.js';

// Constants -------------------------------------------------------------------

/** Lichess only assesses games of at least this many moves per player. */
const MIN_MOVES = 18;
/** Lichess skips games whose estimated length (base + 40 × increment) is at most this. */
const MIN_CLOCK_SECONDS = 60;
/** The assumed engine user's median think time. */
const ENGINE_MEDIAN_MS = 6000;
/** Spreads (lognormal sigma) of the engine user's think times. */
const SPREADS = [0.15, 0.25, 0.35, 0.5];
/** Shares of moves the simulated engine user times like the engine. */
const ENGINE_SHARES = [1, 0.4];

// Flag ------------------------------------------------------------------------

/**
 * Lichess's `highlyConsistentMoveTimes`, on one player's think times in a game: a whole-game
 * coefficient of variation under 0.25, or any 14-move window's (fastest and slowest dropped) under
 * 0.14, in centiseconds plus 10. Windows with 4+ zero times (premoves) are skipped.
 */
function isFlat(thinksMs: number[]): boolean {
	const centis = thinksMs.map((t) => Math.round(t / 10));
	if (variation(centis.map((t) => t + 10)) < 0.25) return true;
	for (let i = 0; i + 14 <= centis.length; i++) {
		const window = centis.slice(i, i + 14).sort((a, b) => a - b).slice(1, -1); // prettier-ignore
		if (window.filter((t) => t === 0).length >= 4) continue;
		if (variation(window.map((t) => t + 10)) < 0.14) return true;
	}
	return false;
}

/** The coefficient of variation: standard deviation over mean. */
function variation(xs: number[]): number {
	const mean = xs.reduce((sum, x) => sum + x, 0) / xs.length;
	return Math.sqrt(xs.reduce((sum, x) => sum + (x - mean) ** 2, 0) / xs.length) / mean;
}

// Main ------------------------------------------------------------------------

/** Each assessable player-game's think times, with who played it. */
const sides = corpus.loadCorpus().flatMap((game) => {
	const row = snapshot.game(game.gameId);
	if ((row.base_time_seconds ?? 0) + 40 * (row.increment_seconds ?? 0) <= MIN_CLOCK_SECONDS) return []; // prettier-ignore
	return game.players.map((p) => ({
		userId: p.userId,
		thinks: game.thinks.filter((t, ply): t is number => ply % 2 === p.parity && t !== undefined),
	}));
}).filter((side) => side.thinks.length >= MIN_MOVES); // prettier-ignore

const flaggedPerPlayer = new Map<number, number>();
for (const side of sides.filter((s) => isFlat(s.thinks))) flaggedPerPlayer.set(side.userId, (flaggedPerPlayer.get(side.userId) ?? 0) + 1); // prettier-ignore
const flagged = [...flaggedPerPlayer.values()].reduce((sum, n) => sum + n, 0);
console.log(`${sides.length} honest rated player-games of ${MIN_MOVES}+ moves: ${flagged} flagged (${((100 * flagged) / sides.length).toFixed(2)}%), ${flaggedPerPlayer.size} players, most by one player ${Math.max(0, ...flaggedPerPlayer.values())}`); // prettier-ignore

const random = simulate.rng(7);
const normal = (): number => Math.sqrt(-2 * Math.log(random() || 1e-9)) * Math.cos(2 * Math.PI * random()); // prettier-ignore
for (const sigma of SPREADS) {
	for (const share of ENGINE_SHARES) {
		const hits = sides.filter((side) => isFlat(side.thinks.map((t) => (random() < share ? ENGINE_MEDIAN_MS * Math.exp(sigma * normal()) : t)))).length; // prettier-ignore
		console.log(`spread ${sigma}, engine on ${share * 100}% of moves: ${((100 * hits) / sides.length).toFixed(1)}% of games flagged`); // prettier-ignore
	}
}
