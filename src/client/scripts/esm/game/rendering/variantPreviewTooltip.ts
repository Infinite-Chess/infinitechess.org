// src/client/scripts/esm/game/rendering/variantPreviewTooltip.ts

/**
 * Renders a floating tooltip containing a small WebGL board preview and
 * gamerule summary when the user hovers over a variant preview (eye) icon.
 * Supports both preset variant codes and custom saved positions.
 */

import type { Mesh } from '../../game/rendering/piecemodels.js';
import type { GameRules } from '../../../../../shared/chess/util/gamerules.js';
import type { VariantCode } from '../../../../../shared/chess/variants/variantregistry.js';
import type { BoardPreview } from '../../../../../shared/chess/logic/boardpreviewer.js';
import type { GameruleWinCondition } from '../../../../../shared/chess/util/winconutil.js';
import type { LoadedVariant, VariantOptions } from '../../../../../shared/chess/logic/gamefile.js';

import boardutil from '../../../../../shared/chess/util/boardutil.js';
import variantcache from '../../../../../shared/chess/variants/variantcache.js';
import boardpreviewer from '../../../../../shared/chess/logic/boardpreviewer.js';
import variantregistry from '../../../../../shared/chess/variants/variantregistry.js';
import variantpreviewer from '../../../../../shared/chess/variants/variantpreviewer.js';
import typeutil, {
	ext_inverted,
	Player,
	players,
} from '../../../../../shared/chess/util/typeutil.js';

import area from '../../game/rendering/area.js';
import webgl from '../../game/rendering/webgl.js';
import camera from '../../game/rendering/camera.js';
import meshes from '../../game/rendering/meshes.js';
import border from '../../game/rendering/border.js';
import boardpos from '../../game/rendering/boardpos.js';
import svgcache from '../../chess/rendering/svgcache.js';
import boardtiles from '../../game/rendering/boardtiles.js';
import maskedDraw from '../../webgl/maskedDraw.js';
import imagecache from '../../chess/rendering/imagecache.js';
import Renderable from '../../webgl/Renderable.js';
import piecemodels from '../../game/rendering/piecemodels.js';
import texturecache from '../../chess/rendering/texturecache.js';
import promotionlines from '../../game/rendering/promotionlines.js';
import miniimagerenderer from '../../game/rendering/miniimagerenderer.js';
import { ProgramManager } from '../../webgl/ProgramManager.js';

// Constants ---------------------------------------------------------------

/** Size of mini image icons in the preview tooltip, in virtual pixels. */
const PREVIEW_ENTITY_WIDTH_VPIXELS = 20;

/** Natural (max) width of the tooltip in px — must match the CSS max-width. */

const TOOLTIP_MAX_WIDTH = 400;
/** Horizontal gap in px between the tooltip and its anchor element. */
const TOOLTIP_OFFSET_X = 12;
/** Vertical gap in px between the tooltip and its anchor element (below placement). */
const TOOLTIP_OFFSET_Y = 8;

/** Minimum gap in px between the tooltip and the viewport edge. */
const EDGE_PAD = 8;

/** Human-readable labels for known non-checkmate win conditions. */
const WIN_CONDITION_LABELS: Partial<Record<GameruleWinCondition, string>> = {
	royalcapture: 'royal capture',
	allroyalscaptured: 'capturing all royals',
	allpiecescaptured: 'capturing all pieces',
	koth: 'reaching the center',
};

// State -------------------------------------------------------------------

/** Whether the WebGL context has been initialized on the preview canvas. */
let glInitialized = false;
/** Incremented on every show/hide; compared after async work to discard stale renders. */
let showToken = 0;

// DOM elements created once and reused

const element_tooltip = document.createElement('div');
element_tooltip.id = 'variant-preview-tooltip';
element_tooltip.classList.add('visibility-hidden');
/**
 * Prevent the imminent release of a finger that hides the
 * tooltip from triggering a click on the items that we below it.
 */
let suppressSynthesizedEventsUntil = 0;

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
element_name.className = 'preview-tooltip-name';

const element_canvas = document.createElement('canvas');
element_canvas.className = 'preview-tooltip-canvas';

const element_rulesBody = document.createElement('span');

const element_rules = document.createElement('p');
element_rules.className = 'preview-tooltip-rules hidden';
element_rules.append(element_rulesBody);

element_tooltip.append(element_name, element_rules, element_canvas);
document.body.appendChild(element_tooltip);

// State ----------------------------------------------------------------

/** The WebGL context for the preview canvas. */
let gl: WebGL2RenderingContext;

// Functions ---------------------------------------------------------------

