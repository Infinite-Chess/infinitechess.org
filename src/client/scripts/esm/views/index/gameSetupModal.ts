// src/client/scripts/esm/views/index/gameSetupModal.ts

/**
 * This script manages the game setup invite/seek creation modal.
 */

import timeControls from './timeControls.js';
import variantSelector from './variantSelector.js';

// Types ----------------------------------------------

/** The active game creation flow: online seek, friend challenge, or computer game. */
type ModalMode = 'online' | 'friend' | 'computer';

/** The data-* attribute keys that each identify an exclusive-select toggle button group. */
type ToggleGroupAttribute = 'data-time' | 'data-mode' | 'data-side' | 'data-level';

// Constants ------------------------------------------

/** Labels for the modal submit button based on the active mode. */
const SUBMIT_LABELS: Record<ModalMode, string> = {
	online: 'Create online game',
	friend: 'Challenge a friend',
	computer: 'Play against computer',
};

// Elements ----------------------------------------------

const element_modalOverlay = document.getElementById('modal-overlay')!;
const element_modalClose = document.getElementById('modal-close')!;
const element_modalSubmit = document.getElementById('modal-submit')!;
const element_btnCreateOnline = document.getElementById('btn-create-game')!;
const element_btnChallengeFriend = document.getElementById('btn-challenge-friend')!;
const element_btnPlayComputer = document.getElementById('btn-play-ai')!;
const element_rowGameMode = document.getElementById('row-game-mode')!;
const element_rowStrength = document.getElementById('row-strength')!;
const element_buttonsByToggleGroup: Record<ToggleGroupAttribute, NodeListOf<HTMLElement>> = {
	'data-time': document.querySelectorAll<HTMLElement>('[data-time]'),
	'data-mode': document.querySelectorAll<HTMLElement>('[data-mode]'),
	'data-side': document.querySelectorAll<HTMLElement>('[data-side]'),
	'data-level': document.querySelectorAll<HTMLElement>('[data-level]'),
};

// Initialization ----------------------------------------------

initModal();

// Functions ----------------------------------------------

/** Initializes shared exclusive-selection behavior for all data-* toggle button groups. */
function initToggleGroups(): void {
	// Each [data-time], [data-mode], [data-side], [data-level] button is an exclusive-select group.
	// Buttons sharing the same data-* attribute key form one group.
	const groups: [ToggleGroupAttribute, (() => void)?][] = [
		['data-time', timeControls.onTimeToggle],
		['data-mode'],
		['data-side'],
		['data-level'],
	];
	for (const [attr, callback] of groups) {
		element_buttonsByToggleGroup[attr].forEach((btn) => {
			btn.addEventListener('click', () => {
				// Keep exactly one active option per group.
				element_buttonsByToggleGroup[attr].forEach((groupButton) =>
					groupButton.classList.remove('active'),
				);
				btn.classList.add('active');
				callback?.();
			});
		});
	}
}

/** Wires modal open/close controls and initializes all interactive sections. */
function initModal(): void {
	element_btnCreateOnline.addEventListener('click', () => openModal('online'));
	element_btnChallengeFriend.addEventListener('click', () => openModal('friend'));
	element_btnPlayComputer.addEventListener('click', () => openModal('computer'));

	element_modalClose.addEventListener('click', closeModal);
	element_modalOverlay.addEventListener('pointerdown', (e) => {
		if (e.target === e.currentTarget) closeModal();
	});
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') closeModal();
	});

	initToggleGroups();
	timeControls.initModalSliders();
	timeControls.onTimeToggle();
	timeControls.initPresets();
	variantSelector.initVariantGroupDropdown();
	variantSelector.initIcnValidation();
}

/** Opens the modal and adjusts mode-specific rows and submit labeling. */
function openModal(mode: ModalMode): void {
	element_modalSubmit.textContent = SUBMIT_LABELS[mode];

	element_rowGameMode.classList.toggle('hidden', mode === 'computer');
	element_rowStrength.classList.toggle('hidden', mode !== 'computer');

	element_modalOverlay.classList.remove('hidden');

	element_modalClose.focus();
}

/** Hides the modal. */
function closeModal(): void {
	element_modalOverlay.classList.add('hidden');
	variantSelector.closeVariantDropdown();
}
