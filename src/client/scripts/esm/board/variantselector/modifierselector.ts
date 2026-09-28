// src/client/scripts/esm/board/variantselector/modifierselector.ts

/**
 * Manages game modifier selection in the variant selector widget:
 * the modifier dropdown, selected modifiers display, and per-modifier settings (e.g. Slide Limit).
 */

import type {
	ModifierCode,
	GameModifier,
	SlideLimitValue,
} from '../../../../../shared/chess/util/modutil.js';

import modutil from '../../../../../shared/chess/util/modutil.js';
import apeironcard from '../../../../../shared/chess/engines/apeironcard.js';

// Types -----------------------------------------------------------------------

/** Callbacks a host wires to react to the modifier selector's state. */
interface ModifierSelectorConfig {
	/** Fired on every modifier change, including live slider drags; hosts sync dependent UI. */
	onChange?: () => void;
	/** Fired only on committed changes (add/remove a modifier, or release the slider); hosts act on it. */
	onCommit?: () => void;
}

// Constants -------------------------------------------------------------------

/** Default slide limit distance in squares. */
const SLIDE_LIMIT_DEFAULT = 7;

// Elements --------------------------------------------------------------------

const element_modifierAddBtn = document.querySelector<SVGElement>('.modifier-add')!;
const element_modifierDropdown = document.getElementById('modifier-dropdown')!;
const element_modifierItems =
	element_modifierDropdown.querySelectorAll<HTMLElement>('[data-modifier]');
const element_modifiersSection = document.getElementById('modifiers-section')!;
const element_modifiersList = document.getElementById('modifiers-list')!;
const element_slideLimitSection = document.getElementById('slide-limit-section')!;
const element_slideLimitSlider = document.getElementById('slider-slide-limit') as HTMLInputElement;
const element_slideLimitDisplay = document.getElementById('slide-limit-display')!;

// State -----------------------------------------------------------------------

/** Host callbacks, populated by {@link initModifierSelector}. */
let config: ModifierSelectorConfig = {};

const selectedModifiers = new Set<ModifierCode>();
/** Whether the picker is restricted to modifiers the engine can play (the computer-game flow). */
let engineOnly = false;

// Initialization --------------------------------------------------------------

/** Wires all modifier selector interactions. */
function initModifierSelector(hostConfig: ModifierSelectorConfig = {}): void {
	config = hostConfig;

	element_modifierAddBtn.addEventListener('click', () => {
		toggleModifierDropdown();
	});

	document.addEventListener('pointerdown', (e) => {
		const target = e.target as Node;
		if (!element_modifierAddBtn.contains(target) && !element_modifierDropdown.contains(target))
			closeModifierDropdown();
	});

	element_modifierItems.forEach((item) => {
		const code = item.getAttribute('data-modifier') as ModifierCode;
		item.addEventListener('click', () => selectModifier(code));
	});

	// input updates the live display (onChange); change (drag release) is a commit.
	element_slideLimitSlider.addEventListener('input', () => {
		const idx = parseInt(element_slideLimitSlider.value, 10);
		const value = modutil.SLIDE_LIMIT_VALUES[idx]!;
		element_slideLimitDisplay.textContent = String(value);
		config.onChange?.();
	});
	element_slideLimitSlider.addEventListener('change', () => config.onCommit?.());

	setSlideLimit(SLIDE_LIMIT_DEFAULT);
}

// Dropdown navigation ---------------------------------------------------------

/** Toggles the modifier dropdown open/closed. */
function toggleModifierDropdown(): void {
	element_modifierDropdown.classList.toggle('open');
}

/** Closes the modifier dropdown. */
function closeModifierDropdown(): void {
	element_modifierDropdown.classList.remove('open');
}

/**
 * Restricts the picker to what the engine can play for an engine game,
 * deselecting any selected modifier it can't.
 */
function onModalOpen(engineGame: boolean): void {
	engineOnly = engineGame;
	for (const code of selectedModifiers) {
		if (!isAvailable(code)) deselectModifier(code);
	}
	refreshModifierItems();
}

/** Whether the modifier may be picked under the current restriction. */
function isAvailable(code: ModifierCode): boolean {
	return !engineOnly || apeironcard.SUPPORTED_MODIFIERS.has(code);
}