/** Initializes the preview WebGL context once (idempotent). */
async function ensureGLReady(): Promise<void> {
	if (glInitialized) return;
	gl = webgl.init(element_canvas);
	camera.init(gl, element_canvas);
	const programManager = new ProgramManager(gl);
	Renderable.init(gl, programManager);
	maskedDraw.init(programManager);
	await boardtiles.init();
	glInitialized = true;
}

/**
 * Shows the preview tooltip for a custom position (from variantOptions).
 * @param anchor - The element the tooltip should appear beside.
 * @param name - The display name of the saved position.
 * @param variantOptions - The position and gamerules to preview.
 */
async function showForPosition(
	anchor: HTMLElement,
	name: string,
	variantOptions: VariantOptions,
	placement: 'left' | 'below' = 'left',
): Promise<void> {
	const token = ++showToken;
	const boardsim = boardpreviewer.initBoardPreview(
		variantOptions.gameRules,
		undefined,
		variantOptions,
	);
	await showForBoard(anchor, name, boardsim, variantOptions.gameRules, token, false, placement);
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
): Promise<void> {
	const token = ++showToken;
	const variantName = variantregistry.getVariantName(code);
	await variantcache.ensureVariantLoaded(code);
	if (token !== showToken) return; // They have since left hover, or hovered over another tooltip anchor.
	const loadedVariant: LoadedVariant = {
		code,
		mod: variantcache.getModule(code),
		dateTimestamp: Date.now(),
	};
	const gameRules = variantpreviewer.getGameRulesOfVariant(loadedVariant);
	const boardsim = boardpreviewer.initBoardPreview(gameRules, loadedVariant);
	await showForBoard(anchor, variantName, boardsim, gameRules, token, true, placement, code);
}

/** Hides the tooltip. */
function hide(): void {
	showToken++;
	element_tooltip.classList.add('visibility-hidden');
}

/** Core show logic: positions the tooltip, renders the board, populates rules. */
async function showForBoard(
	anchor: HTMLElement,
	name: string,
	boardsim: BoardPreview,
	gameRules: GameRules,
	token: number,
	isPreset: boolean,
	placement: 'left' | 'below',
	variantCode?: VariantCode,
): Promise<void> {
	element_name.textContent = name;
	await populateRules(gameRules, boardsim, isPreset, variantCode);
	await ensureReady(boardsim);

	if (token !== showToken) return; // They have since left hover, or hovered over another tooltip anchor.

	positionTooltip(anchor, placement);
	renderBoard(boardsim, gameRules);
	element_tooltip.classList.remove('visibility-hidden');
}

/** Positions the tooltip relative to the anchor. */
function positionTooltip(anchor: HTMLElement, placement: 'left' | 'below'): void {
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
	camera.syncCanvasDimensions();
}

/** Initializes WebGL once and loads any not-yet-cached images and textures for the board. */
async function ensureReady(boardsim: BoardPreview): Promise<void> {
	await ensureGLReady();
	await imagecache.initImagesForGame(boardsim);
	await texturecache.initTexturesForGame(gl, boardsim);
}

/** Renders the board to the preview canvas. */
function renderBoard(boardsim: BoardPreview, gameRules: GameRules): void {
	const mesh: Mesh = { offset: [0n, 0n], inverted: false, types: {} };
	piecemodels.regenAll(boardsim, mesh);

	const startBox = boardsim.startSnapshot.box;
	const boxFloating = meshes.expandTileBoundingBoxToEncompassWholeSquare(startBox);
	const centerArea = area.calculateFromUnpaddedBox(boxFloating);

	boardpos.setBoardPos(centerArea.coords);
	boardpos.setBoardScale(centerArea.scale);
	boardtiles.recalcVariables();

	webgl.clearScreen();

	// Render board and promotion lines
	maskedDraw.execute(
		() => border.drawPlayableRegionMask(gameRules.worldBorder), // INCLUSION MASK: playable region
		() => piecemodels.renderVoids(mesh), // EXCLUSION MASK: voids
		() => {
			boardtiles.render();
			promotionlines.render(gameRules.promotion, startBox);
		},
		'and',
	);
	// Render pieces
	if (
		!boardpos.areZoomedOut() ||
		boardutil.getPieceCountOfGame(boardsim.pieces) >
			miniimagerenderer.pieceCountToDisableMiniImages
	) {
		piecemodels.renderAll(boardsim, mesh);
	} else {
		const instanceData = miniimagerenderer.buildInstanceData(boardsim);
		miniimagerenderer.render(boardsim.existingTypes, instanceData, {}, false, PREVIEW_ENTITY_WIDTH_VPIXELS); // prettier-ignore
	}
}

