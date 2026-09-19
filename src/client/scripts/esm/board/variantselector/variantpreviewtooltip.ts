// src/client/scripts/esm/board/variantselector/variantpreviewtooltip.ts

/**
 * Renders a floating tooltip containing a small WebGL board preview and
 * gamerule summary when the user hovers over a variant preview (eye) icon.
 * Supports both preset variant codes and custom saved positions.
 */

import type RenderContext from '../rendering/RenderContext.js';
import type { VariantCode } from '../../../../../shared/chess/util/variantcodes.js';
import type { BoardPreview } from '../../../../../shared/chess/logic/boardpreviewer.js';
import type { GameModifier } from '../../../../../shared/chess/util/modutil.js';
import type { VariantOptions } from '../../../../../shared/chess/logic/gamefile.js';

import {
	summarizeGameRules,
	type RuleSummaryItem,
} from '../../../../../shared/chess/variants/gamerulesummary.js';

import svgcache from '../../chess/rendering/svgcache.js';
import previewboards from '../previewboards.js';
import previewrenderer from '../rendering/previewrenderer.js';

// Types -----------------------------------------------------------------------

/** Optional extras a preview may be shown with. */
interface PreviewOptions {
	/** Gamerule modifiers active on the game, listed among its rules. */
	modifiers?: GameModifier[];
	/** Whether the engine would be the opponent. See {@link previewboards.ofPreset}. */
	engineGame?: boolean;
}

// Constants -------------------------------------------------------------------

/** Natural (max) width of the tooltip in px — must match the CSS max-width. */
const TOOLTIP_MAX_WIDTH = 400;
/** Horizontal gap in px between the tooltip and its anchor element. */
const TOOLTIP_OFFSET_X = 12;
/** Vertical gap in px between the tooltip and its anchor element (below placement). */
const TOOLTIP_OFFSET_Y = 8;

/** Minimum gap in px between the tooltip and the viewport edge. */
const EDGE_PAD = 8;

// State -----------------------------------------------------------------------

/** The tooltip's own render context, built lazily on first show. Shared by every show since. */
let previewCtx: Promise<RenderContext> | undefined;
/** Incremented on every show/hide; compared after async work to discard stale renders. */
let showToken = 0;
/** The anchor element of the currently visible tooltip, if any. */
let currentAnchor: HTMLElement | null = null;

// Hide the tooltip if its anchor is removed from the DOM — otherwise pointerleave never fires and the tooltip is stranded.
new MutationObserver(() => {
	if (currentAnchor && !currentAnchor.isConnected) hide();
}).observe(document.body, { childList: true, subtree: true });

// DOM elements created once and reused

const element_tooltip = document.createElement('div');
element_tooltip.id = 'variant-preview-tooltip';
element_tooltip.classList.add('visibility-hidden');
/**
 * Prevent the imminent release of a finger that hides the
 * tooltip from triggering a click on the items that we below it.
 */
let suppressSynthesizedEventsUntil = 0;

// Hide the tooltip on screen resize to avoid it being squished into odd positions.
window.addEventListener('resize', () => {
	if (!element_tooltip.classList.contains('visibility-hidden')) hide();
});

// On touch devices, any finger-down anywhere immediately dismisses the tooltip.
document.addEventListener(
	'touchstart',
	() => {
		if (element_tooltip.classList.contains('visibility-hidden')) return;
		hide();
		suppressSynthesizedEventsUntil = Date.now() + 200;
	},
	{ passive: true },
);

// Prevent the imminent release of a finger that hides the tooltip from triggering a click on the items that we below it.
document.addEventListener('click', eatSynthesizedEvent, { capture: true });
function eatSynthesizedEvent(e: Event): void {
	if (Date.now() < suppressSynthesizedEventsUntil) {
		e.stopPropagation();
		e.preventDefault();
	}
}

const element_name = document.createElement('div');
element_name.classList.add('preview-tooltip-name');

const element_canvas = document.createElement('canvas');
element_canvas.classList.add('preview-tooltip-canvas');

const element_rulesBody = document.createElement('span');

const element_rules = document.createElement('p');
element_rules.classList.add('preview-tooltip-rules', 'hidden');
element_rules.append(element_rulesBody);

element_tooltip.append(element_name, element_rules, element_canvas);
document.body.appendChild(element_tooltip);

// Functions -------------------------------------------------------------------

/**
 * Shows the preview tooltip for a custom position.
 * @param anchor - The element the tooltip should appear beside.
 * @param name - The display name of the saved position.
 * @param resolvePosition - Resolves the position to preview, or undefined if unavailable.
 * A resolver, not the position itself, so the show is claimed before any fetching begins —
 * a hide partway through then cancels it, instead of the tooltip surfacing after the pointer left.
 */
async function showForPosition(
	anchor: HTMLElement,
	name: string,
	resolvePosition: () => Promise<VariantOptions | undefined>,
	placement: 'left' | 'below',
	options: PreviewOptions = {},
): Promise<void> {
	const token = ++showToken;
	const variantOptions = await resolvePosition();
	if (variantOptions === undefined || token !== showToken) return; // Unavailable, or they have since left hover.
	const boardsim = previewboards.ofPosition(variantOptions);
	await showForBoard(anchor, name, boardsim, token, placement, undefined, options.modifiers);
}

