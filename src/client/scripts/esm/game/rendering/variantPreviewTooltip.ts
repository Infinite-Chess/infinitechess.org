// src/client/scripts/esm/game/rendering/variantPreviewTooltip.ts

/**
 * Renders a floating tooltip containing a small WebGL board preview and
 * gamerule summary when the user hovers over a variant preview (eye) icon.
 * Supports both preset variant codes and custom saved positions.
 */

import type { Mesh } from '../../game/rendering/piecemodels.js';
import type { GameRules } from '../../../../../shared/chess/util/gamerules.js';
import type { VariantCode } from '../../../../../shared/chess/variants/variantregistry.js';
import type { GameruleWinCondition } from '../../../../../shared/chess/util/winconutil.js';
import type { Board, VariantOptions } from '../../../../../shared/chess/logic/gamefile.js';

import math from '../../../../../shared/util/math/math.js';
import gamefile from '../../../../../shared/chess/logic/gamefile.js';
import variantreader from '../../../../../shared/chess/variants/variantreader.js';
import variantregistry from '../../../../../shared/chess/variants/variantregistry.js';
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
import boardtiles from '../../game/rendering/boardtiles.js';
import maskedDraw from '../../webgl/maskedDraw.js';
import imagecache from '../../chess/rendering/imagecache.js';
import Renderable from '../../webgl/Renderable.js';
import piecemodels from '../../game/rendering/piecemodels.js';
import texturecache from '../../chess/rendering/texturecache.js';
import promotionlines from '../../game/rendering/promotionlines.js';
import { ProgramManager } from '../../webgl/ProgramManager.js';

// Constants ---------------------------------------------------------------

/** Horizontal gap in px between the tooltip and its anchor element. */
const TOOLTIP_OFFSET_X = 12;
/** Minimum horizontal/vertical gap in px between the tooltip and the viewport edge. */
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
): Promise<void> {
	const token = ++showToken;
	const timestamp = Date.now();
	const boardsim = gamefile.initBoard(
		variantOptions.gameRules,
		undefined,
		timestamp,
		variantOptions,
	);
	await showForBoard(anchor, name, boardsim, variantOptions.gameRules, token, false);
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
	if (token !== showToken) return; // They have since left hover, or hovered over another tooltip anchor.
	const gameRules = variantreader.getGameRulesOfVariant(mod, timestamp);
	const loadedVariant = { code, mod };
	const boardsim = gamefile.initBoard(gameRules, loadedVariant, timestamp);
	await showForBoard(anchor, variantName, boardsim, gameRules, token, true);
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
	isPreset: boolean,
): Promise<void> {
	element_name.textContent = name;
	positionTooltip(anchor);
	populateRules(gameRules, boardsim, isPreset);
	await ensureReady(boardsim);

	if (token !== showToken) return; // They have since left hover, or hovered over another tooltip anchor.
	renderBoard(boardsim, gameRules);
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

/** Populates the gamerule modifications list above the canvas. */
function populateRules(gameRules: GameRules, boardsim: Board, isPreset: boolean): void {
	const items: string[] = [];

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

	// Promotion — for preset variants, skip when promotion is defined (pieces are
	// always explicitly set and don't need enumerating); still show "No promotion"
	// when absent. For custom positions, always show the full promotion info.
	if (gameRules.promotion === undefined) {
		items.push('No promotion');
	} else if (!isPreset) {
		const pieceNames = gameRules.promotion.pieces
			.map((raw) => typeutil.getRawTypeStr(raw))
			.join(', ');
		items.push(`Promotion: ${pieceNames}`);
	}

	// Move rule — show if not default (100)
	if (gameRules.moveRule !== 100) {
		if (gameRules.moveRule === undefined) items.push('No 50-move rule');
		else items.push(`Move rule: ${gameRules.moveRule} plies.`);
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
	if (moveRuleState !== undefined) {
		items.push(`${moveRuleState} plies passed since last capture or pawn push`);
	}

	element_rules.classList.toggle('hidden', items.length === 0);
	element_rulesBody.textContent = items.map((s) => s + '.').join(' ');
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

export default {
	showForPosition,
	showForVariantCode,
	hide,
};
