// src/client/scripts/esm/views/index/gameSetupModal.ts

/**
 * This script manages the game setup invite/seek creation modal.
 */

import type { Player } from '../../../../../shared/chess/util/typeutil.js';
import type { ModalMode } from '../../components/gameSetupModalHandoff.js';
import type { CreateEngineGameBody, GameMode, TimeControl } from '../../../../../shared/types.js';

import uuid from '../../../../../shared/util/uuid.js';
import { players } from '../../../../../shared/chess/util/typeutil.js';
import hydrochess_card from '../../../../../shared/chess/engines/hydrochess_card.js';
import { isRatedAllowed } from '../../../../../shared/chess/variants/servervalidation.js';
import { engineDictionary, ValidEngine } from '../../../../../shared/chess/engines/engine.js';

import lobby from './lobby.js';
import toast from '../../components/toast.js';
import gamesound from '../../game/misc/gamesound.js';
import timeControls from './timeControls.js';
import variantSelector from '../../components/variantselector/variantSelector.js';
import modifierSelector from '../../components/variantselector/modifierSelector.js';
import { serverFetch } from '../../util/serverFetch.js';
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

/** The engine computer games are played against. */
const COMPUTER_GAME_ENGINE: ValidEngine = 'hydrochess';

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
		else if (currentMode === 'computer') void handleComputerGame();
		else console.error('Invalid modal mode:', currentMode);
	});

	initToggleGroups();
	timeControls.initModalSliders();
	timeControls.onTimeToggle();
	timeControls.initPresets();
	variantSelector.initVariantGroupDropdown({
		enforceSizeLimit: true,
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

/**
 * Reads the computer game form state, asks the server to create the engine game,
 * and hard-navigates to its game page — where the engine runs locally in wasm.
 */
async function handleComputerGame(): Promise<void> {
	const variant = variantSelector.getInviteVariant();
	if (variant === null) return; // Invalid selection (e.g. unparsable icn or illegal position)

	if (!isVariantSupportedByEngine()) return; // Error toast already shown.

	const time: TimeControl = timeControls.getTimeControl();
	// The engine takes whichever color the player doesn't.
	const color = (getSelectedColor() ?? (Math.random() < 0.5 ? players.WHITE : players.BLACK)) as CreateEngineGameBody['color']; // prettier-ignore
	const strengthLevel = getSelectedEngineStrength();

	const body: CreateEngineGameBody = {
		variant,
		timeControl: time,
		color,
		engine: COMPUTER_GAME_ENGINE,
		strengthLevel,
	};

	element_modalSubmit.disabled = true; // No double-submits while the request is in flight.
	try {
		const response = await serverFetch('/api/engine-game', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
		const data: { id?: number; message?: string } = await response.json();
		if (!response.ok || data.id === undefined)
			throw new Error(data.message ?? `Failed to create the game (${response.status}).`);

		// Plays the notify sound and awaits it so the hard-navigate doesn't cut it off.
		const sound = await gamesound.playNotify(false);
		if (sound) await sound.whenEnded;
		window.location.assign(`/game/${uuid.base10ToBase62(data.id)}`);
	} catch (e) {
		toast.show(e instanceof Error ? e.message : 'Failed to create the game.', { error: true });
		element_modalSubmit.disabled = false;
	}
}

/**
 * Whether the engine supports the selected variant/position,
 * showing an error toast when it doesn't.
 */
function isVariantSupportedByEngine(): boolean {
	const customOptions = variantSelector.getSelectedVariantOptions();

	if (customOptions === null) {
		// Preset selection: the engine plays a fixed set of variants.
		const variant = variantSelector.getInviteVariant();
		if (variant?.kind === 'preset' && !hydrochess_card.SUPPORTED_VARIANTS.has(variant.code)) {
			toast.show("The engine doesn't support this variant yet.", { error: true });
			return false;
		}
		return true;
	}

	// Custom position: check it the same way the game will load it — with the
	// engine's default world border applied when the position lacks one.
	const checkedOptions = { ...customOptions, gameRules: { ...customOptions.gameRules } };
	hydrochess_card.setDefaultWorldBorder(
		checkedOptions,
		engineDictionary[COMPUTER_GAME_ENGINE].worldBorder,
	);
	const result = hydrochess_card.isPositionSupported(checkedOptions);
	if (!result.supported) {
		toast.show(`The engine doesn't support this position. ${result.reason}`, { error: true });
		return false;
	}
	return true;
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
	// Computer games can only be preset variants the engine supports.
	variantSelector.setEngineOnlyVariants(mode === 'computer');

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
	variantSelector.applyIcn(handoff.icn);
}

export default { close };
