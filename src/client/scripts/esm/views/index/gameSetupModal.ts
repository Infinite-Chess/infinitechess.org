// src/client/scripts/esm/views/index/gameSetupModal.ts

/**
 * This script manages the game setup invite/seek creation modal.
 */

import type { VNode } from 'snabbdom';
import type { CloudSaveListRecord } from '../../game/boardeditor/actions/editorSavesAPI.js';
import type {
	VariantGroup,
	VariantCode,
} from '../../../../../shared/chess/variants/variantregistry.js';

import { attributesModule, classModule, eventListenersModule, h, init } from 'snabbdom';

import variantregistry from '../../../../../shared/chess/variants/variantregistry.js';

import validatorama from '../../util/validatorama.js';
import editorSavesAPI from '../../game/boardeditor/actions/editorSavesAPI.js';
import editorpositionsdb from '../../game/boardeditor/actions/esavestore.js';

// Types ----------------------------------------------

type ModalMode = 'online' | 'friend' | 'computer';

type ToggleGroupAttribute = 'data-time' | 'data-mode' | 'data-side' | 'data-level';

// Constants ------------------------------------------

/** Mappings from slider index to actual time control values for both time control sliders. */
const TIME_CONTROL_SLIDER_MAPPINGS = {
	BASE: [
		1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
		25, 30, 35, 40, 45,
		60,
	],
	INCREMENT: [
		0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
		25, 30, 35, 40, 45,
		60,
	],
}; // prettier-ignore

/** Labels for the modal submit button based on the active mode. */
const SUBMIT_LABELS: Record<ModalMode, string> = {
	online: 'Create online game',
	friend: 'Challenge a friend',
	computer: 'Play against computer',
};

const patch = init([attributesModule, classModule, eventListenersModule]);

// Elements ----------------------------------------------

const element_modalOverlay = document.getElementById('modal-overlay')!;
const element_modalClose = document.getElementById('modal-close')!;
const element_modalSubmit = document.getElementById('modal-submit')!;
const element_btnCreateOnline = document.getElementById('btn-create-game')!;
const element_btnChallengeFriend = document.getElementById('btn-challenge-friend')!;
const element_btnPlayComputer = document.getElementById('btn-play-ai')!;
const element_variantCustomSection = document.getElementById('variant-custom-section')!;
const element_variantSelector = document.getElementById('variant-selector')!;
const element_variantDisplay = document.getElementById('variant-display')!;
const element_variantGroupDropdown = document.getElementById('variant-dropdown')!;
const element_variantListPanels = document.querySelectorAll<HTMLElement>('.variant-list-panel');
const element_variantGroupIcon = document.getElementById('variant-group-icon')!;
const element_variantName = document.getElementById('variant-name')!;
const element_icnInput = document.getElementById('icn-input') as HTMLTextAreaElement;
const element_btnPasteIcn = document.getElementById('btn-paste-icn')!;
const element_customVariantContent = document.getElementById('variant-custom-content')!;
const element_timeSliders = document.getElementById('time-sliders')!;
const element_sliderMinutes = document.getElementById('slider-minutes') as HTMLInputElement;
const element_minutesDisplay = document.getElementById('minutes-display')!;
const element_sliderIncrement = document.getElementById('slider-increment') as HTMLInputElement;
const element_incrementDisplay = document.getElementById('increment-display')!;
const element_presetButtons = document.querySelectorAll<HTMLElement>('.preset-btn');
const element_rowGameMode = document.getElementById('row-game-mode')!;
const element_rowStrength = document.getElementById('row-strength')!;
const element_buttonsByToggleGroup: Record<ToggleGroupAttribute, NodeListOf<HTMLElement>> = {
	'data-time': document.querySelectorAll<HTMLElement>('[data-time]'),
	'data-mode': document.querySelectorAll<HTMLElement>('[data-mode]'),
	'data-side': document.querySelectorAll<HTMLElement>('[data-side]'),
	'data-level': document.querySelectorAll<HTMLElement>('[data-level]'),
};

// State ----------------------------------------------

let _selectedVariantCode: VariantCode = 'Classical';
let customContentVNode: VNode | Element = element_customVariantContent;

// Initialization ----------------------------------------------

initModal();

// Functions ----------------------------------------------

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

	initModalSliders();
	initToggleGroups();
	onTimeToggle();
	initPresets();
	initPasteButton();
	initVariantGroupDropdown();
	applyVariantToSelector(_selectedVariantCode);
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
	closeVariantDropdown();
}

/** Connects both time sliders to their value displays. */
function initModalSliders(): void {
	linkSlider(element_sliderMinutes, element_minutesDisplay, (v) =>
		String(TIME_CONTROL_SLIDER_MAPPINGS.BASE[Number(v)]!),
	);
	linkSlider(element_sliderIncrement, element_incrementDisplay, (v) =>
		String(TIME_CONTROL_SLIDER_MAPPINGS.INCREMENT[Number(v)]!),
	);
}

