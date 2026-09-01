// src/client/scripts/esm/views/game/gui/guispectators.ts

/**
 * Manages the `.meta-spectators` readout of the game page's `.game-meta` panel:
 * how many clients are watching the live game right now.
 *
 * Shown only while that number is live — hidden at zero, and once the
 * game has left server memory and the count can no longer change.
 */

const element_Spectators = document.querySelector('.meta-spectators')!;
const element_SpectatorCount = element_Spectators.querySelector('.spectator-count')!;

/** Reveals/updates/hides the live spectator count. Shown at 1+, hidden at 0 and when undefined. */
function updateSpectatorCount(count: number | undefined): void {
	if (count === undefined || count <= 0) {
		element_Spectators.classList.add('hidden');
		return;
	}
	element_SpectatorCount.textContent = String(count);
	element_Spectators.classList.remove('hidden');
}

export default {
	updateSpectatorCount,
};
