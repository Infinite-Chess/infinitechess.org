// src/client/scripts/esm/game/gui/guigamemeta.ts

/**
 * Manages the dynamic parts of the `.game-meta` panel, on both the game page and
 * `/analysis/:id`: the `#meta-started` "Started X ago" readout (re-derived on a
 * 1-minute interval), and revealing the `.result-banner` with the game's conclusion
 * once it ends.
 *
 * The static parts (variant, time control, participants) are SSR-owned and
 * never touched here.
 */

import type { Player, PlayerGroup } from '../../../../../shared/chess/util/typeutil.js';

import timeutil from '../../../../../shared/util/timeutil.js';
import metadatautil from '../../../../../shared/chess/util/metadatautil.js';
import gameresultutil from '../../../../../shared/chess/util/gameresultutil.js';
import { players as p } from '../../../../../shared/chess/util/typeutil.js';

import gameslot from '../chess/gameslot.js';
import { GameBus } from '../../board/GameBus.js';

// Elements --------------------------------------------------------------------

const element_Started = document.getElementById('meta-started') as HTMLTimeElement;

const element_ResultBanner = document.querySelector('.result-banner')!;
const element_BannerScore = element_ResultBanner.querySelector('.result-score')!;
const element_BannerText = element_ResultBanner.querySelector('.result-text')!;

/** The participant `.username-embed`s, in SSR order: white first, then black. */
const element_MetaPlayerEmbeds = document.querySelectorAll('.meta-players .meta-player .username-embed'); // prettier-ignore

// Events ----------------------------------------------------------------------

GameBus.addEventListener('game-concluded', showResultBanner);

// Started X ago ---------------------------------------------------------------

/** Re-derives `#meta-started` no more than once a minute (the string only changes by the minute). */
const REFRESH_INTERVAL_MS = 1000 * 60;

/** Creation epoch (ms), SSR'd onto the element for the client to re-derive the relative string. */
const createdMs = Number(element_Started.dataset['created']);

/** The page's resolved language (`<html lang>`, which honors the user's `lang`-cookie override). */
const lang = document.documentElement.lang;

// SSR painted the first value; just keep it fresh from here on.
setInterval(() => {
	element_Started.textContent = timeutil.getRelativeTimeStringIntl(createdMs, lang);
}, REFRESH_INTERVAL_MS);

// Result Banner ---------------------------------------------------------------

/** Populates and reveals the `.result-banner` with the game's conclusion. */
function showResultBanner(): void {
	const gamefile = gameslot.getGamefile()!;

	const { score, text } = gameresultutil.getResultDisplay(gamefile.gameConclusion!, t.shared);
	element_BannerScore.textContent = score;
	element_BannerText.textContent = text;
	element_ResultBanner.classList.remove('hidden');
}

// Rating Changes --------------------------------------------------------------

/**
 * Appends each player's rating-change delta (e.g. `+27`) beside their rating in the
 * participant list when a rated game finalizes *live*. An already-finalized game is
 * SSR'd with the delta.
 */
function showRatingChanges(ratingChanges: PlayerGroup<number>): void {
	for (const [strColor, change] of Object.entries(ratingChanges)) {
		const player = Number(strColor) as Player;
		const index = player === p.WHITE ? 0 : player === p.BLACK ? 1 : (() => { throw new Error(`Unexpected color ${player}`) })(); // prettier-ignore
		const embed = element_MetaPlayerEmbeds[index]!;
		if (embed.querySelector('.eloChange')) continue; // Already painted (SSR)
		const delta = document.createElement('span');
		delta.classList.add('eloChange', change >= 0 ? 'positive' : 'negative');
		delta.textContent = metadatautil.getWhiteBlackRatingDiff(change);
		embed.appendChild(delta);
	}
}

// Exports ---------------------------------------------------------------------

export default {
	showRatingChanges,
};