/**
 * Shows the preview tooltip for a preset variant code.
 * @param anchor - The element the tooltip should appear beside.
 * @param code - The variant code (e.g. 'Classical').
 */
async function showForVariantCode(
	anchor: HTMLElement,
	code: VariantCode,
	placement: 'left' | 'below',
	options: PreviewOptions = {},
): Promise<void> {
	const token = ++showToken;
	const variantName = t.shared.variants[code];
	const boardsim = await previewboards.ofPreset(code, options.engineGame);
	if (token !== showToken) return; // They have since left hover, or hovered over another tooltip anchor.
	await showForBoard(anchor, variantName, boardsim, token, placement, code, options.modifiers);
}

/** Hides the tooltip. */
function hide(): void {
	showToken++;
	element_tooltip.classList.add('visibility-hidden');
	currentAnchor = null;
}

/** Core show logic: positions the tooltip, renders the board, populates rules. */
async function showForBoard(
	anchor: HTMLElement,
	name: string,
	boardsim: BoardPreview,
	token: number,
	placement: 'left' | 'below',
	/** Undefined for custom positions, which have no variant. */
	variantCode: VariantCode | undefined,
	modifiers: GameModifier[] | undefined,
): Promise<void> {
	element_name.textContent = name;
	await populateRules(boardsim, variantCode, modifiers);
	const ctx = await (previewCtx ??= previewrenderer.createContext(element_canvas));
	await previewrenderer.load(ctx, boardsim);

	if (token !== showToken || !anchor.isConnected) return; // They have since left hover, hovered over another tooltip anchor, or the anchor has been removed from the DOM mid-load.

	positionTooltip(ctx, anchor, placement);
	previewrenderer.render(ctx, boardsim);
	element_tooltip.classList.remove('visibility-hidden');
	currentAnchor = anchor;
}

/** Positions the tooltip relative to the anchor. */
function positionTooltip(
	ctx: RenderContext,
	anchor: HTMLElement,
	placement: 'left' | 'below',
): void {
	const rect = anchor.getBoundingClientRect();

	const preferredLeft =
		placement === 'below'
			? rect.left + rect.width / 2 - TOOLTIP_MAX_WIDTH / 2
			: rect.left - TOOLTIP_MAX_WIDTH - TOOLTIP_OFFSET_X;
	const preferredTop = placement === 'below' ? rect.bottom + TOOLTIP_OFFSET_Y : rect.top;

	// Clamp to viewport edges.
	element_tooltip.style.left = `${Math.max(preferredLeft, EDGE_PAD)}px`;
	element_tooltip.style.right = `${EDGE_PAD}px`;
	// Read natural height after horizontal constraints are applied (canvas shrinks with width via aspect-ratio).
	const tooltipH = element_tooltip.offsetHeight;
	element_tooltip.style.top = `${Math.min(preferredTop, window.innerHeight - tooltipH - EDGE_PAD)}px`;

	// Sync canvas dimensions to the potential new preview dimensions
	ctx.camera.syncCanvasDimensions();
}

/** Populates the gamerule modifications list above the canvas. */
async function populateRules(
	boardsim: BoardPreview,
	variantCode: VariantCode | undefined,
	modifiers: GameModifier[] | undefined,
): Promise<void> {
	const items = summarizeGameRules(
		boardsim.gameRules,
		boardsim.startSnapshot.state_global,
		variantCode,
		modifiers,
		t.shared,
	);

	element_rules.classList.toggle('hidden', items.length === 0);
	element_rulesBody.replaceChildren();
	for (const [i, item] of items.entries()) {
		if (i > 0) element_rulesBody.append(' ');
		if (item.kind === 'text') element_rulesBody.append(item.text);
		else {
			const promotionLine = await buildPromotionLine(item);
			element_rulesBody.appendChild(promotionLine);
		}
	}
}

/** Draws a summary's promotion line, its pieces as inline silhouette icons. */
async function buildPromotionLine(
	item: Extract<RuleSummaryItem, { kind: 'promotion' }>,
): Promise<HTMLSpanElement> {
	const span = document.createElement('span');
	span.classList.add('promotion-icons');
	span.append(item.prefix);
	for (const raw of item.pieces) span.appendChild(await svgcache.getSilhouetteSVG(raw));
	span.append(item.suffix);
	return span;
}

// Exports ---------------------------------------------------------------------

/** Returns true if the given node is inside the tooltip element. */
function containsNode(node: Node): boolean {
	return element_tooltip.contains(node);
}

/**
 * Wires the standard preview-anchor interaction onto an element:
 * mouse hover shows the tooltip, leave hides it, click (touch or mouse) shows it.
 * @param element - The anchor element to attach listeners to.
 * @param show - Called with the anchor element whenever the tooltip should be shown.
 */
function attachAnchor(element: HTMLElement, show: (anchor: HTMLElement) => void): void {
	element.addEventListener('pointerenter', (e) => {
		if (e.pointerType === 'touch') return;
		show(element);
	});
	element.addEventListener('pointerleave', (e) => {
		if (e.pointerType !== 'touch') hide();
	});
	element.addEventListener('click', (e) => {
		e.stopPropagation();
		show(element);
	});
}

export default {
	showForPosition,
	showForVariantCode,
	hide,
	containsNode,
	attachAnchor,
};
