
// This script handles the rendering of legal jumping (no sliding) moves,
// and also hilights the last move played.

"use strict";

const highlights = (function(){

    const highlightedMovesRegenRange = 10_000; // Not every highlighted move can be calculated every frame because it's infinite. So we render them out to a specified distance. This is NOT that specified distance. This is the distance to at which to call the function to recalculate the model of the highlighted moves (the out-of-bounds)
    
    /**
     * The board bounding box in which to render the legal move fields.
     * This dynamically grows and shrinks as you move around while a piece is selected.
     * @type {BoundingBox}
     */
    let boundingBoxOfRenderRange;
    // Amount of screens in length to render highlighted squares, beyond the screen.
    // This is useful because it means there's some cushioning when the user pans and
    // zooms around that we don't instantly need to regenerate the model.
    const multiplier = 4
    const multiplier_perspective = 2

    /** The vertex data of our blue legal move fields. */
    let data;
    /** The buffer model of the blue legal move fields.
     * @type {BufferModel} */
    let model;
    let model_Offset; // [x,y]

    const z = -0.01;

    function render() {
        if (movement.isScaleLess1Pixel_Virtual()) return; // Quit if we're zoomed out.

        highlightLastMove()
        checkhighlight.render()
        renderLegalMoves()
    }

    function renderLegalMoves() {

        if (!selection.isAPieceSelected()) return; // Only render if we have a highlighted squares model to use (will be undefined if none are highlighted)
        
        // Do we need to recalculate the buffer model of highlights?
        if (isRenderRangeBoundingBoxOutOfRange()
        /* || math.isOrthogonalDistanceGreaterThanValue(model_Offset, movement.getBoardPos(), highlightedMovesRegenRange)*/) regenModel();
        // Pretty sure the above is never needed because the render bounding box will always change and
        // subsequently regenerate the model before we ever get more than 10,000 squares away for it to get gittery.

        const boardPos = movement.getBoardPos();
        const position = [
            -boardPos[0] + model_Offset[0], // Add the model's offset
            -boardPos[1] + model_Offset[1],
            0
        ]
        const boardScale = movement.getBoardScale();
        const scale = [boardScale, boardScale, 1]
        // render.renderModel(model, position, scale, "TRIANGLES")
        model.render(position, scale);

        if (options.isDebugModeOn()) renderBoundingBoxOfRenderRange();
    }

    // Regenerates the model for all highlighted squares. Expensive, minimize calling this.
    function regenModel() {
        if (!selection.isAPieceSelected()) return;
        main.renderThisFrame()
        // This is the range at which we will always regen this model. Prevents gittering, but also needed because we can't render all infinite highlights at once.
        model_Offset = math.roundPointToNearestGridpoint(movement.getBoardPos(), highlightedMovesRegenRange)

        // Initate the variable that will store our vertex data
        data = []

        // 1 square data of our single selected piece
        const selectedPieceHighlightData = calcHighlightData_SelectedPiece()
        data.push(...selectedPieceHighlightData)

        // Data of short range moves within 3 tiles
        const legalMovesHighlightData = calcHighlightData_ShortMoves()
        data.push(...legalMovesHighlightData)

        // Potentially infinite data on sliding moves...

        initBoundingBoxOfRenderRange()

        concatData_HighlightedMoves_Sliding()

        model = buffermodel.createModel_Colored(new Float32Array(data), 3, "TRIANGLES")
    }

    function calcHighlightData_SelectedPiece() {
        const color = options.getDefaultSelectedPieceHighlight();
        return bufferdata.getDataQuad_Color3D_FromCoord_WithOffset(model_Offset, selection.getPieceSelected().coords, z, color)
    }

    // Calculates buffer data of legal individual moves selected piece can move to
    function calcHighlightData_ShortMoves() {
        // Get an array of the list of legal squares the current selected piece can move to
        const theseLegalMoves = selection.getLegalMovesOfSelectedPiece().individual

        const legalMovesHighlightColor = options.getDefaultLegalMoveHighlight();

        const data = []

        // For each of these squares, calculate it's buffer data
        const length = !theseLegalMoves ? 0 : theseLegalMoves.length;
        for (let i = 0; i < length; i++) {
            data.push(...bufferdata.getDataQuad_Color3D_FromCoord_WithOffset(model_Offset, theseLegalMoves[i], z, legalMovesHighlightColor))
        }

        return data;
    }

    // Processes current offset and render range to return the bounding box of the area we will be rendering highlights.
    function initBoundingBoxOfRenderRange() {
        // console.log("Recalculating bounding box of render range.")

        const [ newWidth, newHeight ] = perspective.getEnabled() ? getDimensionsOfPerspectiveViewRange()
                                                              : getDimensionsOfOrthographicViewRange()

        const halfNewWidth = newWidth / 2;
        const halfNewHeight = newHeight / 2;

        const boardPos = movement.getBoardPos();
        const newLeft = Math.ceil(boardPos[0] - halfNewWidth)
        const newRight = Math.floor(boardPos[0] + halfNewWidth)
        const newBottom = Math.ceil(boardPos[1] - halfNewHeight)
        const newTop = Math.floor(boardPos[1] + halfNewHeight)

        boundingBoxOfRenderRange = { 
            left: newLeft,
            right: newRight,
            bottom: newBottom,
            top: newTop
        };
    }

    function getDimensionsOfOrthographicViewRange() {
        // New improved method of calculating render bounding box

        // The center of the bounding box is our current boardPos
        
        let width = board.gboundingBox().right - board.gboundingBox().left + 1;
        let height = board.gboundingBox().top - board.gboundingBox().bottom + 1;

        let newWidth = width * multiplier;
        let newHeight = height * multiplier;

        // Make sure width has a cap so we aren't generating a model stupidly large
        // Cap width = width of screen in pixels, * multiplier
        const capWidth = camera.canvas.width * multiplier;
        if (newWidth > capWidth) {
            const ratio = capWidth / newWidth;
            newWidth *= ratio;
            newHeight *= ratio;
        }

        return [newWidth, newHeight]
    }

    function getDimensionsOfPerspectiveViewRange() {
        let width = perspective.viewRange * 2;
        let newWidth = width * multiplier_perspective
        return [newWidth, newWidth]
    }

    function isRenderRangeBoundingBoxOutOfRange() {

        const boundingBoxOfView = perspective.getEnabled() ? getBoundingBoxOfPerspectiveView()
                                                           : board.gboundingBox();

        // If our screen bounding box is less than 3x smaller than our render range bounding box,
        // we're wasting cpu, let's regenerate it.
        const width = boundingBoxOfView.right - boundingBoxOfView.left + 1;

        const renderRangeWidth = boundingBoxOfRenderRange.right - boundingBoxOfRenderRange.left + 1;

        // multiplier needs to be squared cause otherwise when we zoom in it regenerates the render box every frame.
        if (width * multiplier * multiplier < renderRangeWidth && !perspective.getEnabled()) return true;

        // If any edge of our screen bounding box is outside our render range bounding box, regenerate it.
        if (!math.boxContainsBox(boundingBoxOfRenderRange, boundingBoxOfView)) return true;

        return false;
    }

    function getBoundingBoxOfPerspectiveView() {

        const boardPos = movement.getBoardPos();
        const x = boardPos[0]
        const y = boardPos[1]

        const a = perspective.viewRange;

        const left = x - a;
        const right = x + a;
        const bottom = y - a;
        const top = y + a;

        return { left, right, bottom, top }
    }

    // Calculates buffer data of legal sliding moves.
    // renderBoundingBox should always be greater than screen bounding box
    // Concats the highlighted square sliding move data to  data
    function concatData_HighlightedMoves_Sliding () { // { left, right, bottom, top} The size of the box we should render within

        const coords = selection.getPieceSelected().coords

        const legalMovesHighlightColor = options.getDefaultLegalMoveHighlight();

        const [r,g,b,a] = legalMovesHighlightColor;

        // How do we go about calculating the vertex data of our sliding moves?
        // We COULD minimize how often we regenerate the buffer model by extending these lines beyond our field of view.
        // BUT currently we're regenerating every frame so let's just render to screen edge!

        // First we need to calculate the data of the horizontal slide
        concatData_HighlightedMoves_Sliding_Horz(coords, boundingBoxOfRenderRange.left, boundingBoxOfRenderRange.right)

        // Calculate the data of the vertical slide
        concatData_HighlightedMoves_Sliding_Vert(coords, boundingBoxOfRenderRange.bottom, boundingBoxOfRenderRange.top)

        // Calculate the data of the up diagonal
        concatData_HighlightedMoves_Diagonal_Up(coords, boundingBoxOfRenderRange, r, g, b, a)

        // Calculate the data of the down diagonal
        concatData_HighlightedMoves_Diagonal_Down(coords, boundingBoxOfRenderRange, r, g, b, a)
    }

    function concatData_HighlightedMoves_Sliding_Horz(coords, left, right) {
        const legalMoves = selection.getLegalMovesOfSelectedPiece()
        if (!legalMoves.horizontal) return; // Break if no legal horizontal slide

        const [r,g,b,a] = options.getDefaultLegalMoveHighlight();

        // Left

        let startXWithoutOffset = legalMoves.horizontal[0] - board.gsquareCenter()
        if (startXWithoutOffset < left - board.gsquareCenter()) startXWithoutOffset = left - board.gsquareCenter()

        let startX = startXWithoutOffset - model_Offset[0];
        let startY = coords[1] - board.gsquareCenter() - model_Offset[1];
        let endX = coords[0] - board.gsquareCenter() - model_Offset[0];
        let endY = startY + 1;

        data.push(...bufferdata.getDataQuad_Color3D(startX, startY, endX, endY, z, r, g, b, a))

        // Right

        startXWithoutOffset = legalMoves.horizontal[1] + 1 - board.gsquareCenter()
        if (startXWithoutOffset > right + 1 - board.gsquareCenter()) startXWithoutOffset = right + 1 - board.gsquareCenter()

        startX = startXWithoutOffset - model_Offset[0];
        startY = coords[1] - board.gsquareCenter() - model_Offset[1];
        endX = coords[0] + 1 - board.gsquareCenter() - model_Offset[0];
        endY = startY + 1;

        data.push(...bufferdata.getDataQuad_Color3D(startX, startY, endX, endY, z, r, g, b, a))
    }

    function concatData_HighlightedMoves_Sliding_Vert (coords, bottom, top) {
        const legalMoves = selection.getLegalMovesOfSelectedPiece()
        if (!legalMoves.vertical)  return; // Break if there no legal vertical slide

        const [r,g,b,a] = options.getDefaultLegalMoveHighlight();

        // Bottom

        let startYWithoutOffset = legalMoves.vertical[0] - board.gsquareCenter()
        if (startYWithoutOffset < bottom - board.gsquareCenter()) startYWithoutOffset = bottom - board.gsquareCenter()

        let startY = startYWithoutOffset - model_Offset[1];
        let startX = coords[0] - board.gsquareCenter() - model_Offset[0];
        let endY = coords[1] - board.gsquareCenter() - model_Offset[1];
        let endX = startX + 1;

        data.push(...bufferdata.getDataQuad_Color3D(startX, startY, endX, endY, z, r, g, b, a))

        // Top

        startYWithoutOffset = legalMoves.vertical[1] + 1 - board.gsquareCenter()
        if (startYWithoutOffset > top + 1 - board.gsquareCenter()) startYWithoutOffset = top + 1 - board.gsquareCenter()

        startY = startYWithoutOffset - model_Offset[1];
        startX = coords[0] - board.gsquareCenter() - model_Offset[0];
        endY = coords[1] + 1 - board.gsquareCenter() - model_Offset[1];
        endX = startX + 1;

        data.push(...bufferdata.getDataQuad_Color3D(startX, startY, endX, endY, z, r, g, b, a))
    }

    function concatData_HighlightedMoves_Diagonal_Up (coords, renderBoundingBox, r, g, b, a) {
        const legalMoves = selection.getLegalMovesOfSelectedPiece()
        if (!legalMoves.diagonalUp) return;

        // Calculate the intersection tile of this diagonal with the left/bottom and right/top sides of the screen.
        const lineEqua = math.getUpDiagonalFromCoords(coords) // mx + b
        const intsect1Tile = math.getIntersectionEntryTile(1, lineEqua, renderBoundingBox, 'bottomleft')
        const intsect2Tile = math.getIntersectionEntryTile(1, lineEqua, renderBoundingBox, 'topright')

        if (!intsect1Tile) return; // If there's no intersection point, it's off the screen, don't bother rendering.

        { // Down Left moveset
            let startTile = intsect2Tile
            let endTile = intsect1Tile

            // Make sure it doesn't start before the tile right in front of us
            if (startTile[0] > coords[0] - 1) startTile = [coords[0] - 1, coords[1] - 1]
            let diagonalUpLimit = legalMoves.diagonalUp[0]

            // Make sure it doesn't phase through our move limit
            if (endTile[0] < diagonalUpLimit) {
                endTile[0] = diagonalUpLimit
                endTile[1] = startTile[1] + diagonalUpLimit - startTile[0]
            }

            // How many times will we iterate?
            let iterateCount = startTile[0] - endTile[0] + 1
            if (iterateCount < 0) iterateCount = 0

            // Init starting coords of the data, this will increment by 1 every iteration
            let currentX = startTile[0] - board.gsquareCenter() + 1 - model_Offset[0]
            let currentY = startTile[1] - board.gsquareCenter() + 1 - model_Offset[1]
            
            // Generate data of each highlighted square
            addDataDiagonalVariant(iterateCount, currentX, currentY, -1, -1, r, g, b, a)
        }

        { // Up Right moveset
            let startTile = intsect1Tile
            let endTile = intsect2Tile

            // Make sure it doesn't start before the tile right in front of us
            if (startTile[0] < coords[0] + 1) startTile = [coords[0] + 1, coords[1] + 1]
            let diagonalUpLimit = legalMoves.diagonalUp[1]

            // Make sure it doesn't phase through our move limit
            if (endTile[0] > diagonalUpLimit) {
                endTile[0] = diagonalUpLimit
                endTile[1] = startTile[1] + diagonalUpLimit - startTile[0]
            }

            // How many times will we iterate?
            let iterateCount = endTile[0] - startTile[0] + 1
            if (iterateCount < 0) iterateCount = 0

            // Init starting coords of the data, this will increment by 1 every iteration
            let currentX = startTile[0] - board.gsquareCenter() - model_Offset[0]
            let currentY = startTile[1] - board.gsquareCenter() - model_Offset[1]
            
            // Generate data of each highlighted square
            addDataDiagonalVariant(iterateCount, currentX, currentY, +1, +1, r, g, b, a)
        }
    }

    function concatData_HighlightedMoves_Diagonal_Down (coords, renderBoundingBox, r, g, b, a) {
        const legalMoves = selection.getLegalMovesOfSelectedPiece()
        if (!legalMoves.diagonalDown) return; // Quit if there isn't a diagonal down path.

        // Calculate the intersection tile of this diagonal with the left/top and right/bottom sides of the screen.
        const lineEqua = math.getDownDiagonalFromCoords(coords) // mx + b
        const intsect1Tile = math.getIntersectionEntryTile(-1, lineEqua, renderBoundingBox, 'topleft')
        const intsect2Tile = math.getIntersectionEntryTile(-1, lineEqua, renderBoundingBox, 'bottomright')

        if (!intsect1Tile) return; // If there's no intersection point, it's off the screen, don't bother rendering.

        { // Up Left moveset
            let startTile = intsect2Tile
            let endTile = intsect1Tile
            
            // Make sure it doesn't start before the tile right in front of us
            if (startTile[0] > coords[0] - 1) startTile = [coords[0] - 1, coords[1] + 1]
            let diagonalDownLimit = legalMoves.diagonalDown[0]

            // Make sure it doesn't phase through our move limit
            if (endTile[0] < diagonalDownLimit) {
                endTile[0] = diagonalDownLimit
                endTile[1] = startTile[1] + startTile[0] - diagonalDownLimit
            }

            // How many times will we iterate?
            let iterateCount = startTile[0] - endTile[0] + 1
            if (iterateCount < 0) iterateCount = 0

            // Init starting coords of the data, this will increment by 1 every iteration
            let currentX = startTile[0] - board.gsquareCenter() + 1 - model_Offset[0]
            let currentY = startTile[1] - board.gsquareCenter()     - model_Offset[1]
            
            // Generate data of each highlighted square
            addDataDiagonalVariant(iterateCount, currentX, currentY, -1, +1, r, g, b, a)
        }

        { // Down Right moveset

            let startTile = intsect1Tile
            let endTile = intsect2Tile

            // Make sure it doesn't start before the tile right in front of us
            if (startTile[0] < coords[0] + 1) startTile = [coords[0] + 1, coords[1] - 1]
            let diagonalDownLimit = legalMoves.diagonalDown[1]

            // Make sure it doesn't phase through our move limit
            if (endTile[0] > diagonalDownLimit) {
                endTile[0] = diagonalDownLimit
                endTile[1] = startTile[1] + diagonalDownLimit - startTile[0]
            }

            // How many times will we iterate?
            let iterateCount = endTile[0] - startTile[0] + 1
            if (iterateCount < 0) iterateCount = 0

            // Init starting coords of the data, this will increment by 1 every iteration
            let currentX = startTile[0] - board.gsquareCenter()     - model_Offset[0]
            let currentY = startTile[1] - board.gsquareCenter() + 1 - model_Offset[1]
            
            // Generate data of each highlighted square
            addDataDiagonalVariant(iterateCount, currentX, currentY, +1, -1, r, g, b, a)
        }
    }

    // Calculates the vertex data of a single diagonal direction eminating from piece. Current x & y is the starting values, followed by the hop values which are -1 or +1 dependant on the direction we're rendering
    function addDataDiagonalVariant (iterateCount, currentX, currentY, xHop, yHop, r, g, b, a) {

        for (let i = 0; i < iterateCount; i++) { 
            const endX = currentX + xHop
            const endY = currentY + yHop

            data.push(...bufferdata.getDataQuad_Color3D(currentX, currentY, endX, endY, z, r, g, b, a))

            // Prepare for next iteration
            currentX = endX
            currentY = endY
        }
    }

    // Generates buffer model and renders the outline of the render range of our highlights, useful in developer mode.
    function renderBoundingBoxOfRenderRange() {
        const color = [1,0,1, 1];
        const data = bufferdata.getDataRect_FromTileBoundingBox(boundingBoxOfRenderRange, color);

        // const model = buffermodel.createModel_Color(new Float32Array(data));
        const model = buffermodel.createModel_Colored(new Float32Array(data), 2, "LINE_LOOP");

        model.render()
    }

    function highlightLastMove() {
        const lastMove = movesscript.getCurrentMove(game.getGamefile())
        if (!lastMove) return; // Don't render if last move is undefined.

        const color = options.getDefaultLastMoveHighlightColor();

        const data = [];

        data.push(...bufferdata.getDataQuad_Color3D_FromCoord(lastMove.startCoords, z, color))
        data.push(...bufferdata.getDataQuad_Color3D_FromCoord(lastMove.endCoords, z, color))

        const model = buffermodel.createModel_Colored(new Float32Array(data), 3, "TRIANGLES")

        model.render();
    }


    return Object.freeze({
        render,
        regenModel
    })

})();