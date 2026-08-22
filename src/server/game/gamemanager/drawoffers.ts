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
import type { MatchInfo, ServerGame } from './servergametypes.js';

import gameconfig from '../../../shared/util/gameconfig.js';

import { logEventsAndPrint } from '../../middleware/logEvents.js';

// Functions -------------------------------------------------------------------------------------

/**
 * Returns true if the game currently has an open draw offer.
 * If so, players are not allowed to extend another.
 */
function isOpen(match: MatchInfo): boolean {
	return match.drawOfferState !== undefined;
}

/**
 * Returns true if the given color has extended a draw offer that's not confirmed yet.
 * @param color - The color who extended the draw offer
 */
function isExtendedBy(match: MatchInfo, color: Player): boolean {
	return match.drawOfferState === color;
}

/**
 * Returns true if they given color has extended a draw offer
 * too recently for them to extend another, yet.
 */
function offeredTooRecently(servergame: ServerGame, color: Player): boolean {
	const lastPlyDrawOffered = getLastOfferPly(servergame.match, color); // number | undefined
	if (lastPlyDrawOffered !== undefined) {
		// They have made at least 1 offer this game
		// console.log("Last ply offered:", lastPlyDrawOffered);
		const movesSinceLastOffer = servergame.moves.length - lastPlyDrawOffered;
		if (movesSinceLastOffer < gameconfig.MIN_PLIES_BETWEEN_DRAW_OFFERS) return true;
	}
	return false;
}

/**
 * Opens a draw offer, extended by the provided color.
 * DOES NOT INFORM the opponent.
 * @param color - The color of the player extending the offer
 */
function open(servergame: ServerGame, color: Player): void {
	if (isOpen(servergame.match)) {
		logEventsAndPrint("MUST NOT open a draw offer when there's already one open!!", 'errLog');
		return;
	}
	const playerdata = servergame.match.playerData[color]!;
	playerdata.lastOfferPly = servergame.moves.length;
	servergame.match.drawOfferState = color;
	return;
}

/**
 * Closes any open draw offer.
 * DOES NOT INFORM the opponent.
 */
function close(match: MatchInfo): void {
	match.drawOfferState = undefined;
}

/**
 * Returns the last ply move the provided color has offered a draw,
 * if they have, otherwise undefined.
 */
function getLastOfferPly(match: MatchInfo, color: Player): number | undefined {
	return match.playerData[color]?.lastOfferPly;
}

// Exports ---------------------------------------------------------------------------------------

export default {
	isOpen,
	isExtendedBy,
	offeredTooRecently,
	open,
	close,
	getLastOfferPly,
};
