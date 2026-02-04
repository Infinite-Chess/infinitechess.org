// src/server/game/statlogger.ts

import fs from 'fs';
import path from 'path';
import 'dotenv/config'; // Imports all properties of process.env, if it exists
import { fileURLToPath } from 'node:url';

import timeutil from '../../shared/util/timeutil.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import { readFile, writeFile } from '../utility/lockFile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import type { Game } from '../../shared/chess/logic/gamefile.js';

const statsPath = path.resolve('database/stats.json');
(function ensureStatsFileExists(): void {
	if (fs.existsSync(statsPath)) return; // Already exists

	const content = JSON.stringify(
		{
			gamesPlayed: {
				byDay: {},
				byMonth: {},
			},
			moveCount: {},
		},
		null,
		2,
	);

	fs.mkdirSync(path.dirname(statsPath), { recursive: true });
	fs.writeFileSync(statsPath, content);

	console.log('Generated stats file');
})();

let stats: {
	moveCount: Record<string, number>;
	gamesPlayed: {
		byDay: Record<string, number>;
		byMonth: Record<string, Record<string, number>>;
		allTime: Record<string, number>;
	};
};
try {
	stats = await readFile('database/stats.json');
} catch (error: unknown) {
	if (process.env['VITEST']) {
		console.warn('Mocking stats.json for test environment');
		stats = {
			moveCount: {},
			gamesPlayed: {
				byDay: {},
				byMonth: {},
				allTime: {},
			},
		};
	} else {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error('Unable to read stats.json on startup: ' + message);
	}
}

/**
 * Saves and increments the stats for the played variant
 * @param basegame - The game to log
 * @returns
 */
async function logGame(basegame: Game): Promise<void> {
	if (!basegame) return console.error('Cannot log a null game!');

	// Only log the game if at least 2 moves were played! (resignable)
	// Black-moves-first games are logged if at least 1 move is played!
	if (basegame.moves.length < 2) return;

	// What is the current month?
	const month = timeutil.getCurrentMonth(); // 'yyyy-mm'
	// What is the current day?
	const day = timeutil.getCurrentDay(); // 'yyyy-mm-dd'
	// What variant was played?
	const variant = basegame.metadata.Variant!;

	// Now record the number of moves played

	const plyCount = basegame.moves.length;
	if (stats.moveCount['all'] === undefined) stats.moveCount['all'] = 0;
	stats.moveCount['all'] += plyCount;
	if (stats.moveCount[variant] === undefined) stats.moveCount[variant] = 0;
	stats.moveCount[variant] += plyCount;
	if (stats.moveCount[month] === undefined) stats.moveCount[month] = 0;
	stats.moveCount[month] += plyCount;

	// Increment the games played today
	if (stats.gamesPlayed.byDay[day] === undefined) stats.gamesPlayed.byDay[day] = 1;
	else stats.gamesPlayed.byDay[day]++;

	// @ts-ignore
	incrementMonthsGamesPlayed(stats.gamesPlayed, 'allTime', variant);
	incrementMonthsGamesPlayed(stats.gamesPlayed.byMonth, month, variant);

	//----------------------------------------------------------

	await saveStats(); // Saves stats in the database.
}

function incrementMonthsGamesPlayed(
	parent: Record<string, Record<string, number>>,
	month: string,
	variant: string,
): void {
	// allTime / yyyy-mm=
	// Does this month's property exist yet?
	if (parent[month] === undefined) parent[month] = {};

	// Increment this month's all-variants by 1
	if (parent[month]['all'] === undefined) parent[month]['all'] = 1;
	else parent[month]['all']++;

	// Increment this month's this variant by 1
	if (parent[month][variant] === undefined) parent[month][variant] = 1;
	else parent[month][variant]++;
}

// Sometimes this causes a file-already-locked error if multiple games are deleted at once.
async function saveStats(): Promise<void> {
	// Async function
	try {
		await writeFile(path.join(__dirname, '..', '..', '..', 'database', 'stats.json'), stats);
	} catch (e) {
		const errMsg =
			`Failed to lock/write stats.json after logging game! Didn't save the new stats, but it should still be accurate in memory.` +
			(e instanceof Error ? e.message : String(e));
		logEventsAndPrint(errMsg, 'errLog.txt');
	}
}

export default {
	logGame,
};
