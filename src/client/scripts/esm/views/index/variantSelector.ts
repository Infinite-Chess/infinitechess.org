// src/client/scripts/esm/views/index/variantSelector.ts

/**
 * This script manages the variant selector widget inside the game setup modal:
 * the group dropdown, per-group variant lists, custom saves panel (cloud + local),
 * and the ICN paste action.
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
import variantPreviewTooltip from '../../game/rendering/variantPreviewTooltip.js';

// Elements ----------------------------------------------

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

// State ----------------------------------------------

type DisplaySelection =
	| { kind: 'preset'; code: VariantCode }
	| { kind: 'local'; name: string }
	| { kind: 'other' }; // cloud save, ICN paste — no quick preview available

let _selection: DisplaySelection = { kind: 'preset', code: 'Classical' };
let customContentVNode: VNode | Element = element_customVariantContent;

const patch = init([attributesModule, classModule, eventListenersModule]);

// Functions ----------------------------------------------

/** Wires the variant selector open/close and group navigation. */
function initVariantGroupDropdown(): void {
	element_variantDisplay.addEventListener('click', (e) => {
		if ((e.target as HTMLElement).closest('.preview')) return;
		toggleVariantDropdown();
	});
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
			const code = btn.getAttribute('data-code') as VariantCode | null;
			btn.addEventListener('click', (e) => {
				if ((e.target as HTMLElement).closest('.preview')) return;
				if (code) selectVariant(code);
			});
			if (code) {
				const eye = btn.querySelector<SVGElement>('.svg-eye');
				eye?.addEventListener('mouseenter', (e) => {
					void variantPreviewTooltip.showForVariantCode(
						e.currentTarget as HTMLElement,
						code,
					);
				});
				eye?.addEventListener('mouseleave', () => variantPreviewTooltip.hide());
			}
		});
	});
	applyVariantToSelector('Classical');

	const element_displayEye = element_variantDisplay.querySelector<HTMLElement>('.svg-eye')!;
	element_displayEye.addEventListener('mouseenter', () =>
		handleDisplayEyeHover(element_displayEye),
	);
	element_displayEye.addEventListener('mouseleave', () => variantPreviewTooltip.hide());
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
			{
				key: `cloud-${s.name}`,
				on: {
					click: (e: MouseEvent) => {
						if ((e.target as HTMLElement).closest('.preview')) return;
						selectCustomSave(s.name);
					},
				},
			},
			[
				h('span.variant-name', {}, s.name),
				h('svg.svg-eye.preview', {}, [h('use', { attrs: { href: '#svg-eye' } })]),
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
						if ((e.target as HTMLElement).closest('.preview')) return;
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
							mouseenter: (e: MouseEvent) =>
								handleLocalSaveEyeHover(e, s.position_name),
							mouseleave: () => variantPreviewTooltip.hide(),
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
	_selection = { kind: 'other' };
	applyCustomToSelector(name);
	element_variantCustomSection.classList.remove('hidden');
	closeVariantDropdown();
	element_icnInput.focus();
}

/** Selects a cloud saved position by name and updates the selector display. */
function selectCustomSave(name: string): void {
	_selection = { kind: 'other' };
	applyCustomToSelector(name);
	element_variantCustomSection.classList.add('hidden');
	closeVariantDropdown();
}

/** Selects a local saved position by name and updates the selector display. */
function selectLocalCustomSave(name: string): void {
	_selection = { kind: 'local', name };
	applyCustomToSelector(name);
	element_variantCustomSection.classList.add('hidden');
	closeVariantDropdown();
}

/** Loads a local save and shows the preview tooltip anchored to the eye SVG. */
function handleLocalSaveEyeHover(e: MouseEvent, positionName: string): void {
	const anchor = e.currentTarget as HTMLElement;
	void editorpositionsdb.readLocal(positionName).then((saveState) => {
		if (!saveState) return;
		void variantPreviewTooltip.show(anchor, positionName, saveState.variantOptions);
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
function handleDisplayEyeHover(anchor: HTMLElement): void {
	if (_selection.kind === 'preset') {
		void variantPreviewTooltip.showForVariantCode(anchor, _selection.code);
	} else if (_selection.kind === 'local') {
		const name = _selection.name;
		void editorpositionsdb.readLocal(name).then((saveState) => {
			if (!saveState) return;
			void variantPreviewTooltip.show(anchor, name, saveState.variantOptions);
		});
	}
	// kind === 'other': no preview available
}

/** Updates the selected variant state and selector button, then closes all panels. */
function selectVariant(code: VariantCode): void {
	_selection = { kind: 'preset', code };
	applyVariantToSelector(code);
	element_variantCustomSection.classList.add('hidden');
	closeVariantDropdown();
}

// Exports ----------------------------------------------

export default {
	initVariantGroupDropdown,
	initPasteButton,
	closeVariantDropdown,
};
