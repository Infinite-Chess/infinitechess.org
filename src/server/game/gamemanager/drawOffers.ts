// src/server/game/gamemanager/drawOffers.ts

/**
 * State and legality of draw offers within a live game.
 *
 * It does NOT contain the routes for when a player extends/accepts a draw offer!
 * NOR does it send any websocket messages.
 */

import type { Player } from '../../../shared/util/typeutil.js';
import type { MatchInfo, ServerGame } from './serverGameTypes.js';

import gamelimits from '../../../shared/chess/util/gamelimits.js';

import logEvents from '../../utility/logEvents.js';

// Functions -------------------------------------------------------------------

/**
 * Returns true if the game currently has an open draw offer.
 * If so, players are not allowed to extend another.
 */
function isOpen(match: MatchInfo): boolean {
	return match.drawOfferState !== undefined;
}

/** Returns true if the given color has extended a draw offer that's not confirmed yet. */
function isExtendedBy(match: MatchInfo, color: Player): boolean {
	return match.drawOfferState === color;
}

/**
 * Returns true if the given color has extended a draw offer
 * too recently for them to extend another, yet.
 */
function offeredTooRecently(servergame: ServerGame, color: Player): boolean {
	const lastPlyDrawOffered = getLastOfferPly(servergame.match, color);
	if (lastPlyDrawOffered !== undefined) {
		// They have made at least 1 offer this game
		const movesSinceLastOffer = servergame.moves.length - lastPlyDrawOffered;
		if (movesSinceLastOffer < gamelimits.MIN_PLIES_BETWEEN_DRAW_OFFERS) return true;
	}
	return false;
}

/**
 * Opens a draw offer, extended by the provided color.
 * DOES NOT INFORM the opponent.
 */
function open(servergame: ServerGame, color: Player): void {
	if (isOpen(servergame.match)) {
		logEvents.addAndPrint(
			"MUST NOT open a draw offer when there's already one open!!",
			'errLog',
		);
		return;
	}
	const playerdata = servergame.match.playerData[color]!;
	playerdata.lastOfferPly = servergame.moves.length;
	servergame.match.drawOfferState = color;
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

// Exports ---------------------------------------------------------------------

export default {
	isOpen,
	isExtendedBy,
	offeredTooRecently,
	open,
	close,
	getLastOfferPly,
};
