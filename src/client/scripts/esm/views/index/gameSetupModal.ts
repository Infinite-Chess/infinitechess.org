// src/client/scripts/esm/views/index/gameSetupModal.ts

/**
 * This script manages the game setup invite/seek creation modal.
 */

import type { ModalMode } from '../../components/gameSetupModalHandoff.js';
import type { GameMode, TimeControl } from '../../../../../shared/types.js';

import { players } from '../../../../../shared/chess/util/typeutil.js';
import { isRatedAllowed } from '../../../../../shared/chess/variants/servervalidation.js';

import lobby from './lobby.js';
import toast from '../../components/toast.js';
import timeControls from './timeControls.js';
import variantSelector from '../../components/variantselector/variantSelector.js';
import modifierSelector from '../../components/variantselector/modifierSelector.js';
import gameSetupModalHandoff from '../../components/gameSetupModalHandoff.js';

// Types ----------------------------------------------

/** The data-* attribute keys that each identify an exclusive-select toggle button group. */
type ToggleGroupAttribute = 'data-time' | 'data-mode' | 'data-side' | 'data-level';

// Constants ------------------------------------------

/** Submit-button labels per active mode. */
const SUBMIT_LABELS: Record<ModalMode, string> = {
	online: t.index.lobby_buttons.create_online,
	friend: t.index.lobby_buttons.challenge_friend,
	computer: t.index.lobby_buttons.play_computer,
};

// Elements ----------------------------------------------

const element_modalOverlay = document.getElementById('modal-overlay')!;
const element_modalClose = document.getElementById('modal-close')!;
const element_modalSubmit = document.getElementById('modal-submit') as HTMLButtonElement;
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
void consumePendingHandoff();

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

	element_modalClose.addEventListener('click', close);
	element_modalOverlay.addEventListener('pointerdown', (e) => {
		if (e.target === e.currentTarget) close();
	});
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') close();
	});

	element_modalSubmit.addEventListener('click', () => {
		if (currentMode === 'online') handleOnlineSeek();
		else if (currentMode === 'friend')
			toast.show('Friend challenge flow not implemented yet', { error: true });
		else if (currentMode === 'computer') handleComputerGame();
		else console.error('Invalid modal mode:', currentMode);
	});

	initToggleGroups();
	timeControls.initModalSliders();
	timeControls.onTimeToggle();
	timeControls.initPresets();
	variantSelector.initVariantGroupDropdown({
		isSeekContext: true,
		onChange: () => {
			element_modalSubmit.disabled = !variantSelector.isSelectionValid();
			syncRatedButton();
		},
	});
	variantSelector.initIcnValidation();
	modifierSelector.initModifierSelector({ onChange: syncRatedButton });
	syncRatedButton();
}

/** Reads current seek options and disables the Rated button if a rated game is not permitted. */
export function syncRatedButton(): void {
	const variant = variantSelector.getSeekVariant();
	const time: TimeControl = timeControls.getTimeControl();
	const color = getSelectedColor();
	const modifiers = modifierSelector.getGameModifiers();

	const allowed = isRatedAllowed(variant, time, color, modifiers);
	element_ratedButton.disabled = !allowed;
	if (!allowed && element_ratedButton.classList.contains('active')) {
		element_ratedButton.classList.remove('active');
		element_casualButton.classList.add('active');
	}
}

/** Returns the color the player has selected, or null for random. */
function getSelectedColor(): typeof players.WHITE | typeof players.BLACK | null {
	const sideBtn = document.querySelector<HTMLElement>('[data-side].active')!;
	const sideVal = sideBtn.getAttribute('data-side')!;
	if (sideVal === 'random') return null;
	if (sideVal === 'white') return players.WHITE;
	if (sideVal === 'black') return players.BLACK;
	throw new Error(`Invalid side selection: ${sideVal}`);
}

/** Reads the online seek form state and sends a createseek request via the lobby. */
function handleOnlineSeek(): void {
	const variant = variantSelector.getSeekVariant();
	if (variant === null) return; // Invalid selection (e.g. unparsable icn or illegal position)

	const time: TimeControl = timeControls.getTimeControl();
	const color = getSelectedColor();

	const modeBtn = document.querySelector<HTMLElement>('[data-mode].active')!;
	const mode: GameMode = modeBtn.getAttribute('data-mode') as GameMode;

	const modifiers = modifierSelector.getGameModifiers();

	lobby.createSeek({ variant, time, color, mode, modifiers });
	close();
}

/**
 * Reads the computer game form state and asks the server (over the websocket) to create the
 * engine game. On success the server pushes back the id and we hard-navigate to its game page —
 * where the engine runs locally in wasm; on failure it pushes an error toast.
 */
function handleComputerGame(): void {
	const variant = variantSelector.getSeekVariant();
	if (variant === null) return; // Invalid selection (e.g. unparsable icn, illegal position, or one the engine can't play)

	const time: TimeControl = timeControls.getTimeControl();
	const strengthLevel = getSelectedEngineStrength();

	lobby.createEngineGame({
		variant,
		timeControl: time,
		color: getSelectedColor(),
		strengthLevel,
	});
	close();
}

/** The selected engine strength level (the modal's Strength row mirrors the engine's 1-8 range). */
function getSelectedEngineStrength(): number {
	const levelBtn = document.querySelector<HTMLElement>('[data-level].active')!;
	return Number(levelBtn.getAttribute('data-level')!);
}

/** Opens the modal and adjusts mode-specific rows and submit labeling. */
function openModal(mode: ModalMode): void {
	lobby.exitIdle();

	currentMode = mode;
	element_modalSubmit.textContent = SUBMIT_LABELS[mode];

	element_rowGameMode.classList.toggle('hidden', mode === 'computer');
	element_rowStrength.classList.toggle('hidden', mode !== 'computer');
	// Computer games allow supported presets and validated custom positions.
	variantSelector.setEngineOnly(mode === 'computer');

	element_modalOverlay.classList.remove('hidden');

	element_modalClose.focus();
}

/** Hides the modal. */
function close(): void {
	element_modalOverlay.classList.add('hidden');
	variantSelector.closeVariantDropdown();
	modifierSelector.closeModifierDropdown();
}

/**
 * Auto-opens the modal pre-filled from a handoff another page (e.g. analysis
 * "continue from here") stashed before navigating here. Any position errors
 * surface via the modal's own validation.
 */
async function consumePendingHandoff(): Promise<void> {
	const handoff = await gameSetupModalHandoff.take();
	if (handoff === undefined) return;
	openModal(handoff.mode);
	await variantSelector.applyIcn(handoff.icn);
}

export default { close };
