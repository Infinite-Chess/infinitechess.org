// src/client/scripts/esm/views/index/gameSetupModal.ts

/**
 * This script manages the game setup invite/seek creation modal.
 */

import type { Player } from '../../../../../shared/chess/util/typeutil.js';
import type { ModalMode } from '../../components/gameSetupModal/gameSetupModalUi.js';
import type { GameMode, TimeControl } from '../../../../../shared/types.js';

import { players } from '../../../../../shared/chess/util/typeutil.js';
import { isRatedAllowed } from '../../../../../shared/chess/variants/servervalidation.js';

import lobby from './lobby.js';
import toast from '../../components/toast.js';
import timeControls from '../../components/gameSetupModal/timeControls.js';
import variantSelector from './variantSelector.js';
import modifierSelector from './modifierSelector.js';
import gameSetupModalUi from '../../components/gameSetupModal/gameSetupModalUi.js';

// Elements ----------------------------------------------

const element_btnCreateOnline = document.getElementById('btn-create-game')!;
const element_btnChallengeFriend = document.getElementById('btn-challenge-friend')!;
const element_btnPlayComputer = document.getElementById('btn-play-ai')!;
const element_ratedButton = document.querySelector<HTMLButtonElement>('[data-mode="rated"]')!;
const element_casualButton = document.querySelector<HTMLButtonElement>('[data-mode="casual"]')!;

// Variables ------------------------------------------

/** The active game creation flow. */
let currentMode: ModalMode;

// Initialization ----------------------------------------------

initModal();

// Functions ----------------------------------------------

/** Wires modal open/close controls and initializes all interactive sections. */
function initModal(): void {
	element_btnCreateOnline.addEventListener('click', () => openModal('online'));
	element_btnChallengeFriend.addEventListener('click', () => openModal('friend'));
	element_btnPlayComputer.addEventListener('click', () => openModal('computer'));

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') close();
	});

	gameSetupModalUi.getSubmitButton().addEventListener('click', () => {
		if (currentMode === 'online') handleOnlineSeek();
		else if (currentMode === 'friend')
			toast.show('Friend challenge flow not implemented yet', { error: true });
		else if (currentMode === 'computer')
			toast.show('Computer game flow not implemented yet', { error: true });
		else console.error('Invalid modal mode:', currentMode);
	});

	gameSetupModalUi.init({
		time: syncRatedButton,
		side: syncRatedButton,
	});
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
	const modifiers = modifierSelector.getSeekModifiers();

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

	const modifiers = modifierSelector.getSeekModifiers();

	lobby.createSeek({ variant, time, color, mode, modifiers });
	close();
}

/** Opens the modal and adjusts mode-specific rows and submit labeling. */
function openModal(mode: ModalMode): void {
	lobby.exitIdle();

	currentMode = mode;
	gameSetupModalUi.open(mode);
}

/** Hides the modal. */
function close(): void {
	gameSetupModalUi.close();
	variantSelector.closeVariantDropdown();
	modifierSelector.closeModifierDropdown();
}

export default { close };
