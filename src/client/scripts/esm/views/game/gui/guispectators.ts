// src/client/scripts/esm/views/game/gui/guispectators.ts

/**
 * Manages the live spectator count in the game page's `.game-meta` panel.
 *
 * Groundwork: the server tracks each game's spectators but doesn't broadcast
 * a count yet, so nothing calls this until that `game`-route message exists.
 */

const element_Spectators = document.querySelector('.meta-spectators')!;
const element_SpectatorCount = element_Spectators.querySelector('.spectator-count')!;

/** Reveals/updates/hides the live spectator count. Hidden at 0, shown at 1+. */
function updateSpectatorCount(count: number): void {
	if (count <= 0) {
		element_Spectators.classList.add('hidden');
		return;
	}
	element_SpectatorCount.textContent = String(count);
	element_Spectators.classList.remove('hidden');
}

export default {
	updateSpectatorCount,
};
