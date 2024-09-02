
// Import Start
import input from '../input.js';
import bufferdata from './bufferdata.js';
import perspective from './perspective.js';
import miniimage from './miniimage.js';
import board from './board.js';
import transition from './transition.js';
import organizedlines from '../chess/organizedlines.js';
import options from './options.js';
import selection from '../chess/selection.js';
import camera from './camera.js';
import pieces from './pieces.js';
import math from '../misc/math.js';
import movement from './movement.js';
import buffermodel from './buffermodel.js';
import jsutil from '../misc/jsutil.js';
// Import End

/**
 * Type Definitions
 * @typedef {import('./buffermodel.js').BufferModel} BufferModel
 * @typedef {import('../misc/math.js').BoundingBox} BoundingBox
 */

"use strict";

/**
 * This script renders our single-line legal sliding moves
 * when we are zoomed out far.
 */
const highlightline = (function() {

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

        const dataLines = [];

        const legalmoves = jsutil.deepCopyObject(selection.getLegalMovesOfSelectedPiece());
        const pieceCoords = selection.getPieceSelected().coords;
        const worldSpaceCoords = math.convertCoordToWorldSpace(pieceCoords);

        const color = jsutil.deepCopyObject(options.getLegalMoveHighlightColor());
        color[3] = 1;

        const snapDist = miniimage.gwidthWorld() / 2;
        
        const a = perspective.distToRenderBoard;
        /** @type {BoundingBox} */
        let boundingBox = perspective.getEnabled() ? { left: -a, right: a, bottom: -a, top: a } : camera.getScreenBoundingBox(false);
        
        const mouseLocation = input.getMouseWorldLocation();

        let closestDistance;
        let closestPoint;
        for (const strline in legalmoves.sliding) {
            const line = math.getCoordsFromKey(strline);
            const diag = organizedlines.getCFromLine(line, worldSpaceCoords);
            const lineIsVertical = line[0] === 0;
            
            const corner1 = math.getAABBCornerOfLine(line, true);
            
            let point1 = math.getLineIntersectionEntryTile(line[0], line[1], diag, boundingBox, corner1);
            if (!point1) continue;
            const leftLimitPointCoord = getPointOfDiagSlideLimit(pieceCoords, legalmoves.sliding[strline], line, false);
            const leftLimitPointWorld = math.convertCoordToWorldSpace(leftLimitPointCoord);
            point1 = capPointAtSlideLimit(point1, leftLimitPointWorld, false, lineIsVertical);

            const corner2 = math.getAABBCornerOfLine(line, false);

            let point2 = math.getLineIntersectionEntryTile(line[0], line[1], diag, boundingBox, corner2);
            if (!point2) continue; // I hate this
            const rightLimitPointCoord = getPointOfDiagSlideLimit(pieceCoords, legalmoves.sliding[strline], line, true);
            const rightLimitPointWorld = math.convertCoordToWorldSpace(rightLimitPointCoord);
            point2 = capPointAtSlideLimit(point2, rightLimitPointWorld, true, lineIsVertical);

            appendLineToData(dataLines, point1, point2, color);
            
            const snapPoint = math.closestPointOnLine(point1, point2, mouseLocation);
            if (!closestDistance) { if (snapPoint.distance > snapDist) continue; }
            else if (snapPoint.distance > closestDistance) {continue;}
            closestDistance = snapPoint.distance;
            snapPoint.moveset = legalmoves.sliding[strline];
            snapPoint.line = line;
            closestPoint = snapPoint;
        };
        
        modelLines = buffermodel.createModel_Colored(new Float32Array(dataLines), 2, "LINES");

        // Ghost image...

        modelGhost = undefined;

        // In the future we'll still need to pass this point if we've got
        // key points that would trump clicking pieces
        if (miniimage.isHovering()) return;

        if (!closestPoint) return; // There were no snapping points, the mouse is not next to a line.
        // Generate the ghost image model

        const dataGhost = [];

        const type = selection.getPieceSelected().type;

        const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
        const { texStartX, texStartY, texEndX, texEndY } = bufferdata.getTexDataOfType(type, rotation);

        const halfWidth = miniimage.gwidthWorld() / 2;

        const startX = closestPoint.coords[0] - halfWidth;
        const startY = closestPoint.coords[1] - halfWidth;
        const endX = startX + miniimage.gwidthWorld();
        const endY = startY + miniimage.gwidthWorld();

        const { r, g, b } = options.getColorOfType(type);

        const data = bufferdata.getDataQuad_ColorTexture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY, r, g, b, opacityOfGhostImage);

        dataGhost.push(...data);
        
        modelGhost = buffermodel.createModel_ColorTextured(new Float32Array(dataGhost), 2, "TRIANGLES", pieces.getSpritesheet());
        
        // If we clicked, teleport to the point on the line closest to the click location.
        // BUT we have to recalculate it in coords format instead of world-space

        if (!input.isMouseDown_Left() && !input.getTouchClicked()) return;

        const moveset = closestPoint.moveset;
        let point1;
        let point2;

        boundingBox = perspective.getEnabled() ? math.generatePerspectiveBoundingBox(perspectiveLimitToTeleport) : board.gboundingBox();

        const line = closestPoint.line;
        const diag = organizedlines.getCFromLine(line, pieceCoords);
        const lineIsVertical = line[0] === 0;

        const corner1 = math.getAABBCornerOfLine(line, true);

        point1 = math.getLineIntersectionEntryTile(line[0], line[1], diag, boundingBox, corner1);
        const leftLimitPointCoord = getPointOfDiagSlideLimit(pieceCoords, moveset, line, false);
        point1 = capPointAtSlideLimit(point1, leftLimitPointCoord, false, lineIsVertical);

        const corner2 = math.getAABBCornerOfLine(line, false);

        point2 = math.getLineIntersectionEntryTile(line[0], line[1], diag, boundingBox, corner2);
        const rightLimitPointCoord = getPointOfDiagSlideLimit(pieceCoords, moveset, line, true);
        point2 = capPointAtSlideLimit(point2, rightLimitPointCoord, true, lineIsVertical);

        let tileMouseFingerOver;
        if (input.getTouchClicked()) { // Set to what the finger tapped above
            // let touchClickedTile = input.getTouchClickedTile() // { id, x, y }
            // tileMouseFingerOver = [touchClickedTile.x, touchClickedTile.y]

            const tileMouseOver = board.getTileMouseOver(); // { tile_Float, tile_Int }
            tileMouseFingerOver = tileMouseOver.tile_Int;
        } else tileMouseFingerOver = board.gtile_MouseOver_Int();

        const closestCoordCoords = math.closestPointOnLine(point1, point2, tileMouseFingerOver).coords;

        const tel = { endCoords: closestCoordCoords, endScale: 1 };
        // console.log("teleporting to " + closestCoordCoords)
        transition.teleport(tel);
    }
    
    function appendLineToData(data, point1, point2, color) {

        const [ r, g, b, a ] = color;

        data.push(
            // Vertex               Color
            point1[0], point1[1], r, g, b, a,
            point2[0], point2[1], r, g, b, a
        );
    }
    
    function capPointAtSlideLimit(point, slideLimit, positive, lineIsVertical) { // slideLimit = [x,y]
        const cappingAxis = lineIsVertical ? 1 : 0;
        if (!positive && point[cappingAxis] < slideLimit[cappingAxis]
          || positive && point[cappingAxis] > slideLimit[cappingAxis]) return slideLimit;
        return point;
    }

    function getPointOfDiagSlideLimit(pieceCoords, moveset, line, positive) { // positive is true if it's the right/top
        const steps = positive ? moveset[1] : moveset[0];
        const yDiff = line[1] * steps;
        const xDiff = line[0] * steps;
        return [pieceCoords[0] + xDiff, pieceCoords[1] + yDiff];
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
    });

})();

export default highlightline;