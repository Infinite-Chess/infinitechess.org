// src/client/scripts/esm/board/variantselector/variantselector.ts

/**
 * The variant selector widget shared by the home page's game-options modal and the
 * analysis board's setup panel: the group dropdown, per-group variant lists, custom
 * saves panel (cloud + local), and the ICN validation.
 */

import type { VNode } from 'snabbdom';
import type { MetaData } from '../../../../../shared/chess/util/metadatautil.js';
import type { BoundingBox } from '../../../../../shared/util/math/bounds.js';
import type { StorageType } from '../../savedpositions/storetypes.js';
import type { SeekVariant } from '../../../../../shared/chess/util/variantselection.js';
import type { VariantCode } from '../../../../../shared/chess/util/variantcodes.js';
import type { GameModifier } from '../../../../../shared/chess/util/modutil.js';
import type { VariantGroup } from '../../../../../shared/chess/variants/variantregistry.js';
import type { CloudSaveListRecord } from '../../savedpositions/savesapi.js';
import type { GameFile, VariantOptions } from '../../../../../shared/chess/logic/gamefile.js';

import { attributesModule, classModule, eventListenersModule, h, init } from 'snabbdom';

import jsutil from '../../../../../shared/util/jsutil.js';
import bounds from '../../../../../shared/util/math/bounds.js';
import modutil from '../../../../../shared/chess/util/modutil.js';
import coordutil from '../../../../../shared/util/coordutil.js';
import apeironcard from '../../../../../shared/chess/engines/apeironcard.js';
import apeironborder from '../../../../../shared/chess/logic/apeironborder.js';
import gameformulator from '../../../../../shared/chess/game/gameformulator.js';
import variantregistry from '../../../../../shared/chess/variants/variantregistry.js';
import { validatePosition } from '../../../../../shared/chess/logic/positionlegality.js';
import icnconverter, { LongFormatOut } from '../../../../../shared/chess/logic/icn/icnconverter.js';
import playability, { PositionRejection } from '../../../../../shared/chess/game/playability.js';

import savesapi from '../../savedpositions/savesapi.js';
import savestore from '../../savedpositions/savestore.js';
import cloudstore from '../../savedpositions/cloudstore.js';
import validatorama from '../../util/validatorama.js';
import gamecompressor from '../../chess/gamecompressor.js';
import modifierselector from './modifierselector.js';
import clientmetadatautil from '../../chess/clientmetadatautil.js';
import variantpreviewtooltip from './variantpreviewtooltip.js';

// Types -----------------------------------------------------------------------

/** The current variant selection, as a host remembers it between visits. */
export type DisplaySelection = PresetSelection | SaveSelection | IcnSelection;

/** A built-in variant. */
type PresetSelection = { kind: 'preset'; code: VariantCode };
/** A position saved to the cloud or locally, by name. */
type SaveSelection = { kind: StorageType; name: string };
/** A position pasted or typed into the From-ICN field. */
type IcnSelection = {
	kind: 'icn';
	/** The field's exact text, valid or not, so a broken paste survives. */
	icn: string;
};

/**
 * The live selection, carrying its verdict so a verdict can only ever describe the selection it
 * sits on. A preset needs none — it is always valid. A null verdict is unjudged: still being
 * fetched or validated, or an ICN that didn't parse or whose construction crashed.
 */
type SelectionState = PresetSelection | SaveSelectionState | IcnSelectionState;

/** A saved position, with its verdict once fetched and judged. */
interface SaveSelectionState extends SaveSelection {
	verdict: SaveVerdict | null;
}

/**
 * A From-ICN position, with its verdict on the field's current text. It holds no text of its
 * own — the live text is the field itself.
 */
interface IcnSelectionState {
	kind: 'icn';
	/** `'unevaluated'` when too large to judge on a keystroke — the verdict waits for a commit. */
	verdict: IcnVerdict | 'unevaluated' | null;
}

/** A From-ICN selection as accepted, with the ICN text it was loaded from. */
interface AcceptedIcnSelection extends IcnSelection, IcnSelectionState {}

/**
 * A validated custom position, holding everything validating it already produced so nothing
 * downstream re-derives it. Kept even when `isValid` is false (position illegal to play) so the
 * preview still renders the true position the moves lead to.
 */
