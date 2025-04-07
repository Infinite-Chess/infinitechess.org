/**
 * This script logs all completed games into the "games" database table
 * It also computes the players' ratings in rated games and logs them into the "ratings" table
 * It also updates the players' stats in the "players_stats" table
*/

import { addGameToGamesTable } from '../../database/gamesManager.js';
import { getPlayerStatsData, updatePlayerStatsColumns } from "../../database/playerStatsManager.js";
import jsutil from '../../../client/scripts/esm/util/jsutil.js';
// @ts-ignore
import formatconverter from '../../../client/scripts/esm/chess/logic/formatconverter.js';
// @ts-ignore
import { getTranslation } from '../../utility/translate.js';
// @ts-ignore
import { logEvents } from '../../middleware/logEvents.js';
// @ts-ignore
import gameutility from './gameutility.js';
// @ts-ignore
import timeutil from '../../../client/scripts/esm/util/timeutil.js';
// @ts-ignore
import { getMemberDataByCriteria } from "../../database/memberManager.js";

/**
 * Type Definitions
*/

// @ts-ignore
import type { Game } from '../TypeDefinitions.js';

/**
 * Logs a completed game to the database
 * Updates the tables "games", "player_stats" and "ratings" (computing the rating changes if necessary).
 * Only call after the game ends, and when it's being deleted.
 * 
 * Async so that the server can wait for logs to finish when
 * the server is restarting/closing.
 * @param {Game} game - The game to log
 */
async function logGame(game: Game) {
	if (game.moves.length === 0) return; // Don't log games with zero moves

	/**
     * We need to prime the gamefile for the format converter to get the ICN.
     * What values do we need?
     * 
     * metadata
     * turn
     * enpassant
     * moveRule
     * fullMove
     * startingPosition (can pass in shortformat string instead)
     * specialRights
     * moves
     * gameRules
     */
	const gameRules = jsutil.deepCopyObject(game.gameRules);
	const metadata = gameutility.getMetadataOfGame(game);
	const moveRule = gameRules.moveRule ? `0/${gameRules.moveRule}` : undefined;
	delete gameRules.moveRule;
	metadata.Variant = getTranslation(`play.play-menu.${game.variant}`); // Only now translate it after variant.js has gotten the game rules.
	const primedGamefile = {
		metadata,
		moveRule,
		fullMove: 1,
		moves: game.moves,
		gameRules
	};

	let ICN = 'ICN UNAVAILABLE';
	try {
		ICN = formatconverter.LongToShort_Format(primedGamefile, { compact_moves: 1, make_new_lines: false, specifyPosition: false });
	} catch (error: unknown) {
		const stack = error instanceof Error ? error.stack : String(error);
		const errText = `Error when logging game and converting to ICN! The primed gamefile:\n${JSON.stringify(primedGamefile)}\n${stack}`;
		await logEvents(errText, 'errLog.txt', { print: true });
		await logEvents(errText, 'hackLog.txt', { print: true });
	}

	// Get the user_ids and construct the playersString for the games table
	const user_ids: { [key: string] : number } = {};
	let playersString: string = '';
	for (const player_key in game.players) {
		const player_username = game.players[player_key].identifier.member ?? undefined;
		if (player_username !== undefined) {
			const { user_id } = getMemberDataByCriteria(['user_id'], 'username', player_username, { skipErrorLogging: true });
			if (user_id !== undefined) user_ids[player_key] = user_id;
		}
		
		if (playersString !== '') playersString += ',';
		if (user_ids[player_key]) playersString += user_ids[player_key];
		else playersString += '_';
	}

	// Get the eloString and rating_diffString for the games table
	let eloString: string | null = null;
	let rating_diffString: string | null = null;
	if (game.rated) {
		// TODO: get ELOs of players from database
		eloString = '1000,1000';
		rating_diffString = '0,0';
	}

	// Convert the Date of the game to Sqlite string
	const dateSqliteString = timeutil.timestampToSqlite(game.timeCreated) as string;

	const gameToLog = {
		date: dateSqliteString,
		players: playersString,
		elo: eloString,
		rating_diff: rating_diffString,
		time_control: game.clock as string,
		variant: game.variant as string,
		rated: (game.rated ? 1 : 0),
		private: (game.publicity !== 'public' ? 1 : 0),
		result: metadata.Result as string,
		termination: metadata.Termination as string,
		movecount: (game.moves?.length ?? 0),
		icn: ICN
	};

	// Add game to games table in database
	const out = addGameToGamesTable(gameToLog);
	if (!out.success) return;
	const game_id = out.game_id;

	// update player_stats entries for each logged in player
	const winner = game.gameConclusion.split(" ")[0];
	// What if game aborted?
	// TODO: add to "game_count_aborted"

	for (const player_key in game.players) {
		if (user_ids[player_key] === undefined) continue;

		const outcomeString = (winner === player_key ? "wins" : (winner === '0' ? "draws" : "losses"));
		const publicityString = (game.publicity === 'public' ? "public" : "private");
		const ratedString = (game.rated ? "rated" : "casual");

		const read_and_modify_columns = ["game_history", "moves_played"];
		const read_and_increment_columns = [ "game_count", `game_count_${ratedString}`, `game_count_${publicityString}`,
											 `game_count_${outcomeString}`, `game_count_${outcomeString}_${ratedString}`];
		const read_columns = read_and_modify_columns.concat(read_and_increment_columns);
		const player_stats = getPlayerStatsData(user_ids[player_key], read_columns);
		if (player_stats === undefined) continue;

		// Update last_played_rated_game date
		if (game.rated) player_stats.last_played_rated_game = dateSqliteString;

		// Update game history string
		if (player_stats["game_history"] !== undefined) {
			if (player_stats["game_history"] === '') player_stats["game_history"] = `${game_id}`;
			else player_stats["game_history"] += `,${game_id}`;
		}

		// Update moves_played
		// TODO
		
		// Update increment counts
		for (const column of read_and_increment_columns) {
			// @ts-ignore
			if (player_stats[column] !== undefined) player_stats[column]++;
		}

		// Push changed player_stats to database
		updatePlayerStatsColumns(user_ids[player_key], player_stats);
	}
}



export default {
	logGame
};