// Modifier selection ----------------------------------------------------------

/** Adds a modifier to the selection, hides it from the dropdown, and refreshes the display. */
function selectModifier(code: ModifierCode): void {
	selectedModifiers.add(code);
	closeModifierDropdown();
	refreshModifiersSection();
	refreshModifierItems();
	config.onChange?.();
	config.onCommit?.();
}

/** Removes a modifier from the selection and refreshes the display. */
function deselectModifier(code: ModifierCode): void {
	selectedModifiers.delete(code);
	refreshModifiersSection();
	refreshModifierItems();
	config.onChange?.();
	config.onCommit?.();
}

/**
 * Replaces the current selection with the given modifiers, syncing the dropdown,
 * chips, and slider. Used to restore a snapshotted modifier state (no commit fired).
 */
function applyModifiers(modifiers: GameModifier[]): void {
	selectedModifiers.clear();
	for (const modifier of modifiers) {
		selectedModifiers.add(modifier.kind);
		if (modifier.kind === 'slide-limit') setSlideLimit(modifier.value);
	}
	refreshModifiersSection();
	refreshModifierItems();
}

// Display ---------------------------------------------------------------------

/** Rebuilds the selected modifier chips and shows/hides modifier-specific sections. */
function refreshModifiersSection(): void {
	element_modifiersList.innerHTML = '';
	for (const code of selectedModifiers) {
		element_modifiersList.appendChild(createModifierChip(code));
	}
	element_modifiersSection.classList.toggle('hidden', selectedModifiers.size === 0);
	const slideLimitSelected = selectedModifiers.has('slide-limit');
	element_slideLimitSection.classList.toggle('hidden', !slideLimitSelected);
	if (!slideLimitSelected) setSlideLimit(SLIDE_LIMIT_DEFAULT); // Reset once removed.
}

/** Builds the chip showing a selected modifier, which deselects it when clicked. */
function createModifierChip(code: ModifierCode): HTMLElement {
	const name = t.shared.modifiers[code].name;
	const iconId = modutil.getModifierIconId(code);
	const chip = document.createElement('div');
	chip.className = 'modifier-chip';
	chip.dataset['modifier'] = code;
	chip.title = name;
	chip.innerHTML = `<svg class="${iconId}"><use href="#${iconId}"></use></svg><div class="modifier-chip-overlay">✕</div>`;
	chip.addEventListener('click', () => deselectModifier(code));
	return chip;
}

/** Moves the Slide Limit slider, and its readout, to the given distance. */
function setSlideLimit(value: SlideLimitValue): void {
	element_slideLimitSlider.value = String(modutil.SLIDE_LIMIT_VALUES.indexOf(value));
	element_slideLimitDisplay.textContent = String(value);
}

/**
 * Lists in the dropdown only the modifiers still available to add — unselected, and allowed
 * under the current restriction — showing the add button only while any remain.
 */
function refreshModifierItems(): void {
	let anyVisible = false;
	element_modifierItems.forEach((item) => {
		const code = item.getAttribute('data-modifier') as ModifierCode;
		const visible = !selectedModifiers.has(code) && isAvailable(code);
		item.classList.toggle('hidden', !visible);
		if (visible) anyVisible = true;
	});
	element_modifierAddBtn.classList.toggle('hidden', !anyVisible);
}

// Selection accessors ---------------------------------------------------------

/** Returns the complete configuration for every currently selected modifier. */
function getGameModifiers(): GameModifier[] {
	const configs: GameModifier[] = [];
	if (selectedModifiers.has('slide-limit')) {
		const idx = parseInt(element_slideLimitSlider.value, 10);
		const slideLimit = modutil.SLIDE_LIMIT_VALUES[idx]!;
		configs.push({ kind: 'slide-limit', value: slideLimit });
	}
	return configs;
}

// Exports ---------------------------------------------------------------------

export default {
	// Initialization
	initModifierSelector,
	// Dropdown navigation
	closeModifierDropdown,
	onModalOpen,
	// Modifier selection
	applyModifiers,
	// Selection accessors
	getGameModifiers,
};