interface Verdict {
	isValid: boolean;
	/** The flattened position a seek starts from — what the preview draws. */
	played: VariantOptions;
	/** That position serialized; only built in a seek context, the sole place it's read. */
	seekIcn?: string;
}

/** A saved position's verdict. */
interface SaveVerdict extends Verdict {
	/** The save's options as stored — it has no ICN to derive them from. */
	options: VariantOptions;
}

/** A From-ICN position's verdict. */
interface IcnVerdict extends Verdict {
	/** The parse the game was built from, kept so the loader can rebuild it pristine. */
	longFormat: LongFormatOut;
	/**
	 * The moves-applied game. Undefined once the board has taken it — it owns and mutates it
	 * from there, so handing the same one out twice would serve an edited position.
	 */
	gamefile?: GameFile;
}

/** Callbacks a host wires to react to the selector's state. */
interface VariantSelectorConfig {
	/**
	 * Whether this selector creates seeks (lobby), vs. loading positions for analysis. Gates all
	 * seek-only hardening: rejecting oversized positions, 4D movement, and already game-over ones.
	 */
	isSeekContext: boolean;
	/**
	 * Fires whenever the selection's verdict moves — reached, retired, or deferred. Sync UI that
	 * reflects legality (e.g. a submit button). Fires MORE than once per edit, since validating
	 * retires the old verdict before it reaches a new one, so it is the wrong signal for anything
	 * that should happen once per change.
	 */
	onValidityChange?: () => void;
	/**
	 * Fires once, and only when {@link getSelection} actually changed —
	 * exactly what a host remembers between visits. Committing changes neither, so a host that
	 * only persists wants this and not {@link onCommit}.
	 */
	onEdit?: () => void;
	/** Fires only when a selection is committed (a discrete pick, or an ICN blur/paste). */
	onCommit?: () => void;
}

/** The union of all possible group type dropdowns. */
type GroupType = VariantGroup | 'custom';

// Elements --------------------------------------------------------------------

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

// Constants -------------------------------------------------------------------

/**
 * The ICN length past which a keystroke stops judging the position, leaving the verdict to a
 * commit — blur, Enter, paste, or pressing submit. Measured in characters rather than pieces
 * because the piece count can't be known without parsing first, and parsing scales with the
 * string: on a megabyte it is already far too slow to spend on a keypress.
 *
 * Set at the shortest ICN that can hold 5,000 pieces. The densest packing that exists — a square
 * block hugging the origin — measures 37,281 characters there, so nothing under this cap can
 * carry more. Building a gamefile costs roughly 200 ms per 10,000 pieces on Naviary's machine,
 * putting 5,000 at about 100 ms. A position with distant coordinates spends more characters per
 * piece and so defers sooner than its count alone would require.
 */
const MAX_ICN_CHARS_TO_VALIDATE_LIVE = 37_000;

/**
 * How each saved-position backend is read: its reader, and the message shown when that read
 * fails. Naming one by its {@link StorageType} is all a caller needs to select, preview, or
 * restore a save from it.
 */
const SAVE_BACKENDS: Record<
	StorageType,
	{
		read: (name: string) => Promise<{ variantOptions: VariantOptions }>;
		errorMsg: string;
	}
> = {
	cloud: {
		read: cloudstore.readCloud,
		errorMsg: t.shared.variant_selector.cloud_load_failed,
	},
	local: {
		read: savestore.readLocal,
		errorMsg: t.shared.variant_selector.local_load_failed,
	},
};

// State -----------------------------------------------------------------------

/** Host config, populated by {@link initVariantGroupDropdown}. */
let config: VariantSelectorConfig;

/** The currently selected variant, and the verdict on it. */
let selection: SelectionState = { kind: 'preset', code: 'Classical' };
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
	/**
	 * Copied in and out rather than shared, since verdicts are written onto the current
	 * selection in place — sharing it would let a later edit's verdict overwrite this one.
	 */
	selection: PresetSelection | SaveSelectionState | AcceptedIcnSelection;
	/** The modifiers active at load, restored alongside the selection. */
	modifiers: GameModifier[];
} = { selection: { kind: 'preset', code: 'Classical' }, modifiers: [] };

let customContentVNode: VNode | Element = element_customVariantContent;

/**
 * Fetched save previews per backend, keyed by position name.
 * Very low chance a position is edited in another tab when it is sitting in the cache.
 */
