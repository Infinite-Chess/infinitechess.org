// src/client/scripts/esm/views/game/drawoffers.ts

/**
 * This script stores the logic surrounding draw extending and acceptance
 * in online games, client-side.
 *
 * It also keeps track of the last ply (half-move) we extended a draw offer,
 * if we have done so, in the current online game.
 */

import type { DrawOfferInfo } from '../../../../../shared/clientbound.js';

import moveutil from '../../../../../shared/chess/util/moveutil.js';

import toast from '../../components/toast.js';
import gameslot from '../../game/chess/gameslot.js';
import gamesound from '../../board/gamesound.js';
import gameactions from './gui/guigameactions.js';
import { GameBus } from '../../board/GameBus.js';
import socketintents from '../../socket/socketintents.js';

// Variables ---------------------------------------------------

/**
 * Minimum number of plies (half-moves) that
 * must span between 2 consecutive draw offers
 * by the same player!
 *
 * THIS MUST ALWAYS MATCH THE SERVER-SIDE!!!!
 */
const MIN_PLIES_BETWEEN_OFFERS: number = 2;

/** The last move we extended a draw, if we have, otherwise undefined. */
let plyOfLastOfferedDraw: number | undefined;

/** Whether we have an open draw offer FROM OUR OPPONENT */
let isAcceptingDraw: boolean = false;

// Functions ---------------------------------------------------

GameBus.addEventListener('game-concluded', () => {
	// Close any open draw offer and resets all draw for values for future games.
	plyOfLastOfferedDraw = undefined;
	isAcceptingDraw = false;
	gameactions.refresh();
});
// When WE play a move, decline any open draw offer from our opponent. We don't need
// to inform the server because it knows to auto decline when we submit our move.
GameBus.addEventListener('user-move-played', () => closeDraw());

/**
 * Returns true if us extending a draw offer to our opponent is legal.
 */
function isOfferingDrawLegal(): boolean {
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return false; // Game not loaded yet
	if (!gameslot.isGameLive()) return false; // Already concluded
	if (!moveutil.isGameResignable(gamefile)) return false; // Not at least 2+ moves
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
	if (movesSinceLastOffer < MIN_PLIES_BETWEEN_OFFERS) return true;
	return false;
}

/**
 * Returns *true* if we have an open draw offer from our OPPONENT.
 */
function areWeAcceptingDraw(): boolean {
	return isAcceptingDraw;
}

/** Is called when we receive a draw offer from our opponent */
function onOpponentExtendedOffer(): void {
	isAcceptingDraw = true; // Needs to be set FIRST, because gameactions.refresh() reads it.
	gameactions.refresh();
	gamesound.playBase();
}

/** Is called when our opponent declines our draw offer */
function onOpponentDeclinedOffer(): void {
	// TODO: Log into chat window instead.
	toast.show(`Opponent declined draw offer.`);
}

/**
 * Extends a draw offer in our current game.
 * All legality checks have already passed!
 */
function extendOffer(): void {
	// A resync restores plyOfLastOfferedDraw from the server, so if our offer never landed
	// this reads as "we haven't offered" and the held intent is still legal to send.
	socketintents.submit('game', 'offerdraw', undefined, () => isOfferingDrawLegal());
	const gamefile = gameslot.getGamefile()!;
	plyOfLastOfferedDraw = gamefile.moves.length;
	gameactions.updateOfferDrawButton(); // It's now too soon to offer again — disable the button.
	// TODO: Log into chat window instead.
	toast.show(`Waiting for opponent to accept...`); // TODO: Needs to be localized for the user's language.
}

/**
 * This fires when we click the checkmark in
 * the draw offer UI on the bottom navigation bar.
 */
function callback_AcceptDraw(): void {
	isAcceptingDraw = false;
	// A resync restores isAcceptingDraw from the server, so a held intent
	// is dropped if the offer is no longer open by the time we're back.
	socketintents.submit('game', 'acceptdraw', undefined, () => gameslot.isGameLive() && isAcceptingDraw); // prettier-ignore
	gameactions.refresh();
}

/**
 * This fires when we click the X-mark in
 * the draw offer UI on the bottom navigation bar,
 * or when we click "Accept Draw" in the pause menu!
 * @param [options] - Optional settings.
 * @param [options.informServer=true] - If true, the server will be informed that the draw offer has been declined.
 * We'll want to set this to false if we call this after making a move, because the server auto-declines it.
 */
function callback_declineDraw(): void {
	if (!isAcceptingDraw) return; // No open draw offer from our opponent
	closeDraw();
	// Notify the server
	socketintents.submit('game', 'declinedraw', undefined, () => gameslot.isGameLive() && isAcceptingDraw); // prettier-ignore
	// TODO: Log into chat window instead.
	toast.show(`Draw declined`);
}

/**
 * Closes the current draw offer, if there is one, from our opponent.
 * This does NOT notify the server.
 */
function closeDraw(): void {
	if (!isAcceptingDraw) return; // No open draw offer from our opponent
	isAcceptingDraw = false;
	gameactions.refresh();
}

/**
 * Set the current draw offer values according to the information provided.
 * This is called after a page refresh when we're in a game.
 */
function set(drawOffer: DrawOfferInfo): void {
	plyOfLastOfferedDraw = drawOffer.lastOfferPly;
	gameactions.updateOfferDrawButton(); // Restored ply may make it too soon to offer.
	if (!drawOffer.unconfirmed) return; // No open draw offer
	// Open draw offer!!
	onOpponentExtendedOffer();
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
};
