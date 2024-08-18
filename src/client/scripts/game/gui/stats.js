// Import Start
import { movesscript } from '../chess/movesscript.js'
import { style } from './style.js'
// Import End


/**
 * This script renders the statis in the corner of the screen.
 * (Similar to Minecraft's f3 menu)
 */

"use strict";

// Module
const stats = {
    element_Statuses: document.getElementById('stats'),

    // Various statuses
    elementStatusMoveLooking: document.getElementById('status-move-looking'),
    elementStatusFPS: document.getElementById('status-fps'),
    elementStatusPiecesMesh: document.getElementById('status-pieces-mesh'),
    elementStatusRotateMesh: document.getElementById('status-rotate-mesh'),
    elementStatusCoords: document.getElementById('status-coords'),
    elementStatusMoves: document.getElementById('status-moves'),

    // When hideMoves() is called, it decrements this by 1.
    // If it's zero, it ACTUALLY hides the stat.
    // This makes it so we can keep using setTimeout even if we refresh it's visibility!
    visibilityWeight: 0,

    /**
     * Temporarily displays the move number in the corner of the screen.
     * @param {number} [durationSecs] The duration to show the move number. Default: 2.5
     */
    showMoves(durationSecs = 2.5) {
        if (main.videoMode) return;

        stats.visibilityWeight++;

        stats.setTextContentOfMoves();
        setTimeout(stats.hideMoves, durationSecs * 1000);

        if (stats.visibilityWeight === 1) style.revealElement(stats.elementStatusMoves);
    },

    hideMoves() {
        stats.visibilityWeight--;
        if (stats.visibilityWeight === 0) style.hideElement(stats.elementStatusMoves);
    },

    setTextContentOfMoves() {

        const currentPly = game.getGamefile().moveIndex + 1;
        const totalPlyCount = movesscript.getPlyCount(game.getGamefile().moves);

        stats.elementStatusMoves.textContent = `${translations["move_counter"]} ${currentPly}/${totalPlyCount}`;
    },

    updateStatsCSS() {
        stats.element_Statuses.style = `top: ${camera.getPIXEL_HEIGHT_OF_TOP_NAV()}px`;
    },

    showPiecesMesh() {
        if (main.videoMode) return;
        style.revealElement(stats.elementStatusPiecesMesh);
    },

    updatePiecesMesh(percent) {
        const percentString = math.decimalToPercent(percent);
        stats.elementStatusPiecesMesh.textContent = `${translations["constructing_mesh"]} ${percentString}`;
    },

    hidePiecesMesh() {
        style.hideElement(stats.elementStatusPiecesMesh);
    },

    showFPS() {
        if (main.videoMode) return;
        style.revealElement(stats.elementStatusFPS);
    },

    hideFPS() {
        style.hideElement(stats.elementStatusFPS);
    },

    updateFPS(fps) {
        if (!options.isFPSOn()) return;
        const truncated = fps | 0; // Bitwise operation that quickly rounds towards zero
        stats.elementStatusFPS.textContent = `FPS: ${truncated}`;
    },

    showRotateMesh() {
        if (main.videoMode) return;
        style.revealElement(stats.elementStatusRotateMesh);
    },

    updateRotateMesh(percent) {
        const percentString = math.decimalToPercent(percent);
        stats.elementStatusRotateMesh.textContent = `${translations["rotating_mesh"]} ${percentString}`;
    },

    hideRotateMesh() {
        style.hideElement(stats.elementStatusRotateMesh);
    },

    // NO LONGER USED. These were for the aynchronious checkmate algorithm.
    // showMoveLooking() {
    //     if (main.videoMode) return;
    //     style.revealElement(stats.elementStatusMoveLooking);
    // },
    // updateMoveLooking(percent) {
    //     const percentString = math.decimalToPercent(percent);
    //     stats.showMoveLooking();
    //     stats.elementStatusMoveLooking.textContent = `Looking for moves... ${percentString}`;
    // },

    hideMoveLooking() {
        style.hideElement(stats.elementStatusMoveLooking);
    }
};

export { stats };