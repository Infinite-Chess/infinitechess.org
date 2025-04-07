/**
 * This script logs all completed games into the games database table
*/

import { addGameToGamesTable } from '../../database/gamesManager.js';
import jsutil from '../../../client/scripts/esm/util/jsutil.js';
// @ts-ignore
import formatconverter from '../../../client/scripts/esm/chess/logic/formatconverter.js';
// @ts-ignore
import { getTranslation } from '../../utility/translate.js';
// @ts-ignore
import { logEvents } from '../../middleware/logEvents.js';
// @ts-ignore
import { getMetadataOfGame } from './gameutility.js';
// @ts-ignore
import timeutil from '../../../client/scripts/esm/chess/util/timeutil.js';

/**
 * Type Definitions
*/

// @ts-ignore
import type { Game } from '../TypeDefinitions.js';

/**
 * Logs the game to the database
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
	const metadata = getMetadataOfGame(game);
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

	// Get the playerString for the games table
	let playersString: string = '';
	for (const player_key in game.players) {
		if (playersString !== '') playersString += ',';

		const player_username = game.players[player_key].identifier.member ?? undefined;
		if (player_username !== undefined) playersString += player_username;
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

	const gameToLog = {
		date: timeutil.timestampToSqlite(game.timeCreated) as string,
		players: playersString,
		elo: eloString,
		rating_diff: rating_diffString,
		time_control: game.clock as string,
		variant: game.variant as string,
		rated: game.rated,
		private: (game.publicity !== 'public'),
		result: metadata.Result as string,
		termination: metadata.Termination as string,
		movecount: (game.moves?.length ?? 0),
		icn: ICN
	};

	addGameToGamesTable(gameToLog);
}



export default {
	logGame
};