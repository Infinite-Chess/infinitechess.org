// src/client/scripts/esm/game/rendering/variantPreviewTooltip.ts

/**
 * Renders a floating tooltip containing a small WebGL board preview and
 * gamerule summary when the user hovers over a variant eye icon.
 * Supports both preset variant codes and custom saved positions.
 */

import type { Mesh } from '../../game/rendering/piecemodels.js';
import type { GameRules } from '../../../../../shared/chess/util/gamerules.js';
import type { VariantCode } from '../../../../../shared/chess/variants/variantregistry.js';
import type { Board, VariantOptions } from '../../../../../shared/chess/logic/gamefile.js';

import math from '../../../../../shared/util/math/math.js';
import gamefile from '../../../../../shared/chess/logic/gamefile.js';
import variantreader from '../../../../../shared/chess/variants/variantreader.js';
import variantregistry from '../../../../../shared/chess/variants/variantregistry.js';
import typeutil, { players } from '../../../../../shared/chess/util/typeutil.js';
import { DEFAULT_PROMOTION_PIECES } from '../../../../../shared/chess/variants/variant_scripts/defaultPromotions.js';

import area from '../../game/rendering/area.js';
import webgl from '../../game/rendering/webgl.js';
import { gl } from '../../game/rendering/webgl.js';
import camera from '../../game/rendering/camera.js';
import meshes from '../../game/rendering/meshes.js';
import border from '../../game/rendering/border.js';
import boardpos from '../../game/rendering/boardpos.js';
import boardtiles from '../../game/rendering/boardtiles.js';
import maskedDraw from '../../webgl/maskedDraw.js';
import imagecache from '../../chess/rendering/imagecache.js';
import Renderable from '../../webgl/Renderable.js';
import piecemodels from '../../game/rendering/piecemodels.js';
import texturecache from '../../chess/rendering/texturecache.js';
import promotionlines from '../../game/rendering/promotionlines.js';
import { ProgramManager } from '../../webgl/ProgramManager.js';

// Constants ---------------------------------------------------------------

const TOOLTIP_OFFSET_X = 12; // px gap between anchor and tooltip left edge
const EDGE_PAD = 8; // minimum px gap between tooltip and any viewport edge

// State -------------------------------------------------------------------

/** Whether the WebGL context has been initialized on the preview canvas. */
let glInitialized = false;
/** Incremented on every show/hide; compared after async work to discard stale renders. */
let showToken = 0;

// DOM elements created once and reused

const element_tooltip = document.createElement('div');
element_tooltip.id = 'variant-preview-tooltip';
element_tooltip.classList.add('visibility-hidden');

const element_name = document.createElement('div');
element_name.className = 'preview-tooltip-name';

const element_canvas = document.createElement('canvas');
element_canvas.className = 'preview-tooltip-canvas';

const element_rulesHeader = document.createElement('span');
element_rulesHeader.className = 'preview-tooltip-rules-header';
element_rulesHeader.textContent = 'Modifications: ';

const element_rulesBody = document.createElement('span');

const element_rules = document.createElement('p');
element_rules.className = 'preview-tooltip-rules hidden';
element_rules.append(element_rulesHeader, element_rulesBody);

element_tooltip.append(element_name, element_rules, element_canvas);
document.body.appendChild(element_tooltip);

// Functions ---------------------------------------------------------------

/** Initializes the preview WebGL context once (idempotent). */
async function ensureGLReady(): Promise<void> {
	if (glInitialized) return;
	element_canvas.width = element_canvas.clientWidth * window.devicePixelRatio;
	element_canvas.height = element_canvas.clientHeight * window.devicePixelRatio;
	webgl.init(element_canvas);
	camera.init(element_canvas);
	const programManager = new ProgramManager(gl);
	Renderable.init(gl, programManager);
	maskedDraw.init(programManager);
	await boardtiles.init();
	glInitialized = true;
}

/**
 * Shows the preview tooltip for a custom saved position (local or cloud with known variantOptions).
 * @param anchor - The element the tooltip should appear beside.
 * @param name - The display name of the saved position.
 * @param variantOptions - The position and gamerules to preview.
 */
async function show(
	anchor: HTMLElement,
	name: string,
	variantOptions: VariantOptions,
): Promise<void> {
	const token = ++showToken;
	const timestamp = Date.now();
	const boardsim = gamefile.initBoard(
		variantOptions.gameRules,
		undefined,
		timestamp,
		variantOptions,
	);
	await showForBoard(anchor, name, boardsim, variantOptions.gameRules, token);
}

/**
 * Shows the preview tooltip for a preset variant code.
 * @param anchor - The element the tooltip should appear beside.
 * @param code - The variant code (e.g. 'Classical').
 */