/** Binds slider input updates to a display formatter callback. */
function linkSlider(
	slider: HTMLInputElement,
	display: HTMLElement,
	format: (v: string) => string,
): void {
	slider.addEventListener('input', () => {
		display.textContent = format(slider.value);
		syncPresetHighlight();
	});
}

/** Initializes shared exclusive-selection behavior for all data-* toggle button groups. */
function initToggleGroups(): void {
	// Each [data-time], [data-mode], [data-side], [data-level] button is an exclusive-select group.
	// Buttons sharing the same data-* attribute key form one group.
	const groups: [ToggleGroupAttribute, (() => void)?][] = [
		['data-time', onTimeToggle],
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

/** Applies a selected preset to both sliders and display labels. */
function initPresets(): void {
	element_presetButtons.forEach((btn) => {
		btn.addEventListener('click', () => {
			// Presets store literal minute/increment values, not slider indices.
			const minutes = Number(btn.getAttribute('data-minutes'));
			const increment = Number(btn.getAttribute('data-increment'));
			element_sliderMinutes.value = String(
				TIME_CONTROL_SLIDER_MAPPINGS.BASE.indexOf(minutes),
			);
			element_minutesDisplay.textContent = String(minutes);
			element_sliderIncrement.value = String(
				TIME_CONTROL_SLIDER_MAPPINGS.INCREMENT.indexOf(increment),
			);
			element_incrementDisplay.textContent = String(increment);
			syncPresetHighlight();
		});
	});
}

/** Highlights the preset button that matches the current slider values. */
function syncPresetHighlight(): void {
	const currentMinutes = TIME_CONTROL_SLIDER_MAPPINGS.BASE[Number(element_sliderMinutes.value)]!;
	const currentIncrement =
		TIME_CONTROL_SLIDER_MAPPINGS.INCREMENT[Number(element_sliderIncrement.value)]!;
	element_presetButtons.forEach((btn) => {
		const match =
			Number(btn.getAttribute('data-minutes')) === currentMinutes &&
			Number(btn.getAttribute('data-increment')) === currentIncrement;
		btn.classList.toggle('active', match);
	});
}

/** Shows or hides the time slider section based on the active time mode. */
function onTimeToggle(): void {
	const activeBtn = document.querySelector<HTMLElement>('[data-time].active')!;
	const isTimed = activeBtn.getAttribute('data-time') === 'timed';
	element_timeSliders.classList.toggle('is-collapsed', !isTimed);
}

/** Wires the variant selector open/close and group navigation. */
function initVariantGroupDropdown(): void {
	element_variantDisplay.addEventListener('click', toggleVariantDropdown);
	document.addEventListener('pointerdown', (e) => {
		if (!element_variantSelector.contains(e.target as Node)) closeVariantDropdown();
	});
	document.querySelectorAll<HTMLElement>('.variant-group-item').forEach((item) => {
		item.addEventListener('click', () => {
			const group = item.getAttribute('data-group')!;
			if (group === 'custom') void openCustomVariantList();
			else openVariantList(group as VariantGroup);
		});
	});
	element_variantListPanels.forEach((panel) => {
		panel.querySelector('.variant-list-back')!.addEventListener('click', () => {
			panel.classList.remove('open');
			element_variantGroupDropdown.classList.add('open');
		});
		panel.querySelectorAll<HTMLElement>('.variant-item').forEach((btn) => {
			btn.addEventListener('click', () =>
				selectVariant(btn.getAttribute('data-code')! as VariantCode),
			);
		});
	});
}

/** Toggles the group dropdown, closing the variant list if it was open instead. */
function toggleVariantDropdown(): void {
	const anyOpen =
		element_variantGroupDropdown.classList.contains('open') ||
		[...element_variantListPanels].some((p) => p.classList.contains('open'));
	if (anyOpen) {
		closeVariantDropdown();
	} else {
		element_variantGroupDropdown.classList.add('open');
		element_variantDisplay.classList.add('open');
	}
}

/** Closes all variant panels and resets the selector arrowhead. */
function closeVariantDropdown(): void {
	element_variantGroupDropdown.classList.remove('open');
	element_variantListPanels.forEach((p) => p.classList.remove('open'));
	element_variantDisplay.classList.remove('open');
}

/** Switches from the group list to the pre-rendered variant list for the given group. */
function openVariantList(group: VariantGroup): void {
	element_variantGroupDropdown.classList.remove('open');
	document.querySelector(`.variant-list-panel[data-group="${group}"]`)!.classList.add('open');
}

/**
 * Opens the custom variant panel and (re-)loads saved positions.
 * Action rows are shown immediately; the saved-positions list populates asynchronously.
 */
async function openCustomVariantList(): Promise<void> {
	element_variantGroupDropdown.classList.remove('open');
	document.querySelector('.variant-list-panel[data-group="custom"]')!.classList.add('open');

	customContentVNode = patch(customContentVNode, createCustomContentVNode([], []));

	const [cloudResult, localResult] = await Promise.allSettled([
		validatorama.areWeLoggedIn() ? editorSavesAPI.getSavedPositions() : Promise.resolve([]),
		editorpositionsdb.getAllLocalSaveInfos(),
	]);

	const cloudSaves = cloudResult.status === 'fulfilled' ? cloudResult.value : [];
	const localSaves = localResult.status === 'fulfilled' ? localResult.value : [];

	customContentVNode = patch(
		customContentVNode,
		createCustomContentVNode(cloudSaves, localSaves),
	);
}

/** Builds the snabbdom VNode for the custom panel's dynamic content area. */
function createCustomContentVNode(
	cloudSaves: CloudSaveListRecord[],
	localSaves: Array<{ position_name: string; timestamp: number }>,
): VNode {
	const sortedCloud = [...cloudSaves].sort((a, b) => b.timestamp - a.timestamp);
	const sortedLocal = [...localSaves].sort((a, b) => b.timestamp - a.timestamp);

	const actions: Array<{ iconId: string; name: string; desc: string; onClick: (name: string) => void }> = [
		{ iconId: 'svg-pencil',    name: 'Create',   desc: 'Go to the board editor.',       onClick: goToEditor },
		{ iconId: 'svg-clipboard', name: 'From ICN', desc: 'Paste an accessible ICN code.', onClick: openFromICN },
	]; // prettier-ignore

	const actionRows: VNode[] = actions.map(({ iconId, name, desc, onClick }) =>
		h('button.variant-group-item', { on: { click: () => onClick(name) } }, [
			h(`svg.group-icon.${iconId}`, {}, [h('use', { attrs: { href: `#${iconId}` } })]),
			h('span.group-name', {}, name),
			h('span.group-desc', {}, desc),
		]),
	);

	const cloudRows: VNode[] = sortedCloud.map((s) =>
		h(
			'button.variant-item',
			{ key: `cloud-${s.name}`, on: { click: () => selectCustomSave(s.name) } },
			[
				h('span.variant-name', {}, s.name),
				h('svg.svg-eye', {}, [h('use', { attrs: { href: '#svg-eye' } })]),
			],
		),
	);

	const localRows: VNode[] = sortedLocal.map((s) =>
		h(
			'button.variant-item',
			{
				key: `local-${s.position_name}`,
				on: { click: () => selectCustomSave(s.position_name) },
			},
			[
				h('span.variant-name', {}, s.position_name),
				h('svg.svg-eye', {}, [h('use', { attrs: { href: '#svg-eye' } })]),
			],
		),
	);

	const saveRows = [...cloudRows, ...localRows];

	return h('div#variant-custom-content', {}, [
		...actionRows,
		...(saveRows.length > 0
			? [h('div.custom-saves-heading', {}, 'Saved positions'), ...saveRows]
			: []),
	]);
}

/** Navigates to the board editor page. */
function goToEditor(_name: string): void {
	window.location.href = '/editor';
}

/** Shows the ICN input section and updates the selector to the row's display name. */
function openFromICN(name: string): void {
	applyCustomToSelector(name);
	element_variantCustomSection.classList.remove('hidden');
	closeVariantDropdown();
	element_icnInput.focus();
}

/** Selects a saved custom position by name and updates the selector display. */
function selectCustomSave(name: string): void {
	applyCustomToSelector(name);
	element_variantCustomSection.classList.add('hidden');
	closeVariantDropdown();
}

/** Sets the variant selector display button's name text and group icon. */
function setSelectorDisplay(name: string, iconId: string): void {
	element_variantName.textContent = name;
	const classList = element_variantGroupIcon.classList;
	[...classList].filter((c) => c.startsWith('svg-')).forEach((c) => classList.remove(c));
	classList.add(iconId);
	element_variantGroupIcon.querySelector('use')?.setAttribute('href', `#${iconId}`);
}

/** Updates the selector button's icon and name to reflect the given preset variant. */
function applyVariantToSelector(code: VariantCode): void {
	const variantGroup = variantregistry.getVariantGroup(code);
	setSelectorDisplay(
		variantregistry.getVariantName(code),
		variantregistry.getVariantGroupIconId(variantGroup),
	);
}

/** Updates the selector button's icon and name to reflect a custom (non-preset) selection. */
function applyCustomToSelector(name: string): void {
	setSelectorDisplay(name, 'svg-wrench');
}

/** Updates the selected variant state and selector button, then closes all panels. */
function selectVariant(code: VariantCode): void {
	_selectedVariantCode = code;
	applyVariantToSelector(code);
	element_variantCustomSection.classList.add('hidden');
	closeVariantDropdown();
}

/** Adds clipboard paste behavior for the custom ICN textarea. */
function initPasteButton(): void {
	element_btnPasteIcn.addEventListener('click', async () => {
		try {
			element_icnInput.value = await navigator.clipboard.readText();
		} catch {
			// Clipboard access denied — silently ignore.
		}
	});
}

// Exports ----------------------------------------------

export {};
