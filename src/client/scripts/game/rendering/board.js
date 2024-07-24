
/*
 * This script renders the board, and changes it's color.
 * We also keep track of what tile the mouse is currently hovering over.
 */

"use strict";

const board = (function(){

    let tiles_texture; // 2x2 transparent
    let tiles256_texture; // 256x256 transparent. Any color, but greater mouire effect
    let tilesGrey78_texture; // tilesGrey78, only white & grey tiles

    const squareCenter = 0.5; // WITHOUT this, the center of tiles would be their bottom-left corner.  Range: 0-1

    /** The buffer model of the dark squares. This is just one
     * large square covering the whole screen, rendered underneath
     * the white tiles, because the texture is transparent.
     * @type {BufferModel} */
    let darkTilesModel; // The dark tile color is rendered on the screen underneath the white tiles (transparent image)

    let tileWidth_Pixels; // Width of tiles in physical, not virtual screen pixels (greater for retina displays). Dependent on board scale.

    let tile_MouseOver_Float; // [x, y]  The board location of the mouse, in floats.
    let tile_MouseOver_Int; // [x, y]  The board location of the mouse, rounded to nearest tile.
    let tiles_FingersOver_Float; // { touchID: [x, y], touchID: [x, y] }  Object with current touches as parameters, with touches containing their board location.
    let tiles_FingersOver_Int; // Same as tiles_FingersOver_Float, but rounded to nearest tile.

    /**
     * The *exact* bounding box of the board currently visible on the canvas.
     * This differs from the camera's bounding box because this is effected by the camera's scale (zoom).
     * @type {BoundingBox}
     */
    let boundingBoxFloat;
    /**
     * The bounding box of the board currently visible on the canvas,
     * rounded away from the center of the canvas to encapsulate the whole of any partially visible squares.
     * This differs from the camera's bounding box because this is effected by the camera's scale (zoom).
     * @type {BoundingBox}
     */
    let boundingBox;

    const perspectiveMode_z = -0.01;

    const limitToDampScale = 0.000_01; // We need to soft limit the scale so the game doesn't break
    //const limitToDampScale = 0.15; // FOR RECORDING. This slows down very fast.

    let whiteTiles; // [r,g,b,a]
    let darkTiles;

    function initTextures() {
        tiles_texture = texture.loadTexture('tiles', { useMipmaps: false })
        // This transparent tiles texture gives us freedom of color, but the artifacts are a little heavier
        tiles256_texture = texture.loadTexture('tiles256', { useMipmaps: false })
        tilesGrey78_texture = texture.loadTexture('tilesGrey78', { useMipmaps: false })
    }

    function gsquareCenter() {
        return squareCenter;
    }

    function gtileWidth_Pixels() {
        return tileWidth_Pixels;
    }

    function gtile_MouseOver_Float() {
        return tile_MouseOver_Float;
    }

    function gtile_MouseOver_Int() {
        return tile_MouseOver_Int;
    }

    /**
     * Returns a copy of the *exact* board bounding box.
     * @returns {BoundingBox} The board bounding box
     */
    function gboundingBoxFloat() {
        return math.deepCopyObject(boundingBoxFloat);
    }

    /**
     * Returns a copy of the board bounding box, rounded away from the center
     * of the canvas to encapsulate the whole of any partially visible squares.
     * @returns {BoundingBox} The board bounding box
     */
    function gboundingBox() {
        return math.deepCopyObject(boundingBox);
    }

    function glimitToDampScale() {
        return limitToDampScale;
    }

    // Recalculate board velicity, scale, and other common variables.
    function recalcVariables() {
        recalcTileWidth_Pixels() // This needs to be after recalcPosition(), else dragging & scaling has a spring to it.
        recalcTile_MouseCrosshairOver();
        recalcTiles_FingersOver()
        recalcBoundingBox()
    }

    function recalcTile_MouseCrosshairOver() {
        recalcTile_MouseOver()
        recalcTile_CrosshairOver()
    }

    function recalcTileWidth_Pixels() {
        // If we're in developer mode, our screenBoundingBox is different
        const screenBoundingBox = options.isDebugModeOn() ? camera.getScreenBoundingBox(true) : camera.getScreenBoundingBox(false);
        // In physical pixels, not virtual. Physical pixels is greater for retina displays.
        const pixelsPerTile = (camera.canvas.height * 0.5 / screenBoundingBox.top) / camera.getPixelDensity(); // When scale is 1
        tileWidth_Pixels = pixelsPerTile * movement.getBoardScale();
    }

    function recalcTile_MouseOver() {
        if (perspective.isMouseLocked()) return;
        if (perspective.getEnabled()) return setTile_MouseOverToUndefined()

        const tile_MouseOver_IntAndFloat = getTileMouseOver();
       
        tile_MouseOver_Float = tile_MouseOver_IntAndFloat.tile_Float
        tile_MouseOver_Int = tile_MouseOver_IntAndFloat.tile_Int
    }

    function setTile_MouseOverToUndefined() {
        tile_MouseOver_Float = undefined
        tile_MouseOver_Int = undefined
    }

    function recalcTile_CrosshairOver() {
        if (!perspective.isMouseLocked()) return;

        const coords = math.convertWorldSpaceToCoords(input.getMouseWorldLocation())

        tile_MouseOver_Float = coords
        tile_MouseOver_Int = [Math.floor(coords[0] + squareCenter), Math.floor(coords[1] + squareCenter)]
    }

    function recalcTiles_FingersOver() {
        tiles_FingersOver_Float = {};
        tiles_FingersOver_Int = {};
        
        for (let i = 0; i < input.getTouchHelds().length; i++) {
            const thisTouch = input.getTouchHelds()[i]
            const touchTileAndFloat = gtileCoordsOver(thisTouch.x, thisTouch.y)
        
            tiles_FingersOver_Float[thisTouch.id] = touchTileAndFloat.tile_Float;
            tiles_FingersOver_Int[thisTouch.id] = touchTileAndFloat.tile_Int;
        }
    }
    
    function gtileCoordsOver(x, y) { // Takes xy in screen coords from center
        const n = perspective.getIsViewingBlackPerspective() ? -1 : 1;

        const boardPos = movement.getBoardPos();
        const tileXFloat = n*x / tileWidth_Pixels + boardPos[0];
        const tileYFloat = n*y / tileWidth_Pixels + boardPos[1];
    
        const tile_Float = [tileXFloat, tileYFloat]
        const tile_Int = [Math.floor(tileXFloat + squareCenter), Math.floor(tileYFloat + squareCenter)]

        return { tile_Float, tile_Int }
    }

    // Works whether the mouse is virtual (touch screen) or not
    function getTileMouseOver() {
        const mouseWorld = input.getMouseWorldLocation(); // [x, y]
        const tile_Float = math.convertWorldSpaceToCoords(mouseWorld)
        const tile_Int = [Math.floor(tile_Float[0] + squareCenter), Math.floor(tile_Float[1] + squareCenter)]
        
        return { tile_Float, tile_Int }
    }

    // Takes in touchID, returns an object of the finger id, and x & y of tile
    function gpositionFingerOver(touchID) {
        return {
            id: touchID,
            x: tiles_FingersOver_Float[touchID][0],
            y: tiles_FingersOver_Float[touchID][1]
        }
    }

    function recalcBoundingBox() {

        boundingBoxFloat = math.getBoundingBoxOfBoard(movement.getBoardPos(), movement.getBoardScale(), camera.getScreenBoundingBox())
        boundingBox = roundAwayBoundingBox(boundingBoxFloat)
    }

    /**
     * Returns a new board bounding box, with its edges rounded away from the
     * center of the canvas to encapsulate the whole of any squares partially included.
     * @param {BoundingBox} src - The source board bounding box
     * @returns {BoundingBox} The rounded bounding box
     */
    function roundAwayBoundingBox(src) {

        const left = Math.floor(src.left + squareCenter)
        const right = Math.ceil(src.right - 1 + squareCenter)
        const bottom = Math.floor(src.bottom + squareCenter)
        const top = Math.ceil(src.top - 1 + squareCenter)
        
        return { left, right, bottom, top }
    }

    /**
     * Generates the buffer model of the light tiles.
     * The dark tiles are rendered separately and underneath.
     * @returns {BufferModel} The buffer model
     */
    function regenBoardModel() {

        // New method of rendering board!

        const boardScale = movement.getBoardScale();
        const TwoTimesScale = 2 * boardScale;

        const inPerspective = perspective.getEnabled();
        const a = perspective.distToRenderBoard;

        const startX = inPerspective ? -a : camera.getScreenBoundingBox(false).left;
        const endX =   inPerspective ? a : camera.getScreenBoundingBox(false).right;
        const startY = inPerspective ? -a : camera.getScreenBoundingBox(false).bottom;
        const endY =   inPerspective ? a : camera.getScreenBoundingBox(false).top;

        const boardPos = movement.getBoardPos();
        // This processes the big number board positon to a range betw 0-2  (our texture is 2 tiles wide)
                                                                    // Without "- 1/1000", my computer's texture rendering is slightly off
        let texCoordStartX = (((boardPos[0] + squareCenter) + startX / boardScale) % 2) / 2 - 1/1000;
        let texCoordStartY = (((boardPos[1] + squareCenter) + startY / boardScale) % 2) / 2 - 1/1000;
        let texCoordEndX = texCoordStartX + (endX - startX) / TwoTimesScale;
        let texCoordEndY = texCoordStartY + (endY - startY) / TwoTimesScale;

        const [wr,wg,wb,wa] = whiteTiles;
        // const [dr,dg,db,da] = darkTiles;

        const z = perspective.getEnabled() ? perspectiveMode_z : 0;
        
        const data = [];

        const whiteTilesData = bufferdata.getDataQuad_ColorTexture3D(startX, startY, endX, endY, z, texCoordStartX, texCoordStartY, texCoordEndX, texCoordEndY, wr, wg, wb, wa)
        data.push(...whiteTilesData);

        // const darkTilesData = bufferdata.getDataQuad_ColorTexture3D(startX, startY, endX, endY, z, texCoordStartX, texCoordStartY, texCoordEndX, texCoordEndY, dr, dg, db, da)
        // data.push(...darkTilesData);

        // return buffermodel.createModel_ColorTexture3D(new Float32Array(data))
        const texture = perspective.getEnabled() ? tiles256_texture : tiles_texture
        return buffermodel.createModel_ColorTextured(new Float32Array(data), 3, "TRIANGLES", texture)
    }

    // The dark tiles model is a rectangle filling the whole screen, rendered underneath the white tile texture which is transparent.
    function initDarkTilesModel () {
        if (!darkTiles) resetColor()

        const inPerspective = perspective.getEnabled();
        const dist = perspective.distToRenderBoard
        const screenBoundingBox = camera.getScreenBoundingBox(false);

        const startX = inPerspective ? -dist : screenBoundingBox.left
        const endX =   inPerspective ?  dist : screenBoundingBox.right
        const startY = inPerspective ? -dist : screenBoundingBox.bottom
        const endY =   inPerspective ?  dist : screenBoundingBox.top
        // const z = perspective.getEnabled() ? perspectiveMode_z : 0;
        const z = perspective.getEnabled() ? perspectiveMode_z : 0;

        const [r,g,b,a] = darkTiles;

        const data = bufferdata.getDataQuad_Color3D(startX, startY, endX, endY, z, r, g, b, a)
        const dataFloat32 = new Float32Array(data)

        // darkTilesModel = buffermodel.createModel_Color3D(dataFloat32) // { prepDraw, vertexCount, program }
        darkTilesModel = buffermodel.createModel_Colored(dataFloat32, 3, "TRIANGLES")
    }

    function renderMainBoard() {

        if (movement.isScaleLess1Pixel_Physical()) return;

        // We'll need to generate a new board buffer model every frame, because the scale and repeat count changes!
        // The other option is to regenerate it as much as highlighted squares, with the bounding box.
        const model = regenBoardModel()

        // OLD
        // const texture = perspective.getEnabled() ? tilesGrey78_texture : tiles_texture
        // NEW
        // const texture = perspective.getEnabled() ? tiles256_texture : tiles_texture
        // render.renderModel(darkTilesModel, undefined, undefined, "TRIANGLES") // Dark Tiles, underneath white tiles covering whole screen.
        darkTilesModel.render();
        
        // render.renderModel(model, undefined, undefined, "TRIANGLES", texture) // White Tiles
        model.render();
    }

    // Checks if the board position is atleast regenRange-distance away from specified offset
    function isOffsetOutOfRangeOfRegenRange (offset, regenRange) { // offset: [x,y]
        const boardPos = movement.getBoardPos();
        const xDiff = Math.abs(boardPos[0] - offset[0]);
        const yDiff = Math.abs(boardPos[1] - offset[1]);
        if (xDiff > regenRange || yDiff > regenRange) return true;
        return false;
    }

    // Overwrites the current theme's settings with the provided args!
    function changeTheme(args) {
        // whiteTiles
        // darkTiles
        // selectedPieceHighlightColor
        // legalMovesHighlightColor_Friendly
        // legalMovesHighlightColor_Opponent
        // lastMoveHighlightColor
        // checkHighlightColor
        // useColoredPieces
        // whitePiecesColor
        // blackPiecesColor
        // neutralPiecesColor

        // If any of these are not defined, we do not set them!

        if (args.whiteTiles) options.themes[options.gtheme()].whiteTiles = args.whiteTiles;
        if (args.darkTiles) options.themes[options.gtheme()].darkTiles = args.darkTiles;

        ifThemeArgumentDefined_Set(args, 'whiteTiles');
        ifThemeArgumentDefined_Set(args, 'darkTiles');
        ifThemeArgumentDefined_Set(args, 'selectedPieceHighlightColor');
        ifThemeArgumentDefined_Set(args, 'legalMovesHighlightColor_Friendly');
        ifThemeArgumentDefined_Set(args, 'lastMoveHighlightColor');
        ifThemeArgumentDefined_Set(args, 'checkHighlightColor');
        ifThemeArgumentDefined_Set(args, 'useColoredPieces');
        ifThemeArgumentDefined_Set_AndEnableColor(args, 'whitePiecesColor');
        ifThemeArgumentDefined_Set_AndEnableColor(args, 'blackPiecesColor');
        ifThemeArgumentDefined_Set_AndEnableColor(args, 'neutralPiecesColor');

        updateTheme()
        piecesmodel.regenModel(game.getGamefile(), options.getPieceRegenColorArgs())
        highlights.regenModel()
    }

    function ifThemeArgumentDefined_Set(args, argumentName) { // whiteTiles/selectedPieceHighlightColor...
        if (args[argumentName] != null) options.themes[options.gtheme()][argumentName] = args[argumentName];
    }

    function ifThemeArgumentDefined_Set_AndEnableColor(args, argumentName) { // whiteTiles/selectedPieceHighlightColor...
        if (args[argumentName] != null) {
            options.themes[options.gtheme()][argumentName] = args[argumentName];
            options.themes[options.gtheme()].useColoredPieces = true;
        }
    }

    /** Resets the board color, sky, and navigation bars (the color changes when checkmate happens). */
    function updateTheme() {
        resetColor()
        updateSkyColor()
        updateNavColor()
    }

    // Updates sky color based on current board color
    function updateSkyColor() {

        const avgR = (whiteTiles[0] + darkTiles[0]) / 2;
        const avgG = (whiteTiles[1] + darkTiles[1]) / 2;
        const avgB = (whiteTiles[2] + darkTiles[2]) / 2;

        const dimAmount = 0.27; // Default: 0.27
        const skyR = avgR - dimAmount;
        const skyG = avgG - dimAmount;
        const skyB = avgB - dimAmount;

        webgl.setClearColor([skyR, skyG, skyB])
    }

    function updateNavColor() {
        // Determine the new "white" color

        const avgR = (whiteTiles[0] + darkTiles[0]) / 2;
        const avgG = (whiteTiles[1] + darkTiles[1]) / 2;
        const avgB = (whiteTiles[2] + darkTiles[2]) / 2;

        // const brightAmount = 0.3; // 0.11 for default white & grey   0.3 default
        // const navR = (avgR + brightAmount) * 255;
        // const navG = (avgG + brightAmount) * 255;
        // const navB = (avgB + brightAmount) * 255;

        // With the default theme, these should be max
        let navR = 255;
        let navG = 255;
        let navB = 255;

        if (!options.isThemeDefault()) {
            const brightAmount = 0.6; // 50% closer to white
            navR = (1 - (1 - avgR) * (1 - brightAmount)) * 255;
            navG = (1 - (1 - avgG) * (1 - brightAmount)) * 255;
            navB = (1 - (1 - avgB) * (1 - brightAmount)) * 255;
        }

        style.setNavStyle(`

            .navigation {
                background: linear-gradient(to top, rgba(${navR}, ${navG}, ${navB}, 0.104), rgba(${navR}, ${navG}, ${navB}, 0.552), rgba(${navR}, ${navG}, ${navB}, 0.216));
            }

            .footer {
                background: linear-gradient(to bottom, rgba(${navR}, ${navG}, ${navB}, 0.307), rgba(${navR}, ${navG}, ${navB}, 1), rgba(${navR}, ${navG}, ${navB}, 0.84));
            }
        `)
    }

    // TEMPORARILY changes the board tiles color! Resets upon leaving game.
    // Used to darken board
    function changeColor(newWhiteTiles, newDarkTiles) {
        main.renderThisFrame();
        whiteTiles = newWhiteTiles
        darkTiles = newDarkTiles
        initDarkTilesModel()
    }

    function resetColor() {
        whiteTiles = options.getDefaultTiles(true); // true for white
        darkTiles = options.getDefaultTiles(false); // false for dark
        initDarkTilesModel()
        main.renderThisFrame();
    }

    function darkenColor () {
        const whiteTiles = options.getDefaultTiles(true);;
        const darkTiles = options.getDefaultTiles(false);

        const darkenBy = 0.09;
        const darkWR = whiteTiles[0] - darkenBy;
        const darkWG = whiteTiles[1] - darkenBy;
        const darkWB = whiteTiles[2] - darkenBy;
        const darkDR = darkTiles[0] - darkenBy;
        const darkDG = darkTiles[1] - darkenBy;
        const darkDB = darkTiles[2] - darkenBy;

        changeColor([darkWR, darkWG, darkWB, 1], [darkDR, darkDG, darkDB, 1]);
    }

    // Renders board tiles
    function render() {
        // This prevents tearing when rendering in the same z-level and in perspective.
        webgl.executeWithDepthFunc_ALWAYS(() => {
            renderSolidCover() // This is needed even outside of perspective, so when we zoom out, the rendered fractal transprent boards look correct.
            renderMainBoard()
            renderFractalBoards()
        })
    }

    function renderFractalBoards() {

        const e = -math.getBaseLog10(movement.getBoardScale())

        const startE = 0.5; // 0.5   lower = starts coming in quicker
        if (e < startE) return;

        const interval = 3;
        const length = 6;

        let firstInterval = Math.floor((e - startE) / interval) * interval + startE;
        const zeroCount = 3 * (firstInterval - startE) / interval + 3; // Always a multiple of 3
        // console.log(firstInterval, zeroCount)

        const capOpacity = 0.7;

        // Most-zoomed out board
        let zoom = Math.pow(10, zeroCount);
        let x = (firstInterval - e) / length; // 0 - 1
        // console.log(`x: ${x}`)
        let opacity = capOpacity * Math.pow((-0.5 * Math.cos(2 * x * Math.PI) + 0.5), 0.7); // 0.7  the lower the pow, the faster the opacity
        renderZoomedBoard(zoom, opacity)

        // 2nd most-zoomed out board
        firstInterval -= interval;
        if (firstInterval < 0) return;
        zoom /= Math.pow(10, 3)
        x = (firstInterval - e) / length; // 0 - 1
        opacity = capOpacity * (-0.5 * Math.cos(2 * x * Math.PI) + 0.5);
        renderZoomedBoard(zoom, opacity)
    }

    // Renders an upside down grey cone centered around the camera, and level with the horizon.
    function renderSolidCover() {
        // const dist = perspective.distToRenderBoard;
        const dist = camera.getZFar() / Math.SQRT2;
        const z = perspective.getEnabled() ? perspectiveMode_z : 0;
        const cameraZ = camera.getPosition(true)[2]

        const r = (whiteTiles[0] + darkTiles[0]) / 2
        const g = (whiteTiles[1] + darkTiles[1]) / 2
        const b = (whiteTiles[2] + darkTiles[2]) / 2
        const a = (whiteTiles[3] + darkTiles[3]) / 2

        // const data = new Float32Array([
        //     //     Vertex                                      Color
        //     0,     0,   -perspective.distToRenderBoard,     r, g, b, a,
        //     0,     dist, cameraZ,                           r, g, b, a,
        //     dist,  0,    cameraZ,                           r, g, b, a,
        //     0,    -dist, cameraZ,                           r, g, b, a,
        //    -dist,  0,    cameraZ,                           r, g, b, a,
        //     0,     dist, cameraZ,                           r, g, b, a,
        // ])

        const data = bufferdata.getDataBoxTunnel(-dist, -dist, cameraZ, dist, dist, z, r, g, b, a);
        data.push(...bufferdata.getDataQuad_Color3D(-dist, -dist, dist, dist, z, r, g, b, a)); // Floor of the box

        const model = buffermodel.createModel_Colored(new Float32Array(data), 3, "TRIANGLES")

        model.render()
    }

    function renderZoomedBoard(zoom, opacity) {

        const zoomTimesScale = zoom * movement.getBoardScale();
        const zoomTimesScaleTwo = zoomTimesScale * 2;

        const inPerspective = perspective.getEnabled()
        const c = perspective.distToRenderBoard

        const startX = inPerspective ? -c : camera.getScreenBoundingBox(false).left;
        const endX =   inPerspective ?  c : camera.getScreenBoundingBox(false).right;
        const startY = inPerspective ? -c : camera.getScreenBoundingBox(false).bottom;
        const endY =   inPerspective ?  c : camera.getScreenBoundingBox(false).top;

        const boardPos = movement.getBoardPos();
        // This processes the big number board positon to a range betw 0-2  (our texture is 2 tiles wide)
                                                                    // Without "- 1/1000", my mac's texture rendering is slightly off
        let texStartX = (((boardPos[0] + squareCenter) / zoom + (startX / zoomTimesScale)) % 2) / 2 - 1/1000;
        let texStartY = (((boardPos[1] + squareCenter) / zoom + (startY / zoomTimesScale)) % 2) / 2 - 1/1000;
        const texCoordDiffX = (endX - startX) / zoomTimesScaleTwo;
            const screenTexCoordDiffX = (camera.getScreenBoundingBox(false).right - camera.getScreenBoundingBox(false).left) / zoomTimesScaleTwo
            const diffWhen1TileIs1Pixel = camera.canvas.width / 2;
            if (screenTexCoordDiffX > diffWhen1TileIs1Pixel) return; // STOP rendering to avoid glitches! Too small
        const texCoordDiffY = (endY - startY) / zoomTimesScaleTwo;
        let texEndX = texStartX + texCoordDiffX;
        let texEndY = texStartY + texCoordDiffY;

        const texStartXB = texStartX + 0.5;
        const texEndXB = texEndX + 0.5;

        const z = perspective.getEnabled() ? perspectiveMode_z : 0;

        let [wr,wg,wb,wa] = whiteTiles; wa *= opacity;
        let [dr,dg,db,da] = darkTiles; da *= opacity;
        
        const data = [];

        const dataWhiteTiles = bufferdata.getDataQuad_ColorTexture3D(startX, startY, endX, endY, z, texStartX, texStartY, texEndX, texEndY, wr, wg, wb, wa)
        data.push(...dataWhiteTiles);

        const dataDarkTiles = bufferdata.getDataQuad_ColorTexture3D(startX, startY, endX, endY, z, texStartXB, texStartY, texEndXB, texEndY, dr, dg, db, da)
        data.push(...dataDarkTiles);

        // const model = buffermodel.createModel_ColorTexture3D(new Float32Array(data));
        const texture = perspective.getEnabled() ? tiles256_texture : tiles_texture
        const model = buffermodel.createModel_ColorTextured(new Float32Array(data), 3, "TRIANGLES", texture);

        model.render();
    }


    return Object.freeze({
        gsquareCenter,
        initTextures,
        gtileWidth_Pixels,
        recalcVariables,
        gtile_MouseOver_Float,
        isOffsetOutOfRangeOfRegenRange,
        gpositionFingerOver,
        initDarkTilesModel,
        gtile_MouseOver_Int,
        recalcTileWidth_Pixels,
        gtileCoordsOver,
        roundAwayBoundingBox,
        gboundingBox,
        changeTheme,
        gboundingBoxFloat,
        updateTheme,
        resetColor,
        glimitToDampScale,
        darkenColor,
        render,
        getTileMouseOver,
        recalcTile_MouseCrosshairOver,
        recalcTiles_FingersOver
    })
})();