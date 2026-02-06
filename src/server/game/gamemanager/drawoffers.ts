// src/server/game/gamemanager/drawoffers.ts

/**
 * This script contains utility methods for draw offers,
 * and has almost zero dependancies.
 *
 * It does NOT contain the routes for when a player
 * extends/accepts a draw offer!
 * NOR does it send any websocket messages.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { MatchInfo, ServerGame } from './gameutility.js';

import { logEventsAndPrint } from '../../middleware/logevents.js';

//--------------------------------------------------------------------------------------------------------

/**
 * Minimum number of plies (half-moves) that
 * must span between 2 consecutive draw offers
 * by the same player!
 *
 * THIS MUST ALWAYS MATCH THE CLIENT-SIDE!!!!
 */
const movesBetweenDrawOffers = 2;

//--------------------------------------------------------------------------------------------------------

/**
 * Returns true if the game currently has an open draw offer.
 * If so, players are not allowed to extend another.
 */
function isDrawOfferOpen(match: MatchInfo): boolean {
	return match.drawOfferState !== undefined;
}

/**
 * Returns true if the given color has extended a draw offer that's not confirmed yet.
 * @param color - The color who extended the draw offer
 */
function doesColorHaveExtendedDrawOffer(match: MatchInfo, color: Player): boolean {
	return match.drawOfferState === color;
}

/**
 * Returns true if they given color has extended a draw offer
 * too recently for them to extend another, yet.
 */
function hasColorOfferedDrawTooFast({ match, basegame }: ServerGame, color: Player): boolean {
	const lastPlyDrawOffered = getLastDrawOfferPlyOfColor(match, color); // number | undefined
	if (lastPlyDrawOffered !== undefined) {
		// They have made at least 1 offer this game
		// console.log("Last ply offered:", lastPlyDrawOffered);
		const movesSinceLastOffer = basegame.moves.length - lastPlyDrawOffered;
		if (movesSinceLastOffer < movesBetweenDrawOffers) return true;
	}
	return false;
}

/**
 * Opens a draw offer, extended by the provided color.
 * DOES NOT INFORM the opponent.
 * @param color - The color of the player extending the offer
 */
function openDrawOffer({ match, basegame }: ServerGame, color: Player): void {
	if (isDrawOfferOpen(match)) {
		logEventsAndPrint(
			"MUST NOT open a draw offer when there's already one open!!",
			'errLog.txt',
		);
		return;
	}
	const playerdata = match.playerData[color]!;
	playerdata.lastOfferPly = basegame.moves.length;
	match.drawOfferState = color;
	return;
}

/**
 * Closes any open draw offer.
 * DOES NOT INFORM the opponent.
 */
function closeDrawOffer(match: MatchInfo): void {
	match.drawOfferState = undefined;
}

/**
 * Returns the last ply move the provided color has offered a draw,
 * if they have, otherwise undefined.
 */
function getLastDrawOfferPlyOfColor(match: MatchInfo, color: Player): number | undefined {
	return match.playerData[color]?.lastOfferPly;
}

//--------------------------------------------------------------------------------------------------------

export {
	movesBetweenDrawOffers,
	isDrawOfferOpen,
	doesColorHaveExtendedDrawOffer,
	hasColorOfferedDrawTooFast,
	openDrawOffer,
	closeDrawOffer,
	getLastDrawOfferPlyOfColor,
};
