// src/client/scripts/esm/views/index/gamesetupmodal.ts

/**
 * This script manages the game setup invite/seek creation modal.
 */

import type { GameMode } from '../../../../../shared/transport/domain.js';
import type { ModalMode } from '../../handoffs/gamesetuphandoff.js';
import type { TimeControl } from '../../../../../shared/chess/util/clockutil.js';
import type { GameOptions } from './gameoptionsstore.js';

import { players } from '../../../../../shared/chess/util/typeutil.js';
import leaderboardregistry from '../../../../../shared/chess/variants/leaderboardregistry.js';

import lobby from './lobby.js';
import timecontrols from './timecontrols.js';
import validatorama from '../../util/validatorama.js';
import variantselector from '../../board/variantselector/variantselector.js';
import modifierselector from '../../board/variantselector/modifierselector.js';
import gameoptionsstore from './gameoptionsstore.js';
import gamesetuphandoff from '../../handoffs/gamesetuphandoff.js';

// Types -----------------------------------------------------------------------

/** The data-* attribute keys that each identify an exclusive-select toggle button group. */
type ToggleGroupAttribute = 'data-time' | 'data-mode' | 'data-side' | 'data-level';

// Constants -------------------------------------------------------------------

/** Submit-button labels per active mode. */
const SUBMIT_LABELS: Record<ModalMode, string> = {
	online: t.index.lobby_buttons.create_online,
	friend: t.index.lobby_buttons.challenge_friend,
	computer: t.index.lobby_buttons.play_computer,
};

// Elements --------------------------------------------------------------------

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

// State -----------------------------------------------------------------------

/** The active game creation flow. */
let currentMode: ModalMode;

// Initialization --------------------------------------------------------------

initModal();
void initRememberedState();

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

	element_modalSubmit.addEventListener('click', () => void submitModal());

	initToggleGroups();
	// Sliders save on commit, not change — one drag fires dozens of changes, each a whole-ICN write.
	timecontrols.init({ onCommit: persist });
	variantselector.initVariantGroupDropdown({
		isSeekContext: true,
		onValidityChange: () => {
			element_modalSubmit.disabled = !variantselector.isSelectionValid();
			syncRatedButton();
		},
		// Remembered as it is typed, so a half-written ICN survives a refresh.
		// Deliberately not also on commit: committing changes neither the selection nor its text.
		onEdit: persist,
	});
	variantselector.initIcnValidation();
	modifierselector.initModifierSelector({
		onChange: syncRatedButton,
		// A modifier commit re-judges the position: the Slide Limit rebuilds the movesets, so a
		// position judged without it is not the one that would be played.
		onCommit: () => {
			persist();
			void variantselector.revalidateCustomSelection();
		},
	});
	syncRatedButton();
}

/** Initializes shared exclusive-selection behavior for all data-* toggle button groups. */
function initToggleGroups(): void {
	// Each [data-time], [data-mode], [data-side], [data-level] button is an exclusive-select group.
	// Buttons sharing the same data-* attribute key form one group.
	const groups: [ToggleGroupAttribute, (() => void)?][] = [
		[
			'data-time',
			() => {
				timecontrols.onTimeToggle();
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
				setActiveToggle(attr, btn);
				callback?.();
				persist();
			});
		});
	}
}

// Toggle groups ---------------------------------------------------------------

/** Makes the given button the only active one in its toggle group. */
function setActiveToggle(attr: ToggleGroupAttribute, btn: HTMLElement): void {
	element_buttonsByToggleGroup[attr].forEach((groupButton) =>
		groupButton.classList.remove('active'),
	);
	btn.classList.add('active');
}

/** The `data-*` value of the active button in the given toggle group. */
function getToggleValue(attr: ToggleGroupAttribute): string {
	return document.querySelector<HTMLElement>(`[${attr}].active`)!.getAttribute(attr)!;
}

// Remembered options ----------------------------------------------------------

/**
 * Restores the options remembered from the player's last visit, then consumes a pending
 * handoff - that order, so a handoff's variant trumps. The model is initially closed on
 * page load anyway, so the flash between the two is never seen.
 */
async function initRememberedState(): Promise<void> {
	const options = await gameoptionsstore.read();
	if (options !== undefined) applyOptions(options);
	await consumePendingHandoff();
}

/** Applies the options remembered from the player's last visit. */
function applyOptions(options: GameOptions): void {
	applyToggleValue('data-time', options.toggles.time);
	applyToggleValue('data-mode', options.toggles.mode);
	applyToggleValue('data-side', options.toggles.side);
	applyToggleValue('data-level', options.toggles.level);
	timecontrols.onTimeToggle();
	timecontrols.setMinutesAndIncrement(options.minutes, options.increment);
	modifierselector.applyModifiers(options.modifiers);
	// A cloud save can't be fetched while logged out, and trying would show a load failure
	// that lies — nothing failed. Skipping it leaves the variant on Classical.
	if (options.selection.kind !== 'cloud' || validatorama.areWeLoggedIn())
		variantselector.restoreSelection(options.selection);
	// Still needed: a skipped cloud save never reaches restoreSelection, so nothing saved itself.
	syncRatedButton();
	persist();
}

