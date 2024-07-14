
/*
 * This script handles the game info bar, during a game,
 * displaying the clocks, and whos turn it currently is.
 */

"use strict";

const guigameinfo = (function(){

    // Variables

    // Footer game info
    const element_whosturn = document.getElementById('whosturn')
    const element_dot = document.getElementById('dot')
    const element_playerWhite = document.getElementById('playerwhite')
    const element_playerBlack = document.getElementById('playerblack');
    
    // Functions

    function open() {
        if (game.getGamefile().gameConclusion) return;
        style.revealElement(element_dot)
    }

    function hidePlayerNames() {
        style.hideElement(element_playerWhite)
        style.hideElement(element_playerBlack)
    }

    function revealPlayerNames(gameOptions) {
        const white = gameOptions.metadata.White;
        const black = gameOptions.metadata.Black;
        // If you are a guest, then we want your name to be "(You)" instead of "(Guest)"
        element_playerWhite.textContent = onlinegame.areWeColor('white') && white === "(Guest)" ? "(You)" : white;
        element_playerBlack.textContent = onlinegame.areWeColor('black') && black === "(Guest)" ? "(You)" : black;
        style.revealElement(element_playerWhite)
        style.revealElement(element_playerBlack)
    }

    /**
     * Updates the text at the bottom of the screen displaying who's turn it is now.
     * Call this after flipping the gamefile's `whosTurn` property.
     * @param {gamefile} gamefile - The gamefile
     */
    function updateWhosTurn(gamefile) {
        const color = gamefile.whosTurn;

        if (color !== 'white' && color !== 'black' && color !== 'blue' && color !== 'green' && color !== 'red')
            throw new Error(`Cannot set the document element text showing whos turn it is when color is neither white nor black nor red nor blue nor green! ${color}`)

        let textContent = "";
        if (onlinegame.areInOnlineGame()) {
            const ourTurn = onlinegame.isItOurTurn(gamefile)
            textContent = ourTurn ? "Your move" : "Their move";
        } else textContent = color[0].toUpperCase() + color.slice(1) + " to move" // color === "white" ? "White to move" : "Black to move"

        element_whosturn.textContent = textContent;

        style.revealElement(element_dot)
        if (color === 'white') {
            element_dot.classList.remove('dotblack')
            element_dot.classList.remove('dotblue')
            element_dot.classList.add('dotwhite')
        } else if (color === 'black'){
            element_dot.classList.remove('dotwhite')
            element_dot.classList.add('dotblack')
        } else if (color === 'green'){// 4p is always in ccw order
            element_dot.classList.remove('dotwhite')
            element_dot.classList.add('dotgreen')
        } else if (color === 'red'){
            element_dot.classList.remove('dotgreen')
            element_dot.classList.add('dotred')
        } else {
            element_dot.classList.remove('dotred')
            element_dot.classList.add('dotblue');
        }
    }

    // Updates the whosTurn text to say who won!
    function gameEnd(conclusion) {
        // 'white checkmate' / 'black resignation' / 'draw stalemate'  time/resignation/stalemate/repetition/checkmate/disconnect

        const { victor, condition } = wincondition.getVictorAndConditionFromGameConclusion(conclusion)

        style.hideElement(element_dot)

        if (onlinegame.areInOnlineGame()) {

            if (onlinegame.areWeColor(victor)) element_whosturn.textContent = condition === 'checkmate' ? "You win by checkmate!"
                                                                                : condition === 'time' ? "You win on time!"
                                                                                : condition === 'resignation' ? "You win by resignation!"
                                                                                : condition === 'disconnect' ? "You win by abandonment!"
                                                                                : condition === 'royalcapture' ? "You win by royal capture!"
                                                                                : condition === 'allroyalscaptured' ? "You win by all royals captured!"
                                                                                : condition === 'allpiecescaptured' ? "You win by all pieces captured!"
                                                                                : condition === 'threecheck' ? "You win by three-check!"
                                                                                : condition === 'koth' ? "You win by king of the hill!"
                                                                                : "You win!"
            else if (victor === 'draw') element_whosturn.textContent = condition === 'stalemate' ? "Draw by stalemate!"
                                                                     : condition === 'repetition' ? "Draw by repetition!"
                                                                     : condition === 'moverule' ? `Draw by the ${game.getGamefile().gameRules.moveRule / 2}-move-rule!`
																	 : condition === 'insuffmat' ? "Draw by insufficient material!"
                                                                     : "Draw!"
            else if (condition === 'aborted') element_whosturn.textContent = "Game aborted."
            else /* loss */ element_whosturn.textContent = condition === 'checkmate' ? "You lose by checkmate!"
                                                             : condition === 'time' ? "You lose on time!"
                                                             : condition === 'resignation' ? "You lose by resignation!"
                                                             : condition === 'disconnect' ? "You lose by abandonment!"
                                                             : condition === 'royalcapture' ? "You lose by royal capture!"
                                                             : condition === 'allroyalscaptured' ? "You lose by all royals captured!"
                                                             : condition === 'allpiecescaptured' ? "You lose by all pieces captured!"
                                                             : condition === 'threecheck' ? "You lose by three-check!"
                                                             : condition === 'koth' ? "You lose by king of the hill!"
                                                             : "You lose!"
        } else { // Local game
            if (condition === 'checkmate') element_whosturn.textContent = victor === 'white' ? "White wins by checkmate!"
                                                                       : victor === 'black' ? "Black wins by checkmate!"
                                                                       : 'This is a bug, please report. Game ended by checkmate.'
            else if (condition === 'time') element_whosturn.textContent = victor === 'white' ? "White wins on time!"
                                                                       : victor === 'black' ? "Black wins on time!"
                                                                       : 'This is a bug, please report. Game ended on time.'
            else if (condition === 'royalcapture') element_whosturn.textContent = victor === 'white' ? "White wins by royal capture!"
                                                                               : victor === 'black' ? "Black wins by royal capture!"
                                                                               : 'This is a bug, please report. Game ended by royal capture.'
            else if (condition === 'allroyalscaptured') element_whosturn.textContent = victor === 'white' ? "White wins by all royals captured!"
                                                                                    : victor === 'black' ? "Black wins by all royals captured!"
                                                                                    : 'This is a bug, please report. Game ended by all royals captured.'
            else if (condition === 'allpiecescaptured') element_whosturn.textContent = victor === 'white' ? "White wins by all pieces captured!"
                                                                                    : victor === 'black' ? "Black wins by all pieces captured!"
                                                                                    : 'This is a bug, please report. Game ended by all pieces captured.'
            else if (condition === 'threecheck') element_whosturn.textContent = victor === 'white' ? "White wins by three-check!"
                                                                             : victor === 'black' ? "Black wins by three-check!"
                                                                             : 'This is a bug, please report. Game ended by three-check.'
            else if (condition === 'koth') element_whosturn.textContent = victor === 'white' ? "White wins by king of the hill!"
                                                                       : victor === 'black' ? "Black wins by king of the hill!"
                                                                       : 'This is a bug, please report. Game ended by king of the hill.'
            else if (condition === 'stalemate') element_whosturn.textContent = "Draw by stalemate!"
            else if (condition === 'repetition') element_whosturn.textContent = "Draw by repetition!"
            else if (condition === 'moverule') element_whosturn.textContent = `Draw by the ${game.getGamefile().gameRules.moveRule / 2}-move-rule!`
			else if (condition === 'insuffmat') element_whosturn.textContent = "Draw by insufficient material!"
            else {
                element_whosturn.textContent = "This is a bug, please report!"
                console.error(`Game conclusion: "${conclusion}"\nVictor: ${victor}\nCondition: ${condition}`)
            }
        }
    }

    return Object.freeze({
        open,
        hidePlayerNames,
        revealPlayerNames,
        updateWhosTurn,
        gameEnd
    })

})();