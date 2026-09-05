// src/client/scripts/esm/views/checkmatepractice/gui/guipractice.ts

/**
 * The checkmate selection overlay on the practice page: clicking a checkmate banner
 * starts its game, and the progress bar, badges and beaten states repaint whenever
 * the overlay is (re)opened.
 */

import validcheckmates from '../../../../../../shared/chess/util/validcheckmates.js';

import validatorama from '../../../util/validatorama.js';
import practicegame from '../practicegame.js';

// Elements ----------------------------------------------------------------------

const element_selection = document.getElementById('practice-selection')!;
const element_progressCount = document.getElementById('practice-progress-count')!;
const element_progressFill = document.getElementById('practice-progress-fill')!;
const elements_checkmates = document.querySelectorAll<HTMLElement>('.checkmate');

// Constants ---------------------------------------------------------------------

const NUM_CHECKMATES = Object.values(validcheckmates.BY_DIFFICULTY).flat().length;

/** Each badge's earn threshold (fraction of {@link NUM_CHECKMATES}) and tooltip texts. */
const BADGES = [
	{ id: 'checkmate-badge-bronze', threshold: 0.5, earned: () => t.practice.badges.bronze, unearned: () => t.practice.badges.bronze_unearned }, // prettier-ignore
	{ id: 'checkmate-badge-silver', threshold: 0.75, earned: () => t.practice.badges.silver, unearned: () => t.practice.badges.silver_unearned }, // prettier-ignore
	{ id: 'checkmate-badge-gold', threshold: 1, earned: () => t.practice.badges.gold, unearned: () => t.practice.badges.gold_unearned }, // prettier-ignore
] as const;

// Functions ---------------------------------------------------------------------

/** Wires the checkmate banners and paints the initial progress. Runs once at page entry. */
function init(): void {
	for (const checkmate of elements_checkmates) {
		checkmate.addEventListener('click', callback_checkmateClicked);
	}
	refreshProgress();
}

/** Starts the clicked checkmate's game and reveals the board under the overlay. */
function callback_checkmateClicked(event: Event): void {
	const id = (event.currentTarget as HTMLElement).dataset['id']!;
	if (!practicegame.startCheckmatePractice(id)) return; // Refused: another load is in flight.
	element_selection.classList.add('hidden');
}

/** Reopens the selection overlay over the board, repainting the progress. */
function open(): void {
	refreshProgress();
	element_selection.classList.remove('hidden');
}

/** Repaints each banner's beaten state, the progress bar, and the badges. */
function refreshProgress(): void {
	const completedCheckmates = practicegame.getCompletedCheckmates();
	let numCompleted = 0;
	for (const checkmate of elements_checkmates) {
		const beaten = completedCheckmates.includes(checkmate.dataset['id']!);
		checkmate.classList.toggle('beaten', beaten);
		if (beaten) numCompleted++;
	}

	element_progressCount.textContent = `${numCompleted} / ${NUM_CHECKMATES}`;
	element_progressFill.style.width = `${(100 * numCompleted) / NUM_CHECKMATES}%`;

	updateBadges(numCompleted);
}

/**
 * Greys out the unearned badges, shines the earned ones, and updates their tooltips.
 * Badges can only be earned while logged in — progress lives on the account.
 */
function updateBadges(numCompleted: number): void {
	const areLoggedIn = validatorama.areWeLoggedIn();

	for (const badge of BADGES) {
		const element = document.getElementById(badge.id)!;
		const isEarned = areLoggedIn && numCompleted >= badge.threshold * NUM_CHECKMATES;
		const tooltip = isEarned
			? badge.earned()
			: areLoggedIn
				? badge.unearned()
				: t.practice.badges.logged_out;

		element.setAttribute('data-tooltip', tooltip);
		element.querySelector('img')!.classList.toggle('unearned', !isEarned);
		element
			.querySelectorAll('.shine-clockwise, .shine-anticlockwise')
			.forEach((shine) => shine.classList.toggle('hidden', !isEarned));
	}
}

// Exports -------------------------------------------------------------------------

export default {
	init,
	open,
};
