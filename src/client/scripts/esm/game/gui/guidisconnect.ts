// src/client/scripts/esm/game/gui/guidisconnect.ts

/**
 * Manages the `.disconnect-status` block on the game page: the live status of an
 * opponent's disconnection in the side bar.
 *
 * While the opponent is gone it shows a 1-second countdown until we may claim, then
 * reveals the "Claim victory" / "Call a draw" buttons once the window opens. In a not-
 * yet-resignable game there's nothing to claim, so it only informs us they disconnected
 * (we can already abort at will). It hides the moment they reconnect or the game ends.
 *
 * SSR omits `.disconnect-status` for a game that loaded concluded, so every element here
 * may be absent.
 */

import type { DisconnectInfo } from '../../../../../shared/types.js';

import moveutil from '../../../../../shared/chess/util/moveutil.js';

import gameslot from '../chess/gameslot.js';
import { GameBus } from '../GameBus.js';
import socketintents from '../../websocket/socketintents.js';

// Elements ----------------------------------------------------------------------------------

const element_DisconnectStatus = document.querySelector('.disconnect-status');
const element_DisconnectText = document.querySelector('.disconnect-text');
const element_DisconnectButtons = document.querySelector('.disconnect-buttons');
const element_ClaimVictory = document.getElementById(
	'btn-claim-victory',
) as HTMLButtonElement | null;
const element_ClaimDraw = document.getElementById('btn-claim-draw') as HTMLButtonElement | null;

// State -------------------------------------------------------------------------------------

/** The epoch-ms timestamp from which we may claim victory/draw. Undefined when the opponent is connected. */
let claimableAt: number | undefined;
/** Whether the opponent disconnected by choice (vs. lost connection). */
let voluntary: boolean = false;
/** The 1-second render loop's interval id, while the opponent is disconnected. */
let renderIntervalID: number | undefined;

// Events ------------------------------------------------------------------------------------

GameBus.addEventListener('game-concluded', () => onOpponentReturn());

// Functions ---------------------------------------------------------------------------------

/** Called when our opponent disconnects (or on load if they're already disconnected). */
function onOpponentDisconnect(info: DisconnectInfo): void {
	if (!element_DisconnectStatus) return; // Concluded game: block absent.
	claimableAt = Date.now() + info.millisUntilClaimable;
	voluntary = info.voluntary;
	element_DisconnectStatus.classList.remove('hidden');
	render();
	// Keep re-rendering every second so the countdown stays accurate and the buttons
	// reveal once the window opens (or once the game becomes resignable).
	clearInterval(renderIntervalID);
	renderIntervalID = window.setInterval(() => render(), 1000);
}

/** Called when our opponent reconnects, or the game ends. Hides and resets everything. */
function onOpponentReturn(): void {
	claimableAt = undefined;
	clearInterval(renderIntervalID);
	renderIntervalID = undefined;
	element_DisconnectStatus?.classList.add('hidden');
	element_DisconnectButtons?.classList.add('hidden');
}

/** Updates the status text and button visibility for the current moment. */
function render(): void {
	if (!element_DisconnectText || claimableAt === undefined) return;

	const lead = voluntary ? 'Opponent disconnected.' : 'Opponent lost connection.';

	// Before the game is resignable there's no victory/draw to claim — just inform.
	const gamefile = gameslot.getGamefile();

	if (gamefile && moveutil.isGameResignable(gamefile)) {
		const secsRemaining = Math.ceil((claimableAt - Date.now()) / 1000);
		if (secsRemaining > 0) {
			const unit = secsRemaining === 1 ? 'second' : 'seconds';
			element_DisconnectText.textContent = `${lead} You can claim victory in ${secsRemaining} ${unit}.`;
			element_DisconnectButtons?.classList.add('hidden');
		} else {
			element_DisconnectText.textContent = `${lead} You may claim victory, call a draw, or wait.`;
			element_DisconnectButtons?.classList.remove('hidden');
		}
	} else {
		// Abortable, just inform. (or game not loaded yet -> bug)
		element_DisconnectText.textContent = lead;
		element_DisconnectButtons?.classList.add('hidden');
	}
}

// Button handlers ----------------------------------------------------------------------------

/**
 * Whether the claim window is currently open. A resync restores the opponent's disconnect
 * state from the server, so a held claim is dropped once they're back.
 */
function isClaimable(): boolean {
	// Load-bearing: claimableAt is only cleared on 'game-concluded', which online games don't
	// dispatch off our own locally-detected conclusion — so it outlives the game briefly.
	if (!gameslot.isGameLive()) return false;
	return claimableAt !== undefined && Date.now() >= claimableAt;
}

/** Claims victory against the disconnected opponent. Server validates the window is open. */
function callback_ClaimVictory(): void {
	socketintents.submit('game', 'claimvictory', undefined, isClaimable);
}

/** Claims a draw against the disconnected opponent. Server validates the window is open. */
function callback_ClaimDraw(): void {
	socketintents.submit('game', 'claimdraw', undefined, isClaimable);
}

element_ClaimVictory?.addEventListener('click', callback_ClaimVictory);
element_ClaimDraw?.addEventListener('click', callback_ClaimDraw);

// =================================================================================

export default {
	onOpponentDisconnect,
	onOpponentReturn,
};
