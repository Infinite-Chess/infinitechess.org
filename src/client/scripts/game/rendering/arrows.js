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

    /** Whether our mouse is currently hovering over one arrow indicator.
     * Could be used to cancel other mouse events. */
    let hovering = false;

    /**
     * An object that stores the LegalMoves and highlights mesh for hippogonal
     * rider arrow indicators currently being hovered over!
     * `{ '20,2': { LegalMoves, mesh } }`
     */
    const hippogonalRidersHoveredOver = {};

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

        const slideArrows = {};

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

        const gamefile = game.getGamefile()
        const slides = gamefile.startSnapshot.slidingPossible

        for (const line of slides) {
            const perpendicular = [-line[1], line[0]];
            const linestr = math.getKeyFromCoords(line);
            
            let boardCornerLeft = math.getAABBCornerOfLine(perpendicular,true);
            let boardCornerRight = math.getAABBCornerOfLine(perpendicular,false);

            boardCornerLeft = math.getCornerOfBoundingBox(paddedBoundingBox,boardCornerLeft);
            boardCornerRight = math.getCornerOfBoundingBox(paddedBoundingBox,boardCornerRight);

            const boardSlidesRight = organizedlines.getCFromLine(line, boardCornerLeft);
            const boardSlidesLeft = organizedlines.getCFromLine(line, boardCornerRight);

            const boardSlidesStart = Math.min(boardSlidesLeft, boardSlidesRight);
            const boardSlidesEnd = Math.max(boardSlidesLeft, boardSlidesRight);
            for (const key in gamefile.piecesOrganizedByLines[linestr]) {
                const intsects = key.split("|").map(Number)
                if (boardSlidesStart > intsects[0] || boardSlidesEnd < intsects[0]) continue;
                const pieces = calcPiecesOffScreen(line, gamefile.piecesOrganizedByLines[linestr][key])

                if (math.isEmpty(pieces)) continue;

                if (!slideArrows[linestr]) slideArrows[linestr] = {};
                
                slideArrows[linestr][key] = pieces
            }
        }

        function calcPiecesOffScreen(line, organizedline) {

            const rightCorner = math.getCornerOfBoundingBox(paddedBoundingBox, math.getAABBCornerOfLine(line,false));

            let left;
            let right;
            for (var piece of organizedline) {
                if (!piece.coords) continue;
                
                // Is the piece off-screen?
                if (math.boxContainsSquare(boundingBox, piece.coords)) continue;
                
                const x = piece.coords[0];
                const y = piece.coords[1];
                const axis = line[0] == 0 ? 1 : 0;

                const rightSide = x > paddedBoundingBox.right || y > rightCorner[1] == (rightCorner[1]==paddedBoundingBox.top);
                if (rightSide) {
                    if (!right) right = piece;
                    else if (piece.coords[axis]<right.coords[axis]) right = piece;
                } else {
                    if (!left) left = piece;
                    else if (piece.coords[axis]>left.coords[axis]) left = piece;
                }
            }

            const dirs = {}
            if (right) dirs["r"]=right
            if (left) dirs["l"]=left
            return dirs
        }

        // If we are in only-show-attackers mode
        removeUnnecessaryArrows(slideArrows)

        // Calc the model data...

        // What will be the world-space width of our ghost images?
        const boardScale = movement.getBoardScale();
        const worldWidth = width * boardScale;
        let padding = (worldWidth/2) + sidePadding * boardScale;
        let cpadding=padding/boardScale
        {
            paddedBoundingBox.top-=cpadding;
            paddedBoundingBox.right-=cpadding;
            paddedBoundingBox.bottom+=cpadding;
            paddedBoundingBox.left+=cpadding
        }

        if (perspective.getEnabled()) padding = 0;
        for (const strline in slideArrows) {
            const line = math.getCoordsFromKey(strline)
            iterateThroughDiagLine(slideArrows[strline], line)
        }

        function iterateThroughDiagLine(lines, direction) {
            for (const diag in lines) {
                for (const side in lines[diag]) {
                    const piece = lines[diag][side]
                    let intersect=Number(diag.split("|")[0])
                    if (piece.type === 'voidsN') continue;
                    const isLeft = side==="l"
                    const corner = math.getAABBCornerOfLine(direction, isLeft)
                    const renderCoords = math.getLineIntersectionEntryTile(direction[0], direction[1], intersect, paddedBoundingBox, corner)
                    if (!renderCoords) continue;
                    const arrowDirection = isLeft ? [-direction[0],-direction[1]] : direction
                    concatData(renderCoords, piece.type, corner, worldWidth, 0, piece.coords, arrowDirection, !isLeft)
                }
            }
        }

        if (data.length === 0) return;
        
        model = buffermodel.createModel_ColorTextured(new Float32Array(data), 2, "TRIANGLES", pieces.getSpritesheet())
        modelArrows = buffermodel.createModel_Colored(new Float32Array(dataArrows), 2, "TRIANGLES")
    }

    /**
     * Removes asrrows based on the mode.
     * mode == 1 Removes arrows to pieces that cant slide in that direction
     * mode == 2 Like mode 1 but will keep any arrows in directions that a selected piece can move
     * Will not return anything as it alters the object it is given.
     * @param {Object} arrows 
     */
    function removeUnnecessaryArrows(arrows) {
        if (mode === 0) return;

        const gamefile = game.getGamefile();
        let attacklines = []
        attack: {
            if (mode!==2) break attack;
            const piece = selection.getPieceSelected()
            if (!piece) break attack;
            const slidingMoveset = legalmoves.getPieceMoveset(gamefile, piece.type).sliding;
            if (!slidingMoveset) break attack;
            attacklines = Object.keys(slidingMoveset);
        }
        for (const strline in arrows) {
            if (attacklines.includes(strline)) {continue;}
            removeTypesWithIncorrectMoveset(arrows[strline],strline)
            if (math.isEmpty(arrows[strline])) delete arrows[strline];
        }

        function removeTypesWithIncorrectMoveset(object, direction) { // horzRight, vertical/diagonalUp
            for (const key in object) {
                 // { type, coords }
                for (const side in object[key]) {
                    const type = object[key][side].type;
                    if (!doesTypeHaveMoveset(gamefile, type, direction)) delete object[key][side];
                }
                if (math.isEmpty(object[key])) delete object[key];
            }
        }

        function doesTypeHaveMoveset(gamefile, type, direction) {
            const moveset = legalmoves.getPieceMoveset(gamefile, type)
            if (!moveset.sliding) {return false;}
            return moveset.sliding[direction] != null;
        }
    }

    function concatData(renderCoords, type, paddingDir, worldWidth, padding, pieceCoords, direction) {
        const worldHalfWidth = worldWidth/2

        // Convert to world-space
        const worldCoords = math.convertCoordToWorldSpace(renderCoords)

        const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
        const { texStartX, texStartY, texEndX, texEndY } = bufferdata.getTexDataOfType(type, rotation)

        const xPad = paddingDir.includes('right') ? -padding
                   : paddingDir.includes('left')  ?  padding
                   : 0;

        const yPad = paddingDir.includes('top')          ? -padding
                   : paddingDir.includes('bottom')       ?  padding
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
            onIndicatorHover(pieceCoords, direction);
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

        // Next append the data of the little arrow!

        const dist = worldHalfWidth * 1;
        const size = 0.3 * worldHalfWidth;
        const points = [
            [dist, -size],
            [dist, +size],
            [dist+size, 0]
        ]

        const angle = Math.atan2(direction[1], direction[0])
        const ad = applyTransform(points, angle, worldCoords)

        for (let i = 0; i < ad.length; i++) {
            const thisPoint = ad[i]
            //                          x             y                color
            dataArrows.push(thisPoint[0], thisPoint[1],    0,0,0, thisOpacity )
        }
    }

    function applyTransform(points, rotation, translation) {
        // convert rotation angle to radians
      
        // apply rotation matrix and translation vector to each point
        const transformedPoints = points.map(point => {
          const cos = Math.cos(rotation);
          const sin = Math.sin(rotation);
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

    function onIndicatorHover(pieceCoords, direction) {
        if (!isDirectionHippogonal(direction)) return; // Not hippogonal mover (don't render their legal moves)

        // Check if their legal moves and mesh have already been stored

        const key = math.getKeyFromCoords(pieceCoords);
        if (key in hippogonalRidersHoveredOver) return; // Legal moves and mesh already calculated, continue to render them.

        // Calculate their legal moves and mesh!

        const gamefile = game.getGamefile();
        const thisRider = gamefileutility.getPieceAtCoords(gamefile, pieceCoords);
        const thisRiderLegalMoves = legalmoves.calculate(gamefile, thisRider)

        console.log(`Rider coords: ${key}. Calculated rider legal moves:`)
        console.log(thisRiderLegalMoves)

        // Calculate the mesh...

        const data = [];

        // Currently causing a crash
        // highlights.concatData_HighlightedMoves_Sliding(data, pieceCoords, thisRiderLegalMoves);
        // console.log(data);


        // Store both these objects inside hippogonalRidersHoveredOver

        // hippogonalRidersHoveredOver[key] = { legalMoves: thisRiderLegalMoves, mesh: data }
    }

    /**
     * Returns true if the provided direction/step is hippogonal,
     * not orthogonal or diagonal. A [2,0] directions counts as orthogonal here, not hippogonal.
     * @param {number[]} direction - [dx,dy]
     */
    function isDirectionHippogonal(direction) {
        const [dx,dy] = direction;
        if (dx === 0 || dy === 0) return false; // Orthogonal
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return true; // Hippogonal
        return false; // Diagonal
    }

    return Object.freeze({
        getMode,
        update,
        setMode,
        renderThem,
        isMouseHovering
    });

})();