const previewCaches: Record<StorageType, Map<string, VariantOptions>> = {
	cloud: new Map(),
	local: new Map(),
};

const patch = init([attributesModule, classModule, eventListenersModule]);

// Initialization --------------------------------------------------------------

/** Wires the variant selector open/close and group navigation. */
function initVariantGroupDropdown(hostConfig: VariantSelectorConfig): void {
	config = hostConfig;
	applyVariantToSelector('Classical');

	element_variantDisplay.addEventListener('click', (e) => {
		if ((e.target as HTMLElement).closest('.preview')) return; // They clicked the preview button.
		// The modifier-add button is inside the display and bubbles to us; the user is leaving
		// variant selection, so close it. (The modifier leaf toggles its own dropdown on the click.)
		if ((e.target as HTMLElement).closest('.modifier-add')) {
			closeVariantDropdown();
			return;
		}
		toggleVariantDropdown();
	});
	document.addEventListener('pointerdown', (e) => {
		const target = e.target as Node;
		if (
			!element_variantSelector.contains(target) &&
			!variantpreviewtooltip.containsNode(target)
		)
			closeVariantDropdown();
	});

	// Set up variant preview tooltip listener on hovering the preview (eye) icon
	const element_displayPreviewAnchor =
		element_variantDisplay.querySelector<HTMLElement>('.preview')!;
	variantpreviewtooltip.attachAnchor(element_displayPreviewAnchor, handleDisplayPreviewHover);

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
			variantpreviewtooltip.attachAnchor(preview, (anchor) => {
				variantpreviewtooltip.showForVariantCode(anchor, code, 'left', {
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
			element_icnInput.value === loaded.selection.icn
		)
			return;
		config.onCommit?.();
	});
	element_icnInput.addEventListener('focus', () => clearError(element_icnInputWrap));
	element_icnInput.addEventListener('input', (e) => {
		// A paste is a finished code, not a keystroke: judge it in full and reveal its errors now.
		// A keystroke judges only where a host reads validity at all — one that doesn't (the
		// analysis board, acting on commits alone) would pay for a verdict nothing looks at — and
		// keeps its errors to itself, so we don't nag mid-ICN. Never a commit while typing.
		if ((e as InputEvent).inputType === 'insertFromPaste') void validateIcnInput(true);
		else if (config.onValidityChange !== undefined) void validateIcnInput(false, true);
		config.onEdit?.();
	});
	// Enter commits the ICN (blur runs validate + commit) rather than inserting a newline.
	element_icnInput.addEventListener('keydown', (e) => {
		if (e.key !== 'Enter' || e.shiftKey) return;
		e.preventDefault();
		forceCommit = true; // The enter key overrides the "already loaded" check
		element_icnInput.blur();
	});
}

// Dropdown navigation ---------------------------------------------------------

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
 * Readies the selector for an opening modal: restricts it to what the engine can play for an
 * engine game (custom positions stay available either way), then re-validates a custom selection
 * where that could change its verdict. The only point a restored selection is parsed.
 */
function onModalOpen(engineGame: boolean): void {
	const rulesChanged = engineOnly !== engineGame;
	engineOnly = engineGame;
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
		return;
	}
	// Re-parsing a large position is expensive, and engineOnly is validity's only input that
	// can change between opens. GIVE VALIDITY A NEW INPUT AND IT BELONGS IN THIS CONDITION.
	if (rulesChanged || selection.verdict === null) void revalidateCustomSelection();
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

// Custom panel ----------------------------------------------------------------

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
							if (e.pointerType !== 'touch') variantpreviewtooltip.hide();
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
			() => selectCustomSave('cloud', s.name),
			(anchor) => handleSavePreview(anchor, 'cloud', s.name),
		),
	);

	const localRows: VNode[] = sortedLocal.map((s) =>
		createSaveItemVNode(
			`local-${s.position_name}`,
			s.position_name,
			() => selectCustomSave('local', s.position_name),
			(anchor) => handleSavePreview(anchor, 'local', s.position_name),
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

// Variant selection -----------------------------------------------------------

/** Updates the selected variant state and selector button, then closes all panels. */
function selectVariant(code: VariantCode): void {
	setSelection({ kind: 'preset', code });
	applyVariantToSelector(code);
	clearError(element_variantDisplay);
	hideCustomSection();
	closeVariantDropdown();
	config.onEdit?.(); // After hideCustomSection, which emptied the ICN field.
	config.onCommit?.();
}

/**
 * Selects a saved position (cloud or local) by kind and name, updating the selector display.
 * @param kind - Which storage backend the save lives in.
 * @param name - Position name used to look up and display the save.
 */
function selectCustomSave(kind: StorageType, name: string): void {
	const picked: SaveSelectionState = { kind, name, verdict: null };
	setSelection(picked);
	applyCustomToSelector(name);
	clearError(element_variantDisplay);
	hideCustomSection();
	closeVariantDropdown();
	// Announced here rather than beside the commits below, which wait on the read: the selection
	// changed the moment it was clicked, whether or not fetching it goes on to succeed.
	config.onEdit?.();

	const { read, errorMsg } = SAVE_BACKENDS[kind];
	const cache = previewCaches[kind];
	const cached = cache.get(name);
	if (cached !== undefined) {
		validateSavedPosition(picked, cached);
		config.onCommit?.();
		return;
	}
	read(name)
		.then((s) => {
			cache.set(name, s.variantOptions);
			if (selection !== picked) return;
			validateSavedPosition(picked, s.variantOptions);
			config.onCommit?.();
		})
		.catch(() => {
			if (selection !== picked) return;
			showError(element_variantDisplay, errorMsg);
			config.onCommit?.();
		});
}

/** Shows the ICN input section and updates the selector to the From-ICN button's display name. */
function openFromICN(): void {
	setSelection({ kind: 'icn', verdict: null });
	clearError(element_variantDisplay);
	showCustomSection();
	closeVariantDropdown();
	config.onEdit?.(); // The selection changed, but no pick has been committed yet.
}

/** Programmatically selects Custom From-ICN, fills the input with the given ICN, and validates it. */
async function applyIcn(icn: string): Promise<void> {
	// Filled BEFORE opening, so openFromICN's edit announcement already carries the new text —
	// assigning `value` fires no input event of its own.
	element_icnInput.value = icn;
	openFromICN();
	await validateIcnInput(true);
	// Something rewrote the field while we validated — it has committed its own state, so ours is stale.
	if (element_icnInput.value !== icn) return;
	config.onCommit?.();
}

/**
 * Puts a remembered selection back on page load. A From-ICN one is filled but not validated —
 * {@link onModalOpen} does that, once, when the modal opens.
 */
function restoreSelection(restored: DisplaySelection): void {
	if (restored.kind === 'preset') selectVariant(restored.code);
	else if (restored.kind === 'icn') {
		// Filled first, as in applyIcn, so openFromICN's edit announcement carries the text.
		element_icnInput.value = restored.icn;
		openFromICN();
	} else selectCustomSave(restored.kind, restored.name);
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

// Selector display ------------------------------------------------------------

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
	const variantGroup = variantregistry.getGroup(code);
	setSelectorDisplay(t.shared.variants[code], variantregistry.getGroupIconId(variantGroup));
}

/** Updates the selector button's icon and name to reflect a custom (non-preset) selection. */
function applyCustomToSelector(name: string): void {
	setSelectorDisplay(name, 'svg-wrench');
}

// Remembering Committed State -------------------------------------------------

/** Records the current selection, ICN, modifiers, and verdict as accepted to remember. */
function snapshotAccepted(): void {
	loaded = {
		selection:
			selection.kind === 'icn'
				? { kind: 'icn', verdict: selection.verdict, icn: element_icnInput.value }
				: { ...selection },
		modifiers: modifierselector.getGameModifiers(),
	};
}

/**
 * Reverts the display to the last accepted state. Hosts call this when the user
 * performs an action signifying they're no longer interested in the uncommitted selection.
 */
function restoreAcceptedDisplay(): void {
	const accepted = loaded.selection;
	// Its verdict comes back with it rather than being re-judged: this runs on every board move,
	// where rebuilding the game would be ruinous. A From-ICN one leaves its text to the field.
	setSelection(
		accepted.kind === 'icn' ? { kind: 'icn', verdict: accepted.verdict } : { ...accepted },
	);
	element_variantDisplay.classList.remove('invalid');
	if (accepted.kind === 'icn') {
		// Restore the field to the ICN that was actually loaded, discarding any invalid edits.
		showCustomSection();
		element_icnInput.value = accepted.icn;
		clearError(element_icnInputWrap);
	} else {
		hideCustomSection();
		if (accepted.kind === 'preset') applyVariantToSelector(accepted.code);
		else applyCustomToSelector(accepted.name);
	}
	modifierselector.applyModifiers(loaded.modifiers);
}

// Validation ------------------------------------------------------------------

/** Makes the given selection current, and notifies the host the verdict moved with it. */
function setSelection(next: SelectionState): void {
	selection = next;
	config.onValidityChange?.();
}

/** Sets the verdict on a selection, and notifies the host it moved. */
function setVerdict<S extends SaveSelectionState | IcnSelectionState>(
	judged: S,
	verdict: S['verdict'],
): void {
	judged.verdict = verdict;
	config.onValidityChange?.();
}

/** Validates a saved position's VariantOptions and applies the result to the variant display. */
function validateSavedPosition(judged: SaveSelectionState, variantOptions: VariantOptions): void {
	const played = withEngineBorder(variantOptions);
	// Saved positions are authored in the editor, so they were never sourced from a variant.
	const { rejection: positionRejection, seekIcn } = validateOptions(played, {});
	// Legal position; it still has to be playable from here. Every context rejects a position
	// whose king can be captured, and a seek context has further rules on top. Only then do we
	// construct the transient gamefile those checks read off of, and we discard it after.
	const rejection = positionRejection ?? playabilityRejection(played);

	if (rejection !== null)
		showError(element_variantDisplay, playability.localizeRejection(t, rejection));
	else clearError(element_variantDisplay);
	setVerdict(judged, { options: variantOptions, played, seekIcn, isValid: rejection === null });
}

/**
 * Re-runs validation on the current custom selection, for when the rules it's judged by have
 * changed out from under an already-settled result. Resolves once the new verdict is in.
 */
async function revalidateCustomSelection(): Promise<void> {
	if (selection.kind === 'icn') await validateIcnInput(true);
	else if (selection.kind !== 'preset' && selection.verdict !== null)
		validateSavedPosition(selection, selection.verdict.options);
	// A saved position still being fetched has no verdict yet; it'll validate under the new rules.
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
 * @returns The rejection, or null if legal, alongside the ICN built to measure. That string
 * is also the one the seek sends, so it's kept rather than serialized a second time on the way out.
 */
function validateOptions(
	options: VariantOptions,
	metadata: MetaData,
): { rejection: PositionRejection | null; seekIcn: string | undefined } {
	// Serialize only for seeks — that's the sole consumer of the ICN here.
	const seekIcn = config.isSeekContext ? variantOptionsToICN(options, metadata) : undefined;
	const code = validatePosition(options, seekIcn);
	return { rejection: code === null ? null : { kind: 'position', code }, seekIcn };
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

/**
 * {@link playability.getRejection} under the contexts this selector is currently in.
 *
 * Outside a seek the only check that runs is whether the player to move could capture a royal,
 * which is asked of a board at its front — so a moves-applied game answers it as it stands, and
 * that game is the very one analysis goes on to load. A seek's extra checks (already game-over,
 * a player with no pieces, engine support) instead describe a FRESH game started from the
 * flattened position, so they need that board, built here and discarded.
 *
 * @param played - The flattened position, on the border the game would be played with.
 * @param movesApplied - The game the ICN's moves were applied on, when there is one.
 */
function playabilityRejection(
	played: VariantOptions,
	movesApplied?: GameFile,
): PositionRejection | null {
	const judged =
		!config.isSeekContext && movesApplied !== undefined
			? movesApplied
			: gameformulator.constructPosition(played, movesApplied?.variant, selectedSlideLimit());
	return playability.getRejection(judged, {
		seek: config.isSeekContext,
		engine: engineOnly,
	});
}

/**
 * The Slide Limit the game will be built with, read from the modifier selector beside us. It
 * rebuilds the movesets, so every construction the gate makes must carry it or judge a board
 * nobody plays on. Undefined for an engine game: `CreateEngineGameMessage` has no modifiers
 * field, so one never reaches its game however the modal is set.
 */
function selectedSlideLimit(): bigint | undefined {
	if (engineOnly) return undefined;
	return modutil.slideLimitOf(modifierselector.getGameModifiers());
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
 * @param live - Whether this is a keystroke rather than a commit. An ICN over
 * {@link MAX_ICN_CHARS_TO_VALIDATE_LIVE} is then left `unevaluated` for a commit to settle,
 * instead of stalling the keypress. A commit always reaches a verdict, however large it is.
 */
async function validateIcnInput(revealErrors: boolean, live = false): Promise<void> {
	// The From-ICN selection this run judges, and writes its verdict onto. Only it has an ICN.
	const judging = selection;
	if (judging.kind !== 'icn') return;
	const value = element_icnInput.value;
	// Deferring BEFORE the parse, and straight to `unevaluated` rather than by way of null:
	// parsing is already too slow to spend on a keypress at this size, and blanking the verdict
	// first would flick every host's validity off and back on again for each character typed.
	if (live && value.length > MAX_ICN_CHARS_TO_VALIDATE_LIVE) {
		setVerdict(judging, 'unevaluated');
		return;
	}
	// Nothing is resolved until this settles. The held verdict describes the previous value, and
	// awaiting a variant module makes that window long enough to act on — so retire it now.
	setVerdict(judging, null);
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
		return;
	}

	// Atleast the ICN is valid syntax, now let's check position, gamerules, and moves...

	// Resolved apart from building, so a result the user typed past is dropped before paying for
	// the board. The slide limit rides along because it rebuilds the movesets, and a game judged
	// without it is not the game that gets played.
	const constructionOptions = await gameformulator.resolveConstructionOptions(longFormat, {
		slideLimit: selectedSlideLimit(),
	});
	// Awaiting the variant module let the user keep typing, or pick something else — discard a
	// result they've moved past.
	if (selection !== judging || element_icnInput.value !== value) return;

	// Built through the same path the board loads by, so the gate validates the exact game that
	// will be loaded — and hands that very game over to be loaded. Built regardless of
	// play-legality, so the preview always reflects the moves — a play-illegal position
	// (e.g. king capturable) still previews faithfully once they're applied.
	let constructed: GameFile;
	try {
		constructed = gameformulator.constructGame(constructionOptions);
	} catch (e) {
		// Construction crashed — the position can't be previewed or played.
		if (revealErrors) {
			showError(element_icnInputWrap, t.shared.position_errors.moves_invalid);
			console.error("Pasted ICN's moves are invalid:", e instanceof Error ? e.message : e);
		}
		return;
	}

	// Validate the flattened position the moves lead to — the exact position a seek plays from and
	// the server re-validates, judged on the board it gets rather than the one the moves ran on.
	const played = withEngineBorder(gamecompressor.gamefileToPositionOptions(constructed));
	const metadata = clientmetadatautil.buildSourceVariantMetadata(constructed);
	const { rejection: positionRejection, seekIcn } = validateOptions(played, metadata);
	const rejection = positionRejection ?? playabilityRejection(played, constructed);

	// The moves-applied gamefile is kept either way, so a rejected position still previews.
	const isValid = rejection === null;
	if (isValid) clearError(element_icnInputWrap);
	else if (revealErrors)
		showError(element_icnInputWrap, playability.localizeRejection(t, rejection));
	setVerdict(judging, { isValid, longFormat, played, seekIcn, gamefile: constructed });
}

// Preview tooltips ------------------------------------------------------------

/** Shows the preview tooltip for the currently selected variant in the display button. */
function handleDisplayPreviewHover(anchor: HTMLElement): void {
	if (selection.kind === 'preset') {
		variantpreviewtooltip.showForVariantCode(anchor, selection.code, 'left', { engineGame: engineOnly }); // prettier-ignore
	} else if (selection.kind === 'cloud' || selection.kind === 'local') {
		handleSavePreview(anchor, selection.kind, selection.name);
	} else if (selection.kind === 'icn') {
		const hovered = selection;
		void variantpreviewtooltip.showForPosition(
			anchor,
			t.shared.variant_groups.custom.display_label,
			async () => {
				// Judged only where nothing has judged it yet; otherwise validation's own flatten
				// is reused, so no ICN is re-parsed and no board rebuilt just to draw a preview.
				if (hovered.verdict === null || hovered.verdict === 'unevaluated')
					await revalidateCustomSelection();
				// Still nothing legible to draw — show nothing rather than a lie of a position.
				if (hovered.verdict === null || hovered.verdict === 'unevaluated') return undefined;
				return hovered.verdict.played;
			},
			'left',
		);
	}
}

/**
 * Fetches a save (cloud or local) and shows the preview tooltip anchored to the given element.
 * @param anchor - Element the tooltip is positioned relative to.
 * @param kind - Which storage backend the save lives in.
 * @param positionName - Name of the position to fetch and preview.
 */
function handleSavePreview(anchor: HTMLElement, kind: StorageType, positionName: string): void {
	const { read } = SAVE_BACKENDS[kind];
	const cache = previewCaches[kind];
	void variantpreviewtooltip.showForPosition(
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

// Selection accessors ---------------------------------------------------------

/** The current selection, without its verdict — a host stores it, and a verdict isn't storable. */
function getSelection(): DisplaySelection {
	if (selection.kind === 'preset') return selection;
	if (selection.kind === 'icn') return { kind: 'icn', icn: element_icnInput.value };
	return { kind: selection.kind, name: selection.name };
}

/**
 * Whether the selection's verdict was deferred past live validation, so a commit still owes it
 * one. Lets a host settle it at the last moment instead of re-judging an already-settled position.
 */
function isVerdictDeferred(): boolean {
	return selection.kind === 'icn' && selection.verdict === 'unevaluated';
}

/**
 * Whether the current selection resolves to a legal, loadable position. An `unevaluated` one
 * counts as valid: it was too large to judge live, so it is taken on trust until a commit
 * settles it, rather than shown as broken when nothing has judged it either way.
 */
function isSelectionValid(): boolean {
	if (selection.kind === 'preset') return true;
	if (selection.verdict === null) return false;
	return selection.verdict === 'unevaluated' || selection.verdict.isValid;
}

/**
 * The current custom (non-preset) selection resolved for loading onto a board, or null if the
 * selection is a preset or not yet valid.
 *
 * A From-ICN selection hands over the very game validation built — CONSUMING it, since the board
 * mutates what it is given — alongside the parse it came from, which the loader keeps so it can
 * rebuild the pristine game later. A saved position resolves to its {@link VariantOptions},
 * deep-copied because loading writes into them and the cached original outlives the load.
 */
function getCustomPosition():
	| { kind: 'gamefile'; gamefile: GameFile; longFormat: LongFormatOut }
	| { kind: 'options'; options: VariantOptions }
	| null {
	if (selection.kind === 'preset') return null;
	if (selection.kind === 'icn') {
		const verdict = selection.verdict;
		if (verdict === null || verdict === 'unevaluated' || !verdict.isValid) return null;
		// Already handed to a board — it has been played on since, so it is no longer this position.
		const { gamefile, longFormat } = verdict;
		if (gamefile === undefined) return null;
		verdict.gamefile = undefined;
		return { kind: 'gamefile', gamefile, longFormat };
	}
	// cloud / local saved position — the resolved options are loadable as-is (no moves).
	if (!selection.verdict?.isValid) return null;
	return { kind: 'options', options: jsutil.deepCopyObject(selection.verdict.options) };
}

/**
 * Returns the current variant selection as a SeekVariant for the wire format,
 * or null if the selection is not yet valid.
 */
function getSeekVariant(): SeekVariant | null {
	if (selection.kind === 'preset') {
		return { kind: 'preset', code: selection.code };
	}
	const verdict = selection.verdict;
	if (verdict === null || verdict === 'unevaluated' || !verdict.isValid) return null;
	// Every custom selection — saved position or From-ICN — travels as the ICN string it resolves
	// to. Validation built that string to measure it against the size cap, so the exact one it
	// judged is the one sent: the flattened position, on the engine's border, carrying the
	// source-variant tags that tell the game it didn't start from a balanced position.
	if (!verdict.seekIcn) return null;
	return { kind: 'custom', position: verdict.seekIcn };
}

// Exports ---------------------------------------------------------------------

export default {
	// Initialization
	initVariantGroupDropdown,
	initIcnValidation,
	// Dropdown navigation
	closeVariantDropdown,
	onModalOpen,
	// Variant selection
	applyIcn,
	restoreSelection,
	// Remembering Committed State
	snapshotAccepted,
	restoreAcceptedDisplay,
	// Validation
	revalidateCustomSelection,
	// Selection accessors
	getSelection,
	isVerdictDeferred,
	isSelectionValid,
	getCustomPosition,
	getSeekVariant,
};
