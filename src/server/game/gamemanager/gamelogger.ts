
/**
 * This script logs all completed games into the "games" database table
 * It also computes the players' ratings in rated games and logs them into the "ratings" table
 * It also updates the players' stats in the "players_stats" table
 */

import { addGameToGamesTable } from '../../database/gamesManager.js';
import { getPlayerStatsData, updatePlayerStatsColumns } from "../../database/playerStatsManager.js";
import jsutil from '../../../client/scripts/esm/util/jsutil.js';
import { PlayerGroup, players, type Player } from '../../../client/scripts/esm/chess/util/typeutil.js';
import { VariantLeaderboards } from '../../database/leaderboardsManager.js';
import { addGameToPlayerGamesTable } from '../../database/playerGamesManager.js';
// @ts-ignore
import winconutil from '../../../client/scripts/esm/chess/util/winconutil.js';
// @ts-ignore
import formatconverter from '../../../client/scripts/esm/chess/logic/formatconverter.js';
// @ts-ignore
import { logEvents } from '../../middleware/logEvents.js';
// @ts-ignore
import gameutility from './gameutility.js';
// @ts-ignore
import timeutil from '../../../client/scripts/esm/util/timeutil.js';


import type { MetaData } from '../../../client/scripts/esm/chess/util/metadata.js';
import type { FormatConverterLong } from '../../../client/scripts/esm/game/chess/gameformulator.js';
// @ts-ignore
import type { Game } from '../TypeDefinitions.js';


// Functions -------------------------------------------------------------------------------


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
	const movecount = game.moves.length; // Moves is a required property of game
	if (movecount === 0) return; // Don't log games with zero moves

	// Convert the Date of the game to Sqlite string
	const dateSqliteString = timeutil.timestampToSqlite(game.timeCreated);

	// 1. Enter the game into the games table
	const results = await enterGameInGamesTable(game, dateSqliteString);
	if (results.success === false) { // Failure to log game into database and update player stats
		await logEvents('Failed to log game. Check unloggedGames log. Not incrementing player stats either.', 'errLog.txt', { print: true });
		await logEvents(results.reason, 'unloggedGames.txt'); // Log into a separate log
		return;
	}

	// 2. Update the leaderboards table
	const victor: Player | undefined = winconutil.getVictorAndConditionFromGameConclusion(game.gameConclusion).victor;
	// TODO: Compute rating change in different file and update leaderboard

	// 3. Enter the game into the player_games table
	await updatePlayerGamesTable(game, results.game_id); // TODO: Add support for rated games in here

	// 4. Update the player_stats table
	await updatePlayerStatsTable(game, results.game_id, victor);

}

/** The return result of {@link enterGameInGamesTable} */
type LogGameResult = { success: true; game_id: number } | { success: false; reason: string };

/** Enters a game into the games table */
async function enterGameInGamesTable(game: Game, dateSqliteString: string): Promise<LogGameResult> {

	const metadata = gameutility.getMetadataOfGame(game);
	VerifyRequiredMetadata(metadata); // TEMPORARY!!! DELETE AFTER MIGRATION !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	const ICN = await getICNOfGame(game, metadata);
	if (!ICN) return { success: false, reason: `ICN undefined when logging game, cannot log or increment player stats! Game: ${gameutility.getSimplifiedGameString(game)}` };

	const terminationCode = winconutil.getVictorAndConditionFromGameConclusion(game.gameConclusion).condition;
	const leaderboard_id = (game.rated && VariantLeaderboards[game.variant] !== undefined ? VariantLeaderboards[game.variant]! : null);

	const gameToLog = {
		date: dateSqliteString,
		time_control: game.clock as string,
		variant: game.variant as string,
		rated: (game.rated ? 1 : 0),
		leaderboard_id: leaderboard_id,
		private: (game.publicity !== 'public' ? 1 : 0),
		result: metadata.Result as string,
		termination: terminationCode,
		movecount: game.moves.length,
		icn: ICN
	};

	// Add game to games table in database
	const results = addGameToGamesTable(gameToLog);
	if (!results.success) {
		const extendedReason = `Error when adding game to database: ${results.reason}. The game: ${gameutility.getSimplifiedGameString(game)}. The ICN:\n${ICN}`;
		return { success: false, reason: extendedReason };
	}
	return { success: true, game_id: results.result.lastInsertRowid as number }; // The lastInsertRowid is the id of the game we just inserted
}

