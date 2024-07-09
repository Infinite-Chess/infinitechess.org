// This script handles the rendering of arrows poointing to pieces off-screen
// and detects if they are clicked

"use strict";

const arrows = (function() {

    const width = 0.65; // % of 1 tile   default 0.6
    const sidePadding = 0.15; // % of 1 tile between piece and screen edge
    const opacity = 0.6;
    const renderZoomLimit = 10; // virtual pixels. Default: 14

    const perspectiveDist = 17;

    let data;
    /** The buffer model of the piece mini images on
     * the edge of the screen. **Doesn't include** the little arrows.
     * @type {BufferModel} */
    let model;

    let dataArrows = undefined;
    /** The buffer model of the little arrows on
     * the edge of the screen next to the mini piece images.
     * @type {BufferModel} */
    let modelArrows = undefined;

    /** The mode the arrow indicators on the edges of the screen is currently in.
     * 0 = Off, 1 = Defense, 2 = All */
    let mode = 1;

    /**  Whether our mouse is currently hovering over one arrow indicator.
     * Could be used to cancel other mouse events. */
    let hovering = false;

    /**
     * Returns the mode the arrow indicators on the edges of the screen is currently in.
     * 0 = Off, 1 = Defense, 2 = All
     * @returns {number} The current mode
     */
    function getMode() { return mode; }

    /**
     * Sets the rendering mode of the arrow indicators on the edges of the screen.
     * 0 = Off, 1 = Defense, 2 = All
     * @param {number} value - The new mode
     */
    function setMode(value) { mode = value; }

    /**
     * Returns *true* if the mouse is hovering over any one arrow indicator.
     * @returns {boolean}
     */
    function isMouseHovering() { return hovering; }

    function update() {
        if (mode === 0) return;

        // generate model
        model = undefined;

        // Are we zoomed in enough?
        const scaleWhenAtLimit = ((camera.getScreenBoundingBox(false).right * 2) / camera.canvas.width) * camera.getPixelDensity() * renderZoomLimit
        if (movement.getBoardScale() < scaleWhenAtLimit) return;

        modelArrows = undefined;
        data = []
        dataArrows = []

        hovering = false;

        // How do we find out what pieces are off-screen?

        // If any part of the square is on screen, this box rounds to it.
        const boundingBox = perspective.getEnabled() ? math.generatePerspectiveBoundingBox(perspectiveDist + 1) : board.gboundingBox() 
        // Same as above, but doesn't round
        const boundingBoxFloat = perspective.getEnabled() ? math.generatePerspectiveBoundingBox(perspectiveDist) : board.gboundingBoxFloat() 

        const horzRight = {}
        const horzLeft = {}
        const vertTop = {}
        const vertBottom = {}
        const upDiagRight = {}
        const upDiagLeft = {}
        const downDiagRight = {}
        const downDiagLeft = {}

        let headerPad = perspective.getEnabled() ? 0 : math.convertPixelsToWorldSpace_Virtual(camera.getPIXEL_HEIGHT_OF_TOP_NAV())
        let footerPad = perspective.getEnabled() ? 0 : math.convertPixelsToWorldSpace_Virtual(camera.getPIXEL_HEIGHT_OF_BOTTOM_NAV())

        // Reverse header and footer pads if we're viewing blacks side
        if (perspective.getIsViewingBlackPerspective() && !perspective.getEnabled()) {
            const a = headerPad;
            headerPad = footerPad;
            footerPad = a;
        }

        let paddedBoundingBox = math.deepCopyObject(boundingBoxFloat)
        if (!perspective.getEnabled()) {
            paddedBoundingBox.top -= math.convertWorldSpaceToGrid(headerPad)
            paddedBoundingBox.bottom += math.convertWorldSpaceToGrid(footerPad)
        }

        gamefileutility.forEachPieceInPiecesByType(calcPiecesOffScreen, game.getGamefile().ourPieces)

        function calcPiecesOffScreen(type, coords) {

            if (!coords) return;

            // Is the piece off-screen?

            if (math.boxContainsSquare(boundingBox, coords)) return;

            const x = coords[0]
            const y = coords[1]

            // Horizontal. Same row as one onscreen?
            if (y > boundingBox.bottom && y < boundingBox.top) {

                // Left or right side?
                const rightSide = x > boundingBox.right;

                if (rightSide) {
                    // What is the current piece on the right side? Is this piece more left than it? Don't render both
                    if (!horzRight[y]) horzRight[y] = { type, coords }
                    else if (x < horzRight[y].coords[0]) horzRight[y] = { type, coords }
                } else { // Left side
                    if (!horzLeft[y]) horzLeft[y] = { type, coords }
                    else if (x > horzLeft[y].coords[0]) horzLeft[y] = { type, coords }
                }
            }

            // Vertical. Same column as one onscreen?
            if (x > boundingBox.left && x < boundingBox.right) {
                const topSide = y > boundingBox.top;
                if (topSide) {
                    if (!vertTop[x]) vertTop[x] = { type, coords }
                    else if (y < vertTop[x].coords[1]) vertTop[x] = { type, coords }
                } else {
                    if (!vertBottom[x]) vertBottom[x] = { type, coords }
                    else if (y > vertBottom[x].coords[1]) vertBottom[x] = { type, coords }
                }
            }

            // Up Diagonal. Same diag as one onscreen?
            {
                const diagUp = math.getUpDiagonalFromCoords(coords)
                const boardCornerTopLeft = [paddedBoundingBox.left, paddedBoundingBox.top]
                const boardCornerBottomRight = [paddedBoundingBox.right, paddedBoundingBox.bottom]
                const boardDiagUpStart = math.getUpDiagonalFromCoords(boardCornerTopLeft)
                const boardDiagUpEnd = math.getUpDiagonalFromCoords(boardCornerBottomRight)
                if (diagUp < boardDiagUpStart && diagUp > boardDiagUpEnd) {
                    const topRightSide = y > paddedBoundingBox.top || x > paddedBoundingBox.right;
                    if (topRightSide) {
                        if (!upDiagRight[diagUp]) upDiagRight[diagUp] = { type, coords }
                        else if (x < upDiagRight[diagUp].coords[0]) upDiagRight[diagUp] = { type, coords }
                    } else { // Left side
                        if (!upDiagLeft[diagUp]) upDiagLeft[diagUp] = { type, coords }
                        else if (x > upDiagLeft[diagUp].coords[0]) upDiagLeft[diagUp] = { type, coords }
                    }
                }
            }

            // Down Diagonal. Same diag as one onscreen?
            {
                const diagDown = math.getDownDiagonalFromCoords(coords)
                const boardCornerBottomLeft = [paddedBoundingBox.left, paddedBoundingBox.bottom]
                const boardCornerTopRight = [paddedBoundingBox.right, paddedBoundingBox.top]
                const boardDiagDownStart = math.getDownDiagonalFromCoords(boardCornerBottomLeft)
                const boardDiagDownEnd = math.getDownDiagonalFromCoords(boardCornerTopRight)
                // console.log(boardDiagDownStart, diagDown, boardDiagDownEnd)
                if (diagDown > boardDiagDownStart && diagDown < boardDiagDownEnd) {
                    const topLeftSide = y > paddedBoundingBox.top || x < paddedBoundingBox.left;
                    if (topLeftSide) {
                        if (!downDiagLeft[diagDown]) downDiagLeft[diagDown] = { type, coords }
                        else if (x > downDiagLeft[diagDown].coords[0]) downDiagLeft[diagDown] = { type, coords }
                    } else { // Left side
                        if (!downDiagRight[diagDown]) downDiagRight[diagDown] = { type, coords }
                        else if (x < downDiagRight[diagDown].coords[0]) downDiagRight[diagDown] = { type, coords }
                    }
                }
            }
        }

        // If we are in only-show-attackers mode
        removeTypesWithIncorrectMoveset(horzRight, horzLeft, vertTop, vertBottom, upDiagRight, upDiagLeft, downDiagRight, downDiagLeft)

        


        // Calc the model data...

        // What will be the world-space width of our ghost images?
        const boardScale = movement.getBoardScale();
        const worldWidth = width * boardScale;
        let padding = (worldWidth/2) + sidePadding * boardScale;
        if (perspective.getEnabled()) padding = 0;

        iterateThroughStraightLine(horzRight, false, 'right')
        iterateThroughStraightLine(horzLeft, false, 'left')
        iterateThroughStraightLine(vertTop, true, 'top')
        iterateThroughStraightLine(vertBottom, true, 'bottom')

        function iterateThroughStraightLine(line, isVertical, direction) {
            for (const key in line) {
                const piece = line[key] // { type, coords }
                if (piece.type === 'voidsN') continue;
                const renderCoords = isVertical ? [piece.coords[0], boundingBoxFloat[direction]] : [boundingBoxFloat[direction], piece.coords[1]]
                concatData(renderCoords, piece.type, direction, worldWidth, padding, headerPad, footerPad, piece.coords)
            }
        }

        iterateThroughDiagLine(upDiagRight, math.getUpDiagonalFromCoords, 1, 'topright')
        iterateThroughDiagLine(upDiagLeft, math.getUpDiagonalFromCoords, 1, 'bottomleft')
        iterateThroughDiagLine(downDiagRight, math.getDownDiagonalFromCoords, -1, 'bottomright')
        iterateThroughDiagLine(downDiagLeft, math.getDownDiagonalFromCoords, -1, 'topleft')

        function iterateThroughDiagLine(line, mathDiagFunc, oneOrNegOne, direction) {
            for (const key in line) {
                const piece = line[key] // { type, coords }
                if (piece.type === 'voidsN') continue;
                const diag = mathDiagFunc(piece.coords)
                const renderCoords = math.getIntersectionEntryTile(oneOrNegOne, diag, paddedBoundingBox, direction)
                concatData(renderCoords, piece.type, direction, worldWidth, padding, headerPad, footerPad, piece.coords)
            }
        }

        if (data.length === 0) return;
        
        model = buffermodel.createModel_ColorTextured(new Float32Array(data), 2, "TRIANGLES", pieces.getSpritesheet())
        modelArrows = buffermodel.createModel_Colored(new Float32Array(dataArrows), 2, "TRIANGLES")
    }

    function removeTypesWithIncorrectMoveset(horzRight, horzLeft, vertTop, vertBottom, upDiagRight, upDiagLeft, downDiagRight, downDiagLeft) {
        if (mode !== 1) return;

        const gamefile = game.getGamefile();

        removeTypesWithIncorrectMoveset_2(horzRight, 'horizontal');
        removeTypesWithIncorrectMoveset_2(horzLeft, 'horizontal');
        removeTypesWithIncorrectMoveset_2(vertTop, 'vertical');
        removeTypesWithIncorrectMoveset_2(vertBottom, 'vertical');
        removeTypesWithIncorrectMoveset_2(upDiagRight, 'diagonalUp');
        removeTypesWithIncorrectMoveset_2(upDiagLeft, 'diagonalUp');
        removeTypesWithIncorrectMoveset_2(downDiagRight, 'diagonalDown');
        removeTypesWithIncorrectMoveset_2(downDiagLeft, 'diagonalDown');

        function removeTypesWithIncorrectMoveset_2(object, direction) { // horzRight, vertical/diagonalUp
            for (const key in object) {
                const type = object[key].type; // { type, coords }
                if (!doesTypeHaveMoveset(gamefile, type, direction)) delete object[key]
            }
        }

        function doesTypeHaveMoveset(gamefile, type, direction) {
            const moveset = legalmoves.getPieceMoveset(gamefile, type)
            return moveset[direction] != null;
        }
    }

    function concatData(renderCoords, type, paddingDir, worldWidth, padding, headerPad, footerPad, pieceCoords) {
        const worldHalfWidth = worldWidth/2

        // Convert to world-space
        const worldCoords = math.convertCoordToWorldSpace(renderCoords)

        const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
        const { texStartX, texStartY, texEndX, texEndY } = bufferdata.getTexDataOfType(type, rotation)

        const xPad = paddingDir.includes('right') ? -padding
                   : paddingDir.includes('left')  ?  padding
                   : 0;

        const yPad = paddingDir === 'top'          ? -padding - headerPad
                   : paddingDir === 'bottom'       ?  padding + footerPad
                   : paddingDir === 'topright'     ? -padding
                   : paddingDir.includes('bottom') ?  padding
                   : paddingDir === 'topleft'      ? -padding
                   : 0;

        worldCoords[0] += xPad;
        worldCoords[1] += yPad;

        const startX = worldCoords[0] - worldHalfWidth;   
        const startY = worldCoords[1] - worldHalfWidth;
        const endX = startX + worldWidth
        const endY = startY + worldWidth

        // Color
        const { r, g, b } = options.getColorOfType(type);
        let thisOpacity = opacity;

        // Opacity changing with distance
        // let maxAxisDist = math.chebyshevDistance(movement.getBoardPos(), pieceCoords) - 8;
        // opacity = Math.sin(maxAxisDist / 40) * 0.5

        // Are we hovering over? If so, opacity needs to be 100%
        const mouseWorldLocation = input.getMouseWorldLocation(); // [x,y]
        const mouseWorldX = input.getTouchClickedWorld() ? input.getTouchClickedWorld()[0] : mouseWorldLocation[0]
        const mouseWorldY = input.getTouchClickedWorld() ? input.getTouchClickedWorld()[1] : mouseWorldLocation[1]
        if (mouseWorldX > startX && mouseWorldX < endX && mouseWorldY > startY && mouseWorldY < endY) {
            thisOpacity = 1;
            hovering = true;
            // If we also clicked, then teleport!
            if (input.isMouseDown_Left() || input.getTouchClicked()) {
                let startCoords = movement.getBoardPos()
                let telCoords;
                if      (paddingDir === 'right' || paddingDir === 'left') telCoords = [pieceCoords[0], startCoords[1]]
                else if (paddingDir === 'top' || paddingDir === 'bottom') telCoords = [startCoords[0], pieceCoords[1]]
                else                                                      telCoords = [pieceCoords[0], pieceCoords[1]]
                transition.panTel(startCoords, telCoords)
                if (input.isMouseDown_Left()) input.removeMouseDown_Left()
            }
        }

        const thisData = bufferdata.getDataQuad_ColorTexture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY, r, g, b, thisOpacity)

        data.push(...thisData);

        // Next apphend the data of the little arrow!

        const dist = worldHalfWidth * 1;
        const size = 0.3 * worldHalfWidth;
        const points = [
            [dist, -size],
            [dist, +size],
            [dist+size, 0]
        ]

        const angle = paddingDir === 'top' ? 90
                    : paddingDir === 'left' ? 180
                    : paddingDir === 'bottom' ? 270
                    : paddingDir === 'topright' ? 45
                    : paddingDir === 'topleft' ? 135
                    : paddingDir === 'bottomleft' ? 225
                    : paddingDir === 'bottomright' ? 315
                    : 0;
        const ad = applyTransform(points, angle, worldCoords)

        for (let i = 0; i < ad.length; i++) {
            const thisPoint = ad[i]
            //                          x             y                color
            dataArrows.push(thisPoint[0], thisPoint[1],    0,0,0, thisOpacity )
        }
    }

    function applyTransform(points, rotation, translation) {
        // convert rotation angle to radians
        const angleRad = rotation * Math.PI / 180;
      
        // apply rotation matrix and translation vector to each point
        const transformedPoints = points.map(point => {
          const cos = Math.cos(angleRad);
          const sin = Math.sin(angleRad);
          const xRot = point[0] * cos - point[1] * sin;
          const yRot = point[0] * sin + point[1] * cos;
          const xTrans = xRot + translation[0];
          const yTrans = yRot + translation[1];
          return [xTrans, yTrans];
        });
      
        // return transformed points as an array of length-2 arrays
        return transformedPoints;
    }

    function renderThem() {
        if (mode === 0) return;
        if (model == null) return;

        // render.renderModel(model, undefined, undefined, "TRIANGLES", pieces.getSpritesheet())
        model.render();
        // render.renderModel(modelArrows, undefined, undefined, "TRIANGLES")
        modelArrows.render();
    }

    return Object.freeze({
        getMode,
        update,
        setMode,
        renderThem,
        isMouseHovering
    });

})();

