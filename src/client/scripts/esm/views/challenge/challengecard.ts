// src/client/scripts/esm/views/challenge/challengecard.ts

/**
 * Runs the challenge card: the page's state, the card's controls, the accept and
 * cancel intents, and leaving the page once the challenge is gone or became a game.
 *
 * The card is SSR'd per viewer — the owner gets Copy link and Cancel, anyone else Accept
 * and its reason lines — so each control element is reached by its id, and is absent
 * from the other's page.
 */

import type { Player } from '../../../../../shared/chess/util/typeutil.js';
import type {
	ChallengeStateMessage,
	InGameChallenge,
} from '../../../../../shared/transport/clientbound.js';

import gameurl from '../../../../../shared/chess/util/gameurl.js';

import docutil from '../../util/docutil.js';
import navigate from '../../util/navigate.js';
import gamesound from '../../board/gamesound.js';
import { SocketBus } from '../../socket/SocketBus.js';
import socketintents from '../../socket/socketintents.js';

// Constants -------------------------------------------------------------------

/** How long the copy control shows its confirmation. */
const COPIED_CONFIRMATION_MS = 1500;

// Elements --------------------------------------------------------------------

// --- Owner only ---

const element_copy = document.getElementById('challenge-copy');
const element_cancel = document.getElementById('challenge-cancel') as HTMLButtonElement | null;

// --- Visitor only ---

const element_accept = document.getElementById('challenge-accept') as HTMLButtonElement | null;
/** Absent from the owner's page, and when the sign-in reason below is showing. */
const element_ingame = document.getElementById('challenge-ingame');
const element_ingameJoin = document.getElementById('challenge-ingame-join');
/** Only present when they can never accept: signed out, and the challenge is rated. */
const element_signinRequired = document.getElementById('challenge-signin-required');

// State -----------------------------------------------------------------------

/** What the server last said this challenge is. Undefined until the first state arrives. */
let stateKind: ChallengeStateMessage['kind'] | undefined;
/** Whether the server says we're in another game, which bars accepting. */
let inGame = false;
/** The timer ending the copy confirmation, if it's showing. */
let copiedTimer: number | undefined;

// Init ------------------------------------------------------------------------

if (element_copy) element_copy.addEventListener('click', () => void copyLink(element_copy));
element_cancel?.addEventListener('click', cancel);
element_accept?.addEventListener('click', accept);
SocketBus.addEventListener('intents', updateButtons);

gamesound.preload('notify');

// Server State ----------------------------------------------------------------

/** Applies the challenge's whole state, received on every (re)subscribe and whenever its fate changes. */
function applyState(state: ChallengeStateMessage): void {
	stateKind = state.kind;
	switch (state.kind) {
		case 'open':
			if (state.ingame) onInGame(state.ingame);
			else onOutGame();
			break;
		case 'gone':
			updateButtons(); // Leaving, so nothing more may be sent.
			navigate.assign('/');
			break;
		case 'game':
			updateButtons(); // Leaving, so nothing more may be sent.
			void enterGame(state.role);
			break;
		default:
			throw new Error(`Unknown challenge state: ${JSON.stringify(state satisfies never)}`);
	}
}

/** The challenge became a game: go to its page, from our side if we play in it. */
async function enterGame(role: Player | undefined): Promise<void> {
	await gamesound.playNotifyToCompletion();
	navigate.assign(gameurl.getGameUrl(window.challengePageData.id, role));
}

/** We're in another game: reveal the line pointing at it, and bar accepting. */
function onInGame(ingame: InGameChallenge): void {
	inGame = true;
	element_ingameJoin?.setAttribute('href', gameurl.getGameUrl(ingame.id, ingame.role));
	element_ingame?.classList.remove('hidden');
	updateButtons();
}

/** We're in no game. Also what the owner's page lands on with every `open` state. */
function onOutGame(): void {
	inGame = false;
	element_ingame?.classList.add('hidden');
	updateButtons();
}

// Controls --------------------------------------------------------------------

/** Whether the challenge is gone or became a game, so the page is on its way out. */
function isLeaving(): boolean {
	return stateKind === 'gone' || stateKind === 'game';
}

/** Re-derives each control's disabled state. Also greyed while its own click is in flight. */
function updateButtons(): void {
	if (element_accept) {
		// Neither reason line may apply.
		const eligible = !inGame && element_signinRequired === null;
		element_accept.disabled =
			isLeaving() || !eligible || socketintents.isOutstanding('challenge', 'accept');
	}
	if (element_cancel)
		element_cancel.disabled = isLeaving() || socketintents.isOutstanding('challenge', 'cancel');
}

/** Asks the server to start the game against the owner. */
function accept(): void {
	socketintents.submit('challenge', 'accept', undefined, () => stateKind === 'open' && !inGame);
}

/** Asks the server to withdraw the challenge. */
function cancel(): void {
	socketintents.submit('challenge', 'cancel', undefined, () => stateKind === 'open');
}

/** Copies the challenge's link, then briefly confirms it inline by marking the control `.copied`. */
async function copyLink(control: HTMLElement): Promise<void> {
	const url = control.dataset['url']!; // Guaranteed: SSR'd with the link.
	if (!(await docutil.copyToClipboard(url))) return;
	control.classList.add('copied');
	clearTimeout(copiedTimer);
	copiedTimer = window.setTimeout(
		() => control.classList.remove('copied'),
		COPIED_CONFIRMATION_MS,
	);
}

// Exports ---------------------------------------------------------------------

export default {
	applyState,
	onInGame,
	onOutGame,
};