/** Converts a server-side {@link Game} into an ICN */
async function getICNOfGame(game: Game, metadata: MetaData): Promise<string | undefined> {
	// We need to prime the gamefile for the format converter to get the ICN of the game.
	const gameRules = jsutil.deepCopyObject(game.gameRules);
	const moveRule = gameRules.moveRule ? `0/${gameRules.moveRule}` : undefined;
	delete gameRules.moveRule;
	const primedGamefile = {
		metadata,
		moveRule,
		fullMove: 1,
		moves: game.moves,
		gameRules
	};

	// Get ICN of game
	let ICN: string | undefined;
	try {
		ICN = formatconverter.LongToShort_Format(primedGamefile as FormatConverterLong, { compact_moves: 2, make_new_lines: false, specifyPosition: false });
	} catch (error: unknown) {
		const stack = error instanceof Error ? error.stack : String(error);
		const errText = `Error when logging game and converting to ICN! The game: ${gameutility.getSimplifiedGameString(game)}. The primed gamefile:\n${JSON.stringify(primedGamefile)}\n${stack}`;
		await logEvents(errText, 'errLog.txt', { print: true });
	}

	return ICN;
}

/**
 * For each member, add an entry into player_games according to the results of this game.
 * If the game was ranked, also update the leaderboards table accordingly.
 */
async function updatePlayerGamesTable(game: Game, game_id: number) {
	for (const playerStr in game.players) {
		const player: Player = Number(playerStr) as Player;
		const user_id = game.players[playerStr].identifier.user_id;
		if (user_id === undefined) continue; // Guest players don't get an entry in the player_games table or an elo for updating

		const elo_at_game = null;
		const elo_change_from_game = null;

		const options = {
			user_id: user_id,
			game_id: game_id,
			player_number: player,
			elo_at_game: elo_at_game,
			elo_change_from_game: elo_change_from_game
		};

		// Add game to player_games table in database
		const results = addGameToPlayerGamesTable(options);
		if (!results.success) {
			await logEvents('Failed to add game to player_games table after game. Check unloggedGames log.', 'errLog.txt', { print: true });
			const errText = `Error when adding game to player_games when logging game: ${results.reason}  Member "${game.players[playerStr].identifier.member}", user_id "${user_id}". Their color: ${playerStr}. Game ID: ${game_id}. The game: ${gameutility.getSimplifiedGameString(game)}`;
			await logEvents(errText, 'unloggedGames.txt');
			continue;
		}
	}
}

/**
 * Update's each member's game stats in the player stats table according to the results of this game.
 * Such as game count, wins, losses, etc.
 */
async function updatePlayerStatsTable(game: Game, game_id: number, victor: Player | undefined) {

	const playerMoveCounts: PlayerGroup<number> = getPlayerMoveCountsInGame(game);

	// update player_stats entries for each logged in player
	for (const playerStr in game.players) {
		const player: Player = Number(playerStr) as Player;
		const user_id = game.players[playerStr].identifier.user_id;
		if (user_id === undefined) continue; // Guest players don't have a row in the player_stats table for updating

		// Construct the names of the columns that need to be accessed from the player_stats table
		const outcomeString = victor === undefined ? 'invalid' : victor === player ? "wins" : victor === players.NEUTRAL ? "draws" : "losses";
		const publicityString = game.publicity;
		const ratedString = (game.rated ? "rated" : "casual");

		const read_and_modify_columns = ["moves_played"];
		const read_and_increment_columns = victor !== undefined ?
											[ "game_count", `game_count_${ratedString}`, `game_count_${publicityString}`,
											  `game_count_${outcomeString}`, `game_count_${outcomeString}_${ratedString}`]
											: [ "game_count", "game_count_aborted"];
		const read_columns = read_and_modify_columns.concat(read_and_increment_columns);

		// Access the player stats
		const player_stats = getPlayerStatsData(user_id, read_columns);
		if (player_stats === undefined) { // This might occur if they ever deleted their account mid-game.
			// console.log(`Not updating stats of deleted member "${game.players[playerStr].identifier.member}" of user_id "${user_id}". Game ID: ${game_id}.`); // UNCOMMENT AFTER MIGRATION
			continue; // Continue updating next player's stats, they may not be deleted.
		}

		// Update moves_played
		player_stats.moves_played! += playerMoveCounts[player]!;

		// Update increment counts
		// @ts-ignore
		for (const column of read_and_increment_columns) player_stats[column]++;

		// Push changed player_stats to database
		const results = updatePlayerStatsColumns(user_id, player_stats);

		if (!results.success) {
			await logEvents('Failed to increment player stats after game. Check unloggedGames log.', 'errLog.txt', { print: true });
			const errText = `Error when UPDATING player stats when logging game: ${results.reason}  Member "${game.players[playerStr].identifier.member}", user_id "${user_id}". Their color: ${playerStr}. Game ID: ${game_id}. The game: ${gameutility.getSimplifiedGameString(game)}`;
			await logEvents(errText, 'unloggedGames.txt');
			continue;
		}
	}
}

