
/*
 * This script manages the organized lines of all pieces in the current game.
 * For example, pieces organized by type, coordinate, vertical, horizontal, diagonal, etc.
 * 
 * These dramatically increase speed of legal move calculation.
 */

"use strict";

// Module
const organizedlines = {

    /**
     * Organizes all the pieces of the specified game into many different lists,
     * organized in different ways. For example, organized by key `'1,2'`,
     * or by type `'queensW'`, or by row/column/diagonal.
     * 
     * These are helpful because they vastly improve performance. For instance,
     * if we know the coordinates of a piece, we don't have to iterate
     * through the entire list of pieces to find its type.
     * @param {gamefile} gamefile - The gamefile
     * @param {Object} [options] - An object that may contain the `apphendUndefineds` option. If false, no undefined *null* placeholder pieces will be left for the mesh generation. Defaults to *true*. Set to false if you're planning on regenerating manually.
     */
    initOrganizedPieceLists: function (gamefile, { apphendUndefineds = true} = {}) {
        if (!gamefile.ourPieces) return console.error("Cannot init the organized lines before ourPieces is defined.")
        
        // console.log("Begin organizing lists...")

        organizedlines.resetOrganizedLists(gamefile)
        // Organize each piece with a callback function.
        // We need .bind(this) to specify our parent object for the callback!
        // Otherwise it would not be able to access our gamefile's properties such as the organized lists to push to.
        gamefileutility.forEachPieceInGame(gamefile, organizedlines.organizePiece)
        
        // console.log("Finished organizing lists!")

        // Add extra undefined pieces into each type array!
        organizedlines.initUndefineds(gamefile)

        if (apphendUndefineds) organizedlines.apphendUndefineds(gamefile)
    },

    resetOrganizedLists: function(gamefile) {
        gamefile.piecesOrganizedByKey = {}
        gamefile.piecesOrganizedByRow = {}
        gamefile.piecesOrganizedByColumn = {}
        gamefile.piecesOrganizedByUpDiagonal = {}
        gamefile.piecesOrganizedByDownDiagonal = {}
    },

    // Inserts given piece into all the organized piece lists (key, row, column...)
    organizePiece: function (type, coords, gamefile) {
        if (!coords) return; // Piece is undefined, skip this one!

        const piece = { type, coords }

        // Organize by key
        // First, turn the coords into a key in the format 'x,y'
        let key = math.getKeyFromCoords(coords)
        // Is there already a piece there? (Desync)
        if (gamefile.piecesOrganizedByKey[key]) throw new Error(`While organizing a piece, there was already an existing piece there!! ${coords}`)
        gamefile.piecesOrganizedByKey[key] = type;

        // Organize by row
        key = coords[1]
        // Is row initialized?
        if (!gamefile.piecesOrganizedByRow[key]) gamefile.piecesOrganizedByRow[key] = []
        gamefile.piecesOrganizedByRow[key].push(piece)

        // Organize by column
        key = coords[0]
        // Is the column initialized?
        if (!gamefile.piecesOrganizedByColumn[key]) gamefile.piecesOrganizedByColumn[key] = []
        gamefile.piecesOrganizedByColumn[key].push(piece)
        
        // Organize by up-diagonal
        key = math.getUpDiagonalFromCoords(coords);
        // Is the diagonal initialized?
        if (!gamefile.piecesOrganizedByUpDiagonal[key]) gamefile.piecesOrganizedByUpDiagonal[key] = []
        gamefile.piecesOrganizedByUpDiagonal[key].push(piece)
        
        // Organize by down-diagonal
        key = math.getDownDiagonalFromCoords(coords)
        // Is the diagonal initialized?
        if (!gamefile.piecesOrganizedByDownDiagonal[key]) gamefile.piecesOrganizedByDownDiagonal[key] = []
        gamefile.piecesOrganizedByDownDiagonal[key].push(piece)
    },
    
    // Remove specified piece from all the organized piece lists (piecesOrganizedByKey, etc.)
    removeOrganizedPiece: function (gamefile, coords) {

        // Make the piece key undefined in piecesOrganizedByKey object
        let key = math.getKeyFromCoords(coords)
        if (!gamefile.piecesOrganizedByKey[key]) throw new Error(`No organized piece at coords ${coords} to delete!`)
        // Delete is needed, I can't just set the key to undefined, because the object retains the key as 'undefined'
        delete gamefile.piecesOrganizedByKey[key] 

        // Remove from organized rows
        key = coords[1]
        removePieceFromLine(gamefile.piecesOrganizedByRow, key)
        
        // Remove from organized columns
        key = coords[0]
        removePieceFromLine(gamefile.piecesOrganizedByColumn, key)

        // Remove from organized up-diagonals
        // What is the diagonal? It is equal to 0 - x + y. It is determined by the y-intercept point of the diagonal.
        key = math.getUpDiagonalFromCoords(coords)
        removePieceFromLine(gamefile.piecesOrganizedByUpDiagonal, key)

        // Remove from organized down-diagonals
        // What is the diagonal? It is equal to 0 + x + y. It is determined by the y-intercept point of the diagonal.
        key = math.getDownDiagonalFromCoords(coords)
        removePieceFromLine(gamefile.piecesOrganizedByDownDiagonal, key)

        // Takes a line from a property of an organized piece list, deletes the piece at specified coords
        function removePieceFromLine (organizedPieces, lineKey) {
            const line = organizedPieces[lineKey]

            for (let i = 0; i < line.length; i++) {
                const thisPieceCoords = line[i].coords
                if (thisPieceCoords[0] === coords[0] && thisPieceCoords[1] === coords[1]) {
                    line.splice(i, 1) // Delete
                    // If the line length is now 0, remove itself from the organizedPieces
                    if (line.length === 0) delete organizedPieces[lineKey];
                    break;
                }
            }
        }
    },

    initUndefineds: function(gamefile) {
        // Add extra undefined pieces into each type array!
        pieces.forEachPieceType(init)
        function init(listType) {
            const list = gamefile.ourPieces[listType];
            list.undefineds = [];
        }
    },


    /**
     * Adds more undefined placeholders, or *null* pieces, into the piece lists,
     * to allocate more space in the mesh of all the pieces.
     * Only called within `initOrganizedPieceLists()` because this assumes
     * each piece list has zero, so it adds the exact same amount to each list.
     * These placeholders are used up when pawns promote.
     * @param {gamefile} gamefile - The gamefile
     */
    apphendUndefineds: function(gamefile) {
        pieces.forEachPieceType(apphend)

        function apphend(listType) {
            if (!organizedlines.isTypeATypeWereApphendingUndefineds(gamefile, listType)) return;

            const list = gamefile.ourPieces[listType];
            for (let i = 0; i < pieces.extraUndefineds; i++) organizedlines.insertUndefinedIntoList(list)
        }
    },

    areWeShortOnUndefineds: function(gamefile) {

        let weShort = false;
        pieces.forEachPieceType(areWeShort)

        function areWeShort(listType) {
            if (!organizedlines.isTypeATypeWereApphendingUndefineds(gamefile, listType)) return;

            const list = gamefile.ourPieces[listType];
            const undefinedCount = list.undefineds.length;
            if (undefinedCount === 0) weShort = true;
        }

        return weShort;
    },

    /**
     * Adds more undefined placeholders, or *null* pieces, into the piece lists,
     * to allocate more space in the mesh of all the pieces, then regenerates the mesh.
     * Makes sure each piece list has the bare minimum number of undefineds.
     * These placeholders are used up when pawns promote.
     * When they're gone, we have to regenerate the mesh, with more empty placeholders.
     * @param {gamefile} gamefile - The gamefile
     * @param {Object} options - An object containing the various properties:
     * - `regenModel`: Whether or not to renegerate the model of all the pieces afterward. Default: *true*.
     * - `log`: Whether or not to log to the console that we're adding more undefineds. Default: *false*
     */
    addMoreUndefineds: function(gamefile, { regenModel = true, log = false } = {}) {
        if (log) console.log('Adding more placeholder undefined pieces.')
        
        pieces.forEachPieceType(add)

        function add(listType) {
            if (!organizedlines.isTypeATypeWereApphendingUndefineds(gamefile, listType)) return;

            const list = gamefile.ourPieces[listType];
            const undefinedCount = list.undefineds.length;
            for (let i = undefinedCount; i < pieces.extraUndefineds; i++) organizedlines.insertUndefinedIntoList(list)
        }

        if (regenModel) piecesmodel.regenModel(gamefile, options.getPieceRegenColorArgs())
    },

    /**
     * Sees if the provided type is a type we need to apphend undefined
     * placeholders to the piece list of this type.
     * The mesh of all the pieces needs placeholders in case we
     * promote to a new piece.
     * @param {gamefile} gamefile - The gamefile
     * @param {string} type - The type of piece (e.g. "pawnsW")
     * @returns {boolean} *true* if we need to apphend placeholders for this type.
     */
    isTypeATypeWereApphendingUndefineds(gamefile, type) {
        if (!gamefile.gameRules.promotionsAllowed) throw new Error("promotionsAllowed needs to be defined before apphending undefineds to the piece lists!");

        const color = math.getPieceColorFromType(type);

        if (!gamefile.gameRules.promotionsAllowed[color]) return false; // Eliminates neutral pieces.
        
        const trimmedType = math.trimWorBFromType(type);
        return gamefile.gameRules.promotionsAllowed[color].includes(trimmedType); // Eliminates all pieces that can't be promoted to
    },

    insertUndefinedIntoList: function(list) {
        const insertedIndex = list.push(undefined) - 1; // insertedIndex = New length - 1
        list.undefineds.push(insertedIndex)
    },

    buildKeyListFromState: function (state) { // state is default piece list organized by type

        const keyList = { };

        gamefileutility.forEachPieceInPiecesByType(callback, state)

        function callback (type, coords) {
            const key = math.getKeyFromCoords(coords)
            keyList[key] = type;
        }

        return keyList;
    },

    /**
     * Converts a piece list organized by key to organized by type.
     * @param {Object} keyList - Pieces organized by key: `{ '1,2': 'pawnsW' }`
     * @returns {Object} Pieces organized by type: `{ pawnsW: [ [1,2], [2,2], ...]}`
     */
    buildStateFromKeyList: function (keyList) {
        const state = organizedlines.getEmptyTypeState()

        // For some reason, does not iterate through inherited properties?
        for (const key in keyList) {
            const type = keyList[key]
            const coords = math.getCoordsFromKey(key)
            // Does the type parameter exist?
            // if (!state[type]) state[type] = []
            if (!state[type]) return console.error(`Error when building state from key list. Type ${type} is undefined!`)
            // Push the coords
            state[type].push(coords)
        }

        return state;
    },

    getEmptyTypeState() {

        const state = {}

        // White and Black
        for (let i = 0; i < pieces.white.length; i++) {
            state[pieces.white[i]] = []
            state[pieces.black[i]] = []
        }
        // Neutral
        for (let i = 0; i < pieces.neutral.length; i++) {
            state[pieces.neutral[i]] = []
        }

        return state;
    }
};