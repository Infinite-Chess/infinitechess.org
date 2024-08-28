
import path from 'path';
import fs from 'fs';
import { readFile, writeFile } from '../utility/lockFile.js';
import math1 from './math1.js'

import { writeFile_ensureDirectory } from '../utility/fileUtils.js';

import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @typedef {import('./TypeDefinitions.js').Game} Game */


const statsPath = path.resolve('database/stats.json');
(function ensureStatsFileExists() {
    if (fs.existsSync(statsPath)) return; // Already exists

    const content = JSON.stringify({
        gamesPlayed: {
            byDay: {},
            byMonth: {}
        },
        moveCount: {}
    }, null, 2);
    writeFile_ensureDirectory(statsPath, content);
    console.log("Generated stats file");
})();

const stats = await readFile('database/stats.json', 'Unable to read stats.json on startup.');
// {
//     gamesPlayed: {
//         allTime: {
//             all: 0
//         }
//     }
//     moveCount: {
//         all: 0,
//         classical: 0,
//         month: 0,
//     }
// }

const statlogger = (function() {

    /**
     * 
     * @param {Game} game - The game to log
     * @returns 
     */
    async function logGame(game) {
        if (game == null) return console.error("Cannot log a null game!");

        // Only log the game if atleast 2 moves were played! (resignable)
        // Black-moves-first games are logged if atleast 1 move is played!
        if (game.moves.length < 2) return;

        // What is the current month?
        const month = math1.getCurrentMonth(); // 'yyyy-mm'
        // What is the current day?
        const day = math1.getCurrentDay(); // 'yyyy-mm-dd'
        // What variant was played?
        const variant = game.variant;




        // Now record the number of moves played

        const plyCount = game.moves.length; 
        if (stats.moveCount.all == null) stats.moveCount.all = 0;
        stats.moveCount.all += plyCount;
        if (stats.moveCount[variant] == null) stats.moveCount[variant] = 0;
        stats.moveCount[variant] += plyCount;
        if (stats.moveCount[month] == null) stats.moveCount[month] = 0;
        stats.moveCount[month] += plyCount;




        // Increment the games played today
        if (stats.gamesPlayed.byDay[day] == null) stats.gamesPlayed.byDay[day] = 1;
        else stats.gamesPlayed.byDay[day]++;




        // Atleast 2 moves have been played. Log the game!

        incrementMonthsGamesPlayed(stats.gamesPlayed, 'allTime', variant);
        incrementMonthsGamesPlayed(stats.gamesPlayed.byMonth, month, variant);

        //----------------------------------------------------------

        await saveStats(); // Saves stats in the database.
    }

    function incrementMonthsGamesPlayed(parent, month, variant) { // allTime / yyyy-mm=
        // Does this month's property exist yet?
        if (parent[month] == null) parent[month] = {};

        // Increment this month's all-variants by 1
        if (parent[month].all == null) parent[month].all = 1;
        else parent[month].all++;

        // Increment this month's this variant by 1
        if (parent[month][variant] == null) parent[month][variant] = 1;
        else parent[month][variant]++;
    }

    // Sometimes this causes a file-already-locked error if multiple games are deleted at once.
    async function saveStats() {
        // Async function
        await writeFile(
            path.join(__dirname, '..', '..', '..', 'database', 'stats.json'),
            stats,
            `Failed to lock/write stats.json after logging game! Didn't save the new stats, but it should still be accurate in memory.`
        );
    }

    return Object.freeze({
        logGame
    });
})();

export default statlogger;