/**
 * Counts the number of moves each player has made in the game.
 * 
 * TODO: Move to moveutil script, once its dependancies are healthy!!!
 */
function getPlayerMoveCountsInGame(game: Game): PlayerGroup<number> {
	// Optimized to not require iterating through each move in the list.
	const playerMoveCounts: PlayerGroup<number> = {};
	const fullmoves_completed_total = Math.floor(game.moves.length / game.gameRules.turnOrder.length);
	const last_partial_move_length = game.moves.length % game.gameRules.turnOrder.length;
	for (const playerStr in game.players) {
		const player: Player = Number(playerStr) as Player;
		playerMoveCounts[player] = fullmoves_completed_total * game.gameRules.turnOrder.filter((p : Player) => p === player).length;
		playerMoveCounts[player] += game.gameRules.turnOrder
			.slice(0, last_partial_move_length)
			.filter((p : Player) => p === player).length;
	}
	return playerMoveCounts;
}






// =================== Everything below can be deleted after migration of games ========================







import fs from 'fs';
import readline from 'readline';
import uuid from '../../../client/scripts/esm/util/uuid.js';
/**
 * TEMPORARY FUNCTION
 * This functions opens the file /logs/gameLog.txt, if it exists
 * It reads in all games from that file, and uses them to update the "games" and "player_stats" database tables
 * It assumes that all games are unrated up to now! This will be deprecated after rated games are introduced
 * When it's done, it deletes the file /logs/gameLog.txt
 */
