// Import Start
import { transition } from './transition.mjs'
import { movement } from './movement.mjs'
import { camera } from './camera.mjs'
import { board } from './board.mjs'
import { gamefileutility } from '../chess/gamefileutility.mjs'
import { math } from '../misc/math.mjs'
// Import End


/**
 * This script handles the calculation of the "Area"s on screen that
 * will contain the desired list of piece coordinates when at a specific
 * camera position and scale (zoom), which can be used to tell
 * {@link transition} where to teleport to.
 */

"use strict";

/**
 * An area object, containing the information {@link transition} needs
 * to teleport/transition to this location on the board.
 * @typedef {Object} Area
 * @property {number[]} coords - The coordinates of the area
 * @property {number} scale - The camera scale (zoom) of the area
 * @property {Object} boundingBox - The bounding box that contains the area of interest.
 */

const area = (function() {

    const padding = 0.03; // As a percentage of the screen WIDTH/HEIGHT (subtract the navigation bars height)
    const paddingMiniimage = 0.2; // The padding to use when miniimages are visible (zoomed out far)
    const capScale = 1.4; // Divided by screen width

    // Just the action of adding padding, changes the required scale to have that amount of padding,
    // so we need to iterate it a few times for more accuracy.
    const iterationsToRecalcPadding = 10;

    /**
     * Calculates the area object that contains every coordinate in the provided list, *with padding added*,
     * and contains the optional {@link existingBox} bounding box.
     * @param {number[][]} coordsList - An array of coordinates, typically of the pieces.
     * @param {BoundingBox} [existingBox] A bounding box to merge with, if specified.
     * @returns {Area} The area object
     */
    function calculateFromCoordsList(coordsList, existingBox) {
        if (!coordsList) return console.error("Cannot calculate area from an undefined coords list.");
        if (coordsList.length === 0) return console.error("Cannot calculate area from an empty coords list.");

        let box = math.getBoxFromCoordsList(coordsList); // Unpadded
        if (existingBox) box = math.mergeBoundingBoxes(box, existingBox); // Unpadded
        
        return calculateFromUnpaddedBox(box);
    }
    
    /**
     * Calulates the area object from the provided bounding box, *with padding added*.
     * @param {BoundingBox} box - A BoundingBox object.
     * @returns {Area} The area object
     */
    function calculateFromUnpaddedBox(box) {
        if (!box) return console.error("Cannot calculate area from an undefined box.");

        const paddedBox = applyPaddingToBox(box);
        return calculateFromBox(paddedBox);
    }

    /**
     * Returns a new bounding box, with added padding so the pieces
     * aren't too close to the edge or underneath the navigation bar.
     * @param {BoundingBox} box - The source bounding box
     * @returns {BoundingBox} The new bounding box
     */
    function applyPaddingToBox(box) { // { left, right, bottom, top }
        if (!box) { console.error("Cannot apply padding to an undefined box."); return box; }
        const boxCopy = math.deepCopyObject(box);
        
        const topNavHeight = camera.getPIXEL_HEIGHT_OF_TOP_NAV();
        const bottomNavHeight = camera.getPIXEL_HEIGHT_OF_BOTTOM_NAV();
        const navHeight = topNavHeight + bottomNavHeight;
        const canvasHeightVirtualSubNav = camera.getCanvasHeightVirtualPixels() - navHeight;
        
        // Round to the furthest away edge of the square.
        const squareCenter = board.gsquareCenter();
        boxCopy.left -= squareCenter;
        boxCopy.right += 1 - squareCenter;
        boxCopy.bottom -= squareCenter;
        boxCopy.top += 1 - squareCenter;

        /** Start with a copy with zero padding.
         * @type {BoundingBox} */
        let paddedBox = math.deepCopyObject(boxCopy);
        let scale = calcScaleToMatchSides(paddedBox);

        // Iterate until we have desired padding
        if (iterationsToRecalcPadding <= 0) { console.error("iterationsToRecalcPadding must be greater than 0!"); return boxCopy; }
        for (let i = 0; i < iterationsToRecalcPadding; i++) {

            const paddingToUse = scale < movement.getScale_When1TileIs1Pixel_Virtual() ? paddingMiniimage : padding;
            const paddingHorzPixels = camera.getCanvasWidthVirtualPixels() * paddingToUse;
            const paddingVertPixels = canvasHeightVirtualSubNav * paddingToUse + bottomNavHeight;

            const paddingHorzWorld = math.convertPixelsToWorldSpace_Virtual(paddingHorzPixels);
            const paddingVertWorld = math.convertPixelsToWorldSpace_Virtual(paddingVertPixels);
            const paddingHorz = paddingHorzWorld / scale;
            const paddingVert = paddingVertWorld / scale;

            paddedBox = addPaddingToBoundingBox(boxCopy, paddingHorz, paddingVert);

            // Prep for next iteration
            scale = calcScaleToMatchSides(paddedBox);
        }

        return paddedBox;
    }

    /**
     * Calculates an Area object from the given bounding box.
     * The box must come PRE-PADDED.
     * @param {BoundingBox} box - The bounding box
     * @returns {Area} The area object
     */
    function calculateFromBox(box) { // { left, right, bottom, top }
        if (!box) return console.error("Cannot calculate area from an undefined box.");

        // The new boardPos is the middle point
        const xHalfLength = (box.right - box.left) / 2;
        const yHalfLength = (box.top - box.bottom) / 2;
        const centerX = box.left + xHalfLength;
        const centerY = box.bottom + yHalfLength;
        const newBoardPos = [centerX, centerY];

        // What is the scale required to match the sides?
        const newScale = calcScaleToMatchSides(box);

        // Now maximize the bounding box to fill entire screen when at position and scale, so that
        // we don't have long thin slices of a bounding box that will fail the math.boxContainsSquare() function EVEN
        // if the square is visible on screen!
        box = math.getBoundingBoxOfBoard(newBoardPos, newScale, camera.getScreenBoundingBox());
        math;
        // PROBLEM WITH this enabled is since it changes the size of the boundingBox, new coords are not centered.

        return {
            coords: newBoardPos,
            scale: newScale,
            boundingBox: box
        };
    }
    
    /**
     * Calculates the camera scale (zoom) needed to fit
     * the provided board bounding box within the canvas.
     * @param {BoundingBox} boundingBox - The bounding box
     * @returns {number} The scale (zoom) required
     */
    function calcScaleToMatchSides(boundingBox) {
        if (!boundingBox) return console.log("Cannot calc scale to match sides of an undefined box.");

        const xHalfLength = (boundingBox.right - boundingBox.left) / 2;
        const yHalfLength = (boundingBox.top - boundingBox.bottom) / 2;

        // What is the scale required to match the sides?
        const xScale = camera.getScreenBoundingBox(false).right / xHalfLength;
        const yScale = camera.getScreenBoundingBox(false).top / yHalfLength;

        let newScale = xScale < yScale ? xScale : yScale;
        if (newScale > capScale) newScale = capScale;
        
        return newScale;
    }

    /**
     * Creates a new bounding box with the added padding.
     * @param {BoundingBox} boundingBox The bounding box
     * @param {number} horzPad - Horizontal padding
     * @param {number} vertPad - Vertical padding
     * @returns {BoundingBox} The padded bounding box
     */
    function addPaddingToBoundingBox(boundingBox, horzPad, vertPad) {
        return {
            left: boundingBox.left - horzPad,
            right: boundingBox.right + horzPad,
            bottom: boundingBox.bottom - vertPad,
            top: boundingBox.top + vertPad,
        };
    }

    function initTelFromCoordsList(coordsList) { // pieces is an array of coords
        if (!coordsList) return console.error("Cannot init teleport from an undefined coords list.");
        if (coordsList.length === 0) return console.error("Cannot init teleport from an empty coords list.");

        const box = math.getBoxFromCoordsList(coordsList); // Unpadded
        initTelFromUnpaddedBox(box);
    }

    function initTelFromUnpaddedBox(box) {
        if (!box) return console.error("Cannot init teleport from an undefined box.");

        const thisArea = calculateFromUnpaddedBox(box);
        initTelFromArea(thisArea);
    }

    /**
     * Tells {@link transition} where to teleport to based off the provided area object.
     * @param {Area} thisArea - The area object to teleport to
     * @param {boolean} ignoreHistory - Whether to forget adding this teleport to the teleport history.
     */
    function initTelFromArea(thisArea, ignoreHistory) {
        if (!thisArea) return console.error("Cannot init teleport from an undefined area.");

        const thisAreaBox = thisArea.boundingBox;

        const startCoords = movement.getBoardPos();
        const endCoords = thisArea.coords;

        const currentBoardBoundingBox = board.gboundingBox(); // Tile/board space, NOT world-space

        // Will a teleport to this area be a zoom out or in?
        const isAZoomOut = thisArea.scale < movement.getBoardScale();

        let firstArea;

        if (isAZoomOut) { // If our current screen isn't within the final area, create new area to teleport to first
            if (!math.boxContainsSquare(thisAreaBox, startCoords)) firstArea = calculateFromCoordsList([startCoords], thisAreaBox);
            // Version that fits the entire screen on the zoom out
            // if (!math.boxContainsBox(thisAreaBox, currentBoardBoundingBox)) {
            //     const mergedBoxes = math.mergeBoundingBoxes(currentBoardBoundingBox, thisAreaBox);
            //     firstArea = calculateFromBox(mergedBoxes);
            // }
        } else { // zoom-in. If the end area isn't visible on screen now, create new area to teleport to first
            if (!math.boxContainsSquare(currentBoardBoundingBox, endCoords)) firstArea = calculateFromCoordsList([endCoords], currentBoardBoundingBox);
            // Version that fits the entire screen on the zoom out
            // if (!math.boxContainsBox(currentBoardBoundingBox, thisAreaBox)) {
            //     const mergedBoxes = math.mergeBoundingBoxes(currentBoardBoundingBox, thisAreaBox);
            //     firstArea = calculateFromBox(mergedBoxes);
            // }
        }

        const tel1 = firstArea ? { endCoords: firstArea.coords, endScale: firstArea.scale } : undefined;
        const tel2 = { endCoords: thisArea.coords, endScale: thisArea.scale };

        if (tel1) transition.teleport(tel1, tel2, ignoreHistory);
        else transition.teleport(tel2, null, ignoreHistory);
    }

    /**
     * Returns the area object that contains all pieces within
     * it from the specified gamefile, with added padding.
     * @param {gamefile} gamefile - The gamefile
     * @returns {Area} The area object
     */
    function getAreaOfAllPieces(gamefile) {
        if (!gamefile) return console.error("Cannot get the area of all pieces of an undefined game.");
        if (!gamefile.startSnapshot.box) return console.error("Cannot get area of all pieces when gamefile has no startSnapshot.box property!");
        return calculateFromUnpaddedBox(gamefile.startSnapshot.box);
    }

    /**
     * Saves the bounding box of the game's starting position to the startSnapshot property
     * @param {gamefile} gamefile - The gamefile
     */
    function initStartingAreaBox(gamefile) {
        const startingPosition = gamefile.startSnapshot.position;
        const coordsList = gamefileutility.getCoordsOfAllPiecesByKey(startingPosition);
        const box = math.getBoxFromCoordsList(coordsList);
        gamefile.startSnapshot.box = box;
    }

    return Object.freeze({
        calculateFromCoordsList,
        calculateFromUnpaddedBox,
        getAreaOfAllPieces,
        initStartingAreaBox,
        initTelFromUnpaddedBox,
        initTelFromCoordsList,
        initTelFromArea
    });

})();

export { area }