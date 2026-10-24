// scripts/cheatdetection/reconstruct-rd.ts

/**
 * Reconstructs every player's rating deviation going into every rated game, which prod's
 * player_games doesn't store, by replaying them in finishing order through the site's own Glicko-1
 * code. Checks the replay against the stored ratings, and writes { "<gameId>/<userId>": rd } to
 * rd.json.
 *
 * Usage: npx tsx scripts/cheatdetection/reconstruct-rd.ts --snapshot=<path>
 */

import type { GameRow } from './lib/snapshot.js';
import type { RatingData } from '../../src/server/utility/ratingCalculation.js';

import { writeFileSync } from 'node:fs';

import timeutil from '../../src/shared/util/timeutil.js';

import ratingCalculation from '../../src/server/utility/ratingCalculation.js';

import corpus from './lib/corpus.js';
import snapshot from './lib/snapshot.js';

// Types -----------------------------------------------------------------------

/** A player's standing on one leaderboard. */
interface Standing {
	elo: number;
	rd: number;
	/** When their RD was last updated, as SQLite; null before their first rated game. */
	last: string | null;
}

// Replay ----------------------------------------------------------------------

/** When a game finished, epoch ms. */
function finish(game: GameRow): number {
	return timeutil.sqliteToTimestamp(game.date) + (game.time_duration_millis ?? 0);
}

const games = snapshot.ratedGames().sort((a, b) => finish(a) - finish(b));
const standings = new Map<string, Standing>();
const rds: Record<string, number> = {};
let checked = 0;
let maxError = 0;
for (const game of games) {
	const players = snapshot.players(game.game_id);
	if (players.length !== 2) continue;
	const ratingData: RatingData = {};
	for (const p of players) {
		const key = `${p.user_id}/${game.leaderboard_id}`;
		const standing = standings.get(key) ?? { elo: ratingCalculation.DEFAULT_LEADERBOARD_ELO, rd: ratingCalculation.DEFAULT_LEADERBOARD_RD, last: null }; // prettier-ignore
		standings.set(key, standing);
		ratingData[p.player_number] = { elo_at_game: standing.elo, rating_deviation_at_game: standing.rd, rd_last_update_date: standing.last }; // prettier-ignore
		rds[`${game.game_id}/${p.user_id}`] = ratingCalculation.getTrueRD(standing.rd, standing.last, finish(game)); // prettier-ignore
	}
	if (players.some((p) => p.score === null)) continue;

	// As the game was logged: at its end.
	const white = players.find((p) => p.player_number === 1)!;
	ratingCalculation.computeChanges(ratingData, white.score === 1 ? 1 : white.score === 0 ? 2 : null, finish(game)); // prettier-ignore

	for (const p of players) {
		const data = ratingData[p.player_number]!;
		if (p.elo_change_from_game !== null) {
			maxError = Math.max(
				maxError,
				Math.abs(p.elo_change_from_game - data.elo_change_from_game!),
			);
			checked++;
		}
		standings.set(`${p.user_id}/${game.leaderboard_id}`, { elo: data.elo_after_game!, rd: data.rating_deviation_after_game!, last: timeutil.timestampToSqlite(finish(game)) }); // prettier-ignore
	}
}

writeFileSync(corpus.file('rd.json'), JSON.stringify(rds));
console.log(`${games.length} rated games replayed; ${checked} stored rating changes reproduced within ${maxError.toFixed(4)}`); // prettier-ignore
