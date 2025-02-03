
/**
 * This script opens and closes our Draw Offer UI
 * on the bottom navigation bar.
 * 
 * It does NOT calculate if extending an offer is legal,
 * nor does it keep track of our current offers!
 */


import guigameinfo from './guigameinfo.js';
import clock from '../../chess/logic/clock.js';
import gameslot from '../chess/gameslot.js';
import drawoffers from '../misc/onlinegame/drawoffers.js';
// @ts-ignore
import guiclock from './guiclock.js';


// Variables -------------------------------------------------------------------


const element_draw_offer_ui = document.getElementById('draw_offer_ui')!;
const element_acceptDraw = document.getElementById('acceptdraw')!;
const element_declineDraw = document.getElementById('declinedraw')!;
const element_whosturn = document.getElementById('whosturn')!;

/** Whether the player names and clocks have been hidden to give space for the draw offer UI */
let drawOfferUICramped: boolean = false;


// Functions -------------------------------------------------------------------


/** Reveals the draw offer UI on the bottom navigation bar */
function open() {
	element_draw_offer_ui.classList.remove('hidden');
	element_whosturn.classList.add('hidden');
	initDrawOfferListeners();
	// Do the names and clocks need to be hidden to make room for the draw offer UI?
	updateVisibilityOfNamesAndClocksWithDrawOffer();
}

/** Hides the draw offer UI on the bottom navigation bar */
function close() {
	element_draw_offer_ui.classList.add('hidden');
	element_whosturn.classList.remove('hidden');
	closeDrawOfferListeners();

	if (!drawOfferUICramped) return;
	// We had hid the names and clocks to make room for the UI, reveal them here!
	// console.log("revealing");
	guigameinfo.revealPlayerNames();
	guiclock.showClocks();
	drawOfferUICramped = false; // Reset for next draw offer UI opening
}

function initDrawOfferListeners() {
	element_acceptDraw.addEventListener('click', drawoffers.callback_AcceptDraw);
	element_declineDraw.addEventListener('click', drawoffers.callback_declineDraw);
}

function closeDrawOfferListeners() {
	element_acceptDraw.removeEventListener('click', drawoffers.callback_AcceptDraw);
	element_declineDraw.removeEventListener('click', drawoffers.callback_declineDraw);
}

/**
 * Hides/reveals the player names and clocks depending on if the draw offer UI has
 * enough space to fit with them.
 * This is called when the UI is opened, AND on screen resize event!
 */
function updateVisibilityOfNamesAndClocksWithDrawOffer() {
	if (!drawoffers.areWeAcceptingDraw()) return; // No open draw offer
	    
	if (isDrawOfferUICramped()) { // Hide the player names and clocks
		if (drawOfferUICramped) return; // Already hidden
		// console.log("hiding");
		drawOfferUICramped = true;
		guigameinfo.hidePlayerNames();
		guiclock.hideClocks();
	} else { // We have space now, reveal them!
		if (!drawOfferUICramped) return; // Already revealed
		// console.log("revealing");
		drawOfferUICramped = false;
		guigameinfo.revealPlayerNames();
		guiclock.showClocks();
	}
}

/**
 * Returns true if the screen is small enough for the
 * draw offer UI to not fit with everything on the header bar.
 */
function isDrawOfferUICramped(): boolean {
	if (clock.isGameUntimed(gameslot.getGamefile()!)) return false; // Clocks not visible, we definitely have room
	if (window.innerWidth > 560) return false; // Screen is wide, we have room
	return true; // Cramped
}


export default {
	open,
	close,
	updateVisibilityOfNamesAndClocksWithDrawOffer,
};