/** Populates the gamerule modifications list above the canvas. */
async function populateRules(
	gameRules: GameRules,
	boardsim: BoardPreview,
	isPreset: boolean,
	variantCode?: VariantCode,
): Promise<void> {
	const items: Array<string | HTMLElement> = [];

	// 4D movement — first
	if (variantCode !== undefined && variantregistry.getVariantGroup(variantCode) === '4D') {
		items.push('Pieces travel four-dimensionally');
	}

	// Turn order — show if not standard [White, Black]
	const defaultTurnOrder = [players.WHITE, players.BLACK];
	const blackFirstTurnOrder = [players.BLACK, players.WHITE];
	const turnOrderIsDefault = matchesTurnOrder(gameRules, defaultTurnOrder);
	if (!turnOrderIsDefault) {
		const isBlackFirst = matchesTurnOrder(gameRules, blackFirstTurnOrder);
		if (isBlackFirst) {
			items.push('Black moves first');
		} else {
			const order = gameRules.turnOrder.map((p) => ext_inverted[p]).join(', ');
			items.push(`Turn order: ${order}`);
		}
	}

	// Win conditions — show if not all checkmate
	const allCheckmate = Object.values(gameRules.winConditions).every(
		(conds) => conds.length === 1 && conds[0] === 'checkmate',
	);
	if (!allCheckmate) {
		const playerCount = Object.keys(gameRules.winConditions).length;
		// Map each non-checkmate win condition to the list of players that have it
		const condToPlayers = new Map<GameruleWinCondition, Player[]>();
		for (const [playerStr, conds] of Object.entries(gameRules.winConditions)) {
			const player = Number(playerStr) as Player;
			for (const cond of conds) {
				if (!condToPlayers.has(cond)) condToPlayers.set(cond, []);
				condToPlayers.get(cond)!.push(player);
			}
		}
		for (const [cond, condPlayers] of condToPlayers) {
			const label = formatWinCondition(cond);
			if (condPlayers.length === playerCount) {
				// All players share this win condition
				items.push(`Win by ${label}`);
			} else {
				// Only specific players have this win condition
				for (const player of condPlayers) {
					const color = typeutil.strcolors[player];
					const colorStr = color.charAt(0).toUpperCase() + color.slice(1); // Capitalize first letter
					items.push(`${colorStr} wins by ${label}`);
				}
			}
		}
	}

	// Promotion — for preset variants, skip when promotion is defined (pieces are
	// always explicitly set and don't need enumerating); still show "No promotion"
	// when absent. For custom positions, always show the full promotion info.
	if (gameRules.promotion === undefined) {
		items.push('No promotion');
	} else if (!isPreset) {
		const span = document.createElement('span');
		span.className = 'preview-tooltip-promotion-icons';
		span.append('Promotion: '); // Use a non-breaking space to ensure spacing between the label and icons.
		for (const raw of gameRules.promotion.pieces) {
			const silhouetteSVG = await svgcache.getSilhouetteSVG(raw);
			span.appendChild(silhouetteSVG);
		}
		items.push(span);
	}

	// Move rule — show if not default (100)
	if (gameRules.moveRule !== 100) {
		if (gameRules.moveRule === undefined) items.push('No 50-move rule');
		else items.push(`Move rule: ${gameRules.moveRule} plies`);
	}

	// Slide limit — show if set
	if (gameRules.slideLimit !== undefined) {
		items.push(`Slide limit: ${gameRules.slideLimit}`);
	}

	// Game state: enpassant square
	const { enpassant, moveRuleState } = boardsim.startSnapshot.state_global;
	if (enpassant !== undefined) {
		const [x, y] = enpassant.square;
		items.push(`En passant square: (${x},${y})`);
	}

	// Game state: move rule counter
	if (moveRuleState !== undefined && moveRuleState !== 0) {
		items.push(`${moveRuleState} plies passed since last capture or pawn push`);
	}

	element_rules.classList.toggle('hidden', items.length === 0);
	element_rulesBody.replaceChildren();
	items.forEach((item, i) => {
		const suffix = i < items.length - 1 ? '. ' : '.';
		if (typeof item === 'string') {
			element_rulesBody.append(item + suffix);
		} else {
			element_rulesBody.appendChild(item);
			element_rulesBody.append(suffix);
		}
	});
}

/** Returns a human-readable label for a win condition code. */
function formatWinCondition(cond: GameruleWinCondition): string {
	return WIN_CONDITION_LABELS[cond] ?? cond;
}

/** Whether the turn order in gameRules matches the given order. */
function matchesTurnOrder(gameRules: GameRules, order: Player[]): boolean {
	return (
		gameRules.turnOrder.length === order.length &&
		gameRules.turnOrder.every((p, i) => p === order[i])
	);
}

// Exports -----------------------------------------------------------------

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
