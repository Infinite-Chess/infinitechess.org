// Import Start
import { wincondition } from '../chess/wincondition.js'
import { style } from './style.js'
import { game } from '../chess/game.js';
import { onlinegame } from '../misc/onlinegame.js'
// Import End

/* eslint-disable indent */

/*
 * This script handles the game info bar, during a game,
 * displaying the clocks, and whos turn it currently is.
 */

"use strict";

// eslint-disable-next-line no-unused-vars
const guigameinfo = (function() {

    // Variables

    // Footer game info
    const element_whosturn = document.getElementById('whosturn');
    const element_dot = document.getElementById('dot');
    const element_playerWhite = document.getElementById('playerwhite');
    const element_playerBlack = document.getElementById('playerblack');
    
    // Functions

    function open() {
        if (game.getGamefile().gameConclusion) return;
        style.revealElement(element_dot);
    }

    function hidePlayerNames() {
        style.hideElement(element_playerWhite);
        style.hideElement(element_playerBlack);
    }

    function revealPlayerNames(gameOptions) {
        if (gameOptions) {
            const white = gameOptions.metadata.White;
            const black = gameOptions.metadata.Black;
            // If you are a guest, then we want your name to be "(You)" instead of "(Guest)"
            element_playerWhite.textContent = onlinegame.areWeColor('white') && white === translations.guest_indicator ? translations.you_indicator : white;
            element_playerBlack.textContent = onlinegame.areWeColor('black') && black === translations.guest_indicator ? translations.you_indicator : black;
        }
        style.revealElement(element_playerWhite);
        style.revealElement(element_playerBlack);
    }

    /**
     * Updates the text at the bottom of the screen displaying who's turn it is now.
     * Call this after flipping the gamefile's `whosTurn` property.
     * @param {gamefile} gamefile - The gamefile
     */
    function updateWhosTurn(gamefile) {
        const color = gamefile.whosTurn;

        if (color !== 'white' && color !== 'black')
            throw new Error(`Cannot set the document element text showing whos turn it is when color is neither white nor black! ${color}`);

        let textContent = "";
        if (onlinegame.areInOnlineGame()) {
            const ourTurn = onlinegame.isItOurTurn(gamefile);
            textContent = ourTurn ? translations.your_move : translations.their_move;
        } else textContent = color === "white" ? translations.white_to_move : translations.black_to_move;

        element_whosturn.textContent = textContent;

        style.revealElement(element_dot);
        if (color === 'white') {
            element_dot.classList.remove('dotblack');
            element_dot.classList.add('dotwhite');
        } else {
            element_dot.classList.remove('dotwhite');
            element_dot.classList.add('dotblack');
        }
    }

    // Updates the whosTurn text to say who won!
    function gameEnd(conclusion) {
        // 'white checkmate' / 'black resignation' / 'draw stalemate'  time/resignation/stalemate/repetition/checkmate/disconnect/agreement

        const { victor, condition } = wincondition.getVictorAndConditionFromGameConclusion(conclusion);
	    const resultTranslations = translations.results;
        style.hideElement(element_dot);

        if (onlinegame.areInOnlineGame()) {

            if (onlinegame.areWeColor(victor)) element_whosturn.textContent = condition === 'checkmate' ? resultTranslations.you_checkmate
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
                                                                     : condition === 'moverule' ? `${resultTranslations.draw_moverule[0]}${(game.getGamefile().gameRules.moveRule / 2)}${resultTranslations.draw_moverule[1]}`
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
            else if (condition === 'moverule') element_whosturn.textContent = `${resultTranslations.draw_moverule[0]}${(game.getGamefile().gameRules.moveRule / 2)}${resultTranslations.draw_moverule[1]}`;
            else if (condition === 'insuffmat') element_whosturn.textContent = resultTranslations.draw_insuffmat;
            else {
                element_whosturn.textContent = resultTranslations.bug_generic;
                console.error(`Game conclusion: "${conclusion}"\nVictor: ${victor}\nCondition: ${condition}`);
            }
        }
    }

    return Object.freeze({
        open,
        hidePlayerNames,
        revealPlayerNames,
        updateWhosTurn,
        gameEnd
    });

})();

export { guigameinfo };