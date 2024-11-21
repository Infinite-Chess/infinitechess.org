
// Import Start
import guidrawoffer from '../gui/guidrawoffer.js';
import statustext from '../gui/statustext.js';
import websocket from '../websocket.js';
import guipause from '../gui/guipause.js';
import sound from './sound.js';
import moveutil from '../../chess/util/moveutil.js';
import onlinegame from './onlinegame.js';
import game from '../chess/game.js';
// Import End

'use strict';

/**
 * This script stores the logic surrounding draw extending and acceptance
 * in online games, client-side.
 * 
 * It also keeps track of the last ply (half-move) we extended a draw offer,
 * if we have done so, in the current online game.
 */

/**
 * Minimum number of plies (half-moves) that
 * must span between 2 consecutive draw offers
 * by the same player!
 * 
 * THIS MUST ALWAYS MATCH THE SERVER-SIDE!!!!
 */
const movesBetweenDrawOffers = 2;

/** The last move we extended a draw, if we have, otherwise undefined. */
let plyOfLastOfferedDraw;

/** Whether we have an open draw offer FROM OUR OPPONENT */
let isAcceptingDraw = false;


/**
 * Returns true if us extending a dropper to our opponent is legal.
 * @returns {boolean}
 */
function isOfferingDrawLegal() {
	const gamefile = game.getGamefile();
	if (!onlinegame.areInOnlineGame()) return false; // Can't offer draws in local games
	if (!moveutil.isGameResignable(gamefile)) return false; // Not atleast 2+ moves
	if (onlinegame.hasGameConcluded()) return false; // Can't offer draws after the game has ended
	if (isTooSoonToOfferDraw()) return false; // It's been too soon since our last offer
	return true; // Is legal to EXTEND
}

/**
 * Returns true if it's been too soon since our last draw offer extension
 * for us to extend another one. We cannot extend them too rapidly.
 * @returns {boolean}
 */
function isTooSoonToOfferDraw() {
	const gamefile = game.getGamefile();
	if (plyOfLastOfferedDraw === undefined) return false; // We have made zero offers so far this game

	const movesSinceLastOffer = gamefile.moves.length - plyOfLastOfferedDraw;
	if (movesSinceLastOffer < movesBetweenDrawOffers) return true;
	return false;
}

/**
 * Returns *true* if we have an open draw offer from our OPPONENT.
 * @returns {boolean}
 */
function areWeAcceptingDraw() { return isAcceptingDraw; }

/** Is called when we receive a draw offer from our opponent */
function onOpponentExtendedOffer() {
	isAcceptingDraw = true; // Needs to be set FIRST, because guidrawoffer.open() relies on it.
	guidrawoffer.open();
	sound.playSound_base(); //playSound_drawOffer()
	guipause.updateDrawOfferButton();
}

/**
 * Extends a draw offer in our current game.
 * All legality checks have already passed!
 */
function extendOffer() {
	websocket.sendmessage('game', 'offerdraw');
	const gamefile = game.getGamefile();
	plyOfLastOfferedDraw = gamefile.moves.length;
	statustext.showStatus(`Waiting for opponent to accept...`);
	guipause.updateDrawOfferButton();
}

/**
 * This fires when we click the checkmark in
 * the draw offer UI on the bottom navigation bar.
 */
function callback_AcceptDraw() {
	isAcceptingDraw = false;
	websocket.sendmessage('game', 'acceptdraw');
	guidrawoffer.close();
	guipause.updateDrawOfferButton();
}

/**
 * This fires when we click the X-mark in
 * the draw offer UI on the bottom navigation bar,
 * or when we click "Accept Draw" in the pause menu,
 * OR when we make a move while there's an open offer!
* @param {Object} [options] - Optional settings.
* @param {boolean} [options.informServer=true] - If true, the server will be informed that the draw offer has been declined.
* We'll want to set this to false if we call this after making a move, because the server auto-declines it.
*/
function callback_declineDraw({ informServer = true } = {}) {
	if (!isAcceptingDraw) return; // No open draw offer from our opponent

	if (informServer) {
		websocket.sendmessage('game', 'declinedraw');
		statustext.showStatus(`Draw declined`);
	}
	guidrawoffer.close();
	isAcceptingDraw = false;
}

/**
 * Set the current draw offer values according to the information provided.
 * This is called after a page refresh when we're in a game.
 * @param {Object} drawOffer - An object that looks like: `{ unconfirmed, lastOfferPly }`, where `unconfirmed` is
 * a boolean that's true if the opponent has an open draw offer we have not yet confirmed/rejected,
 * and `lastOfferPly` is the last move ply WE EXTENDED an offer, if we have, otherwise undefined.
 */
function set(drawOffer) {
	plyOfLastOfferedDraw = drawOffer.lastOfferPly;
	if (!drawOffer.unconfirmed) return; // No open draw offer
	// Open draw offer!!
	onOpponentExtendedOffer();
}

/**
 * Called when an online game concludes or is closed. Closes any open draw
 * offer and resets all draw for values for future games.
 */
function reset() {
	plyOfLastOfferedDraw = undefined;
	isAcceptingDraw = false;
	guidrawoffer.close();
	guipause.updateDrawOfferButton();
}

export default {
	isOfferingDrawLegal,
	areWeAcceptingDraw,
	callback_AcceptDraw,
	callback_declineDraw,
	onOpponentExtendedOffer,
	extendOffer,
	set,
	reset,
};