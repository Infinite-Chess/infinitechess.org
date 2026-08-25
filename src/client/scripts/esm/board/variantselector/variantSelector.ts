// src/client/scripts/esm/board/variantselector/variantSelector.ts

/**
 * The variant selector widget shared by the home page's game-options modal and the
 * analysis board's setup panel: the group dropdown, per-group variant lists, custom
 * saves panel (cloud + local), and the ICN validation.
 */

import type { VNode } from 'snabbdom';
import type { MetaData } from '../../../../../shared/chess/util/metadatautil.js';
import type { BoundingBox } from '../../../../../shared/util/math/bounds.js';
import type { StorageType } from '../../savedpositions/storetypes.js';
import type { SeekVariant } from '../../../../../shared/chess/variants/variantselection.js';
import type { VariantCode } from '../../../../../shared/chess/util/variantcodes.js';
import type { GameModifier } from '../../../../../shared/util/modutil.js';
import type { VariantGroup } from '../../../../../shared/chess/variants/variantregistry.js';
import type { CloudSaveListRecord } from '../../savedpositions/savesapi.js';
import type { GameFile, VariantOptions } from '../../../../../shared/chess/logic/gamefile.js';

import { attributesModule, classModule, eventListenersModule, h, init } from 'snabbdom';

import jsutil from '../../../../../shared/util/jsutil.js';
import bounds from '../../../../../shared/util/math/bounds.js';
import coordutil from '../../../../../shared/util/coordutil.js';
import apeironcard from '../../../../../shared/chess/engines/apeironcard.js';
import apeironborder from '../../../../../shared/chess/logic/apeironborder.js';
import gameformulator from '../../../../../shared/chess/game/gameformulator.js';
import variantregistry from '../../../../../shared/chess/variants/variantregistry.js';
import icnconverter, { LongFormatOut } from '../../../../../shared/chess/logic/icn/icnconverter.js';
import {
	PositionRejection,
	validatePosition,
	localizeRejection,
	getPlayabilityRejection,
} from '../../../../../shared/chess/game/positionvalidation.js';

import savesapi from '../../savedpositions/savesapi.js';
import savestore from '../../savedpositions/savestore.js';
import cloudstore from '../../savedpositions/cloudstore.js';
import validatorama from '../../util/validatorama.js';
import gamecompressor from '../../chess/gamecompressor.js';
import modifierSelector from './modifierSelector.js';
import clientmetadatautil from '../../chess/clientmetadatautil.js';
import variantPreviewTooltip from '../rendering/variantPreviewTooltip.js';

// Types -------------------------------------------------

/** The current variant selection. */
type DisplaySelection =
	| { kind: 'preset'; code: VariantCode }
	| { kind: StorageType; name: string }
	| { kind: 'icn' };

/** Callbacks a host wires to react to the selector's state. */
interface VariantSelectorConfig {
	/**
	 * Whether this selector creates seeks (lobby), vs. loading positions for analysis. Gates all
	 * seek-only hardening: rejecting oversized positions, 4D movement, and already game-over ones.
	 */
	isSeekContext: boolean;
	/** Fires on every selection/validity change (live). Sync dependent UI (e.g. a submit button). */
	onChange?: () => void;
	/** Fires only when a selection is committed (a discrete pick, or an ICN blur/paste). */
	onCommit?: () => void;
}

/** The union of all possible group type dropdowns. */
type GroupType = VariantGroup | 'custom';

/**
 * The last validated custom position. A From-ICN result caches its parse and moves-applied
 * gamefile so the seek flatten and preview don't rebuild them; the gamefile is kept even when
 * `isValid` is false (position illegal to play) so the preview still renders the true position
 * the moves lead to. Saved positions store options at rest, with no ICN to derive them from.
 */
type IcnResult =
	| { kind: 'saved'; isValid: boolean; options: VariantOptions }
	| { kind: 'icn'; isValid: boolean; longFormat: LongFormatOut; gamefile: GameFile };

// Elements ----------------------------------------------

