
/** @typedef {import('./TypeDefinitions.js').Game} Game */

const movesscript1 = (function() {

    /**
     * Tests if the game is resignable (atleast 2 moves have been played).
     * If not, then the game is abortable.
     * @param {Game} game - The game
     * @returns {boolean} *true* if the game is resignable.
     */
    function isGameResignable(game) { return game.moves.length > 1; }

    /**
     * Returns the last, or most recent, move in the provided move list, or undefined if there isn't one.
     * @param {string[]} moves - The moves list, with the moves in most compact notation: `1,2>3,4N`
     * @returns {string | undefined} The move, in most compact notation, or undefined if there isn't one.
     */
    function getLastMove(moves) {
        if (moves.length === 0) return;
        return moves[moves.length - 1];
    }

    /**
     * Returns the color of the player that played that moveIndex within the moves list.
     * Returns error if index -1
     * @param {Game} game
     * @param {number} i - The moveIndex
     * @returns {string} - The color that played the moveIndex
     */
    function getColorThatPlayedMoveIndex(game, i) {
        if (i === -1) return console.error("Cannot get color that played move index when move index is -1.");
        const turnOrder = game.turnOrder;
        return turnOrder[i % turnOrder.length];
    }
    
    return Object.freeze({
        isGameResignable,
        getLastMove,
        getColorThatPlayedMoveIndex
    });
})();

export default movesscript1;