async function showForVariantCode(anchor: HTMLElement, code: VariantCode): Promise<void> {
	const token = ++showToken;
	const timestamp = Date.now();
	const variantName = variantregistry.getVariantName(code);
	const mod = await variantregistry.getVariantLoader(code)();
	if (token !== showToken) return;
	const gameRules = variantreader.getGameRulesOfVariant(mod, timestamp);
	const loadedVariant = { code, mod };
	const boardsim = gamefile.initBoard(gameRules, loadedVariant, timestamp);
	await showForBoard(anchor, variantName, boardsim, gameRules, token);
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
	boardsim: Board,
	gameRules: GameRules,
	token: number,
): Promise<void> {
	element_name.textContent = name;
	positionTooltip(anchor);
	populateRules(gameRules);
	await ensureReady(boardsim);

	if (token !== showToken) return;
	try {
		renderBoard(boardsim, gameRules);
	} catch (e) {
		console.error('Preview render failed:', e);
	}
	element_tooltip.classList.remove('visibility-hidden');
}

/** Positions the tooltip to the left of the anchor, clamped to all viewport edges. */
function positionTooltip(anchor: HTMLElement): void {
	const rect = anchor.getBoundingClientRect();
	const tooltipW = element_tooltip.offsetWidth;
	const tooltipH = element_tooltip.offsetHeight;

	const left = math.clamp(
		rect.left - tooltipW - TOOLTIP_OFFSET_X,
		EDGE_PAD,
		window.innerWidth - tooltipW - EDGE_PAD,
	);
	const top = math.clamp(rect.top, EDGE_PAD, window.innerHeight - tooltipH - EDGE_PAD);

	element_tooltip.style.left = `${left}px`;
	element_tooltip.style.top = `${top}px`;
}

/** Initializes WebGL once and loads any not-yet-cached images and textures for the board. */
async function ensureReady(boardsim: Board): Promise<void> {
	await ensureGLReady();
	await imagecache.initImagesForGame(boardsim);
	await texturecache.initTexturesForGame(gl, boardsim);
}

/** Renders the board to the preview canvas. */
function renderBoard(boardsim: Board, gameRules: GameRules): void {
	const mesh: Mesh = { offset: [0n, 0n], inverted: false, types: {} };
	piecemodels.regenAll(boardsim, mesh);

	const startBox = boardsim.startSnapshot.box;
	const boxFloating = meshes.expandTileBoundingBoxToEncompassWholeSquare(startBox);
	const centerArea = area.calculateFromUnpaddedBox(boxFloating);

	boardpos.setBoardPos(centerArea.coords);
	boardpos.setBoardScale(centerArea.scale);
	boardtiles.recalcVariables();

	webgl.clearScreen();
	maskedDraw.execute(
		() => border.drawPlayableRegionMask(gameRules.worldBorder), // INCLUSION MASK: playable region
		() => piecemodels.renderVoids(mesh), // EXCLUSION MASK: voids
		() => {
			boardtiles.render();
			promotionlines.render(gameRules.promotion, startBox);
		},
		'and',
	);
	piecemodels.renderAll(boardsim, mesh);
}

/** Populates the gamerule list below the canvas. */
function populateRules(gameRules: GameRules): void {
	const items: string[] = [];

	// Win conditions — show if not all checkmate
	const allCheckmate = Object.values(gameRules.winConditions).every(
		(conds) => conds.length === 1 && conds[0] === 'checkmate',
	);
	if (!allCheckmate) {
		const condSet = new Set<string>();
		Object.values(gameRules.winConditions).forEach((conds) =>
			conds.forEach((c) => condSet.add(c)),
		);
		items.push(`Win: ${[...condSet].join(', ')}`);
	}

	// Turn order — show if not standard [White, Black]
	const defaultTurnOrder = [players.WHITE, players.BLACK];
	const turnOrderIsDefault =
		gameRules.turnOrder.length === defaultTurnOrder.length &&
		gameRules.turnOrder.every((p, i) => p === defaultTurnOrder[i]);
	if (!turnOrderIsDefault) {
		const order = gameRules.turnOrder.map((p) => (p === players.WHITE ? 'W' : 'B')).join(', ');
		items.push(`Turn order: ${order}`);
	}

	// Promotion — show if absent or pieces differ from default
	if (gameRules.promotion === undefined) {
		items.push('No promotion');
	} else {
		const piecesAreDefault =
			gameRules.promotion.pieces.length === DEFAULT_PROMOTION_PIECES.length &&
			gameRules.promotion.pieces.every((p, i) => p === DEFAULT_PROMOTION_PIECES[i]);
		if (!piecesAreDefault) {
			const pieceNames = gameRules.promotion.pieces
				.map((raw) => typeutil.getRawTypeStr(raw))
				.join(', ');
			items.push(`Promotion: ${pieceNames}`);
		}
	}

	// Move rule — show if not default (100)
	if (gameRules.moveRule !== 100) {
		if (gameRules.moveRule === undefined) items.push('No move rule');
		else items.push(`Move rule: ${gameRules.moveRule}`);
	}

	// Slide limit — show if set
	if (gameRules.slideLimit !== undefined) {
		items.push(`Slide limit: ${gameRules.slideLimit}`);
	}

	element_rules.classList.toggle('hidden', items.length === 0);
	element_rulesBody.textContent = items.map((s) => s + '.').join(' ');
}

// Exports -----------------------------------------------------------------

export default {
	show,
	showForVariantCode,
	hide,
};