async function migrateGameLogsToDatabase() {
	if (!fs.existsSync('./logs/gameLog.txt')) {
		console.log("File gameLog.txt not found, no migration of games to database is performed.");
		return;
	}	

	// Create a readable stream from the file
	const fileStream = fs.createReadStream('./logs/gameLog.txt');

	fileStream.on('error', (err) => {
		console.error("Accessing file gameLog.txt did not work, no migration of games to database is performed.");
		console.error(err);
	});

	// Create an interface to read the file line by line
	const rl = readline.createInterface({
		input: fileStream,
		crlfDelay: Infinity
	});

	let gamecount = 0;
	let lastread_JSON: { id: string, publicity: 'public' | 'private' };

	rl.on('close', () => {
		console.log(`Finished migrating gameLog.txt with ${gamecount} games to database.`);

		// Delete gameLog.txt
		// DON'T WHILE DEBUGGING
		// fs.unlink('./logs/gameLog.txt', (err) => {
		// 	if (err) {
		// 		console.error('Error gameLog.txt:', err);
		// 		return;
		// 	}
		// 	console.log('gameLog.txt deleted successfully');
		// });
	});

	rl.on('line', async(line) => {
		// line starts with YYYY
		if (/^[0-9]{4}/.test(line)) {
			// parse JSON of infoline
			lastread_JSON = JSON.parse(line.slice(line.indexOf("{")));
		}

		// line contains only whitespaces
		else if (/^\s*$/.test(line)) {
			// do nothing
		}

		// line starts with metadata
		else if (/^\s*\[/.test(line)) {
			const longformat = formatconverter.ShortToLong_Format(line);
			const game: Partial<Game> = {};

			// set all the needed properties of the Game Object, as required in TypeDefinitions.js

			longformat.metadata.Variant = translationToVariant[longformat.metadata.Variant!];

			VerifyRequiredMetadata(longformat.metadata);

			// game.id = lastread_JSON.id; // Not needed?
			game.timeCreated = timeutil.convertUTCDateUTCTimeToTimeStamp(longformat.metadata.UTCDate, longformat.metadata.UTCTime);
			if (lastread_JSON.publicity !== 'public' && lastread_JSON.publicity !== 'private') throw Error(`Publicity "${lastread_JSON.publicity}" not valid!`);
			game.publicity = lastread_JSON.publicity;
			game.variant = longformat.metadata.Variant;
			game.clock = longformat.metadata.TimeControl;
			// Not needed?
			// game.untimed = (longformat.metadata.TimeControl === "-");
			// game.startTimeMillis = Number(longformat.metadata.TimeControl.split("+")[0]) * 1000;
			// game.incrementMillis = Number(longformat.metadata.TimeControl.split("+")[1]);
			game.rated = false;
			game.moves = longformat.moves;

			game.players = { 1: { identifier: {} } , 2: { identifier: {} } };
			if (longformat.metadata.White !== "(Guest)") game.players[1].identifier = { member: longformat.metadata.White, user_id: uuid.base62ToBase10(longformat.metadata.WhiteID!) };
			else game.players[1].identifier = { browser: 'examplebrowserid' };
			if (longformat.metadata.Black !== "(Guest)") game.players[2].identifier = { member: longformat.metadata.Black, user_id: uuid.base62ToBase10(longformat.metadata.BlackID!) };
			else game.players[2].identifier = { browser: 'examplebrowserid' };

			game.gameRules = longformat.gameRules;
			// Pass on the moveRule to the gameRules object
			if (longformat.moveRule) {
				const max = longformat.moveRule.split('/').map(Number)[1]; // The number of plies until termination by moverule
				if (max !== 100) throw Error(`Move rule "${longformat.moveRule}" not valid!`);
				game.gameRules.moveRule = max;
			}

			if (longformat.metadata.Termination === undefined) throw Error(`Termination metadata is undefined!`);
			else if (longformat.metadata.Termination === "Aborted") {
				game.gameConclusion = "aborted";
			} else {
				const winner = longformat.metadata.Result === "1-0" ? String(players.WHITE) : longformat.metadata.Result === "0-1" ? String(players.BLACK) : longformat.metadata.Result === "1/2-1/2" ? String(players.NEUTRAL) : (() => { console.error(`Unexpected result in gameLog.txt: ${longformat.metadata.Result}`); return "unknown"; })();

				// The Termination metadata is NOT the same as the "condition" in the gameConclusion string.
				const condition = terminationToCondition[longformat.metadata.Termination];
				if (condition === undefined) throw Error(`Termination "${longformat.metadata.Termination}" not valid!`);
				game.gameConclusion = `${winner} ${condition}`;
			}

			// game.whosTurn and all the time information is not needed for the logging of the game
			
			// console.log("Game to log: " + gameutility.getSimplifiedGameString(game));
			await logGame(game as Game);
			gamecount++;
		}

		else {
			console.error(`Unexpected line encountered in gameLog.txt: ${line}`);
		}
	});
}

// Dictionary of all the possible game conclusion conditions and their corresponding Termination translation:
const conditionToTermination = {
	"checkmate": "Checkmate",
	"stalemate": "Stalemate",
	"repetition": "Threefold repetition",
	"moverule": "50-move rule",
	"insuffmat": "Insufficient material",
	"royalcapture": "Royal capture",
	"allroyalscaptured": "All royals captured",
	"allpiecescaptured": "All pieces captured",
	// "threecheck": "Three-check", // No longer supported
	"koth": "King of the hill",
	"resignation": "Resignation",
	"agreement": "Agreement",
	"time": "Time forfeit",
	"aborted": "Aborted",
	"disconnect": "Abandoned"
};

const terminationToCondition = jsutil.invertObj(conditionToTermination);


// Dictionary of all the possible game variants and their corresponding english translation:
const variantToTranslation = {
	"Classical": "Classical",
	"Confined_Classical": "Confined Classical",
	"Classical_Plus": "Classical+",
	"CoaIP": "Chess on an Infinite Plane",
	"Pawndard": "Pawndard",
	"Knighted_Chess": "Knighted Chess",
	"Knightline": "Knightline",
	"Core": "Core",
	"Standarch": "Standarch",
	"Pawn_Horde": "Pawn Horde",
	"Space_Classic": "Space Classic",
	"Space": "Space",
	"Obstocean": "Obstocean",
	"Abundance": "Abundance",
	"Amazon_Chandelier": "Amazon Chandelier",
	"Containment": "Containment",
	"Classical_Limit_7": "Classical - Limit 7",
	"CoaIP_Limit_7": "Coaip - Limit 7",
	"Chess": "Chess",
	"Classical_KOTH": "Experimental: Classical - KOTH",
	"CoaIP_KOTH": "Experimental: Coaip - KOTH",
	"CoaIP_HO": "Chess on an Infinite Plane - Huygens Option",
	"Omega": "Showcase: Omega",
	"Omega_Squared": "Showcase: Omega^2",
	"Omega_Cubed": "Showcase: Omega^3",
	"Omega_Fourth": "Showcase: Omega^4",
	"4x4x4x4_Chess": "4×4×4×4 Chess",
	"5D_Chess": "5D Chess"
};

const translationToVariant = jsutil.invertObj(variantToTranslation);

const MetaDataRequiredValues = {
	Variant: ['Classical', 'Confined_Classical', 'Classical_Plus', 'CoaIP', 'CoaIP_HO', 'Knighted_Chess', 'Pawndard', 'Knightline', 'Core', 'Standarch', 'Pawn_Horde', 'Space_Classic', 'Space', 'Obstocean', 'Abundance', 'Chess', '4x4x4x4_Chess', '5D_Chess', 'Omega', 'Omega_Squared', 'Omega_Cubed', 'Omega_Fourth', 'Amazon_Chandelier', 'Containment', 'Classical_Limit_7', 'CoaIP_Limit_7', 'Classical_KOTH', 'CoaIP_KOTH'],
	Result: ['1-0', '0-1', '1/2-1/2', '0-0'],
	Termination: ['Aborted', 'Checkmate', 'Stalemate', 'Threefold repetition', 'Resignation', 'Insufficient material', 'Royal capture', 'All pieces captured', 'King of the hill', 'Time forfeit', 'Agreement', '50-move rule', 'Abandoned'],
	Event: null,
	Site: ['https://www.infinitechess.org/'],
	Round: ['-'],
	UTCDate: null,
	UTCTime: null,
	White: null,
	Black: null,
	TimeControl: null,
};

const MetaDataOptionalValues = {
	WhiteID: null,
	BlackID: null,
};

/**
 * Verifies given metadata is valid:
 * 
 * * Contains all required metadata
 * * Each required metadata is one of the allowed values
 * * No additional metadata is present
 */
function VerifyRequiredMetadata(metadata: MetaData) {
	// Make sure all required metadata is present.
	// And for each of them, make sure they're one of the allowed values.
	for (const key in MetaDataRequiredValues) {
		// @ts-ignore
		const Meta = MetaDataRequiredValues[key];
		// Make sure it's present
		// @ts-ignore
		if (metadata[key] === undefined) {
			console.log(`Missing metadata: ${key}`);
			return false;
		}
		// Make sure it's one of the allowed values, if there is a list of allowed values.
		// @ts-ignore
		if (Meta && !Meta.includes(metadata[key])) {
			// @ts-ignore
			console.log(`Invalid metadata: ${key} = ${metadata[key]}`);
			return false;
		}
	}
	// Make sure no additional metadata is present.
	for (const key in metadata) {
		// @ts-ignore
		if (MetaDataRequiredValues[key] === undefined && MetaDataOptionalValues[key] === undefined) {
			// @ts-ignore
			console.log(`Depricated metadata: ${key} = ${metadata[key]}`);
			return false;
		}
	}
	// Make sure if White/Black is present, that WhiteID/BlackID is also present
	if (metadata.White !== "(Guest)" && !metadata.WhiteID) console.log(`WhiteID is missing, but White is present! ${metadata.White}`);
	if (metadata.Black !== "(Guest)" && !metadata.BlackID) console.log(`BlackID is missing, but Black is present! ${metadata.Black}`);
	if (metadata.WhiteID && metadata.White === "(Guest)") console.log(`White is missing, but WhiteID is present! ${metadata.WhiteID}`);
	if (metadata.BlackID && metadata.Black === "(Guest)") console.log(`Black is missing, but BlackID is present! ${metadata.BlackID}`);
	// Make sure specifically TimeControl isn't in m+s, but s+s format
	if (metadata.TimeControl === '10+4' || metadata.TimeControl === '10+6') console.log(`Time control "${metadata.TimeControl}" not valid! Should be in s+s format.`);

	return true;
}


export default {
	logGame,
	migrateGameLogsToDatabase
};