// sandbox/cheat-case-report.ts

/**
 * Renders every open cheat case in the dev database as a static HTML report, derived purely
 * from cheat_cases + cheat_assessments, the way a future admin review page would.
 *
 * Usage: npx tsx sandbox/cheat-case-report.ts [--db=database.db] [--out=sandbox/cheat-case-report.html]
 */

import type { MoveEvidence } from '../src/server/game/cheatdetection/moveEvidence.js';

import fs from 'node:fs';
import Database from 'better-sqlite3';

import gameurl from '../src/shared/chess/util/gameurl.js';

import bettingScore from '../src/server/game/cheatdetection/bettingScore.js';

// Constants -------------------------------------------------------------------

const ORIGIN = 'https://localhost:3443';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const DB_PATH: string = args['db'] ?? 'database.db';
const OUT_PATH: string = args['out'] ?? 'sandbox/cheat-case-report.html';

// Types -----------------------------------------------------------------------

interface GameRow {
	game_id: number;
	updated_at: number;
	evidence: string;
	elo_at_game: number;
	rating_deviation_at_game: number;
	player_number: number;
	score: number | null;
	move_count: number;
	variant: string | null;
	base_time_seconds: number | null;
	increment_seconds: number | null;
	opponent: string | null;
}

// Helpers ---------------------------------------------------------------------

const db = new Database(DB_PATH, { readonly: true });
const { MODEL } = bettingScore;

