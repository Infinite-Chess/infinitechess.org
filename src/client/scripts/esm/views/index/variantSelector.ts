// src/client/scripts/esm/views/index/variantSelector.ts

/**
 * This script manages the variant selector widget inside the game setup modal:
 * the group dropdown, per-group variant lists, custom saves panel (cloud + local),
 * and the ICN validation.
 */

import type { VNode } from 'snabbdom';
import type { InviteVariant } from '../../../../../shared/types.js';
import type { VariantOptions } from '../../../../../shared/chess/logic/gamefile.js';
import type { CloudSaveListRecord } from '../../game/editorstores/editorSavesAPI.js';
import type {
	VariantGroup,
	VariantCode,
} from '../../../../../shared/chess/variants/variantregistry.js';

import { attributesModule, classModule, eventListenersModule, h, init } from 'snabbdom';

import icnimport from '../../../../../shared/chess/logic/icn/icnimport.js';
import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';
import variantregistry from '../../../../../shared/chess/variants/variantregistry.js';
import { validatePosition } from '../../../../../shared/chess/variants/positionvalidation.js';

import ecloudstore from '../../game/editorstores/ecloudstore.js';
import validatorama from '../../util/validatorama.js';
import editorSavesAPI from '../../game/editorstores/editorSavesAPI.js';
import editorpositionsdb from '../../game/editorstores/esavestore.js';
import { syncRatedButton } from './gameSetupModal.js';
import variantPreviewTooltip from '../../game/rendering/variantPreviewTooltip.js';

// Types -------------------------------------------------

type DisplaySelection =
	| { kind: 'preset'; code: VariantCode }
	| { kind: 'online'; name: string }
	| { kind: 'local'; name: string }
	| { kind: 'icn' };

/** The union of all possible group type dropdowns. */
type GroupType = VariantGroup | 'custom';

// Elements ----------------------------------------------

const element_variantCustomSection = document.getElementById('variant-custom-section')!;
const element_variantSelector = document.getElementById('variant-selector')!;
const element_variantDisplay = document.getElementById('variant-display')!;
const element_variantGroupDropdown = document.getElementById('variant-dropdown')!;
const element_variantListPanels = document.querySelectorAll<HTMLElement>('.variant-list-panel');
const element_variantGroupIcon = document.getElementById('variant-group-icon')!;
const element_variantName = document.getElementById('variant-name')!;
const element_icnInput = document.getElementById('icn-input') as HTMLTextAreaElement;
const element_icnInputWrap = document.querySelector('.icn-input-wrap') as HTMLElement;
const element_icnErrorText = document.getElementById('icn-error-text') as HTMLElement;
const element_customVariantContent = document.getElementById('variant-custom-content')!;
const element_modalSubmit = document.getElementById('modal-submit') as HTMLButtonElement;

// State ----------------------------------------------

/** The currently selected variant for the game options modal. */
let selection: DisplaySelection = { kind: 'preset', code: 'Classical' };
let customContentVNode: VNode | Element = element_customVariantContent;
/** The last validated custom position (ICN input or saved position). null while loading or unset. */
let icnResult: {
	/** The variantOptions for the custom position. */
	options: VariantOptions;
	/** Whether the position passes validatePosition() and is legal to play. */
	isValid: boolean;
} | null = null;

// Custom position caching
// Very low chance a position is edited in another tab when it is sitting in the cache.

/** Cache for fetched cloud save previews — keyed by position name. */
const cloudPreviewCache = new Map<string, VariantOptions>();
/** Cache for fetched local save previews — keyed by position name. */
const localPreviewCache = new Map<string, VariantOptions>();

const patch = init([attributesModule, classModule, eventListenersModule]);

// Initialization ----------------------------------------------

