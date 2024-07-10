
// This script renders our single-line legal sliding moves
// when we are zoomed out far.

"use strict";

const highlightline = (function(){

    /** The buffer model of the legal move lines when zoomed out.
     * @type {BufferModel} */
    let modelLines;

    /** The buffer model of the mini piece that is
     * rendered when hovering over the legal move line.
     * @type {BufferModel} */
    let modelGhost;

    const perspectiveLimitToTeleport = 50;

    const opacityOfGhostImage = 1;

    // Also tests to see if the line is being hovered over, or clicked to transition.
    function genModel() {
        
        if (!movement.isScaleLess1Pixel_Virtual()) return; // Quit if we're not even zoomed out.
        if (!selection.isAPieceSelected()) return;

        const dataLines = []

        const legalmoves = math.deepCopyObject(selection.getLegalMovesOfSelectedPiece());
        const pieceCoords = selection.getPieceSelected().coords;
        const worldSpaceCoords = math.convertCoordToWorldSpace(pieceCoords)

        const color = math.deepCopyObject(options.getDefaultLegalMoveHighlight());
        color[3] = 1;

        const snapDist = miniimage.gwidthWorld() / 2;
        const snapPointsList = [];

        if (legalmoves.horizontal) {

            const left = math.convertCoordToWorldSpace_ClampEdge([legalmoves.horizontal[0], pieceCoords[1]])
            const right = math.convertCoordToWorldSpace_ClampEdge([legalmoves.horizontal[1], pieceCoords[1]])

            apphendLineToData(dataLines, left, right, color)

            const closestPoint = math.closestPointOnLine(left, right, input.getMouseWorldLocation()) // { coords, distance }
            closestPoint.moveset = legalmoves.horizontal;
            closestPoint.direction = 'horizontal';
            if (closestPoint.distance <= snapDist) snapPointsList.push(closestPoint)
        }

        if (legalmoves.vertical) {

            const bottom = math.convertCoordToWorldSpace_ClampEdge([pieceCoords[0], legalmoves.vertical[0]])
            const top = math.convertCoordToWorldSpace_ClampEdge([pieceCoords[0], legalmoves.vertical[1]])

            apphendLineToData(dataLines, bottom, top, color)

            const closestPoint = math.closestPointOnLine(bottom, top, input.getMouseWorldLocation())
            closestPoint.moveset = legalmoves.vertical;
            closestPoint.direction = 'vertical';
            if (closestPoint.distance <= snapDist) snapPointsList.push(closestPoint)
        }

        const a = perspective.distToRenderBoard
        /** @type {BoundingBox} */
        let boundingBox = perspective.getEnabled() ? { left: -a, right: a, bottom: -a, top: a } : camera.getScreenBoundingBox(false)
        
        up: if (legalmoves.diagonalUp) {

            const diag = math.getUpDiagonalFromCoords(worldSpaceCoords);

            let point1 = math.getIntersectionEntryTile(1, diag, boundingBox, "bottomleft")
            if (!point1) break up;
            const leftLimitPointCoord = getPointOfDiagSlideLimit(pieceCoords, legalmoves.diagonalUp, true, false)
            const leftLimitPointWorld = math.convertCoordToWorldSpace(leftLimitPointCoord)
            point1 = capPointAtSlideLimit(point1, leftLimitPointWorld, false)

            let point2 = math.getIntersectionEntryTile(1, diag, boundingBox, "topright")
            const rightLimitPointCoord = getPointOfDiagSlideLimit(pieceCoords, legalmoves.diagonalUp, true, true)
            const rightLimitPointWorld = math.convertCoordToWorldSpace(rightLimitPointCoord)
            point2 = capPointAtSlideLimit(point2, rightLimitPointWorld, true)

            apphendLineToData(dataLines, point1, point2, color)

            const closestPoint = math.closestPointOnLine(point1, point2, input.getMouseWorldLocation())
            closestPoint.moveset = legalmoves.diagonalUp;
            closestPoint.direction = 'diagonalup';
            if (closestPoint.distance <= snapDist) snapPointsList.push(closestPoint)
        }

        down: if (legalmoves.diagonalDown) {

            const diag = math.getDownDiagonalFromCoords(worldSpaceCoords);

            let point1 = math.getIntersectionEntryTile(-1, diag, boundingBox, "topleft")
            if (!point1) break down;
            const leftLimitPointCoord = getPointOfDiagSlideLimit(pieceCoords, legalmoves.diagonalDown, false, false)
            const leftLimitPointWorld = math.convertCoordToWorldSpace(leftLimitPointCoord)
            point1 = capPointAtSlideLimit(point1, leftLimitPointWorld, false)

            let point2 = math.getIntersectionEntryTile(-1, diag, boundingBox, "bottomright")
            const rightLimitPointCoord = getPointOfDiagSlideLimit(pieceCoords, legalmoves.diagonalDown, false, true)
            const rightLimitPointWorld = math.convertCoordToWorldSpace(rightLimitPointCoord)
            point2 = capPointAtSlideLimit(point2, rightLimitPointWorld, true)

            apphendLineToData(dataLines, point1, point2, color)

            const closestPoint = math.closestPointOnLine(point1, point2, input.getMouseWorldLocation())
            closestPoint.moveset = legalmoves.diagonalDown;
            closestPoint.direction = 'diagonaldown';
            if (closestPoint.distance <= snapDist) snapPointsList.push(closestPoint)
        }

        modelLines = buffermodel.createModel_Colored(new Float32Array(dataLines), 2, "LINES")

        // Ghost image...

        modelGhost = undefined;

        // In the future we'll still need to pass this point if we've got
        // key points that would trump clicking pieces
        if (miniimage.isHovering()) return;

        // Iterate through all snapping points to find the closest one to the mouse
        let closestPoint = snapPointsList[0];
        for (let i = 1; i < snapPointsList.length; i++) {
            const thisPoint = snapPointsList[i];
            if (thisPoint.distance < closestPoint.distance) closestPoint = thisPoint;
        }

        if (!closestPoint) return; // There were no snapping points, the mouse is not next to a line.

        // Generate the ghost image model

        const dataGhost = []

        const type = selection.getPieceSelected().type;

        const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
        const { texStartX, texStartY, texEndX, texEndY } = bufferdata.getTexDataOfType(type, rotation)

        const halfWidth = miniimage.gwidthWorld() / 2;

        const startX = closestPoint.coords[0] - halfWidth;
        const startY = closestPoint.coords[1] - halfWidth;
        const endX = startX + miniimage.gwidthWorld();
        const endY = startY + miniimage.gwidthWorld();

        const { r, g, b } = options.getColorOfType(type);

        const data = bufferdata.getDataQuad_ColorTexture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY, r, g, b, opacityOfGhostImage)

        dataGhost.push(...data)
        
        modelGhost = buffermodel.createModel_ColorTextured(new Float32Array(dataGhost), 2, "TRIANGLES", pieces.getSpritesheet())
        
        // If we clicked, teleport to the point on the line closest to the click location.
        // BUT we have to recalculate it in coords format instead of world-space

        if (!input.isMouseDown_Left() && !input.getTouchClicked()) return;

        const moveset = closestPoint.moveset;
        let point1;
        let point2;

        boundingBox = perspective.getEnabled() ? math.generatePerspectiveBoundingBox(perspectiveLimitToTeleport) : board.gboundingBox();

        if (closestPoint.direction === 'horizontal') {
            if (moveset[0] === -Infinity) moveset[0] = boundingBox.left;
            if (moveset[1] === Infinity)  moveset[1] = boundingBox.right;
            point1 = [moveset[0], pieceCoords[1]]
            point2 = [moveset[1], pieceCoords[1]]
        }

        else if (closestPoint.direction === 'vertical') {
            if (moveset[0] === -Infinity) moveset[0] = boundingBox.bottom;
            if (moveset[1] === Infinity)  moveset[1] = boundingBox.top;
            point1 = [pieceCoords[0], moveset[0]]
            point2 = [pieceCoords[0], moveset[1]]
        }

        else if (closestPoint.direction === 'diagonalup') {

            // Calculate the intersection tile of this diagonal with the left/bottom and right/top sides of the screen.
            const diag = math.getUpDiagonalFromCoords(pieceCoords) // mx + b
            const intsect1Tile = math.getIntersectionEntryTile(1, diag, boundingBox, 'bottomleft')
            const intsect2Tile = math.getIntersectionEntryTile(1, diag, boundingBox, 'topright')

            point1 = moveset[0] === -Infinity ? intsect1Tile : [moveset[0], pieceCoords[1] - (pieceCoords[0] - moveset[0])]
            point2 = moveset[1] ===  Infinity ? intsect2Tile : [moveset[1], pieceCoords[1] + moveset[1] - pieceCoords[0]]
        }

        else { // closestPoint.direction === 'diagonaldown'

            // Calculate the intersection tile of this diagonal with the left/bottom and right/top sides of the screen.
            const diag = math.getDownDiagonalFromCoords(pieceCoords) // mx + b
            const intsect1Tile = math.getIntersectionEntryTile(-1, diag, boundingBox, 'topleft')
            const intsect2Tile = math.getIntersectionEntryTile(-1, diag, boundingBox, 'bottomright')

            point1 = moveset[0] === -Infinity ? intsect1Tile : [moveset[0], pieceCoords[1] + pieceCoords[0] - moveset[0]]
            point2 = moveset[1] ===  Infinity ? intsect2Tile : [moveset[1], pieceCoords[1] - (moveset[1] - pieceCoords[0])]
        }

        let tileMouseFingerOver;
        if (input.getTouchClicked()) { // Set to what the finger tapped above
            // let touchClickedTile = input.getTouchClickedTile() // { id, x, y }
            // tileMouseFingerOver = [touchClickedTile.x, touchClickedTile.y]

            const tileMouseOver = board.getTileMouseOver(); // { tile_Float, tile_Int }
            tileMouseFingerOver = tileMouseOver.tile_Int;
        } else tileMouseFingerOver = board.gtile_MouseOver_Int();

        const closestCoordCoords = math.closestPointOnLine(point1, point2, tileMouseFingerOver).coords

        const tel = { endCoords: closestCoordCoords, endScale: 1 }
        // console.log("teleporting to " + closestCoordCoords)
        transition.teleport(tel)
    }
    
    function apphendLineToData (data, point1, point2, color) {

        const [ r, g, b, a ] = color;

        data.push(
            // Vertex               Color
            point1[0], point1[1],   r, g, b, a,
            point2[0], point2[1],   r, g, b, a
        )
    }
    
    function capPointAtSlideLimit(point, slideLimit, positive) { // slideLimit = [x,y]
        if (!positive  && point[0] < slideLimit[0]
          || positive && point[0] > slideLimit[0]) return slideLimit;
         return point;
    }

    function getPointOfDiagSlideLimit (pieceCoords, moveset, isDiagUp, positive) { // positive is true if it's the right/top

        const targetX = positive ? moveset[1] : moveset[0];
        const xDiff = targetX - pieceCoords[0]
        const yDiff = isDiagUp ? xDiff : -xDiff;

        return [pieceCoords[0]+xDiff, pieceCoords[1]+yDiff]
    }

    // Renders the legal slide move lines, and ghost image if hovering
    function render() {
        if (!movement.isScaleLess1Pixel_Virtual()) return; // Quit if we're not even zoomed out.
        if (!selection.isAPieceSelected()) return;
        if (!modelLines) { console.log("No highlightline model to render!"); return; }

        // render.renderModel(modelLines, undefined, undefined, "LINES")
        modelLines.render();

        // if (modelGhost) render.renderModel(modelGhost, undefined, undefined, "TRIANGLES", pieces.getSpritesheet())
        if (modelGhost) modelGhost.render();
    }

    return Object.freeze({
        genModel,
        render
    })

})();