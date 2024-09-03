
import board from "../rendering/board.js";
import camera from "../rendering/camera.js";
import movement from "../rendering/movement.js";

/**
 * This script converts world-space coordinates to square coordinates, and vice verca.
 * 
 * Where square coordinates are where the pieces are located,
 * world-space coordinates are where in space objects are actually rendered.
 * 
 * There is also pixel space, which is the [x,y] coordinate of virtual pixels on the screen.
 */
const space = (function() {

    function convertWorldSpaceToCoords(worldCoords) {

        const boardPos = movement.getBoardPos();
        const boardScale = movement.getBoardScale();
        const xCoord = worldCoords[0] / boardScale + boardPos[0];
        const yCoord = worldCoords[1] / boardScale + boardPos[1];

        return [xCoord, yCoord];
    }

    function convertWorldSpaceToCoords_Rounded(worldCoords) {

        const boardPos = movement.getBoardPos();
        const boardScale = movement.getBoardScale();
        const xCoord = worldCoords[0] / boardScale + boardPos[0];
        const yCoord = worldCoords[1] / boardScale + boardPos[1];

        const squareCenter = board.gsquareCenter();
        return [Math.floor(xCoord + squareCenter), Math.floor(yCoord + squareCenter)];
    }

    // Takes a square coordinate, returns the world-space location of the square's VISUAL center! Dependant on board.gsquareCenter().
    function convertCoordToWorldSpace(coords, position = movement.getBoardPos(), scale = movement.getBoardScale()) {

        const worldX = (coords[0] - position[0] + 0.5 - board.gsquareCenter()) * scale;
        const worldY = (coords[1] - position[1] + 0.5 - board.gsquareCenter()) * scale;

        return [worldX, worldY];
    }

    function convertPixelsToWorldSpace_Virtual(value) {
        return (value / camera.getCanvasHeightVirtualPixels()) * (camera.getScreenBoundingBox(false).top - camera.getScreenBoundingBox(false).bottom);
    }

    function convertWorldSpaceToPixels_Virtual(value) {
        return (value / (camera.getScreenBoundingBox(false).top - camera.getScreenBoundingBox(false).bottom)) * camera.getCanvasHeightVirtualPixels();
    }

    function convertWorldSpaceToGrid(value) {
        return value / movement.getBoardScale();
    }

    return Object.freeze({
        convertWorldSpaceToCoords,
        convertWorldSpaceToCoords_Rounded,
        convertCoordToWorldSpace,
        convertPixelsToWorldSpace_Virtual,
        convertWorldSpaceToPixels_Virtual,
        convertWorldSpaceToGrid,
    });

})();

export default space;