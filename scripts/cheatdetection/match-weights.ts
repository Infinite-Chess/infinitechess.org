// scripts/cheatdetection/match-weights.ts

/**
 * The honest side of an analysis match, by ply: how often a rated game's position at each ply was
 * already reached in one of the same player's earlier games, which they could be reviewing. Replays
 * every game of every rated player, keying positions as live games do, and checks the shipped match
 * weight against each bin: its assumed honest share, 1 / weight at the bin's first ply, must cover
 * the measured one. Positions past every repeat bound the weight's cap by the rule of three.
 *
 * Usage: npx tsx scripts/cheatdetection/match-weights.ts --snapshot=<path>
 */

import timeutil from '../../src/shared/util/timeutil.js';
import movepiece from '../../src/shared/chess/logic/movepiece.js';
import gamerules from '../../src/shared/chess/util/gamerules.js';
import positionkey from '../../src/shared/chess/logic/positionkey.js';

import gameReplay from '../../src/server/game/cheatdetection/gameReplay.js';
import bettingScore from '../../src/server/game/cheatdetection/bettingScore.js';

import snapshot from './lib/snapshot.js';

// Constants -------------------------------------------------------------------

/** The first ply of each bin the shares are reported in; the last runs to the end of the game. */
const BINS = [0, 2, 4, 6, 8, 10, 12, 16, 20];
/** Zero repeats in N positions bound the honest rate at about this over N (the rule of three). */
const RULE_OF_THREE = 3;

// Replay ----------------------------------------------------------------------

/** Each position's key, by ply, as a live game keys it; undefined if the game can't be replayed. */
async function keysOf(icn: string): Promise<string[] | undefined> {
	try {
		const { longformat, gamefile } = await gameReplay.loadAtStart(icn);
		const moves = longformat.moves ?? [];
		const keys: string[] = [];
		for (let ply = 0; ply <= moves.length; ply++) {
			const sideToMove = gamerules.getWhosTurnAtMoveIndex(gamefile.gameRules, ply - 1);
			keys.push(positionkey.of(gamefile.pieces, sideToMove));
			if (ply < moves.length) movepiece.calculateAndMakeMove(gamefile, moves[ply]!);
		}
		return keys;
	} catch {
		return undefined; // A game whose stored moves no longer replay, e.g. an old unvalidated one.
	}
}

// Bins ------------------------------------------------------------------------

/** The index of the bin `ply` falls in. */
function binOf(ply: number): number {
	return BINS.findLastIndex((first) => ply >= first);
}

// Main ------------------------------------------------------------------------

const seats = snapshot.ratedPlayersSeats();
const timeOf = new Map(seats.map((s) => [s.game_id, timeutil.sqliteToTimestamp(s.date)]));
const keys = new Map<number, string[]>();
for (const { game_id, icn } of seats) {
	if (keys.has(game_id)) continue;
	const gameKeys = await keysOf(icn);
	if (gameKeys) keys.set(game_id, gameKeys);
}
const unreplayable = timeOf.size - keys.size;

/** Each player's replayable games, oldest first. */
const historyOf = new Map<number, number[]>();
for (const { user_id, game_id } of seats) {
	if (!keys.has(game_id)) continue;
	const history = historyOf.get(user_id) ?? [];
	history.push(game_id);
	historyOf.set(user_id, history);
}
for (const history of historyOf.values()) history.sort((a, b) => timeOf.get(a)! - timeOf.get(b)!);

const tally = BINS.map(() => ({ positions: 0, repeats: 0 }));
for (const { user_id, game_id, rated, termination } of seats) {
	const gameKeys = keys.get(game_id);
	if (!rated || termination === 'aborted' || !gameKeys) continue;
	const at = timeOf.get(game_id)!;
	const earlier = historyOf.get(user_id)!.filter((id) => timeOf.get(id)! < at);
	const seen = new Set(earlier.flatMap((id) => keys.get(id)!));
	gameKeys.forEach((key, ply) => {
		const bin = tally[binOf(ply)]!;
		bin.positions++;
		if (seen.has(key)) bin.repeats++;
	});
}

console.log(`${keys.size} games replayed (${unreplayable} couldn't be), of ${historyOf.size} rated players`); // prettier-ignore
console.log('plies    positions  already reached  shipped weight assumes  covered');
tally.forEach(({ positions, repeats }, i) => {
	const first = BINS[i]!;
	const label = i + 1 < BINS.length ? `${first}–${BINS[i + 1]! - 1}` : `${first}+`;
	const share = repeats / positions;
	const assumed = 1 / bettingScore.matchWeight(first);
	console.log(`${label.padEnd(7)}  ${String(positions).padStart(9)}  ${`${(100 * share).toFixed(3)}%`.padStart(15)}  ${`${(100 * assumed).toFixed(3)}%`.padStart(22)}  ${share <= assumed ? 'yes' : 'NO'}`); // prettier-ignore
});

const lastRepeat = tally.findLastIndex((bin) => bin.repeats > 0);
const unrepeated = tally.slice(lastRepeat + 1).reduce((sum, bin) => sum + bin.positions, 0);
const cap = bettingScore.matchWeight(Infinity);
console.log(`${unrepeated} positions from ply ${BINS[lastRepeat + 1] ?? '-'} never repeated: they back a cap up to ×${Math.round(unrepeated / RULE_OF_THREE)} (shipped ×${cap})`); // prettier-ignore