/** Marks the button carrying the given value as the active one in its toggle group. */
function applyToggleValue(attr: ToggleGroupAttribute, value: string): void {
	const match = [...element_buttonsByToggleGroup[attr]].find(
		(btn) => btn.getAttribute(attr) === value,
	);
	// A value no button carries any more (a stored option the markup has since dropped) changes nothing.
	if (match !== undefined) setActiveToggle(attr, match);
}

/** Remembers every option the modal is currently set to, for the player's next visit. */
function persist(): void {
	const { minutes, increment } = timecontrols.getMinutesAndIncrement();
	gameoptionsstore.save({
		selection: variantselector.getSelection(),
		modifiers: modifierselector.getGameModifiers(),
		minutes,
		increment,
		toggles: {
			time: getToggleValue('data-time'),
			mode: getToggleValue('data-mode'),
			side: getToggleValue('data-side'),
			level: getToggleValue('data-level'),
		},
	});
}

// Form state ------------------------------------------------------------------

/** Reads current seek options and disables the Rated button if a rated game is not permitted. */
function syncRatedButton(): void {
	// Only a preset can be rated, so a custom selection is never resolved here — doing so would
	// hand back the whole ICN it serializes to, only for rated-eligibility to refuse it anyway.
	const isPreset = variantselector.getSelection().kind === 'preset';
	const variant = isPreset ? variantselector.getSeekVariant() : null;
	const time: TimeControl = timecontrols.getTimeControl();
	const color = getSelectedColor();
	const modifiers = modifierselector.getGameModifiers();

	const allowed = leaderboardregistry.isRatedAllowed(variant, time, color, modifiers);
	element_ratedButton.disabled = !allowed;
	if (!allowed && element_ratedButton.classList.contains('active'))
		setActiveToggle('data-mode', element_casualButton);
}

/** Returns the color the player has selected, or null for random. */
function getSelectedColor(): typeof players.WHITE | typeof players.BLACK | null {
	const sideVal = getToggleValue('data-side');
	if (sideVal === 'random') return null;
	if (sideVal === 'white') return players.WHITE;
	if (sideVal === 'black') return players.BLACK;
	throw new Error(`Invalid side selection: ${sideVal}`);
}

// Creating the game -----------------------------------------------------------

/** Runs the active flow's submit, first settling any verdict live validation deferred. */
async function submitModal(): Promise<void> {
	if (variantselector.isVerdictDeferred()) {
		// A position too large to judge on every keystroke leaves the button enabled rather than
		// greyed out with nothing having judged it — so pressing it is where that position gets judged.
		await variantselector.revalidateCustomSelection();
		element_modalSubmit.disabled = !variantselector.isSelectionValid();
		if (element_modalSubmit.disabled) return;
	}

	if (currentMode === 'online') handleSeek(false);
	else if (currentMode === 'friend') handleSeek(true);
	else if (currentMode === 'computer') handleComputerGame();
	else console.error('Invalid modal mode:', currentMode);
}

/**
 * Reads the seek form state and sends a createseek request via the lobby.
 * @param isPrivate - Whether it's a "Challenge a friend" invite, rather than a lobby seek.
 */
function handleSeek(isPrivate: boolean): void {
	const variant = variantselector.getSeekVariant();
	if (variant === null) return; // Invalid selection (e.g. unparsable icn or illegal position)

	const time: TimeControl = timecontrols.getTimeControl();
	const color = getSelectedColor();

	const mode = getToggleValue('data-mode') as GameMode;

	const modifiers = modifierselector.getGameModifiers();

	lobby.createSeek({
		variant,
		time,
		color,
		mode,
		modifiers: modifiers.length > 0 ? modifiers : undefined,
		private: isPrivate,
	});
	close();
}

/** Reads the computer game form state and asks the server to create the engine game. */
function handleComputerGame(): void {
	const variant = variantselector.getSeekVariant();
	if (variant === null) return; // Invalid selection (e.g. unparsable icn, illegal position, or one the engine can't play)

	const time: TimeControl = timecontrols.getTimeControl();
	const color = getSelectedColor();

	const strengthLevel = Number(getToggleValue('data-level'));

	lobby.createEngineGame({ variant, time, color, strengthLevel });
	close();
}

// Opening and closing ---------------------------------------------------------

/** Opens the modal and adjusts mode-specific rows and submit labeling. */
function openModal(mode: ModalMode): void {
	lobby.exitIdle();

	currentMode = mode;
	element_modalSubmit.textContent = SUBMIT_LABELS[mode];

	element_rowGameMode.classList.toggle('hidden', mode === 'computer');
	element_rowStrength.classList.toggle('hidden', mode !== 'computer');
	variantselector.onModalOpen(mode === 'computer');

	element_modalOverlay.classList.remove('hidden');

	element_modalClose.focus();
}

/** Hides the modal. */
function close(): void {
	element_modalOverlay.classList.add('hidden');
	variantselector.closeVariantDropdown();
	modifierselector.closeModifierDropdown();
}

/**
 * Auto-opens the modal pre-filled from a handoff another page (e.g. analysis
 * "continue from here") stashed before navigating here. Any position errors
 * surface via the modal's own validation.
 */
async function consumePendingHandoff(): Promise<void> {
	const handoff = await gamesetuphandoff.take();
	if (handoff === undefined) return;
	openModal(handoff.mode);
	await variantselector.applyIcn(handoff.icn);
}

// Exports ---------------------------------------------------------------------

export default { close };
