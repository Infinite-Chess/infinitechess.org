

import { MetaData } from '../../chess/util/metadata.js';


import gamefileutility from '../../chess/util/gamefileutility.js';
import gameslot from '../chess/gameslot.js';
// @ts-ignore
import onlinegame from '../misc/onlinegame/onlinegame.js';
// @ts-ignore
import winconutil from '../../chess/util/winconutil.js';
// @ts-ignore
import camera from '../rendering/camera.js';



/** 
 * Type Definitions 
 * @typedef {import('../../chess/logic/gamefile.js').gamefile} gamefile
*/

"use strict";

/**
 * This script handles the game info bar, during a game,
 * displaying the clocks, and whos turn it currently is.
 */

// Variables

const element_gameInfoBar = document.getElementById('game-info-bar')!;

const element_whosturn = document.getElementById('whosturn')!;
const element_dot = document.getElementById('dot')!;
const element_playerWhite = document.getElementById('playerwhite')!;
const element_playerBlack = document.getElementById('playerblack')!;

let isOpen = false;

// Functions

/**
 * 
 * @param metadata - The metadata of the gamefile, with its respective White and Black player names.
 */
function open(metadata: MetaData) {
	const { white, black } = getPlayerNamesForGame(metadata);

	element_playerWhite.textContent = white;
	element_playerBlack.textContent = black;
	updateWhosTurn();
	element_gameInfoBar.classList.remove('hidden');
	isOpen = true;
}

function close() {
	// Restore the player names to original content
	element_playerWhite.textContent = '';
	element_playerBlack.textContent = '';
	// revealPlayerNames();
	// Restore the whosturn marker to original content
	element_whosturn.textContent = '';
	element_dot.classList.remove('dotblack');
	element_dot.classList.add('dotwhite');
	element_dot.classList.remove('hidden');
	
	// Hide the whole bar
	element_gameInfoBar.classList.add('hidden');

	isOpen = false;
}

/** Reveales the player names. Typically called after the draw offer UI is closed */
function revealPlayerNames() {
	element_playerWhite.classList.remove('hidden');
	element_playerBlack.classList.remove('hidden');
}

/** Hides the player names. Typically to make room for the draw offer UI */
function hidePlayerNames() {
	element_playerWhite.classList.add('hidden');
	element_playerBlack.classList.add('hidden');
}

function toggle() {
	if (isOpen) close();
	else open(gameslot.getGamefile()!.metadata);
}

function getPlayerNamesForGame(metadata: MetaData): { white: string, black: string } {
	if (onlinegame.areInOnlineGame()) {			
		if (!metadata.White || !metadata.Black) throw Error('White or Black metadata not defined when getting player names for online game.');
	
		// If you are a guest, then we want your name to be "(You)" instead of "(Guest)"
		return {
			white: onlinegame.areWeColorInOnlineGame('white') && metadata['White'] === translations['guest_indicator'] ? translations['you_indicator'] : metadata['White'],
			black: onlinegame.areWeColorInOnlineGame('black') && metadata['Black'] === translations['guest_indicator'] ? translations['you_indicator'] : metadata['Black']
		};
	}

	// Local game

	return { 
		white: translations['player_name_white_generic'],
		black: translations['player_name_black_generic']
	};
}

/**
 * Updates the text at the bottom of the screen displaying who's turn it is now.
 * Call this after flipping the gamefile's `whosTurn` property.
 */
function updateWhosTurn() {
	const gamefile = gameslot.getGamefile()!;

	// In the scenario we forward the game to front after the game has adjudicated,
	// don't modify the game over text saying who won!
	if (gamefileutility.isGameOver(gamefile)) return gameEnd(gamefile.gameConclusion);

	const color = gamefile.whosTurn;

	if (color !== 'white' && color !== 'black') throw Error(`Cannot set the document element text showing whos turn it is when color is neither white nor black! ${color}`);

	let textContent = "";
	if (onlinegame.areInOnlineGame()) {
		const ourTurn = onlinegame.isItOurTurn();
		textContent = ourTurn ? translations['your_move'] : translations['their_move'];
	} else textContent = color === "white" ? translations['white_to_move'] : translations['black_to_move'];

	element_whosturn.textContent = textContent;

	element_dot.classList.remove('hidden');
	if (color === 'white') {
		element_dot.classList.remove('dotblack');
		element_dot.classList.add('dotwhite');
	} else {
		element_dot.classList.remove('dotwhite');
		element_dot.classList.add('dotblack');
	}
}

