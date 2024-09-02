
// Import Start

// Import End

/**
 * This scripts contains utility methods for working with colors,
 * such as getting the opposite color, trimming the color from type, etc.
 */
const colorutil = (function() {

    /** All colors that are compatible with the game, EXCLUDING 'neutral'. */
    const validColors_NoNeutral = ['white','black'];
    /** All color-extensions that are compatible with the game, EXCLUDING 'neutral'. */
    const validColorExtensions_NoNeutral = ['W','B'];

    /** All colors that are compatible with the game. */
    const validColors = [...validColors_NoNeutral, 'neutral'];
    /** All color-extensions that are compatible with the game. */
    const validColorExtensions = [...validColorExtensions_NoNeutral, 'N'];



    /**
     * Returns the color of the provided piece type
     * @param {string} type - The type of the piece (e.g., "pawnsW")
     * @returns {string | undefined} The color of the piece, "white", "black", or "neutral", or undefined if not valid
     */
    function getPieceColorFromType(type) {
        // If the last letter of the piece type is 'W', the piece is white.
        if (type.endsWith('W')) return "white";
        else if (type.endsWith('B')) return "black";
        else if (type.endsWith('N')) return "neutral";
        else throw new Error(`Cannot get the color of piece with type ${type}`);
    }

    function getColorFromWorB(WorB) {
        if (WorB === 'W') return 'white';
        else if (WorB === 'B') return 'black';
        else if (WorB === 'N') return 'neutral';
        throw new Error(`Cannot return color when WorB is not W, B, or N! Received: "${WorB}"`);
    }

    /**
     * Returns the opposite color of the color provided.
     * @param {string} color - "White" / "Black"
     * @returns {string} The opposite color, "White" / "Black"
     */
    function getOppositeColor(color) {
        if (color === 'white') return 'black';
        else if (color === 'black') return 'white';
        else throw new Error(`Cannot return the opposite color of color ${color}!`);
    }

    // REQUIRES the type of piece to be valid, and have a W or B at the end!
    function getWorBFromType(type) {
        return type.charAt(type.length - 1);
    }

    function getWorBFromColor(color) {
        if (color === 'white') return 'W';
        else if (color === 'black') return 'B';
        else if (color === 'neutral') return 'N';
        else throw new Error(`Cannot return WorB from strange color ${color}!`);
    }

    /**
     * Trims the W, B, or N from the end of the piece type. "pawnsW" => "pawns"
     * @param {string} type - The type of piece (eg "pawnsW").
     * @returns {string} The trimmed type.
     */
    function trimWorBFromType(type) {
        return type.slice(0, -1); // Returns a new string that starts from the first character (index 0) and excludes the last character (because of -1).
    }

    return Object.freeze({
        validColors,
        validColorExtensions,
        validColors_NoNeutral,
        validColorExtensions_NoNeutral,
        getPieceColorFromType,
        getColorFromWorB,
        getOppositeColor,
        getWorBFromType,
        getWorBFromColor,
        trimWorBFromType
    });

})();

export default colorutil;