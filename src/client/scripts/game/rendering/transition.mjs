// Import Start
import { perspective } from './perspective.mjs'
import { area } from './area.mjs'
import { main } from '../main.mjs'
import { movement } from './movement.mjs'
import { math } from '../misc/math.mjs'
// Import End

// This class handles the smooth animation of teleporting from one location to another
// when clicking on our Expand, Recenter, or Undo Transition buttons.

"use strict";

const transition = (function() {

    const teleportHistory = [];
    const historyCap = 20;

    const baseSpeed = 600; // default 700
    const speedPerE = 70; // Milliseconds per 1E of zoom   default 70
    const perspectiveMultiplier = 1.3;
    let speed; // 1000 Milliseconds. Time it takes to teleport

    const maxPanTelDistB4Teleport = 90;

    /**
     * Duration, in milliseconds, of all *panning* transition type.
     * @type {number}
     */
    const panTelSpeed = 800;

    let startTime;
    let isZoomOut;
    let isPanTel;
    
    let startCoords;
    let endCoords;
    let diffCoords;

    let startScale;
    let endScale;
    let startE;
    let endE;
    let diffE;

    let startWorldSpace;
    let endWorldSpace;
    let diffWorldSpace;

    let isTeleporting = false; // Set to true when we're currently animating. For the duration, ignore navigation controls
    let secondTeleport;

    function teleport(tel1, tel2, ignoreHistory) { // tel2 can be undefined, if only 1

        if (!ignoreHistory) pushToTelHistory({ endCoords: movement.getBoardPos(), endScale: movement.getBoardScale(), isPanTel: false });

        secondTeleport = tel2;

        startCoords = movement.getBoardPos();
        startScale = movement.getBoardScale();
        endCoords = tel1.endCoords;
        endScale = tel1.endScale;

        startTime = performance.now();

        isZoomOut = endScale < startScale;
        isPanTel = false;

        if (isZoomOut) {
            startWorldSpace = [0,0];
            endWorldSpace = math.convertCoordToWorldSpace(startCoords, endCoords, endScale);
        } else { // Is a zoom-in
            startWorldSpace = math.convertCoordToWorldSpace(endCoords);
            endWorldSpace = [0,0];
        }

        const diffX = endWorldSpace[0] - startWorldSpace[0];
        const diffY = endWorldSpace[1] - startWorldSpace[1];
        diffWorldSpace = [diffX, diffY];

        // Scale

        startE = Math.log(startScale); // We're using base E
        endE = Math.log(endScale);
        diffE = endE - startE;

        const multiplier = perspective.getEnabled() ? perspectiveMultiplier : 1;
        speed = baseSpeed * multiplier + Math.abs(diffE) * speedPerE * multiplier;

        isTeleporting = true;

        // Reset velocities to zero
        movement.eraseMomentum();
    }

    function update() { // Animate if we are currently teleporting

        if (!isTeleporting) return; // Return if not currently teleporting

        main.renderThisFrame();

        const elapsedTime = performance.now() - startTime;
        if (elapsedTime >= speed) {
            finish();
            return;
        }

        const equaX = elapsedTime / speed; // 0-100% of the equation
        const equaY = -0.5 * Math.cos(Math.PI * equaX) + 0.5;

        // console.log(equaX)

        if (!isPanTel) updateNormal(equaY);
        else updatePanTel(equaX, equaY);
    }

    function updateNormal(equaY) {

        // Scale

        // Smoothly transition E, then convert back to scale
        const newE = startE + diffE * equaY;
        const newScale = Math.pow(Math.E, newE);
        movement.setBoardScale(newScale, 'pidough');

        // Coords. Needs to be after changing scale because the new world-space is dependant on scale
        // SEE GRAPH ON DESMOS "World-space converted to boardPos" for my notes while writing this algorithm

        const targetCoords = isZoomOut ? startCoords : endCoords;

        // Calculate new world-space
        const newWorldX = startWorldSpace[0] + diffWorldSpace[0] * equaY;
        const newWorldY = startWorldSpace[1] + diffWorldSpace[1] * equaY;
        // Convert to board position
        const boardScale = movement.getBoardScale();
        const newX = targetCoords[0] - (newWorldX / boardScale);
        const newY = targetCoords[1] - (newWorldY / boardScale);

        movement.setBoardPos([newX, newY], "pidough");
    }

    function updatePanTel(equaX, equaY) {

        // What is the scale?
        // What is the maximum distance we should pan b4 teleporting to the other half?
        const maxDist = maxPanTelDistB4Teleport / movement.getBoardScale();
        const greaterThanMaxDist = Math.abs(diffCoords[0]) > maxDist || Math.abs(diffCoords[1]) > maxDist;

        let newX;
        let newY;

        if (!greaterThanMaxDist) {

            // Calculate new world-space
            const addX = (endCoords[0] - startCoords[0]) * equaY;
            const addY = (endCoords[1] - startCoords[1]) * equaY;
            // Convert to board position
            newX = startCoords[0] + addX;
            newY = startCoords[1] + addY;

        } else {
            // 1st half or 2nd half?
            const firstHalf = equaX < 0.5;
            const neg = firstHalf ? 1 : -1;
            const actualEquaY = firstHalf ? equaY : 1 - equaY;

            let diffX = diffCoords[0];
            const xRatio = maxDist / Math.abs(diffX);
            let diffY = diffCoords[1];
            const yRatio = maxDist / Math.abs(diffY);

            let ratio = xRatio < yRatio ? xRatio : yRatio; ratio = ratio > 1 ? ratio : ratio;

            diffX *= ratio;
            diffY *= ratio;

            const target = firstHalf ? startCoords : endCoords;

            const addX = diffX * actualEquaY * neg;
            const addY = diffY * actualEquaY * neg;

            newX = target[0] + addX;
            newY = target[1] + addY;
        }

        movement.setBoardPos([newX, newY], "pidough");
    }

    function finish() { // Called at the end of a teleport

        // Set the final coords and scale
        movement.setBoardPos(endCoords, "pidough");
        movement.setBoardScale(endScale, "pidough");

        if (secondTeleport) {

            teleport(secondTeleport, undefined, true);

        } else isTeleporting = false;
    }

    function panTel(startCoord, endCoord, ignoreHistory, speeed = panTelSpeed) {

        if (!ignoreHistory) pushToTelHistory({ isPanTel: true, endCoords: movement.getBoardPos() });

        startTime = performance.now();

        startCoords = startCoord;
        endCoords = endCoord;
        const boardScale = movement.getBoardScale();
        startScale = boardScale;
        endScale = boardScale;

        const diffX = endCoords[0] - startCoords[0];
        const diffY = endCoords[1] - startCoords[1];
        diffCoords = [diffX, diffY];

        speed = speeed;
 
        isTeleporting = true;
        isPanTel = true;

        // Reset velocities to zero
        movement.eraseMomentum();
    }

    function pushToTelHistory(tel) { // { isPanTel, endCoords, endScale }
        teleportHistory.push(tel);
        if (teleportHistory.length > historyCap) teleportHistory.shift();
    }

    function telToPrevTel() {
        const previousTel = teleportHistory.pop();
        if (!previousTel) return;

        if (previousTel.isPanTel) {

            panTel(movement.getBoardPos(), previousTel.endCoords, true);

        } else { // Zooming transition
            const thisArea = {
                coords: previousTel.endCoords,
                scale: previousTel.endScale,
                boundingBox: math.getBoundingBoxOfBoard(previousTel.endCoords, previousTel.endScale, camera.getScreenBoundingBox())
            };
            area.initTelFromArea(thisArea, true);
        }
    }

    /** Erases teleport history. */
    function eraseTelHist() {
        teleportHistory.length = 0;
    }

    /**
     * Returns *true* if we are currently transitioning.
     * @returns {boolean}
     */
    function areWeTeleporting() {
        return isTeleporting;
    }
    
    return Object.freeze({
        areWeTeleporting,
        teleport,
        update,
        telToPrevTel,
        eraseTelHist,
        panTel
    });
})();

export { transition }