/** Wires the variant selector open/close and group navigation. */
function initVariantGroupDropdown(): void {
	applyVariantToSelector('Classical');

	element_variantDisplay.addEventListener('click', (e) => {
		if ((e.target as HTMLElement).closest('.preview')) return; // They clicked the preview button
		if ((e.target as HTMLElement).closest('.modifier-add')) return; // They clicked the modifier button
		toggleVariantDropdown();
	});
	document.addEventListener('pointerdown', (e) => {
		const target = e.target as Node;
		if (
			!element_variantSelector.contains(target) &&
			!variantPreviewTooltip.containsNode(target)
		)
			closeVariantDropdown();
	});

	// Set up variant preview tooltip listener on hovering the preview (eye) icon
	const element_displayPreviewAnchor =
		element_variantDisplay.querySelector<HTMLElement>('.preview')!;
	variantPreviewTooltip.attachAnchor(element_displayPreviewAnchor, handleDisplayPreviewHover);

	// Wire up group buttons
	document.querySelectorAll<HTMLElement>('button[data-group]').forEach((item) => {
		item.addEventListener('click', () => {
			const group = item.getAttribute('data-group') as GroupType;
			if (group === 'custom') openCustomVariantList();
			else openVariantList(group);
		});
	});

	// Wire up the static custom-panel action buttons (Create + From ICN).
	document.getElementById('btn-custom-create')!.addEventListener('click', goToEditor);
	document.getElementById('btn-custom-from-icn')!.addEventListener('click', openFromICN);

	// Wire up variant buttons
	element_variantListPanels.forEach((panel) => {
		panel.querySelector('.variant-list-back')!.addEventListener('click', () => {
			panel.classList.remove('open');
			element_variantGroupDropdown.classList.add('open');
		});
		panel.querySelectorAll<HTMLElement>('.variant-item').forEach((btn) => {
			const code = btn.getAttribute('data-code') as VariantCode;
			btn.addEventListener('click', (e) => {
				if ((e.target as HTMLElement).closest('.preview')) return; // They clicked the preview button
				selectVariant(code);
			});
			const preview = btn.querySelector<HTMLElement>('.preview')!;
			variantPreviewTooltip.attachAnchor(preview, (anchor) => {
				variantPreviewTooltip.showForVariantCode(anchor, code, 'left');
			});
		});
	});
}

/** Wires blur/focus/input listeners to keep the ICN validation state in sync. */
function initIcnValidation(): void {
	element_icnInput.addEventListener('blur', validateIcnInput);
	element_icnInput.addEventListener('focus', () => {
		element_icnInputWrap.classList.remove('invalid');
		element_icnErrorText.textContent = '';
	});
	element_icnInput.addEventListener('input', () => {
		setIcnResult(null);
	});
}

// Dropdown navigation ----------------------------------------------

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

