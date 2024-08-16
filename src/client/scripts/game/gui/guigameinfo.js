/* eslint-disable indent */

/*
 * This script handles the game info bar, during a game,
 * displaying the clocks, and whos turn it currently is.
 */

"use strict";

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
        const white = gameOptions.metadata.White;
        const black = gameOptions.metadata.Black;
        // If you are a guest, then we want your name to be "(You)" instead of "(Guest)"
        element_playerWhite.textContent = onlinegame.areWeColor('white') && white === translations["guest_indicator"] ? translations["you_indicator"] : white;
        element_playerBlack.textContent = onlinegame.areWeColor('black') && black === translations["guest_indicator"] ? translations["you_indicator"] : black;
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
            textContent = ourTurn ? translations["your_move"] : translations["their_move"];
        } else textContent = color === "white" ? translations["white_to_move"] : translations["black_to_move"];

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

        style.hideElement(element_dot);

        if (onlinegame.areInOnlineGame()) {

          if (onlinegame.areWeColor(victor)) element_whosturn.textContent = condition === 'checkmate' ? translations["results"]["you_checkmate"]
                                                                                : condition === 'time' ? translations["results"]["you_time"]
                                                                                : condition === 'resignation' ? translations["results"]["you_resignation"]
                                                                                : condition === 'disconnect' ? translations["results"]["you_disconnect"]
                                                                                : condition === 'royalcapture' ? translations["results"]["you_royalcapture"]
                                                                                : condition === 'allroyalscaptured' ? translations["results"]["you_allroyalscaptured"]
                                                                                : condition === 'allpiecescaptured' ? translations["results"]["you_allpiecescaptured"]
                                                                                : condition === 'threecheck' ? translations["results"]["you_threecheck"]
                                                                                : condition === 'koth' ? translations["results"]["you_koth"]
                                                                                : translations["results"]["you_generic"];
            else if (victor === 'draw') element_whosturn.textContent = condition === 'stalemate' ? translations["results"]["draw_stalemate"]
                                                                     : condition === 'repetition' ? translations["results"]["draw_repetition"]
                                                                     : condition === 'moverule' ? `${translations["results"]["draw_moverule"][0]}${(game.getGamefile().gameRules.moveRule / 2)}${translations["results"]["draw_moverule"][1]}`
																	 : condition === 'insuffmat' ? translations["results"]["draw_insuffmat"]
                                                                     : condition === 'agreement' ? translations["results"]["draw_agreement"]
                                                                     : translations["results"]["draw_generic"];
            else if (condition === 'aborted') element_whosturn.textContent = translations["results"]["aborted"];
            else /* loss */ element_whosturn.textContent = condition === 'checkmate' ? translations["results"]["opponent_checkmate"]
                                                             : condition === 'time' ? translations["results"]["opponent_time"]
                                                             : condition === 'resignation' ? translations["results"]["opponen_resignation"]
                                                             : condition === 'disconnect' ? translations["results"]["opponent_disconnect"]
                                                             : condition === 'royalcapture' ? translations["results"]["opponent_royalcapture"]
                                                             : condition === 'allroyalscaptured' ? translations["results"]["opponent_allroyalscaptured"]
                                                             : condition === 'allpiecescaptured' ? translations["results"]["opponent_allpiecescaptured"]
                                                             : condition === 'threecheck' ? translations["results"]["opponent_threecheck"]
                                                             : condition === 'koth' ? translations["results"]["opponent_koth"]
                                                             : translations["results"]["opponent_generic"];
        } else { // Local game
            if (condition === 'checkmate') element_whosturn.textContent = victor === 'white' ? translations["results"]["white_checkmate"]
                                                                       : victor === 'black' ? translations["results"]["black_checkmate"]
                                                                       : translations["results"]["bug_checkmate"];
            else if (condition === 'time') element_whosturn.textContent = victor === 'white' ? translations["results"]["white_time"]
                                                                       : victor === 'black' ? translations["results"]["black_time"]
                                                                       : translations["results"]["bug_time"];
            else if (condition === 'royalcapture') element_whosturn.textContent = victor === 'white' ? translations["results"]["white_royalcapture"]
                                                                               : victor === 'black' ? translations["results"]["black_royalcapture"]
                                                                               : translations["results"]["bug_royalcapture"];
            else if (condition === 'allroyalscaptured') element_whosturn.textContent = victor === 'white' ? translations["results"]["white_allroyalscaptured"]
                                                                                    : victor === 'black' ? translations["results"]["black_allroyalscaptured"]
                                                                                    : translations["results"]["bug_allroyalscaptured"];
            else if (condition === 'allpiecescaptured') element_whosturn.textContent = victor === 'white' ? translations["results"]["white_allpiecescaptured"]
                                                                                    : victor === 'black' ? translations["results"]["black_allpiecescaptured"]
                                                                                    : translations["results"]["bug_allpiecescaptured"];
            else if (condition === 'threecheck') element_whosturn.textContent = victor === 'white' ? translations["results"]["white_threecheck"]
                                                                             : victor === 'black' ? translations["results"]["black_threecheck"]
                                                                             : translations["results"]["bug_threecheck"];
            else if (condition === 'koth') element_whosturn.textContent = victor === 'white' ? translations["results"]["white_koth"]
                                                                       : victor === 'black' ? translations["results"]["black_koth"]
                                                                       : translations["results"]["bug_koth"];
            else if (condition === 'stalemate') element_whosturn.textContent = translations["results"]["draw_stalemate"];
            else if (condition === 'repetition') element_whosturn.textContent = translations["results"]["draw_repetition"];
            else if (condition === 'moverule') element_whosturn.textContent = `${translations["results"]["draw_moverule"][0]}${(game.getGamefile().gameRules.moveRule / 2)}${translations["results"]["draw_moverule"][1]}`;
			else if (condition === 'insuffmat') element_whosturn.textContent = translations["results"]["draw_insuffmat"];
            else {
                element_whosturn.textContent = translations["results"]["bug_generic"];
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