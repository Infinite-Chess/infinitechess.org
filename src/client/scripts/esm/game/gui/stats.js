
// Import Start
import moveutil from '../../chess/util/moveutil.js';
import config from '../config.js';
import gameslot from '../chess/gameslot.js';
import guinavigation from './guinavigation.js';
// Import End

"use strict";


/**
 * This script renders the statis in the corner of the screen.
 * (Similar to Minecraft's f3 menu)
 */

const element_Statuses = document.getElementById('stats');

// Various statuses
const elementStatusFPS = document.getElementById('status-fps');
const elementStatusMoves = document.getElementById('status-moves');

// When hideMoves() is called, it decrements this by 1.
// If it's zero, it ACTUALLY hides the stat.
// This makes it so we can keep using setTimeout even if we refresh it's visibility!
let visibilityWeight = 0;

let fps = false;

/**
 * Temporarily displays the move number in the corner of the screen.
 * @param {number} [durationSecs] The duration to show the move number. Default: 2.5
 */
function showMoves(durationSecs = 2.5) {
	if (config.VIDEO_MODE) return;

	visibilityWeight++;

	updateTextContentOfMoves();
	setTimeout(hideMoves, durationSecs * 1000);

	if (visibilityWeight === 1) elementStatusMoves.classList.remove('hidden');
}

function hideMoves() {
	visibilityWeight--;
	if (visibilityWeight === 0) elementStatusMoves.classList.add('hidden');
}

function updateTextContentOfMoves() {

	const currentPly = gameslot.getGamefile().moveIndex + 1;
	const totalPlyCount = moveutil.getPlyCount(gameslot.getGamefile().moves);

	elementStatusMoves.textContent = `${translations.move_counter} ${currentPly}/${totalPlyCount}`;
}

function updateStatsCSS() {
	element_Statuses.style = `top: ${guinavigation.getHeightOfNavBar()}px`;
}

function toggleFPS() {
	fps = !fps;
	if (fps) showFPS();
	else hideFPS();
}

function showFPS() {
	if (config.VIDEO_MODE) return;
	elementStatusFPS.classList.remove('hidden');
}

function hideFPS() {
	elementStatusFPS.classList.add('hidden');
}

function updateFPS(fps) {
	if (!fps) return;
	const truncated = fps | 0; // Bitwise operation that quickly rounds towards zero
	elementStatusFPS.textContent = `FPS: ${truncated}`;
}


function decimalToPercent(decimal) {
	// Multiply by 100 to convert to percentage, then round
	const percent = Math.round(decimal * 100);
    
	// Convert the rounded percentage to a string with a percentage sign
	return percent.toString() + "%";
}


export default {
	showMoves,
	updateStatsCSS,
	toggleFPS,
	updateFPS,
	updateTextContentOfMoves,
};