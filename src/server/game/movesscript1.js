
const movesscript1 = (function() {

    /**
     * Tests if the game is resignable (atleast 2 moves have been played).
     * If not, then the game is abortable.
     * @param {gamefile} gamefile - The gamefile
     * @returns {boolean} *true* if the game is resignable.
     */
    function isGameResignable(gamefile) { return gamefile.moves.length > 1; }

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
     * @param {number} i - The moveIndex
     * @returns {string} - The color that playd the moveIndex
     */
    function getColorThatPlayedMoveIndex(i, blackMovesFirst) {
        if (i === -1) return console.error("Cannot get color that played move index when move index is -1.")
        const color = i % 2 === 0 ? 'white' : 'black';
        return blackMovesFirst ? math.getOppositeColor(color) : color;
    }
    
    return Object.freeze({
        isGameResignable,
        getLastMove,
        getColorThatPlayedMoveIndex
    })
})();

module.exports = movesscript1