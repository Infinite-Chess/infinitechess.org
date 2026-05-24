// src/client/scripts/esm/views/index/variantSelector.ts

/**
 * This script manages the variant selector widget inside the game setup modal:
 * the group dropdown, per-group variant lists, custom saves panel (cloud + local),
 * and the ICN validation.
 */

import type { VNode } from 'snabbdom';
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

// State ----------------------------------------------

/** The currently selected variant for the game options modal. */
let selection: DisplaySelection = { kind: 'preset', code: 'Classical' };
let customContentVNode: VNode | Element = element_customVariantContent;
/** The last successfully parsed ICN input. */
let icnResult: {
	/** The variantOptions parsed from the ICN input, if it was syntactically valid. */
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

// Functions ----------------------------------------------

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
	// pointerenter (not mouseenter) so we can skip touch — touch is handled by the click handler below.
	element_displayPreviewAnchor.addEventListener('pointerenter', (e) => {
		if (e.pointerType === 'touch') return;
		handleDisplayPreviewHover(element_displayPreviewAnchor);
	});
	element_displayPreviewAnchor.addEventListener('pointerleave', (e) => {
		if (e.pointerType !== 'touch') variantPreviewTooltip.hide();
	});
	element_displayPreviewAnchor.addEventListener('click', (e) => {
		e.stopPropagation();
		handleDisplayPreviewHover(element_displayPreviewAnchor);
	});

	// Wire up group buttons
	document.querySelectorAll<HTMLElement>('button[data-group]').forEach((item) => {
		item.addEventListener('click', () => {
			const group = item.getAttribute('data-group') as GroupType;
			if (group === 'custom') openCustomVariantList();
			else openVariantList(group);
		});
	});

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
			// Set up variant preview tooltip listener on hovering the preview (eye) icon.
			// pointerenter (not mouseenter) so we can skip touch — touch is handled by the click handler below.
			const preview = btn.querySelector<SVGElement>('.preview')!;
			preview.addEventListener('pointerenter', (e) => {
				if (e.pointerType === 'touch') return;
				variantPreviewTooltip.showForVariantCode(e.currentTarget as HTMLElement, code);
			});
			preview.addEventListener('pointerleave', (e) => {
				if (e.pointerType !== 'touch') variantPreviewTooltip.hide();
			});
			preview.addEventListener('click', (e) => {
				e.stopPropagation();
				variantPreviewTooltip.showForVariantCode(e.currentTarget as HTMLElement, code);
			});
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
			{
				key: `cloud-${s.name}`,
				on: {
					click: (e: MouseEvent) => {
						if ((e.target as HTMLElement).closest('.preview')) return; // They clicked the preview button
						selectOnlineCustomSave(s.name);
					},
				},
			},
			[
				h('span.variant-name', {}, s.name),
				h(
					'svg.svg-eye.preview',
					{
						on: {
							// pointerenter (not mouseenter) so we can skip touch — touch is handled by the click handler below.
							pointerenter: (e: PointerEvent) => {
								if (e.pointerType === 'touch') return;
								handleCloudSavePreview(e.currentTarget as HTMLElement, s.name);
							},
							pointerleave: (e: PointerEvent) => {
								if (e.pointerType !== 'touch') variantPreviewTooltip.hide();
							},
							click: (e: MouseEvent) => {
								e.stopPropagation();
								handleCloudSavePreview(e.currentTarget as HTMLElement, s.name);
							},
						},
					},
					[h('use', { attrs: { href: '#svg-eye' } })],
				),
			],
		),
	);

	const localRows: VNode[] = sortedLocal.map((s) =>
		h(
			'button.variant-item',
			{
				key: `local-${s.position_name}`,
				on: {
					click: (e: MouseEvent) => {
						if ((e.target as HTMLElement).closest('.preview')) return; // They clicked the preview button
						selectLocalCustomSave(s.position_name);
					},
				},
			},
			[
				h('span.variant-name', {}, s.position_name),
				h(
					'svg.svg-eye.preview',
					{
						on: {
							// pointerenter (not mouseenter) so we can skip touch — touch is handled by the click handler below.
							pointerenter: (e: PointerEvent) => {
								if (e.pointerType === 'touch') return;
								handleLocalSavePreview(
									e.currentTarget as HTMLElement,
									s.position_name,
								);
							},
							pointerleave: (e: PointerEvent) => {
								if (e.pointerType !== 'touch') variantPreviewTooltip.hide();
							},
							click: (e: MouseEvent) => {
								e.stopPropagation();
								handleLocalSavePreview(
									e.currentTarget as HTMLElement,
									s.position_name,
								);
							},
						},
					},
					[h('use', { attrs: { href: '#svg-eye' } })],
				),
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
	selection = { kind: 'icn' };
	applyCustomToSelector(name);
	element_variantCustomSection.classList.remove('hidden');
	closeVariantDropdown();
	element_icnInput.focus();
}

/** Selects a cloud saved position by name and updates the selector display. */
function selectOnlineCustomSave(name: string): void {
	selection = { kind: 'online', name };
	applyCustomToSelector(name);
	element_variantCustomSection.classList.add('hidden');
	closeVariantDropdown();
}

/** Selects a local saved position by name and updates the selector display. */
function selectLocalCustomSave(name: string): void {
	selection = { kind: 'local', name };
	applyCustomToSelector(name);
	element_variantCustomSection.classList.add('hidden');
	closeVariantDropdown();
}

/** Fetches a cloud save and shows the preview tooltip anchored to the given element. */
function handleCloudSavePreview(anchor: HTMLElement, positionName: string): void {
	const cached = cloudPreviewCache.get(positionName);
	if (cached !== undefined) {
		// Cache hit!
		// console.log('Cloud preview cache hit for', positionName);
		variantPreviewTooltip.showForPosition(anchor, positionName, cached);
		return;
	}
	// Request for the first time, cache the result.
	ecloudstore
		.readCloud(positionName)
		.then((saveState) => {
			cloudPreviewCache.set(positionName, saveState.variantOptions);
			variantPreviewTooltip.showForPosition(anchor, positionName, saveState.variantOptions);
		})
		.catch(() => {
			/* Preview unavailable – silently ignore */
		});
}

/** Loads a local save and shows the preview tooltip anchored to the given element. */
function handleLocalSavePreview(anchor: HTMLElement, positionName: string): void {
	const cached = localPreviewCache.get(positionName);
	if (cached !== undefined) {
		// Cache hit!
		// console.log('Local preview cache hit for', positionName);
		variantPreviewTooltip.showForPosition(anchor, positionName, cached);
		return;
	}
	// Request for the first time, cache the result.
	editorpositionsdb
		.readLocal(positionName)
		.then((saveState) => {
			localPreviewCache.set(positionName, saveState.variantOptions);
			variantPreviewTooltip.showForPosition(anchor, positionName, saveState.variantOptions);
		})
		.catch(() => {
			/* Preview unavailable – silently ignore */
		});
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

/** Shows the preview tooltip for the currently selected variant in the display button. */
async function handleDisplayPreviewHover(anchor: HTMLElement): Promise<void> {
	if (selection.kind === 'preset') {
		variantPreviewTooltip.showForVariantCode(anchor, selection.code);
	} else if (selection.kind === 'online') {
		handleCloudSavePreview(anchor, selection.name);
	} else if (selection.kind === 'local') {
		handleLocalSavePreview(anchor, selection.name);
	} else if (selection.kind === 'icn') {
		await validateIcnInput();
		if (icnResult !== null)
			variantPreviewTooltip.showForPosition(anchor, 'Custom Variant', icnResult.options);
	}
}

/** Updates the selected variant state and selector button, then closes all panels. */
function selectVariant(code: VariantCode): void {
	selection = { kind: 'preset', code };
	applyVariantToSelector(code);
	element_variantCustomSection.classList.add('hidden');
	closeVariantDropdown();
}

/** Validates the current ICN textarea value, updates the invalid style, and stores resolved VariantOptions. */
async function validateIcnInput(): Promise<void> {
	const value = element_icnInput.value;
	if (value === '') {
		element_icnInputWrap.classList.remove('invalid');
		element_icnErrorText.textContent = '';
		icnResult = null;
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
			icnResult = { options: icnVariantOptions, isValid: false };
		} else {
			element_icnErrorText.textContent = '';
			icnResult = { options: icnVariantOptions, isValid: true };
		}
	} catch (e) {
		element_icnInputWrap.classList.add('invalid');
		element_icnErrorText.textContent = '';
		console.error('Illegal position:', e instanceof Error ? e.message : e);
		icnResult = null;
	}
}

/** Wires blur/focus/input listeners to keep the ICN validation state in sync. */
function initIcnValidation(): void {
	element_icnInput.addEventListener('blur', validateIcnInput);
	element_icnInput.addEventListener('focus', () => {
		element_icnInputWrap.classList.remove('invalid');
		element_icnErrorText.textContent = '';
	});
	element_icnInput.addEventListener('input', () => {
		icnResult = null;
	});
}

// Exports ----------------------------------------------

export default {
	initVariantGroupDropdown,
	initIcnValidation,
	closeVariantDropdown,
};
