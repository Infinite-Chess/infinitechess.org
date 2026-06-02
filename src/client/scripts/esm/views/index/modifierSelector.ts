// src/client/scripts/esm/views/index/modifierSelector.ts

/**
 * Manages game modifier selection in the game setup modal:
 * the modifier dropdown, selected modifiers display, and per-modifier settings (e.g. Slide Limit).
 */

import type { ModifierCode } from '../../../../../shared/util/modutil.js';
import type { InviteModifier } from '../../../../../shared/types.js';

import modutil from '../../../../../shared/util/modutil.js';
import gameconfig from '../../../../../shared/util/gameconfig.js';

import variantSelector from './variantSelector.js';
import { syncRatedButton } from './gameSetupModal.js';

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

const selectedModifiers = new Set<ModifierCode>();

// Functions ---------------------------------------------

/** Wires all modifier selector interactions. */
function initModifierSelector(): void {
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

	element_slideLimitSlider.addEventListener('input', () => {
		const idx = parseInt(element_slideLimitSlider.value, 10);
		const value = gameconfig.SLIDE_LIMIT_VALUES[idx]!;
		element_slideLimitDisplay.textContent = String(value);
	});

	// Initialize slider display
	const defaultIdx = gameconfig.SLIDE_LIMIT_VALUES.indexOf(SLIDE_LIMIT_DEFAULT);
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
	syncRatedButton();
}

/** Removes a modifier from the selection, reveals it in the dropdown, and refreshes the display. */
function deselectModifier(code: ModifierCode): void {
	selectedModifiers.delete(code);
	element_modifierDropdown
		.querySelector<HTMLElement>(`[data-modifier="${code}"]`)
		?.classList.remove('hidden');
	refreshModifiersSection();
	refreshModifierAddBtn();
	syncRatedButton();
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

/** Returns the complete configuration for every currently selected modifier. */
function getInviteModifiers(): InviteModifier[] {
	const configs: InviteModifier[] = [];
	if (selectedModifiers.has('slide-limit')) {
		const idx = parseInt(element_slideLimitSlider.value, 10);
		const slideLimit = gameconfig.SLIDE_LIMIT_VALUES[idx]!;
		configs.push({ kind: 'slide-limit', value: slideLimit });
	}
	return configs;
}

// Exports -----------------------------------------------

export default {
	initModifierSelector,
	closeModifierDropdown,
	getInviteModifiers,
};