function esc(s: string): string {
	return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function factor(logRatio: number): string {
	const x = Math.exp(logRatio);
	return x >= 100 ? `×${x.toFixed(0)}` : `×${x.toFixed(2)}`;
}

function date(ms: number): string {
	return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

function result(score: number | null): string {
	return score === 1 ? 'Won' : score === 0 ? 'Lost' : score === 0.5 ? 'Draw' : '—';
}

function moveLabel(ply: number): string {
	return `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '...'}`;
}

function yes(b: boolean): string {
	return b ? '✓' : '';
}

// Report ----------------------------------------------------------------------

function renderCase(user_id: number, opened_at: number): string {
	const username = db.prepare('SELECT username FROM members WHERE user_id = ?').pluck().get(user_id) as string | undefined; // prettier-ignore
	const since = Date.now() - bettingScore.MAX_EVIDENCE_AGE_MS;
	const rows = db
		.prepare(
			`SELECT a.game_id, a.updated_at, a.evidence, p.elo_at_game, p.rating_deviation_at_game, p.player_number, p.score,
				g.move_count, g.variant, g.base_time_seconds, g.increment_seconds,
				(SELECT m.username FROM player_games o LEFT JOIN members m ON m.user_id = o.user_id
					WHERE o.game_id = a.game_id AND o.user_id != a.user_id) AS opponent
			FROM cheat_assessments a
			JOIN player_games p ON p.game_id = a.game_id AND p.user_id = a.user_id
			JOIN games g ON g.game_id = a.game_id
			WHERE a.user_id = ? AND a.updated_at >= ? AND a.outcome = 'analysed'
			ORDER BY a.updated_at`,
		)
		.all(user_id, since) as GameRow[];

	const games = rows.map((row) => {
		const evidence: MoveEvidence[] = JSON.parse(row.evidence);
		const ceiling = bettingScore.skillCeiling(MODEL, row.elo_at_game, row.rating_deviation_at_game);
		const ratios = bettingScore.gameLogRatios(evidence, MODEL, ceiling);
		const moves = evidence.map((move) => ({
			move,
			log: bettingScore.averageLogRatio(bettingScore.gameLogRatios([move], MODEL, ceiling)),
		}));
		return { row, evidence, ratios, moves };
	});

	// The score after each game, as the detector computed it at that point.
	const scoreAfter = games.map((_, i) => bettingScore.bestRunLogScore(games.slice(0, i + 1).map((g) => g.ratios))); // prettier-ignore
	const scoreNow = scoreAfter.at(-1) ?? 0;
	// Where the best run ending with the latest game starts.
	let runStart = games.length - 1;
	{
		let best = -Infinity;
		const sums = MODEL.cheatFractions.map(() => 0);
		for (let s = games.length - 1; s >= 0; s--) {
			games[s]!.ratios.forEach((r, i) => (sums[i]! += r));
			const avg = bettingScore.averageLogRatio(sums);
			if (avg > best) [best, runStart] = [avg, s];
		}
	}

	const timeline = games
		.map((g, i) => {
			const { row } = g;
			const url = ORIGIN + gameurl.getGameUrl(row.game_id);
			const counts = { top: 0, good: 0, miss: 0 };
			for (const m of g.evidence) counts[m.outcome]++;
			const tc = row.base_time_seconds === null ? 'untimed' : `${row.base_time_seconds / 60}+${row.increment_seconds}`; // prettier-ignore
			return `<tr class="${i >= runStart ? 'run' : ''}">
				<td>${i + 1}</td><td>${date(row.updated_at)}</td>
				<td><a href="${url}">${esc(url)}</a></td>
				<td>${esc(row.variant ?? 'custom')} ${tc}</td>
				<td>${row.player_number === 1 ? 'White' : 'Black'} vs ${esc(row.opponent ?? '?')}</td>
				<td>${result(row.score)}</td>
				<td>${Math.round(row.elo_at_game)} ± ${Math.round(row.rating_deviation_at_game)}</td>
				<td>${row.move_count}</td>
				<td>${g.evidence.length} <span class="dim">(${counts.top} top · ${counts.good} good · ${counts.miss} miss)</span></td>
				<td class="num">${factor(bettingScore.averageLogRatio(g.ratios))}</td>
				<td class="num">${factor(scoreAfter[i]!)}</td>
			</tr>`;
		})
		.join('');

	const perGame = games
		.map((g, i) => {
			const trs = g.moves
				.map(({ move: m, log }) => {
					const d = m.difficulty;
					return `<tr>
						<td>${moveLabel(m.ply)} <span class="dim">(ply ${m.ply})</span></td>
						<td class="${m.outcome}">${m.outcome}</td>
						<td class="num">${factor(log)}</td>
						<td>${d.goodMoves}</td><td>${yes(d.shallowFinds)}</td><td>${yes(d.deepFind)}</td>
						<td>${yes(d.forcingGoodMove)}</td><td>${yes(d.bestCaptures)}</td><td>${yes(d.inCheck)}</td>
						<td class="num">${(d.opponentBlunder * 100).toFixed(1)}%</td>
						<td class="num">${d.imbalance.toFixed(2)}</td>
					</tr>`;
				})
				.join('');
			const url = ORIGIN + gameurl.getGameUrl(g.row.game_id);
			return `<h3>Game ${i + 1} · <a href="${url}">${esc(url)}</a> · ${factor(bettingScore.averageLogRatio(g.ratios))}</h3>
				<table><thead><tr><th>Move</th><th>Outcome</th><th>Suspicion</th><th>Good moves</th><th>Shallow finds</th>
				<th>Deep find</th><th>Forcing good</th><th>Best captures</th><th>In check</th><th>Opp. blunder</th><th>Imbalance</th></tr></thead>
				<tbody>${trs || '<tr><td colspan="11" class="dim">No scored moves</td></tr>'}</tbody></table>`;
		})
		.join('');

	return `<section>
		<h2>${esc(username ?? `user ${user_id}`)} <span class="dim">(user ${user_id})</span></h2>
		<p>Opened ${date(opened_at)} · Score now <b>${factor(scoreNow)}</b> (line ×1000) ·
		Best run: games ${runStart + 1}–${games.length} of ${games.length} in the last 6 months</p>
		<h3>Games</h3>
		<table><thead><tr><th>#</th><th>Assessed</th><th>Game</th><th>Variant</th><th>Side</th><th>Result</th>
		<th>Rating going in</th><th>Plies</th><th>Scored moves</th><th>Game ratio</th><th>Score after</th></tr></thead>
		<tbody>${timeline}</tbody></table>
		<h3 class="dim">Every scored move per game, in game order</h3>
		${perGame}
	</section>`;
}

// Main ------------------------------------------------------------------------

const cases = db.prepare('SELECT user_id, opened_at FROM cheat_cases ORDER BY opened_at').all() as { user_id: number; opened_at: number }[]; // prettier-ignore
const body = cases.length ? cases.map((c) => renderCase(c.user_id, c.opened_at)).join('<hr>') : '<p>No open cases.</p>';

fs.writeFileSync(
	OUT_PATH,
	`<!doctype html><html><head><meta charset="utf-8"><title>Cheat cases</title><style>
	:root { color-scheme: light dark; --bg: #fff; --fg: #1b1b1b; --dim: #777; --line: #ddd; --run: #fff4d6; }
	@media (prefers-color-scheme: dark) { :root { --bg: #161616; --fg: #e8e8e8; --dim: #888; --line: #333; --run: #3a3220; } }
	body { background: var(--bg); color: var(--fg); font: 14px/1.4 system-ui, sans-serif; margin: 24px; }
	table { border-collapse: collapse; margin-bottom: 20px; }
	th, td { border-bottom: 1px solid var(--line); padding: 4px 10px; text-align: left; white-space: nowrap; }
	th { font-weight: 600; font-size: 12px; }
	.num { text-align: right; font-variant-numeric: tabular-nums; }
	.dim { color: var(--dim); font-weight: normal; }
	tr.run { background: var(--run); }
	.top { color: #c0392b; font-weight: 600; } .good { color: #d68910; } .miss { color: var(--dim); }
	a { color: inherit; }
	</style></head><body><h1>Open cheat cases</h1><p class="dim">Highlighted rows: the run of games behind the current score.</p>${body}</body></html>`,
);
console.log(`${cases.length} case(s) → ${OUT_PATH}`);
