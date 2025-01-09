
/**
 * This script loads and unloads gamefiles, not only handling the logic stuff,
 * but also initiating and opening the gui elements for the game,
 * such as the navigation and gameinfo bars.
 */

// @ts-ignore
import timeutil from "../../util/timeutil.js";
// @ts-ignore
import guiclock from "../gui/guiclock.js";
// @ts-ignore
import guigameinfo from "../gui/guigameinfo.js";
// @ts-ignore
import guinavigation from "../gui/guinavigation.js";
// @ts-ignore
import sound from '../misc/sound.js';
// @ts-ignore
import onlinegame from "../misc/onlinegame.js";
import gameslot from "./gameslot.js";


// @ts-ignore
import type { GameRules } from "../../chess/variants/gamerules.js";
import type { MetaData } from "../../chess/util/metadata.js";



/**
 * Starts a game according to the options provided.
 * @param {Object} gameOptions - An object that contains the properties `metadata`, `moves`, `gameConclusion`, `variantOptions`, `clockValues`
 * @param {boolean} fromWhitePerspective - True if the game should be loaded from white's perspective, false for black's perspective
 * @param {boolean} allowEditCoords - Whether the loaded game should allow you to edit your coords directly
 */
async function loadGame(
	gameOptions: {
		metadata: MetaData,
		/** Should be provided if we're rejoining an online game. */
		clockValues?: {
			timerWhite: number,
			timerBlack: number,
			accountForPing: boolean
		},
		/** Should be provided if we're rejoining an online game. */
		gameConclusion?: string | false,
		/**
		 * This will be a string array of all the moves played thus far, in the most compact notation (e.g. `["5,2>5,4", ...]`)
		 * 
		 * Should be provided if we're pasting a game, or rejoining an online game.
		 */
		moves?: string[],
		/**
		 * Provide to load a custom variant game, or a normal variant where moves have been played,
		 * instead of starting the variant that is specified in the metadata.
		 * 
		 * Should be provided if we're pasting a game, or rejoining a custom online private game.
		 */
		variantOptions?: {
			fullMove: number,
			gameRules: GameRules,
			/** If the move ruleRule gamerule is present, this is a string of its current state and the move rule number (e.g. `"0/100"`) */
			moveRule?: string,
			/** A position in ICN notation (e.g. `"P1,2+|P2,2+|..."`) */
			positionString: string,
			/**
			 * The starting position object, containing the pieces organized by key.
			 * The key of the object is the coordinates of the piece as a string,
			 * and the value is the type of piece on that coordinate (e.g. `"pawnsW"`)
			 */
			startingPosition: { [coordsKey: string]: string }
			/** The special rights object of the gamefile at the starting position provided, NOT after the moves provided have been played. */
			specialRights: { [coordsKey: string]: true },
		},
	},
	fromWhitePerspective: boolean,
	allowEditCoords: boolean
) {
	// console.log("Loading game with game options:");
	// console.log(gameOptions);

	// If the date is not already specified, set that here.
	gameOptions.metadata['UTCDate'] = gameOptions.metadata['UTCDate'] || timeutil.getCurrentUTCDate();
	gameOptions.metadata['UTCTime'] = gameOptions.metadata['UTCTime'] || timeutil.getCurrentUTCTime();

	await gameslot.loadGamefile(gameOptions.metadata, fromWhitePerspective, { // Pass in the pre-existing moves
		moves: gameOptions.moves,
		variantOptions: gameOptions.variantOptions,
		gameConclusion: gameOptions.gameConclusion,
		clockValues: gameOptions.clockValues
	});
	
	const gamefile = gameslot.getGamefile()!;
	guinavigation.open(gamefile, { allowEditCoords }); // Editing your coords allowed in local games
	guiclock.set(gamefile);
	guigameinfo.updateWhosTurn(gamefile);
    
	sound.playSound_gamestart();
}

function unloadGame() {
	onlinegame.closeOnlineGame();
	guinavigation.close();
	gameslot.unloadGame();
}


export default {
	loadGame,
	unloadGame,
};