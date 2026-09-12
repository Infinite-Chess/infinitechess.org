// src/client/scripts/esm/views/game/gui/guichatreport.ts

/**
 * The chat's report flag on the game page: its two-step dropdown, the POST, and
 * disabling the flag once a report lands.
 */

import uuid from '../../../../../../shared/util/uuid.js';

import toast from '../../../components/toast.js';
import guichat from './guichat.js';
import validatorama from '../../../util/validatorama.js';
import { serverfetch } from '../../../util/serverfetch.js';

// Constants -------------------------------------------------------------------

/** The one failure told apart from the rest, so hitting the cap doesn't disable the button. */
const RATE_LIMITED_STATUS = 429;

/** What every other failure reads as. Hardcoded — a network failure carries no server reply. */
const FAILURE_TEXT = 'Failed to submit report.';

// Elements --------------------------------------------------------------------

// Every element here may be absent — SSR omits the whole chat panel for anyone who
// isn't a participant of a non-engine game, the only people who may report.

const element_Report = document.getElementById('btn-report') as HTMLButtonElement | null;
const element_ReasonMenu = document.getElementById('report-reason-menu');
const element_ConfirmMenu = document.getElementById('report-confirm-menu');
const element_ChosenReason = document.getElementById('report-chosen-reason');
const element_Cancel = document.getElementById('btn-report-cancel');
const element_Submit = document.getElementById('btn-report-submit');

// State -----------------------------------------------------------------------

/** The reason code awaiting confirmation in menu 2, or undefined while menu 1 is up. */
let pendingReason: string | undefined;

// The Menus -------------------------------------------------------------------

/** Opens menu 1, or closes whichever menu is open. */
function toggleMenu(): void {
	const shouldOpen = element_ReasonMenu?.classList.contains('hidden') === true;
	closeMenus();
	if (shouldOpen) element_ReasonMenu?.classList.remove('hidden');
}

/** Replaces menu 1 with menu 2, quoting the chosen reason's label back. */
function openConfirmation(code: string, label: string): void {
	pendingReason = code;
	if (element_ChosenReason) element_ChosenReason.textContent = label;
	element_ReasonMenu?.classList.add('hidden');
	element_ConfirmMenu?.classList.remove('hidden');
}

/** Closes both menus, dropping whatever reason was awaiting confirmation. */
function closeMenus(): void {
	pendingReason = undefined;
	element_ReasonMenu?.classList.add('hidden');
	element_ConfirmMenu?.classList.add('hidden');
}

// Sending ---------------------------------------------------------------------

/** Sends the confirmed report, then reports its fate in a toast. */
async function submit(): Promise<void> {
	const reason = pendingReason;
	closeMenus();
	if (reason === undefined) return; // The menu closed before the click resolved.

	// A game of nothing but notices is nothing to report. The server refuses it too;
	// this only spares an honest user the round trip.
	if (!guichat.hasPlayerMessages()) return toast.show(FAILURE_TEXT, { error: true });

	setFlagEnabled(false);

	const response = await postReport(reason);
	if (response === undefined) return failReport(FAILURE_TEXT); // The network never answered.

	if (response.ok) {
		toast.show('Report sent.');
		// Left disabled for the rest of the visit; the greying is the whole feedback.
		if (element_Report) element_Report.title = 'Report sent';
		return;
	}
	if (response.status === RATE_LIMITED_STATUS) {
		const body = (await response.json()) as { message: string };
		return failReport(body.message);
	}
	failReport(FAILURE_TEXT);
}

/** POSTs the report, or `undefined` if the request never reached a reply. */
async function postReport(reason: string): Promise<Response | undefined> {
	// The route decodes base62, the form the id takes in every URL.
	const id = uuid.base10ToBase62(window.gamePageData.id);
	try {
		return await serverfetch(`/api/game/${id}/chat-report`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ reason }),
		});
	} catch {
		return undefined;
	}
}

/** Says why the report didn't land, and enables the flag so it can be tried again. */
function failReport(text: string): void {
	toast.show(text, { error: true });
	setFlagEnabled(true);
}

/** Greys the flag, or restores it. Absent for a viewer SSR gave no chat panel. */
function setFlagEnabled(enabled: boolean): void {
	if (element_Report) element_Report.disabled = !enabled;
}

// Life Cycle ------------------------------------------------------------------

/**
 * The server detached us from the game. A member stays identifiable and keeps the flag; a
 * guest doesn't, so the server could never attribute their report. Load-bearing: eviction
 * does NOT reload the page, so a guest's flag would otherwise stay live indefinitely.
 */
function onDetached(): void {
	if (validatorama.areWeLoggedIn()) return;
	closeMenus();
	element_Report?.classList.add('hidden');
}

// Listeners -------------------------------------------------------------------

element_Report?.addEventListener('click', () => toggleMenu());

// The picked reason rides on the click, so neither menu holds a selection state.
element_ReasonMenu?.addEventListener('click', (e) => {
	const row = (e.target as Element).closest<HTMLElement>('[data-reason]');
	if (!row) return;
	openConfirmation(row.dataset['reason']!, row.textContent!);
});

element_Cancel?.addEventListener('click', () => closeMenus());
element_Submit?.addEventListener('click', () => void submit());

// Anything pressed outside both menus and the flag closes them.
document.addEventListener('pointerdown', (e) => {
	if (!(e.target instanceof Node)) return;
	if (
		element_Report?.contains(e.target) === true ||
		element_ReasonMenu?.contains(e.target) === true ||
		element_ConfirmMenu?.contains(e.target) === true
	)
		return;
	closeMenus();
});

// So does Escape, as on the analysis page's context menu.
document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape') closeMenus();
});

// Exports ---------------------------------------------------------------------

export default {
	// Life Cycle
	onDetached,
};
