// src/client/scripts/esm/game/gui/stats.ts

/**
 * This script renders the stats in the corner of the screen (Similar to Minecraft's f3 menu):
 *
 * Move number
 * FPS
 */

import config from '../config.js';
import moveutil from '../../../../../shared/chess/util/moveutil.js';
import gameslot from '../chess/gameslot.js';
import guinavigation from './guinavigation.js';

// Elements -------------------------------------------------------------

/** The entire stats element container. */
const element_Statuses = document.getElementById('stats')!;

/** The FPS text element. */
const elementStatusFPS = document.getElementById('status-fps')!;
/** The Move Number text element. */
const elementStatusMoves = document.getElementById('status-moves')!;

// Variables -------------------------------------------------------------

/**
 * Weight of visibility for the move number stat.
 * When it is 0, the move number is hidden.
 */
let visibilityWeight = 0;

/** Whether FPS display is enabled. */
let fps = false;

// Move Number -------------------------------------------------------------

/**
 * Temporarily displays the move number in the corner of the screen.
 * @param [durationSecs] The duration to show the move number. Default: 2.5
 */
function showMoves(durationSecs: number = 2.5): void {
	if (config.VIDEO_MODE) return;

	visibilityWeight++;

	updateTextContentOfMoves();
	setTimeout(hideMoves, durationSecs * 1000);

	if (visibilityWeight === 1) elementStatusMoves.classList.remove('hidden');
}

function hideMoves(): void {
	visibilityWeight--;
	if (visibilityWeight === 0) elementStatusMoves.classList.add('hidden');
}

function updateTextContentOfMoves(): void {
	const currentPly = gameslot.getGamefile()!.boardsim.state.local.moveIndex + 1;
	const totalPlyCount = moveutil.getPlyCount(gameslot.getGamefile()!.boardsim.moves);

	elementStatusMoves.textContent = `${translations['move_counter']} ${currentPly}/${totalPlyCount}`;
}

function updateStatsCSS(): void {
	element_Statuses.style = `top: ${guinavigation.getHeightOfNavBar()}px`;
}

// FPS ----------------------------------------------------------------------

function toggleFPS(): void {
	fps = !fps;
	if (fps) showFPS();
	else hideFPS();
}

function showFPS(): void {
	if (config.VIDEO_MODE) return;
	elementStatusFPS.classList.remove('hidden');
}

function hideFPS(): void {
	elementStatusFPS.classList.add('hidden');
}

function updateFPS(fps: number): void {
	if (!fps) return;
	const truncated = fps | 0; // Bitwise operation that quickly rounds towards zero
	elementStatusFPS.textContent = `FPS: ${truncated}`;
}

// Exports ------------------------------------------------------------------

export default {
	showMoves,
	updateStatsCSS,
	toggleFPS,
	updateFPS,
	updateTextContentOfMoves,
};
