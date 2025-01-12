
// Import Start
import moveutil from '../../chess/util/moveutil.js';
import style from './style.js';
import options from '../rendering/options.js';
import camera from '../rendering/camera.js';
import math from '../../util/math.js';
import config from '../config.js';
import gameslot from '../chess/gameslot.js';
// Import End

"use strict";


/**
 * This script renders the statis in the corner of the screen.
 * (Similar to Minecraft's f3 menu)
 */

const element_Statuses = document.getElementById('stats');

// Various statuses
const elementStatusFPS = document.getElementById('status-fps');
const elementStatusPiecesMesh = document.getElementById('status-pieces-mesh');
const elementStatusRotateMesh = document.getElementById('status-rotate-mesh');
const elementStatusCoords = document.getElementById('status-coords');
const elementStatusMoves = document.getElementById('status-moves');

// When hideMoves() is called, it decrements this by 1.
// If it's zero, it ACTUALLY hides the stat.
// This makes it so we can keep using setTimeout even if we refresh it's visibility!
let visibilityWeight = 0;

/**
 * Temporarily displays the move number in the corner of the screen.
 * @param {number} [durationSecs] The duration to show the move number. Default: 2.5
 */
function showMoves(durationSecs = 2.5) {
	if (config.VIDEO_MODE) return;

	visibilityWeight++;

	updateTextContentOfMoves();
	setTimeout(hideMoves, durationSecs * 1000);

	if (visibilityWeight === 1) style.revealElement(elementStatusMoves);
}

function hideMoves() {
	visibilityWeight--;
	if (visibilityWeight === 0) style.hideElement(elementStatusMoves);
}

function updateTextContentOfMoves() {

	const currentPly = gameslot.getGamefile().moveIndex + 1;
	const totalPlyCount = moveutil.getPlyCount(gameslot.getGamefile().moves);

	elementStatusMoves.textContent = `${translations.move_counter} ${currentPly}/${totalPlyCount}`;
}

function updateStatsCSS() {
	element_Statuses.style = `top: ${camera.getPIXEL_HEIGHT_OF_TOP_NAV()}px`;
}

function showPiecesMesh() {
	if (config.VIDEO_MODE) return;
	style.revealElement(elementStatusPiecesMesh);
}

function updatePiecesMesh(percent) {
	const percentString = math.decimalToPercent(percent);
	elementStatusPiecesMesh.textContent = `${translations.constructing_mesh} ${percentString}`;
}

function hidePiecesMesh() {
	style.hideElement(elementStatusPiecesMesh);
}

function showFPS() {
	if (config.VIDEO_MODE) return;
	style.revealElement(elementStatusFPS);
}

function hideFPS() {
	style.hideElement(elementStatusFPS);
}

function updateFPS(fps) {
	if (!options.isFPSOn()) return;
	const truncated = fps | 0; // Bitwise operation that quickly rounds towards zero
	elementStatusFPS.textContent = `FPS: ${truncated}`;
}

function showRotateMesh() {
	if (config.VIDEO_MODE) return;
	style.revealElement(elementStatusRotateMesh);
}

function updateRotateMesh(percent) {
	const percentString = math.decimalToPercent(percent);
	elementStatusRotateMesh.textContent = `${translations.rotating_mesh} ${percentString}`;
}

function hideRotateMesh() {
	style.hideElement(elementStatusRotateMesh);
}

// NO LONGER USED. These were for the aynchronious checkmate algorithm.
// showMoveLooking() {
//     if (config.VIDEO_MODE) return;
//     style.revealElement(elementStatusMoveLooking);
// },
// updateMoveLooking(percent) {
//     const percentString = math.decimalToPercent(percent);
//     showMoveLooking();
//     elementStatusMoveLooking.textContent = `Looking for moves... ${percentString}`;
// },

export default {
	showMoves,
	updateStatsCSS,
	showPiecesMesh,
	updatePiecesMesh,
	hidePiecesMesh,
	showFPS,
	hideFPS,
	updateFPS,
	showRotateMesh,
	updateRotateMesh,
	hideRotateMesh,
	updateTextContentOfMoves,
};