const element_variantCustomSection = document.getElementById('variant-custom-section')!;
const element_variantSelector = document.getElementById('variant-selector')!;
const element_variantDisplay = document.getElementById('variant-display')!;
const element_variantGroupDropdown = document.getElementById('variant-dropdown')!;
const element_variantListPanels = document.querySelectorAll<HTMLElement>('.variant-list-panel');
const element_variantGroupButtons = document.querySelectorAll<HTMLElement>('button[data-group]');
const element_variantGroupButtonByGroup = new Map<GroupType, HTMLElement>(
	[...element_variantGroupButtons].map((button) => [
		button.getAttribute('data-group') as GroupType,
		button,
	]),
);
/** Variant-list panels indexed by `data-group` for O(1) lookup. */
const element_variantListPanelByGroup = new Map<GroupType, HTMLElement>(
	[...element_variantListPanels].map((p) => [p.getAttribute('data-group') as GroupType, p]),
);
const element_variantGroupIcon = document.getElementById('variant-group-icon')!;
const element_variantName = document.getElementById('variant-name')!;
const element_icnInput = document.getElementById('icn-input') as HTMLTextAreaElement;
const element_icnInputWrap = document.querySelector('.icn-input-wrap') as HTMLElement;
const element_icnErrorText = document.getElementById('icn-error-text') as HTMLElement;
const element_customVariantContent = document.getElementById('variant-custom-content')!;
const element_btnCustomCreate = document.getElementById('btn-custom-create')!;
const element_btnCustomFromICN = document.getElementById('btn-custom-from-icn')!;
const element_btnCustomFromICNName =
	element_btnCustomFromICN.querySelector<HTMLElement>('.group-name')!;

// State ----------------------------------------------

/** Host config, populated by {@link initVariantGroupDropdown}. */
let config: VariantSelectorConfig;

/** The currently selected variant. */
let selection: DisplaySelection = { kind: 'preset', code: 'Classical' };
/**
 * Whether the selection is restricted to what the engine can play (the computer-game flow).
 * Unlike {@link VariantSelectorConfig.isSeekContext} this toggles per modal-open, so flipping
 * it re-validates the current custom position against the new rules. Only ever set within a
 * seek context — the engine checks ride along with the seek-only ones.
 */
let engineOnly = false;
/**
 * The full state currently committed — what the display reverts to when
 * {@link restoreAcceptedDisplay} is called to abandon an un-committed selection.
 * Always valid since invalid selections are never committed.
 */
let loaded: {
	selection: DisplaySelection;
	/** The ICN a From-ICN position was loaded from; undefined for non-ICN selections. */
	icn?: string;
	/** The modifiers active at load, restored alongside the selection. */
	modifiers: GameModifier[];
} = { selection: { kind: 'preset', code: 'Classical' }, icn: '', modifiers: [] };

let customContentVNode: VNode | Element = element_customVariantContent;
/**
 * The last validated custom position (ICN input or saved position). Null while
 * loading or unset, and for an ICN that didn't parse or whose construction crashed.
 * If defined, we can always display the variant preview tooltip.
 */
let icnResult: IcnResult | null = null;

// Custom position caching
// Very low chance a position is edited in another tab when it is sitting in the cache.

/** Cache for fetched cloud save previews — keyed by position name. */
const cloudPreviewCache = new Map<string, VariantOptions>();
/** Cache for fetched local save previews — keyed by position name. */
const localPreviewCache = new Map<string, VariantOptions>();

const patch = init([attributesModule, classModule, eventListenersModule]);

// Initialization ----------------------------------------------

/** Wires the variant selector open/close and group navigation. */
function initVariantGroupDropdown(hostConfig: VariantSelectorConfig): void {
	config = hostConfig;
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
	element_variantGroupButtons.forEach((item) => {
		item.addEventListener('click', () => {
			const group = item.getAttribute('data-group') as GroupType;
			if (group === 'custom') openCustomVariantList();
			else openVariantList(group);
		});
	});

	// Wire up the static custom-panel action buttons (Create + From ICN).
	element_btnCustomCreate.addEventListener('click', goToEditor);
	element_btnCustomFromICN.addEventListener('click', () => {
		openFromICN();
		element_icnInput.focus(); // Picking it from the menu means they're about to type in it
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
			const preview = btn.querySelector<HTMLElement>('.preview')!;
			variantPreviewTooltip.attachAnchor(preview, (anchor) => {
				variantPreviewTooltip.showForVariantCode(anchor, code, 'left', {
					engineGame: engineOnly,
				});
			});
		});
	});
}

