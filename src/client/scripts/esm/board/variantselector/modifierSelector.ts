// src/client/scripts/esm/board/variantselector/modifierSelector.ts

/**
 * Manages game modifier selection in the variant selector widget:
 * the modifier dropdown, selected modifiers display, and per-modifier settings (e.g. Slide Limit).
 */

import type { ModifierCode, GameModifier } from '../../../../../shared/chess/util/modutil.js';

import modutil from '../../../../../shared/chess/util/modutil.js';

import variantSelector from './variantSelector.js';

// Types -------------------------------------------------

/** Callbacks a host wires to react to the modifier selector's state. */
interface ModifierSelectorConfig {
	/** Fired on every modifier change, including live slider drags; hosts sync dependent UI. */
	onChange?: () => void;
	/** Fired only on committed changes (add/remove a modifier, or release the slider); hosts act on it. */
	onCommit?: () => void;
}

// Constants ---------------------------------------------

/** Default slide limit distance in squares. */
const SLIDE_LIMIT_DEFAULT = 7;

// Elements ----------------------------------------------

const element_modifierAddBtn = document.querySelector<SVGElement>('.modifier-add')!;
const element_modifierDropdown = document.getElementById('modifier-dropdown')!;
const element_modifiersSection = document.getElementById('modifiers-section')!;
const element_modifiersList = document.getElementById('modifiers-list')!;
const element_slideLimitSection = document.getElementById('slide-limit-section')!;
const element_slideLimitSlider = document.getElementById('slider-slide-limit') as HTMLInputElement;
const element_slideLimitDisplay = document.getElementById('slide-limit-display')!;

// State -------------------------------------------------

/** Host callbacks, populated by {@link initModifierSelector}. */
let config: ModifierSelectorConfig = {};

const selectedModifiers = new Set<ModifierCode>();

// Functions ---------------------------------------------

/** Wires all modifier selector interactions. */
function initModifierSelector(hostConfig: ModifierSelectorConfig = {}): void {
	config = hostConfig;

	element_modifierAddBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		variantSelector.closeVariantDropdown();
		toggleModifierDropdown();
	});

	document.addEventListener('pointerdown', (e) => {
		const target = e.target as Node;
		if (!element_modifierAddBtn.contains(target) && !element_modifierDropdown.contains(target))
			closeModifierDropdown();
	});

	element_modifierDropdown.querySelectorAll<HTMLElement>('[data-modifier]').forEach((item) => {
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

	// Initialize slider display
	const defaultIdx = modutil.SLIDE_LIMIT_VALUES.indexOf(SLIDE_LIMIT_DEFAULT);
	element_slideLimitSlider.value = String(defaultIdx);
	element_slideLimitDisplay.textContent = String(SLIDE_LIMIT_DEFAULT);
}

/** Toggles the modifier dropdown open/closed. */
function toggleModifierDropdown(): void {
	element_modifierDropdown.classList.toggle('open');
}

/** Closes the modifier dropdown. */
function closeModifierDropdown(): void {
	element_modifierDropdown.classList.remove('open');
}

/** Adds a modifier to the selection, hides it from the dropdown, and refreshes the display. */
function selectModifier(code: ModifierCode): void {
	selectedModifiers.add(code);
	element_modifierDropdown
		.querySelector<HTMLElement>(`[data-modifier="${code}"]`)!
		.classList.add('hidden');
	closeModifierDropdown();
	refreshModifiersSection();
	refreshModifierAddBtn();
	config.onChange?.();
	config.onCommit?.();
}

/** Removes a modifier from the selection, reveals it in the dropdown, and refreshes the display. */
function deselectModifier(code: ModifierCode): void {
	selectedModifiers.delete(code);
	element_modifierDropdown
		.querySelector<HTMLElement>(`[data-modifier="${code}"]`)
		?.classList.remove('hidden');
	refreshModifiersSection();
	refreshModifierAddBtn();
	config.onChange?.();
	config.onCommit?.();
}

/** Rebuilds the selected modifier chips and shows/hides modifier-specific sections. */
function refreshModifiersSection(): void {
	element_modifiersList.innerHTML = '';
	for (const code of selectedModifiers) {
		element_modifiersList.appendChild(createModifierChip(code));
	}
	element_modifiersSection.classList.toggle('hidden', selectedModifiers.size === 0);
	element_slideLimitSection.classList.toggle('hidden', !selectedModifiers.has('slide-limit'));
}

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

/** Shows the modifier-add button only when there are modifiers still available to add. */
function refreshModifierAddBtn(): void {
	element_modifierAddBtn.classList.toggle('hidden', !hasVisibleModifierItems());
}

function hasVisibleModifierItems(): boolean {
	return [...element_modifierDropdown.querySelectorAll<HTMLElement>('[data-modifier]')].some(
		(item) => !item.classList.contains('hidden'),
	);
}

/**
 * Replaces the current selection with the given modifiers, syncing the dropdown,
 * chips, and slider. Used to restore a snapshotted modifier state (no commit fired).
 */
function applyModifiers(modifiers: GameModifier[]): void {
	selectedModifiers.clear();
	for (const modifier of modifiers) {
		selectedModifiers.add(modifier.kind);
		if (modifier.kind === 'slide-limit') {
			const idx = modutil.SLIDE_LIMIT_VALUES.indexOf(modifier.value);
			element_slideLimitSlider.value = String(idx);
			element_slideLimitDisplay.textContent = String(modifier.value);
		}
	}
	// Hide selected modifiers from the dropdown; reveal the rest.
	element_modifierDropdown.querySelectorAll<HTMLElement>('[data-modifier]').forEach((item) => {
		const code = item.getAttribute('data-modifier') as ModifierCode;
		item.classList.toggle('hidden', selectedModifiers.has(code));
	});
	refreshModifiersSection();
	refreshModifierAddBtn();
}

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

// Exports -----------------------------------------------

export default {
	initModifierSelector,
	closeModifierDropdown,
	getGameModifiers,
	applyModifiers,
};
