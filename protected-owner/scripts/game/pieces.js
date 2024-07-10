
// This script contains our list of all possible piece types,
// spritesheet data,
// and contains the functions for rendering the main pieces,
// ghost piece, and mini icons!

"use strict";

const pieces = (function () {

    // All piece names we have a texture for on our spritesheet (except voids).
    // They are arranged in this order for faster checkmate/draw detection.
    const white = ['kingsW', 'giraffesW', 'camelsW', 'zebrasW', 'amazonsW', 'queensW', 'royalQueensW', 'hawksW', 'chancellorsW', 'archbishopsW', 'centaursW', 'royalCentaursW', 'knightsW', 'guardsW', 'rooksW', 'bishopsW', 'pawnsW'];
    const black = ['kingsB', 'giraffesB', 'camelsB', 'zebrasB', 'amazonsB', 'queensB', 'royalQueensB', 'hawksB', 'chancellorsB', 'archbishopsB', 'centaursB', 'royalCentaursB', 'knightsB', 'guardsB', 'rooksB', 'bishopsB', 'pawnsB'];
    const neutral = ['obstaclesN', 'voidsN'];

    /** A list of the royal pieces, without the color apphended. */
    const royals = ['kings', 'royalQueens', 'royalCentaurs'];
    /** A list of the royals that are compatible with checkmate. */
    const jumpingRoyals = ['kings', 'royalCentaurs'];

    let spritesheet; // Texture. 8x8 containing every texture of every piece, black and white.
    let spritesheetData; // Contains where each piece is located in the spritesheet (texture coord)

    const ghostOpacity = 0.4;

    // Amount of extra undefined pieces to store with each type array!
    // These placeholders are utilized when pieces are added or pawns promote!
    const extraUndefineds = 5; // After this many promotions, need to add more undefineds and recalc the model!

    function renderPiecesInGame(gamefile) {
        renderPieces(gamefile);
        voids.render(gamefile);
        miniimage.render();
    }

    function renderPieces(gamefile) {
        if (gamefile.mesh == null) return;
        if (gamefile.mesh.model == null) return;
        if (movement.isScaleLess1Pixel_Virtual() && !miniimage.isDisabled()) return;

        // Do we need to regen the pieces model? Are we out of bounds of our regenRange?
        if (!movement.isScaleLess1Pixel_Virtual()
          && board.isOffsetOutOfRangeOfRegenRange(gamefile.mesh.offset, piecesmodel.regenRange)) piecesmodel.shiftPiecesModel(gamefile)

        const boardPos = movement.getBoardPos();
        const position = [ // Translate
            -boardPos[0] + gamefile.mesh.offset[0], // Add the model's offset. 
            -boardPos[1] + gamefile.mesh.offset[1],
            0
        ] // While separate these are each big decimals, TOGETHER they are small number! That's fast for rendering!

        const boardScale = movement.getBoardScale();
        const scale = [boardScale, boardScale, 1]

        let modelToUse;
        if (onlinegame.areWeColor('black')) modelToUse = perspective.getEnabled() && !perspective.getIsViewingBlackPerspective() && gamefile.mesh.rotatedModel != null ? gamefile.mesh.rotatedModel : gamefile.mesh.model;
        else modelToUse = perspective.getEnabled() && perspective.getIsViewingBlackPerspective() && gamefile.mesh.rotatedModel != null ? gamefile.mesh.rotatedModel : gamefile.mesh.model

        modelToUse.render(position, scale);
        // Use this line when rendering with the tinted texture shader program.
        // modelToUse.render(position, scale, { uVertexColor: [1,0,0, 1] }); // Specifies the tint uniform value before rendering
    }

    /** Renders a semi-transparent piece at the specified coordinates. */
    function renderGhostPiece(type, coords) {
        const color = options.getColorOfType(type); color.a *= ghostOpacity;
        const data = bufferdata.getDataQuad_ColorTexture_FromCoordAndType(coords, type, color)
        const model = buffermodel.createModel_ColorTextured(new Float32Array(data), 2, "TRIANGLES", pieces.getSpritesheet());
        model.render();
    }

    /**
     * Iterates through every single piece TYPE in the game state, and performs specified function on the type.
     * @param {function} callback - The function to execute on each type of piece. Must have 1 parameter of "type".
     * @param {Object} [options] An object that may contain the options `ignoreNeutrals` or `ignoreVoids`. These default to *false*.
     */
    function forEachPieceType(callback, { ignoreNeutrals = false, ignoreVoids = false } = {}) { // Callback needs to have 1 parameter: type
        for (let i = 0; i < white.length; i++) {
            // We iterate through black types first so that the white icons render on top!
            callback(black[i])
            callback(white[i])
        }
        if (ignoreNeutrals) return;
        for (let i = 0; i < neutral.length; i++) {
            const type = neutral[i];
            if (ignoreVoids && type.startsWith('voids')) continue;
            callback(type)
        }
    }

    /**
     * A variant of `forEachPieceType()` that allows an asynchronious callback function to be used.
     * 
     * Iterates through every single piece TYPE in the game state, and performs specified function on the type
     * @param {function} callback - The function to execute on each type of piece. Must have 1 parameter of "type".
     * @param {Object} [options] An object that may contain the options `ignoreNeutrals` or `ignoreVoids`. These default to *false*.
     */
    async function forEachPieceType_Async(callback, { ignoreNeutrals = false, ignoreVoids = false } = {}) { // Callback needs to have 1 parameter: type
        for (let i = 0; i < white.length; i++) {
            // We iterate through black types first so that the white icons render on top!
            await callback(black[i])
            await callback(white[i])
        }
        if (ignoreNeutrals) return;
        for (let i = 0; i < neutral.length; i++) {
            const type = neutral[i];
            if (ignoreVoids && type.startsWith('voids')) continue;
            await callback(type)
        }
    }

    // Iterates through every single piece TYPE in the game state of specified COLOR,
    // and performs specified function on the type
    function forEachPieceTypeOfColor(color, callback) {
        if (color !== 'white' && color !== 'black') throw new Error(`Cannot iterate through each piece type of invalid color: ${color}!`)
        for (let i = 0; i < white.length; i++) callback(pieces[color][i]);
    }

    function initSpritesheet() {
        spritesheet = texture.loadTexture('spritesheet', { useMipmaps: true })
    }

    // Returns the spritesheet texture object!
    // I need a getter for this because it's not immediately initialized.
    function getSpritesheet() {
        return spritesheet;
    }

    // The spritesheet data contains where each piece's texture is located in the spritesheet. Only called once per run.
    function initSpritesheetData() {

        const pieceWidth = 1 / 8; // In texture coords. Our spritesheet is 8x8

        spritesheetData = {
            pieceWidth,
            
            // One-sided pieces
            pawnsW: getSpriteCoords(pieceWidth, 1,1),
            pawnsB: getSpriteCoords(pieceWidth, 2,1),
            knightsW: getSpriteCoords(pieceWidth, 3,1),
            knightsB: getSpriteCoords(pieceWidth, 4,1),
            bishopsW: getSpriteCoords(pieceWidth, 5,1),
            bishopsB: getSpriteCoords(pieceWidth, 6,1),
            rooksW: getSpriteCoords(pieceWidth, 7,1),
            rooksB: getSpriteCoords(pieceWidth, 8,1),
            queensW: getSpriteCoords(pieceWidth, 1,2),
            queensB: getSpriteCoords(pieceWidth, 2,2),
            kingsW: getSpriteCoords(pieceWidth, 3,2),
            kingsB: getSpriteCoords(pieceWidth, 4,2),
            chancellorsW: getSpriteCoords(pieceWidth, 5,2),
            chancellorsB: getSpriteCoords(pieceWidth, 6,2),
            archbishopsW: getSpriteCoords(pieceWidth, 7,2),
            archbishopsB: getSpriteCoords(pieceWidth, 8,2),
            amazonsW: getSpriteCoords(pieceWidth, 1,3),
            amazonsB: getSpriteCoords(pieceWidth, 2,3),
            // Guard texture for the guard
            guardsW: getSpriteCoords(pieceWidth, 3,3),
            guardsB: getSpriteCoords(pieceWidth, 4,3),
            // Commoner texture for the guard
            // guardsW: getSpriteCoords(pieceWidth, 5,3),
            // guardsB: getSpriteCoords(pieceWidth, 6,3),
            hawksW: getSpriteCoords(pieceWidth, 7,3),
            hawksB: getSpriteCoords(pieceWidth, 8,3),
            camelsW: getSpriteCoords(pieceWidth, 1,4),
            camelsB: getSpriteCoords(pieceWidth, 2,4),
            giraffesW: getSpriteCoords(pieceWidth, 3,4),
            giraffesB: getSpriteCoords(pieceWidth, 4,4),
            zebrasW: getSpriteCoords(pieceWidth, 5,4),
            zebrasB: getSpriteCoords(pieceWidth, 6,4),
            knightridersW: getSpriteCoords(pieceWidth, 7,4),
            knightridersB: getSpriteCoords(pieceWidth, 8,4),
            unicornsW: getSpriteCoords(pieceWidth, 1,5),
            unicornsB: getSpriteCoords(pieceWidth, 2,5),
            evolvedUnicornsW: getSpriteCoords(pieceWidth, 3,5),
            evolvedUnicornsB: getSpriteCoords(pieceWidth, 4,5),
            rosesW: getSpriteCoords(pieceWidth, 5,5),
            rosesB: getSpriteCoords(pieceWidth, 6,5),
            centaursW: getSpriteCoords(pieceWidth, 7,5),
            centaursB: getSpriteCoords(pieceWidth, 8,5),
            royalCentaursW: getSpriteCoords(pieceWidth, 1,6),
            royalCentaursB: getSpriteCoords(pieceWidth, 2,6),
            royalQueensW: getSpriteCoords(pieceWidth, 3,6),
            royalQueensB: getSpriteCoords(pieceWidth, 4,6),
            kelpiesW: getSpriteCoords(pieceWidth, 5,6),
            kelpiesB: getSpriteCoords(pieceWidth, 6,6),
            dragonsW: getSpriteCoords(pieceWidth, 7,6),
            dragonsB: getSpriteCoords(pieceWidth, 8,6),
            // 2nd dragon texture, also used in 5D chess.
            drakonsW: getSpriteCoords(pieceWidth, 1,7),
            drakonsB: getSpriteCoords(pieceWidth, 2,7),

            // Neutral pieces
            air: getSpriteCoords(pieceWidth, 3,7),
            obstaclesN: getSpriteCoords(pieceWidth, 4,7),

            // Miscellaneous
            yellow: getSpriteCoords(pieceWidth, 5,7) // COIN
        }

        // pieceWidth is how many textures in 1 row.  yColumn starts from the top. 
        function getSpriteCoords(pieceWidth, xPos, yPos) {
            const texX = (xPos - 1) * pieceWidth;
            const texY = 1 - yPos * pieceWidth;
            return [texX, texY]
        }
    }

    function getSpritesheetDataPieceWidth() {
        return spritesheetData.pieceWidth;
    }

    function getSpritesheetDataTexLocation(type) {
        return spritesheetData[type];
    }

    return Object.freeze({
        white,
        black,
        neutral,
        royals,
        jumpingRoyals,
        extraUndefineds,
        renderPiecesInGame,
        renderGhostPiece,
        forEachPieceType,
        forEachPieceType_Async,
        forEachPieceTypeOfColor,
        initSpritesheet,
        getSpritesheet,
        initSpritesheetData,
        getSpritesheetDataPieceWidth,
        getSpritesheetDataTexLocation,
    });

})();