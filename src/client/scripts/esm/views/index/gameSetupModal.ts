// src/client/scripts/esm/views/index/gameSetupModal.ts

/**
 * This script manages the game setup invite/seek creation modal.
 */

import type { Player } from '../../../../../shared/chess/util/typeutil.js';
import type { GameMode, TimeControl } from '../../../../../shared/types.js';

import { players } from '../../../../../shared/chess/util/typeutil.js';
import { isRatedAllowed } from '../../../../../shared/chess/variants/servervalidation.js';

import lobby from './lobby.js';
import toast from '../../components/toast.js';
import timeControls from './timeControls.js';
import variantSelector from './variantSelector.js';
import modifierSelector from './modifierSelector.js';

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
const element_ratedButton = document.querySelector<HTMLButtonElement>('[data-mode="rated"]')!;
const element_casualButton = document.querySelector<HTMLButtonElement>('[data-mode="casual"]')!;
const element_rowStrength = document.getElementById('row-strength')!;
const element_buttonsByToggleGroup: Record<ToggleGroupAttribute, NodeListOf<HTMLElement>> = {
	'data-time': document.querySelectorAll<HTMLElement>('[data-time]'),
	'data-mode': document.querySelectorAll<HTMLElement>('[data-mode]'),
	'data-side': document.querySelectorAll<HTMLElement>('[data-side]'),
	'data-level': document.querySelectorAll<HTMLElement>('[data-level]'),
};

// Variables ------------------------------------------

/** The active game creation flow. */
let currentMode: ModalMode;

// Initialization ----------------------------------------------

initModal();

// Functions ----------------------------------------------

/** Initializes shared exclusive-selection behavior for all data-* toggle button groups. */
function initToggleGroups(): void {
	// Each [data-time], [data-mode], [data-side], [data-level] button is an exclusive-select group.
	// Buttons sharing the same data-* attribute key form one group.
	const groups: [ToggleGroupAttribute, (() => void)?][] = [
		[
			'data-time',
			() => {
				timeControls.onTimeToggle();
				syncRatedButton();
			},
		],
		['data-mode'],
		['data-side', syncRatedButton],
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

	element_modalSubmit.addEventListener('click', () => {
		if (currentMode === 'online') handleOnlineSeek();
		else if (currentMode === 'friend')
			toast.show('Friend challenge flow not implemented yet', { error: true });
		else if (currentMode === 'computer')
			toast.show('Computer game flow not implemented yet', { error: true });
		else console.error('Invalid modal mode:', currentMode);
	});

	initToggleGroups();
	timeControls.initModalSliders();
	timeControls.onTimeToggle();
	timeControls.initPresets();
	variantSelector.initVariantGroupDropdown();
	variantSelector.initIcnValidation();
	modifierSelector.initModifierSelector();
	syncRatedButton();
}

/** Reads current seek options and disables the Rated button if a rated game is not permitted. */
export function syncRatedButton(): void {
	const variant = variantSelector.getInviteVariant();
	const time: TimeControl = timeControls.getTimeControl();
	const color = getSelectedColor();
	const modifiers = modifierSelector.getInviteModifiers();

	const allowed = isRatedAllowed(variant, time, color, modifiers);
	element_ratedButton.disabled = !allowed;
	if (!allowed && element_ratedButton.classList.contains('active')) {
		element_ratedButton.classList.remove('active');
		element_casualButton.classList.add('active');
	}
}

/** Returns the color the player has selected, or null for random. */
function getSelectedColor(): Player | null {
	const sideBtn = document.querySelector<HTMLElement>('[data-side].active')!;
	const sideVal = sideBtn.getAttribute('data-side')!;
	if (sideVal === 'random') return null;
	if (sideVal === 'white') return players.WHITE;
	if (sideVal === 'black') return players.BLACK;
	throw new Error(`Invalid side selection: ${sideVal}`);
}

/** Reads the online seek form state and sends a createseek request via the lobby. */
function handleOnlineSeek(): void {
	const variant = variantSelector.getInviteVariant();
	if (variant === null) return; // Invalid selection (e.g. unparsable icn or illegal position)

	const time: TimeControl = timeControls.getTimeControl();
	const color = getSelectedColor();

	const modeBtn = document.querySelector<HTMLElement>('[data-mode].active')!;
	const mode: GameMode = modeBtn.getAttribute('data-mode') as GameMode;

	const modifiers = modifierSelector.getInviteModifiers();

	lobby.createSeek({ variant, time, color, mode, modifiers });
	closeModal();
}

/** Opens the modal and adjusts mode-specific rows and submit labeling. */
function openModal(mode: ModalMode): void {
	currentMode = mode;
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
	modifierSelector.closeModifierDropdown();
}