/** Opens the custom variant panel and refreshes saved positions. */
async function openCustomVariantList(): Promise<void> {
	element_variantGroupDropdown.classList.remove('open');
	document.querySelector('.variant-list-panel[data-group="custom"]')!.classList.add('open');

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

// Custom panel ----------------------------------------------

/**
 * Builds a single save-row VNode for the custom panel's saved positions list.
 * @param key - Snabbdom key used for efficient list diffing.
 * @param name - Display text shown in the row.
 * @param onSelect - Called when the user clicks the row (excluding the preview button).
 * @param onPreview - Called with the anchor element when the user hovers or clicks the preview icon.
 */
function createSaveItemVNode(
	key: string,
	name: string,
	onSelect: () => void,
	onPreview: (anchor: HTMLElement) => void,
): VNode {
	return h(
		'button.variant-item',
		{
			key,
			on: {
				click: (e: MouseEvent) => {
					if ((e.target as HTMLElement).closest('.preview')) return; // They clicked the preview button
					onSelect();
				},
			},
		},
		[
			h('span.variant-name', {}, name),
			h(
				'svg.svg-eye.preview',
				{
					on: {
						// pointerenter (not mouseenter) so we can skip touch — touch is handled by the click handler below.
						pointerenter: (e: PointerEvent) => {
							if (e.pointerType === 'touch') return;
							onPreview(e.currentTarget as HTMLElement);
						},
						pointerleave: (e: PointerEvent) => {
							if (e.pointerType !== 'touch') variantPreviewTooltip.hide();
						},
						click: (e: MouseEvent) => {
							e.stopPropagation();
							onPreview(e.currentTarget as HTMLElement);
						},
					},
				},
				[h('use', { attrs: { href: '#svg-eye' } })],
			),
		],
	);
}

/** Builds the snabbdom VNode for the custom panel's dynamic saved-positions list. */
function createCustomContentVNode(
	cloudSaves: CloudSaveListRecord[],
	localSaves: Array<{ position_name: string; timestamp: number }>,
): VNode {
	const sortedCloud = [...cloudSaves].sort((a, b) => b.timestamp - a.timestamp);
	const sortedLocal = [...localSaves].sort((a, b) => b.timestamp - a.timestamp);

	const cloudRows: VNode[] = sortedCloud.map((s) =>
		createSaveItemVNode(
			`cloud-${s.name}`,
			s.name,
			() => selectCustomSave( 'online', s.name, cloudPreviewCache, ecloudstore.readCloud, 'Failed to load cloud save.'), // prettier-ignore
			(anchor) => handleSavePreview(anchor, s.name, cloudPreviewCache, ecloudstore.readCloud),
		),
	);

	const localRows: VNode[] = sortedLocal.map((s) =>
		createSaveItemVNode(
			`local-${s.position_name}`,
			s.position_name,
			() => selectCustomSave('local', s.position_name, localPreviewCache, editorpositionsdb.readLocal, 'Failed to load local save.'), // prettier-ignore
			(anchor) => handleSavePreview(anchor, s.position_name,  localPreviewCache, editorpositionsdb.readLocal), // prettier-ignore
		),
	);

	const saveRows = [...cloudRows, ...localRows];

	return h(
		'div#variant-custom-content',
		{},
		saveRows.length > 0
			? [h('div.custom-saves-heading', {}, 'Saved positions'), ...saveRows]
			: [],
	);
}

/** Navigates to the board editor page. */
function goToEditor(): void {
	window.location.href = '/editor';
}

/** Shows the ICN input section and updates the selector to the "From ICN" display name. */
function openFromICN(): void {
	selection = { kind: 'icn' };
	applyCustomToSelector('From ICN');
	clearSavedPositionError();
	element_variantCustomSection.classList.remove('hidden');
	closeVariantDropdown();
	element_icnInput.focus();
}

// Variant selection ----------------------------------------------

/** Updates the selected variant state and selector button, then closes all panels. */
function selectVariant(code: VariantCode): void {
	selection = { kind: 'preset', code };
	applyVariantToSelector(code);
	clearSavedPositionError();
	element_variantCustomSection.classList.add('hidden');
	closeVariantDropdown();
}

/**
 * Selects a saved position (cloud or local) by kind and name, updating the selector display.
 * @param kind - Whether this is a cloud (`'online'`) or local (`'local'`) save.
 * @param name - Position name used to look up and display the save.
 * @param cache - Preview cache to read from (cache hit) or write to (after fetch).
 * @param read - Async function that fetches the full save state by name.
 * @param errorMsg - Error message shown in the selector if the fetch fails.
 */
function selectCustomSave(
	kind: 'online' | 'local',
	name: string,
	cache: Map<string, VariantOptions>,
	read: (n: string) => Promise<{ variantOptions: VariantOptions }>,
	errorMsg: string,
): void {
	selection = kind === 'online' ? { kind: 'online', name } : { kind: 'local', name };
	applyCustomToSelector(name);
	clearSavedPositionError();
	element_variantCustomSection.classList.add('hidden');
	closeVariantDropdown();

	const cached = cache.get(name);
	if (cached !== undefined) {
		validateSavedPosition(cached);
		return;
	}
	read(name)
		.then((s) => {
			cache.set(name, s.variantOptions);
			if (selection.kind !== kind || selection.name !== name) return;
			validateSavedPosition(s.variantOptions);
		})
		.catch(() => {
			if (selection.kind !== kind || selection.name !== name) return;
			element_variantDisplay.classList.add('invalid');
			element_icnErrorText.textContent = errorMsg;
			setIcnResult(null);
		});
}

// Selector display ----------------------------------------------

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

// Validation ----------------------------------------------

/**
 * Sets icnResult and syncs the modal submit button's disabled state.
 * The button is disabled whenever a non-preset selection has no valid resolved position.
 */
function setIcnResult(result: typeof icnResult): void {
	icnResult = result;
	element_modalSubmit.disabled = selection.kind !== 'preset' && !icnResult?.isValid;
	syncRatedButton();
}

/** Validates a saved position's VariantOptions and applies the result to the variant display. */
function validateSavedPosition(variantOptions: VariantOptions): void {
	const illegalReason = validatePosition(variantOptions, '');
	if (illegalReason !== null) {
		element_variantDisplay.classList.add('invalid');
		element_icnErrorText.textContent = illegalReason;
		setIcnResult({ options: variantOptions, isValid: false });
	} else {
		setIcnResult({ options: variantOptions, isValid: true });
	}
}

/** Clears any saved-position error state from the variant display. */
function clearSavedPositionError(): void {
	setIcnResult(null);
	element_variantDisplay.classList.remove('invalid');
	element_icnErrorText.textContent = '';
}

/** Validates the current ICN textarea value, updates the invalid style, and stores resolved VariantOptions. */
async function validateIcnInput(): Promise<void> {
	const value = element_icnInput.value;
	if (value === '') {
		element_icnInputWrap.classList.remove('invalid');
		element_icnErrorText.textContent = '';
		setIcnResult(null);
		return;
	}
	try {
		const longFormat = icnconverter.ShortToLong_Format(value);
		element_icnInputWrap.classList.remove('invalid');
		const variantCode = variantregistry.resolveVariantCode(longFormat.metadata.Variant);
		const { position, specialRights } = await icnimport.getPositionAndSpecialRightsFromLongFormat(longFormat, variantCode); // prettier-ignore

		const icnVariantOptions = {
			position,
			gameRules: longFormat.gameRules,
			state_global: { ...longFormat.state_global, specialRights },
			// fullMove: longFormat.fullMove,
			fullMove: 1, // For now, games can only start from a fullMove of 1
		};
		const illegalReason = validatePosition(icnVariantOptions, value);
		if (illegalReason !== null) {
			element_icnInputWrap.classList.add('invalid');
			element_icnErrorText.textContent = illegalReason;
			setIcnResult({ options: icnVariantOptions, isValid: false });
		} else {
			element_icnErrorText.textContent = '';
			setIcnResult({ options: icnVariantOptions, isValid: true });
		}
	} catch (e) {
		element_icnInputWrap.classList.add('invalid');
		element_icnErrorText.textContent = '';
		console.error('Illegal position:', e instanceof Error ? e.message : e);
		setIcnResult(null);
	}
}

// Preview tooltips ----------------------------------------------

/** Shows the preview tooltip for the currently selected variant in the display button. */
async function handleDisplayPreviewHover(anchor: HTMLElement): Promise<void> {
	if (selection.kind === 'preset') {
		variantPreviewTooltip.showForVariantCode(anchor, selection.code, 'left');
	} else if (selection.kind === 'online') {
		handleSavePreview(anchor, selection.name, cloudPreviewCache, ecloudstore.readCloud);
	} else if (selection.kind === 'local') {
		handleSavePreview(anchor, selection.name, localPreviewCache, editorpositionsdb.readLocal);
	} else if (selection.kind === 'icn') {
		await validateIcnInput();
		if (icnResult !== null)
			variantPreviewTooltip.showForPosition(anchor, 'Custom Variant', icnResult.options);
	}
}

/**
 * Fetches a save (cloud or local) and shows the preview tooltip anchored to the given element.
 * @param anchor - Element the tooltip is positioned relative to.
 * @param positionName - Name of the position to fetch and preview.
 * @param cache - Preview cache to read from (cache hit) or write to (after fetch).
 * @param read - Async function that fetches the save state by position name.
 */
function handleSavePreview(
	anchor: HTMLElement,
	positionName: string,
	cache: Map<string, VariantOptions>,
	read: (n: string) => Promise<{ variantOptions: VariantOptions }>,
): void {
	const cached = cache.get(positionName);
	if (cached !== undefined) {
		// Cache hit!
		// console.log('Preview cache hit for', positionName);
		variantPreviewTooltip.showForPosition(anchor, positionName, cached);
		return;
	}
	// Request for the first time, cache the result.
	read(positionName)
		.then((saveState) => {
			cache.set(positionName, saveState.variantOptions);
			variantPreviewTooltip.showForPosition(anchor, positionName, saveState.variantOptions);
		})
		.catch(() => {
			/* Preview unavailable – silently ignore */
		});
}

/**
 * Returns the current variant selection as an InviteVariant for the wire format,
 * or null if the selection cannot be used for an online seek (invalid ICN, local save).
 */
function getInviteVariant(): InviteVariant | null {
	if (selection.kind === 'preset') {
		return { kind: 'preset', code: selection.code };
	} else if (selection.kind === 'online') {
		if (!icnResult?.isValid) return null;
		return { kind: 'cloudSave', name: selection.name };
	} else if (selection.kind === 'local') {
		if (!icnResult?.isValid) return null;
		const content = icnconverter.LongToShort_Format(
			{
				metadata: {},
				position: icnResult.options.position,
				gameRules: icnResult.options.gameRules,
				fullMove: icnResult.options.fullMove,
				state_global: icnResult.options.state_global,
			},
			{ compact: true, spaces: false, comments: false, make_new_lines: false, move_numbers: false }, // prettier-ignore
		);
		return { kind: 'icn', content };
	} else if (selection.kind === 'icn') {
		const content = element_icnInput.value;
		if (!icnResult?.isValid || !content) return null;
		return { kind: 'icn', content };
	}
	return null;
}

// Exports ----------------------------------------------

export default {
	initVariantGroupDropdown,
	initIcnValidation,
	closeVariantDropdown,
	getInviteVariant,
};
