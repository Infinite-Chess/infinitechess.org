

/**
 * This script stores the logic surrounding draw extending and acceptance
 * in online games, client-side.
 * 
 * It also keeps track of the last ply (half-move) we extended a draw offer,
 * if we have done so, in the current online game.
 */


import type { DrawOfferInfo } from './onlinegamerouter.js';


import gameslot from '../../chess/gameslot.js';
import onlinegame from './onlinegame.js';
// @ts-ignore
import guidrawoffer from '../../gui/guidrawoffer.js';
// @ts-ignore
import statustext from '../../gui/statustext.js';
// @ts-ignore
import websocket from '../../websocket.js';
// @ts-ignore
import guipause from '../../gui/guipause.js';
// @ts-ignore
import sound from '../sound.js';
// @ts-ignore
import moveutil from '../../../chess/util/moveutil.js';


// Variables ---------------------------------------------------


/**
 * Minimum number of plies (half-moves) that
 * must span between 2 consecutive draw offers
 * by the same player!
 * 
 * THIS MUST ALWAYS MATCH THE SERVER-SIDE!!!!
 */
const movesBetweenDrawOffers: number = 2;

/** The last move we extended a draw, if we have, otherwise undefined. */
let plyOfLastOfferedDraw: number | undefined;

/** Whether we have an open draw offer FROM OUR OPPONENT */
let isAcceptingDraw: boolean = false;


// Functions ---------------------------------------------------


/**
 * Returns true if us extending a draw offer to our opponent is legal.
 */
function isOfferingDrawLegal(): boolean {
	const gamefile = gameslot.getGamefile()!;
	if (!onlinegame.areInOnlineGame()) return false; // Can't offer draws in local games
	if (!moveutil.isGameResignable(gamefile)) return false; // Not atleast 2+ moves
	if (onlinegame.hasServerConcludedGame()) return false; // Can't offer draws after the game has ended
	if (isTooSoonToOfferDraw()) return false; // It's been too soon since our last offer
	return true; // Is legal to EXTEND
}

/**
 * Returns true if it's been too soon since our last draw offer extension
 * for us to extend another one. We cannot extend them too rapidly.
 */
function isTooSoonToOfferDraw(): boolean {
	const gamefile = gameslot.getGamefile()!;
	if (plyOfLastOfferedDraw === undefined) return false; // We have made zero offers so far this game

	const movesSinceLastOffer = gamefile.moves.length - plyOfLastOfferedDraw;
	if (movesSinceLastOffer < movesBetweenDrawOffers) return true;
	return false;
}

/**
 * Returns *true* if we have an open draw offer from our OPPONENT.
 */
function areWeAcceptingDraw(): boolean {
	return isAcceptingDraw;
}

/** Is called when we receive a draw offer from our opponent */
function onOpponentExtendedOffer() {
	isAcceptingDraw = true; // Needs to be set FIRST, because guidrawoffer.open() relies on it.
	guidrawoffer.open();
	sound.playSound_base();
	guipause.updateDrawOfferButton();
}

/** Is called when our opponent declines our draw offer */
function onOpponentDeclinedOffer() {
	statustext.showStatus(`Opponent declined draw offer.`);
}

/**
 * Extends a draw offer in our current game.
 * All legality checks have already passed!
 */
function extendOffer() {
	websocket.sendmessage('game', 'offerdraw');
	const gamefile = gameslot.getGamefile()!;
	plyOfLastOfferedDraw = gamefile.moves.length;
	statustext.showStatus(`Waiting for opponent to accept...`); // TODO: Needs to be localized for the user's language.
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
 * or when we click "Accept Draw" in the pause menu!
 * @param [options] - Optional settings.
 * @param [options.informServer=true] - If true, the server will be informed that the draw offer has been declined.
 * We'll want to set this to false if we call this after making a move, because the server auto-declines it.
 */
function callback_declineDraw() {
	if (!isAcceptingDraw) return; // No open draw offer from our opponent
	closeDraw();
	// Notify the server
	websocket.sendmessage('game', 'declinedraw');
	statustext.showStatus(`Draw declined`); // TODO: This needs to be localized to the user's language
}

/**
 * Closes the current draw offer, if there is one, from our opponent.
 * This does NOT notify the server.
 */
function closeDraw() {
	if (!isAcceptingDraw) return; // No open draw offer from our opponent
	guidrawoffer.close();
	isAcceptingDraw = false;
}

/**
 * Set the current draw offer values according to the information provided.
 * This is called after a page refresh when we're in a game.
 */
function set(drawOffer: DrawOfferInfo) {
	plyOfLastOfferedDraw = drawOffer.lastOfferPly;
	if (!drawOffer.unconfirmed) return; // No open draw offer
	// Open draw offer!!
	onOpponentExtendedOffer();
}

/** Called whenever a move is played in an online game */
function onMovePlayed({ isOpponents }: { isOpponents: boolean }) {
	// Declines any open draw offer from our opponent. We don't need to inform
	// the server because the server knows to auto decline when we submit our move.
	if (!isOpponents) closeDraw();
}

/**
 * Called when an online game concludes or is closed. Closes any open draw
 * offer and resets all draw for values for future games.
 */
function onGameClose() {
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
	onOpponentDeclinedOffer,
	extendOffer,
	set,
	onMovePlayed,
	onGameClose,
};