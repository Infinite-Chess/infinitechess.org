// src/client/scripts/esm/game/gui/guigamemeta.ts

/**
 * Manages the dynamic parts of the `.game-meta` panel on the game page: the
 * `#meta-started` "Started X ago" readout (re-derived on a 1-minute interval),
 * the `.meta-spectators` live spectator count, and revealing the `.result-banner`
 * with the game's conclusion once it ends.
 *
 * The static parts (variant, time control, participants) are SSR-owned and
 * never touched here.
 */

import timeutil from '../../../../../shared/util/timeutil.js';
import gameresultutil from '../../../../../shared/chess/util/gameresultutil.js';

import gameslot from '../chess/gameslot.js';
import { GameBus } from '../GameBus.js';

// Elements ----------------------------------------------------------------------------------

const element_Started = document.getElementById('meta-started') as HTMLTimeElement;

const element_Spectators = document.querySelector('.meta-spectators')!;
const element_SpectatorCount = element_Spectators.querySelector('.spectator-count')!;

const element_ResultBanner = document.querySelector('.result-banner')!;
const element_BannerScore = element_ResultBanner.querySelector('.result-score')!;
const element_BannerText = element_ResultBanner.querySelector('.result-text')!;

// =============================== Started X ago ===============================

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

// =============================== Spectators ===============================

/**
 * Reveals/updates/hides the live spectator count. Hidden at 0, shown at 1+.
 * Exported for the game-route message handler to call once the server sends spectator updates.
 */
function updateSpectatorCount(count: number): void {
	if (count <= 0) {
		element_Spectators.classList.add('hidden');
		return;
	}
	element_SpectatorCount.textContent = String(count);
	element_Spectators.classList.remove('hidden');
}

// =============================== Result Banner ===============================

/** Populates and reveals the `.result-banner` with the game's conclusion. */
function showResultBanner(): void {
	const gamefile = gameslot.getGamefile()!;

	const { score, text } = gameresultutil.getResultDisplay(gamefile.gameConclusion!, t.shared);
	element_BannerScore.textContent = score;
	element_BannerText.textContent = text;
	element_ResultBanner.classList.remove('hidden');
}

GameBus.addEventListener('game-concluded', showResultBanner);

// ===========================================================================

export default {
	updateSpectatorCount,
};
