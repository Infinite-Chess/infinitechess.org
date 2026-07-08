// src/client/scripts/esm/components/gameSetupModal/gameSetupModalUi.ts

/**
 * Shared DOM behavior for the game setup modal.
 */

import timeControls from './timeControls.js';

// Types ----------------------------------------------

/** The active game creation flow: online seek, friend challenge, or computer game. */
type ModalMode = 'online' | 'friend' | 'computer';

/** The data-* attribute keys that each identify an exclusive-select toggle button group. */
type ToggleGroupAttribute = 'data-time' | 'data-mode' | 'data-side' | 'data-level';

interface ToggleCallbacks {
	time?: () => void;
	mode?: () => void;
	side?: () => void;
	level?: () => void;
}

// Constants ------------------------------------------

/** Submit-button labels per active mode. */
const SUBMIT_LABELS: Record<ModalMode, string> = {
	online: t.index.lobby_buttons.create_online,
	friend: t.index.lobby_buttons.challenge_friend,
	computer: t.index.lobby_buttons.play_computer,
};

const TOGGLE_CALLBACK_KEYS: Record<ToggleGroupAttribute, keyof ToggleCallbacks> = {
	'data-time': 'time',
	'data-mode': 'mode',
	'data-side': 'side',
	'data-level': 'level',
};

// Elements ----------------------------------------------

const element_modalOverlay = document.getElementById('modal-overlay')!;
const element_modalClose = document.getElementById('modal-close')!;
const element_modalSubmit = document.getElementById('modal-submit') as HTMLButtonElement;
const element_rowGameMode = document.getElementById('row-game-mode')!;
const element_rowStrength = document.getElementById('row-strength')!;
const element_variantCustomSection = document.getElementById('variant-custom-section')!;
const element_variantName = document.getElementById('variant-name')!;
const element_variantGroupIconUse =
	document.querySelector<SVGUseElement>('#variant-group-icon use')!;
const element_icnInput = document.getElementById('icn-input') as HTMLTextAreaElement;
const element_buttonsByToggleGroup: Record<ToggleGroupAttribute, NodeListOf<HTMLElement>> = {
	'data-time': document.querySelectorAll<HTMLElement>('#modal-overlay [data-time]'),
	'data-mode': document.querySelectorAll<HTMLElement>('#modal-overlay [data-mode]'),
	'data-side': document.querySelectorAll<HTMLElement>('#modal-overlay [data-side]'),
	'data-level': document.querySelectorAll<HTMLElement>('#modal-overlay [data-level]'),
};

// Functions ----------------------------------------------

/** Initializes shared modal controls and exclusive-selection behavior. */
function init(callbacks: ToggleCallbacks = {}): void {
	element_modalClose.addEventListener('click', close);
	element_modalOverlay.addEventListener('pointerdown', (e) => {
		if (e.target === e.currentTarget) close();
	});

	initToggleGroups(callbacks);
	timeControls.initModalSliders();
	timeControls.onTimeToggle();
	timeControls.initPresets();
}

/** Initializes shared exclusive-selection behavior for all data-* toggle button groups. */
function initToggleGroups(callbacks: ToggleCallbacks): void {
	const groups: ToggleGroupAttribute[] = ['data-time', 'data-mode', 'data-side', 'data-level'];
	for (const attr of groups) {
		element_buttonsByToggleGroup[attr].forEach((btn) => {
			btn.addEventListener('click', () => {
				element_buttonsByToggleGroup[attr].forEach((groupButton) =>
					groupButton.classList.remove('active'),
				);
				btn.classList.add('active');
				if (attr === 'data-time') timeControls.onTimeToggle();
				callbacks[TOGGLE_CALLBACK_KEYS[attr]]?.();
			});
		});
	}
}

/** Opens the modal and adjusts mode-specific rows and submit labeling. */
function open(mode: ModalMode): void {
	element_modalSubmit.textContent = SUBMIT_LABELS[mode];

	element_rowGameMode.classList.toggle('hidden', mode === 'computer');
	element_rowStrength.classList.toggle('hidden', mode !== 'computer');

	element_modalOverlay.classList.remove('hidden');
	element_modalClose.focus();
}

/** Hides the modal. */
function close(): void {
	element_modalOverlay.classList.add('hidden');
}

/** Selects the custom From-ICN display and injects the exported position. */
function setCustomIcn(positionIcn: string, displayName = 'From ICN'): void {
	element_icnInput.value = positionIcn;
	element_variantCustomSection.classList.remove('hidden');
	element_variantName.textContent = displayName;
	const icon = element_variantGroupIconUse.closest('svg');
	icon?.classList.add('svg-clipboard');
	element_variantGroupIconUse.setAttribute('href', '#svg-clipboard');
}

function getSubmitButton(): HTMLButtonElement {
	return element_modalSubmit;
}

function getPositionInput(): HTMLTextAreaElement {
	return element_icnInput;
}

export type { ModalMode };

export default {
	init,
	open,
	close,
	setCustomIcn,
	getSubmitButton,
	getPositionInput,
};