/** Wires blur/focus/input/paste listeners to keep the ICN validation state in sync. */
function initIcnValidation(): void {
	/** Whether to ignore the "already loaded" check and force a commit on blur. */
	let forceCommit = false;

	// Blur/paste are "commit" points; live typing only updates validity (onChange), not a commit.
	element_icnInput.addEventListener('blur', async () => {
		const value = element_icnInput.value;
		await validateIcnInput(true);
		const wasForceCommit = forceCommit;
		forceCommit = false;
		// Validating can await a variant module, during which another selection may have rewritten
		// the field and committed its own state. Ours is stale then — leave it alone.
		if (element_icnInput.value !== value) return;
		// Skip the commit if the field still holds exactly the ICN already accepted — re-committing
		// would reload the position, needlessly wiping any analysis branches made from it.
		if (
			!wasForceCommit &&
			loaded.selection.kind === 'icn' &&
			element_icnInput.value === loaded.icn
		)
			return;
		config.onCommit?.();
	});
	element_icnInput.addEventListener('focus', () => clearError(element_icnInputWrap));
	// Validate live so validity updates the moment the position is valid, but suppress
	// error display until blur so we don't nag as the user types. No commit while typing.
	element_icnInput.addEventListener('input', (e) => {
		// A paste is a finished code, so reveal its errors instantly rather than waiting for blur.
		const pasted = (e as InputEvent).inputType === 'insertFromPaste';
		void validateIcnInput(pasted);
	});
	// Enter commits the ICN (blur runs validate + commit) rather than inserting a newline.
	element_icnInput.addEventListener('keydown', (e) => {
		if (e.key !== 'Enter' || e.shiftKey) return;
		e.preventDefault();
		forceCommit = true; // The enter key overrides the "already loaded" check
		element_icnInput.blur();
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
	element_variantListPanelByGroup.get(group)!.classList.add('open');
}

/**
 * Restricts the selector to what the engine can play (the computer-game flow), or lifts the
 * restriction. Hides unsupported preset variants — and any group left empty — rather than
 * erroring on submit; an unsupported current selection falls back to Classical. Custom
 * positions stay available, re-validated here against the newly active rules.
 */
function setEngineOnly(restrict: boolean): void {
	engineOnly = restrict;
	element_variantListPanels.forEach((panel) => {
		const group = panel.getAttribute('data-group') as GroupType;
		if (group === 'custom') return;

		let anySupported = false;
		panel.querySelectorAll<HTMLElement>('.variant-item[data-code]').forEach((btn) => {
			const code = btn.getAttribute('data-code') as VariantCode;
			const supported = apeironcard.SUPPORTED_VARIANTS.has(code);
			btn.classList.toggle('hidden', engineOnly && !supported);
			if (supported) anySupported = true;
		});
		element_variantGroupButtonByGroup
			.get(group)
			?.classList.toggle('hidden', engineOnly && !anySupported);
	});

	if (selection.kind === 'preset') {
		if (engineOnly && !apeironcard.SUPPORTED_VARIANTS.has(selection.code))
			selectVariant('Classical');
	} else revalidateCustomSelection();
}

/** Opens the custom variant panel and refreshes saved positions. */
async function openCustomVariantList(): Promise<void> {
	element_variantGroupDropdown.classList.remove('open');
	element_variantListPanelByGroup.get('custom')!.classList.add('open');

	const [cloudResult, localResult] = await Promise.allSettled([
		validatorama.areWeLoggedIn() ? savesapi.getSavedPositions() : Promise.resolve([]),
		savestore.getAllLocalSaveInfos(),
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
			() => selectCustomSave( 'cloud', s.name, cloudPreviewCache, cloudstore.readCloud, t.shared.variant_selector.cloud_load_failed), // prettier-ignore
			(anchor) => handleSavePreview(anchor, s.name, cloudPreviewCache, cloudstore.readCloud),
		),
	);

	const localRows: VNode[] = sortedLocal.map((s) =>
		createSaveItemVNode(
			`local-${s.position_name}`,
			s.position_name,
			() => selectCustomSave('local', s.position_name, localPreviewCache, savestore.readLocal, t.shared.variant_selector.local_load_failed), // prettier-ignore
			(anchor) => handleSavePreview(anchor, s.position_name,  localPreviewCache, savestore.readLocal), // prettier-ignore
		),
	);

	const saveRows = [...cloudRows, ...localRows];

	return h(
		'div#variant-custom-content',
		{},
		saveRows.length > 0
			? [
					h('div.custom-saves-heading', {}, t.shared.variant_selector.saved_positions),
					...saveRows,
				]
			: [],
	);
}

/** Navigates to the board editor page. */
function goToEditor(): void {
	window.location.assign('/editor');
}

// Variant selection ----------------------------------------------

/** Updates the selected variant state and selector button, then closes all panels. */
function selectVariant(code: VariantCode): void {
	selection = { kind: 'preset', code };
	applyVariantToSelector(code);
	clearSavedPositionError();
	hideCustomSection();
	closeVariantDropdown();
	config.onCommit?.();
}

/**
 * Selects a saved position (cloud or local) by kind and name, updating the selector display.
 * @param kind - Which storage backend the save lives in.
 * @param name - Position name used to look up and display the save.
 * @param cache - Preview cache to read from (cache hit) or write to (after fetch).
 * @param read - Async function that fetches the full save state by name.
 * @param errorMsg - Error message shown in the selector if the fetch fails.
 */
function selectCustomSave(
	kind: StorageType,
	name: string,
	cache: Map<string, VariantOptions>,
	read: (n: string) => Promise<{ variantOptions: VariantOptions }>,
	errorMsg: string,
): void {
	selection = { kind, name };
	applyCustomToSelector(name);
	clearSavedPositionError();
	hideCustomSection();
	closeVariantDropdown();

	const cached = cache.get(name);
	if (cached !== undefined) {
		validateSavedPosition(cached);
		config.onCommit?.();
		return;
	}
	read(name)
		.then((s) => {
			cache.set(name, s.variantOptions);
			if (selection.kind !== kind || selection.name !== name) return;
			validateSavedPosition(s.variantOptions);
			config.onCommit?.();
		})
		.catch(() => {
			if (selection.kind !== kind || selection.name !== name) return;
			showError(element_variantDisplay, errorMsg);
			setIcnResult(null);
			config.onCommit?.();
		});
}

/** Shows the ICN input section and updates the selector to the From-ICN button's display name. */
function openFromICN(): void {
	selection = { kind: 'icn' };
	clearSavedPositionError();
	showCustomSection();
	closeVariantDropdown();
}

/** Programmatically selects Custom From-ICN, fills the input with the given ICN, and validates it. */
async function applyIcn(icn: string): Promise<void> {
	openFromICN();
	element_icnInput.value = icn;
	await validateIcnInput(true);
	// Something rewrote the field while we validated — it has committed its own state, so ours is stale.
	if (element_icnInput.value !== icn) return;
	config.onCommit?.();
}

/** Reveals the ICN input section and labels the selector with the From-ICN button's name. */
function showCustomSection(): void {
	element_variantCustomSection.classList.remove('hidden');
	applyCustomToSelector(element_btnCustomFromICNName.textContent!);
}

/** Hides the ICN input section, clearing its field and error so re-opening From-ICN starts fresh. */
function hideCustomSection(): void {
	element_variantCustomSection.classList.add('hidden');
	element_icnInput.value = '';
	clearError(element_icnInputWrap);
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
		t.shared.variants[code],
		variantregistry.getVariantGroupIconId(variantGroup),
	);
}

/** Updates the selector button's icon and name to reflect a custom (non-preset) selection. */
function applyCustomToSelector(name: string): void {
	setSelectorDisplay(name, 'svg-wrench');
}

// Remembering Committed State ----------------------------------------------

/** Records the current selection, ICN, and modifiers as accepted to remember. */
function snapshotAccepted(): void {
	loaded = {
		selection,
		icn: selection.kind === 'icn' ? element_icnInput.value : undefined,
		modifiers: modifierSelector.getGameModifiers(),
	};
}

/**
 * Reverts the display to the last accepted state. Hosts call this when the user
 * performs an action signifying they're no longer interested in the uncommitted selection.
 */
function restoreAcceptedDisplay(): void {
	selection = loaded.selection;
	element_variantDisplay.classList.remove('invalid');
	if (selection.kind === 'icn') {
		// Restore the field to the ICN that was actually loaded (discarding any invalid edits),
		// then re-validate to refresh validity and clear the error highlight.
		showCustomSection();
		element_icnInput.value = loaded.icn!;
		void validateIcnInput(false);
	} else {
		hideCustomSection();
		if (selection.kind === 'preset') applyVariantToSelector(selection.code);
		else applyCustomToSelector(selection.name);
	}
	modifierSelector.applyModifiers(loaded.modifiers);
}

// Validation ----------------------------------------------

/** Sets icnResult and notifies the host of the change. */
function setIcnResult(result: IcnResult | null): void {
	icnResult = result;
	config.onChange?.();
}

/** Validates a saved position's VariantOptions and applies the result to the variant display. */
function validateSavedPosition(variantOptions: VariantOptions): void {
	const played = withEngineBorder(variantOptions);
	// Saved positions are authored in the editor, so they were never sourced from a variant.
	let rejection = validateOptions(played, {});
	// Legal position; it still has to be playable from here. Every context rejects a position
	// whose king can be captured, and a seek context has further rules on top. Only then do we
	// construct the transient gamefile those checks read off of, and we discard it after.
	if (rejection === null) {
		const constructed = gameformulator.constructPosition(played);
		rejection = playabilityRejection(constructed);
	}
	if (rejection !== null) {
		showError(element_variantDisplay, localizeRejection(t, rejection));
		setIcnResult({ kind: 'saved', options: variantOptions, isValid: false });
		return;
	}
	clearError(element_variantDisplay);
	setIcnResult({ kind: 'saved', options: variantOptions, isValid: true });
}

/**
 * Re-runs validation on the current custom selection, for when the rules
 * it's judged by have changed out from under an already-settled result.
 */
function revalidateCustomSelection(): void {
	if (selection.kind === 'icn') void validateIcnInput(true);
	else if (icnResult?.kind === 'saved') validateSavedPosition(icnResult.options);
	// A saved position still being fetched has no result yet; it'll validate under the new rules.
}

/**
 * Serializes a custom position's VariantOptions to its canonical compact ICN string.
 * @param metadata - The source-variant tags to declare, from {@link clientmetadatautil.buildSourceVariantMetadata}.
 */
function variantOptionsToICN(options: VariantOptions, metadata: MetaData): string {
	return icnconverter.LongToShort_Format(
		{
			metadata,
			position: options.position,
			gameRules: options.gameRules,
			fullMove: options.fullMove,
			state_global: options.state_global,
		},
		icnconverter.COMPACT_FORMAT_OPTIONS,
	);
}

/**
 * Validates a flattened position's legality, plus its ICN size in a seek context.
 * @param metadata - The tags the seek's ICN will carry — measured here so the size
 * checked is the size sent, which the server re-checks against the same threshold.
 */
function validateOptions(options: VariantOptions, metadata: MetaData): PositionRejection | null {
	// Serialize only for seeks — that's the sole consumer of the ICN here.
	const code = validatePosition(
		options,
		config.isSeekContext ? variantOptionsToICN(options, metadata) : undefined,
	);
	return code === null ? null : { kind: 'position', code };
}

/**
 * The position as it would be played against the engine: its own world border held to what the
 * engine can evaluate, or one spaced around it when it declares none. The single point a custom
 * seek's border is decided, so its validation, its preview, and the ICN sent all judge the exact
 * board the game loads on. Derived rather than written onto the caller's position, which stays
 * the pristine one the engine restriction may be lifted from later.
 */
function withEngineBorder(options: VariantOptions): VariantOptions {
	if (!engineOnly) return options;
	const declared = options.gameRules.worldBorder;
	// An empty position has no box to space a border around; validation rejects it regardless.
	if (declared === undefined && options.position.size === 0) return options;
	let worldBorder: BoundingBox;
	if (declared !== undefined) worldBorder = apeironborder.clampToCap(declared, Date.now());
	else {
		const coords = [...options.position.keys()].map((key) => coordutil.getCoordsFromKey(key));
		const box = bounds.getBoxFromCoordsList(coords);
		worldBorder = apeironborder.forBox(box, Date.now());
	}
	return { ...options, gameRules: { ...options.gameRules, worldBorder } };
}

/** {@link getPlayabilityRejection} under the contexts this selector is currently in. */
function playabilityRejection(constructed: GameFile): PositionRejection | null {
	return getPlayabilityRejection(constructed, {
		seek: config.isSeekContext,
		engine: engineOnly,
	});
}

/** Clears any saved-position error state from the variant display. */
function clearSavedPositionError(): void {
	setIcnResult(null);
	clearError(element_variantDisplay);
}

/**
 * Outlines an element as invalid and sets the shared error text below it.
 * A null message outlines the element without a message — used for invalid ICN syntax.
 */
function showError(outline: HTMLElement, message: string | null): void {
	outline.classList.add('invalid');
	// Warn if the translation key was missing, but don't throw.
	if (message === undefined) console.warn('Variant selector error text has no translation.');
	element_icnErrorText.textContent = message ?? '';
}

/** Clears an element's invalid outline and the shared error text together. */
function clearError(outline: HTMLElement): void {
	outline.classList.remove('invalid');
	element_icnErrorText.textContent = '';
}

/**
 * Validates the current ICN textarea value and caches what validating it produced,
 * notifying the host of the validity change.
 *
 * @param revealErrors - Whether to surface invalid styling/error text. False while typing
 * (validity still updates); true on blur/paste so errors show once done.
 */
async function validateIcnInput(revealErrors: boolean): Promise<void> {
	const value = element_icnInput.value;
	// Nothing is resolved until this settles. Held results describe the previous value, and
	// awaiting a variant module makes that window long enough to act on — so retire them now.
	setIcnResult(null);
	if (value === '') {
		clearError(element_icnInputWrap);
		return;
	}

	let longFormat: LongFormatOut;
	try {
		longFormat = icnconverter.ShortToLong_Format(value);
	} catch (e) {
		// The icn itself was in an invalid format
		if (revealErrors) {
			showError(element_icnInputWrap, null); // Outline the field without a message
			// Only log on reveal so we don't spam the console on every keystroke of an in-progress ICN.
			console.error('Illegal position:', e instanceof Error ? e.message : e);
		}
		setIcnResult(null);
		return;
	}

	// Atleast the ICN is valid syntax, now let's check position, gamerules, and moves...

	// Built through the same path the board loads by, so the gate validates the exact game that
	// will be loaded. Built regardless of play-legality, so the preview always reflects the moves —
	// a play-illegal position (e.g. king capturable) still previews faithfully once they're applied.
	const constructed = await gameformulator.tryFormulateGame(longFormat, revealErrors);
	// Awaiting the variant module let the user keep typing — discard a result they've moved past.
	if (element_icnInput.value !== value) return;
	if (constructed === 'moves_invalid') {
		// Construction crashed — the position can't be previewed or played.
		if (revealErrors) showError(element_icnInputWrap, t.shared.position_errors.moves_invalid);
		setIcnResult(null);
		return;
	}

	// Validate the flattened position the moves lead to — the exact position a seek plays from and
	// the server re-validates, judged on the board it gets rather than the one the moves ran on.
	const played = withEngineBorder(gamecompressor.gamefileToPositionOptions(constructed));
	const metadata = clientmetadatautil.buildSourceVariantMetadata(constructed);
	const rejection =
		validateOptions(played, metadata) ??
		playabilityRejection(gameformulator.constructPosition(played, constructed.variant));

	// The moves-applied gamefile is kept either way, so a rejected position still previews.
	if (rejection !== null) {
		if (revealErrors) showError(element_icnInputWrap, localizeRejection(t, rejection));
		setIcnResult({ kind: 'icn', isValid: false, longFormat, gamefile: constructed });
		return;
	}
	// Position is legal and playable.
	clearError(element_icnInputWrap);
	setIcnResult({ kind: 'icn', isValid: true, longFormat, gamefile: constructed });
}

// Preview tooltips ----------------------------------------------

/** Shows the preview tooltip for the currently selected variant in the display button. */
function handleDisplayPreviewHover(anchor: HTMLElement): void {
	if (selection.kind === 'preset') {
		variantPreviewTooltip.showForVariantCode(anchor, selection.code, 'left', { engineGame: engineOnly }); // prettier-ignore
	} else if (selection.kind === 'cloud') {
		handleSavePreview(anchor, selection.name, cloudPreviewCache, cloudstore.readCloud);
	} else if (selection.kind === 'local') {
		handleSavePreview(anchor, selection.name, localPreviewCache, savestore.readLocal);
	} else if (selection.kind === 'icn') {
		void variantPreviewTooltip.showForPosition(
			anchor,
			t.shared.variant_groups.custom.display_label,
			async () => {
				await validateIcnInput(true);
				// Construction failed — show nothing rather than a lie of a starting position.
				if (icnResult?.kind !== 'icn') return undefined;
				return withEngineBorder(
					gamecompressor.gamefileToPositionOptions(icnResult.gamefile),
				);
			},
			'left',
		);
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
	void variantPreviewTooltip.showForPosition(
		anchor,
		positionName,
		async () => {
			// The pristine save is what's cached; the border is layered on per preview, since the
			// engine restriction can be lifted while the cache lives on.
			const cached = cache.get(positionName);
			if (cached !== undefined) return withEngineBorder(cached); // Cache hit!
			// Request for the first time, cache the result.
			const saveState = await read(positionName).catch(() => undefined);
			if (saveState === undefined) return undefined; // Preview unavailable – silently ignore
			cache.set(positionName, saveState.variantOptions);
			return withEngineBorder(saveState.variantOptions);
		},
		'left',
	);
}

// Selection accessors ----------------------------------------------

/** The current selection. */
function getSelection(): DisplaySelection {
	return selection;
}

/** Whether the current selection resolves to a legal, loadable position. */
function isSelectionValid(): boolean {
	return selection.kind === 'preset' || !!icnResult?.isValid;
}

/**
 * The current custom (non-preset) selection resolved for loading onto a board, or null if the
 * selection is a preset or not yet valid. A From-ICN selection returns the parse validation
 * already produced, so loading doesn't have to redo it; saved positions resolve to their
 * {@link VariantOptions}.
 *
 * Both are deep-copied, since loading mutates them (e.g. gameRules.slideLimit)
 * and the cached originals outlive the load.
 */
function getCustomPosition():
	| { kind: 'longFormat'; longFormat: LongFormatOut }
	| { kind: 'options'; options: VariantOptions }
	| null {
	if (selection.kind === 'preset') return null;
	if (!icnResult?.isValid) return null;
	if (icnResult.kind === 'icn') {
		return { kind: 'longFormat', longFormat: jsutil.deepCopyObject(icnResult.longFormat) };
	}
	// online / local saved position — the resolved options are loadable as-is (no moves).
	return { kind: 'options', options: jsutil.deepCopyObject(icnResult.options) };
}

/**
 * Returns the current variant selection as a SeekVariant for the wire format,
 * or null if the selection is not yet valid.
 */
function getSeekVariant(): SeekVariant | null {
	if (selection.kind === 'preset') {
		return { kind: 'preset', code: selection.code };
	}
	if (!icnResult?.isValid) return null;
	// Every custom selection — saved position or From-ICN — travels as the ICN string it resolves
	// to. A From-ICN selection sends the position its moves lead to, since a seek's ICN may not
	// contain moves; a save's resolved options are already move-free. The engine's border is
	// written in, since the server takes the ICN's own board as given and refuses one without.
	const options = withEngineBorder(
		icnResult.kind === 'icn'
			? gamecompressor.gamefileToPositionOptions(icnResult.gamefile)
			: icnResult.options,
	);
	// The source-variant tags ride along — an explicit position lifted from the middle of a
	// balanced game is lopsided, and they are all that tells the game it starts otherwise.
	const metadata =
		icnResult.kind === 'icn'
			? clientmetadatautil.buildSourceVariantMetadata(icnResult.gamefile)
			: {};
	const position = variantOptionsToICN(options, metadata);
	if (!position) return null;
	return { kind: 'custom', position };
}

// Exports ----------------------------------------------

export default {
	initVariantGroupDropdown,
	initIcnValidation,
	closeVariantDropdown,
	setEngineOnly,
	getSelection,
	isSelectionValid,
	getCustomPosition,
	getSeekVariant,
	applyIcn,
	snapshotAccepted,
	restoreAcceptedDisplay,
};