/** Updates the whosTurn text to say who won! */
function gameEnd(conclusion: string | false) {
	// 'white checkmate' / 'black resignation' / 'draw stalemate'  time/resignation/stalemate/repetition/checkmate/disconnect/agreement
	if (conclusion === false) throw Error("Should not call gameEnd when game isn't over.");

	const { victor, condition } = winconutil.getVictorAndConditionFromGameConclusion(conclusion);
	const resultTranslations = translations['results'];
	element_dot.classList.add('hidden');

	const gamefile = gameslot.getGamefile()!;

	if (onlinegame.areInOnlineGame()) {

		if (onlinegame.areWeColorInOnlineGame(victor)) element_whosturn.textContent = condition === 'checkmate' ? resultTranslations.you_checkmate
                                                                            : condition === 'time' ? resultTranslations.you_time
                                                                            : condition === 'resignation' ? resultTranslations.you_resignation
                                                                            : condition === 'disconnect' ? resultTranslations.you_disconnect
                                                                            : condition === 'royalcapture' ? resultTranslations.you_royalcapture
                                                                            : condition === 'allroyalscaptured' ? resultTranslations.you_allroyalscaptured
                                                                            : condition === 'allpiecescaptured' ? resultTranslations.you_allpiecescaptured
                                                                            : condition === 'threecheck' ? resultTranslations.you_threecheck
                                                                            : condition === 'koth' ? resultTranslations.you_koth
                                                                            : resultTranslations.you_generic;
		else if (victor === 'draw') element_whosturn.textContent = condition === 'stalemate' ? resultTranslations.draw_stalemate
                                                                    : condition === 'repetition' ? resultTranslations.draw_repetition
                                                                    : condition === 'moverule' ? `${resultTranslations.draw_moverule[0]}${(gamefile.gameRules.moveRule! / 2)}${resultTranslations.draw_moverule[1]}`
                                                                                                    : condition === 'insuffmat' ? resultTranslations.draw_insuffmat
                                                                    : condition === 'agreement' ? resultTranslations.draw_agreement
                                                                    : resultTranslations.draw_generic;
		else if (condition === 'aborted') element_whosturn.textContent = resultTranslations.aborted;
		else /* loss */ element_whosturn.textContent = condition === 'checkmate' ? resultTranslations.opponent_checkmate
                                                            : condition === 'time' ? resultTranslations.opponent_time
                                                            : condition === 'resignation' ? resultTranslations.opponent_resignation
                                                            : condition === 'disconnect' ? resultTranslations.opponent_disconnect
                                                            : condition === 'royalcapture' ? resultTranslations.opponent_royalcapture
                                                            : condition === 'allroyalscaptured' ? resultTranslations.opponent_allroyalscaptured
                                                            : condition === 'allpiecescaptured' ? resultTranslations.opponent_allpiecescaptured
                                                            : condition === 'threecheck' ? resultTranslations.opponent_threecheck
                                                            : condition === 'koth' ? resultTranslations.opponent_koth
                                                            : resultTranslations.opponent_generic;
	} else { // Local game
		if (condition === 'checkmate') element_whosturn.textContent = victor === 'white' ? resultTranslations.white_checkmate
                                                                    : victor === 'black' ? resultTranslations.black_checkmate
                                                                    : resultTranslations.bug_checkmate;
		else if (condition === 'time') element_whosturn.textContent = victor === 'white' ? resultTranslations.white_time
                                                                    : victor === 'black' ? resultTranslations.black_time
                                                                    : resultTranslations.bug_time;
		else if (condition === 'royalcapture') element_whosturn.textContent = victor === 'white' ? resultTranslations.white_royalcapture
                                                                            : victor === 'black' ? resultTranslations.black_royalcapture
                                                                            : resultTranslations.bug_royalcapture;
		else if (condition === 'allroyalscaptured') element_whosturn.textContent = victor === 'white' ? resultTranslations.white_allroyalscaptured
                                                                                : victor === 'black' ? resultTranslations.black_allroyalscaptured
                                                                                : resultTranslations.bug_allroyalscaptured;
		else if (condition === 'allpiecescaptured') element_whosturn.textContent = victor === 'white' ? resultTranslations.white_allpiecescaptured
                                                                                : victor === 'black' ? resultTranslations.black_allpiecescaptured
                                                                                : resultTranslations.bug_allpiecescaptured;
		else if (condition === 'threecheck') element_whosturn.textContent = victor === 'white' ? resultTranslations.white_threecheck
                                                                            : victor === 'black' ? resultTranslations.black_threecheck
                                                                            : resultTranslations.bug_threecheck;
		else if (condition === 'koth') element_whosturn.textContent = victor === 'white' ? resultTranslations.white_koth
                                                                    : victor === 'black' ? resultTranslations.black_koth
                                                                    : resultTranslations.bug_koth;
		else if (condition === 'stalemate') element_whosturn.textContent = resultTranslations.draw_stalemate;
		else if (condition === 'repetition') element_whosturn.textContent = resultTranslations.draw_repetition;
		else if (condition === 'moverule') element_whosturn.textContent = `${resultTranslations.draw_moverule[0]}${(gamefile.gameRules.moveRule! / 2)}${resultTranslations.draw_moverule[1]}`;
		else if (condition === 'insuffmat') element_whosturn.textContent = resultTranslations.draw_insuffmat;
		else {
			element_whosturn.textContent = resultTranslations.bug_generic;
			console.error(`Game conclusion: "${conclusion}"\nVictor: ${victor}\nCondition: ${condition}`);
		}
	}
}

export default {
	open,
	close,
	revealPlayerNames,
	hidePlayerNames,
	toggle,
	updateWhosTurn,
	gameEnd
};