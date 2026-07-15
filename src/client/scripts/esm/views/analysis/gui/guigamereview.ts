// src/client/scripts/esm/views/analysis/gui/guigamereview.ts

/**
 * Game review UI for the analysis page. Owns:
 *
 * * the two-column per-player stats (accuracy, lapses, acpl) that replace the
 *   participant rows + result banner there, filling in live as the review runs;
 * * the progress bar below the moves list, swapped for the clickable eval graph
 *   when the review completes.
 *
 * The move list's per-ply glyphs are guimovetree's job (it owns that DOM).
 */

import type { Player } from '../../../../../../shared/chess/util/typeutil.js';
import type { ClassificationKey } from '../gamereview.js';

import math from '../../../../../../shared/util/math/math.js';
import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter.js';
import { players as p } from '../../../../../../shared/chess/util/typeutil.js';

import toast from '../../../components/toast.js';
import docutil from '../../../util/docutil.js';
import movetree from '../movetree.js';
import gameslot from '../../../game/chess/gameslot.js';
import gamereview from '../gamereview.js';
import guimovetree from './guimovetree.js';
import { GameBus } from '../../../game/GameBus.js';
import gamesession from '../../../game/chess/gamesession.js';

// Elements ---------------------------------------------------------------------------

const element_Stats = document.getElementById('review-stats');
const element_Progress = document.getElementById('review-progress');
const element_ProgressFill = document.getElementById('review-progress-fill');
const element_ProgressText = document.getElementById('review-progress-text');
const element_Graph = document.getElementById('review-graph');
const element_GraphCanvas = document.getElementById('review-graph-canvas') as HTMLCanvasElement | null; // prettier-ignore
const element_GraphTooltip = document.getElementById('review-graph-tooltip');
const element_GraphTooltipMove = document.getElementById('review-graph-tooltip-move');
const element_GraphTooltipEval = document.getElementById('review-graph-tooltip-eval');
const element_PhaseMarkers = document.getElementById('review-phase-markers');

/** The stat value cells per player, rebuilt when the stats columns are created. */
const statCells: { [player: number]: Partial<Record<StatKey, HTMLElement>> } = {};

type StatKey = 'accuracy' | 'inaccuracy' | 'mistake' | 'blunder' | 'acpl';

/** Classifications treated as "lapses": clickable stat rows, and dotted on the eval graph. */
const LAPSE_KEYS = ['inaccuracy', 'mistake', 'blunder'] as const satisfies readonly ClassificationKey[]; // prettier-ignore
type LapseKey = (typeof LAPSE_KEYS)[number];
function isLapseKey(key: string): key is LapseKey {
	return (LAPSE_KEYS as readonly string[]).includes(key);
}

/** The rows each player's stats column shows, in order. */
const STAT_ROWS: { key: StatKey; label: string }[] = [
	{ key: 'inaccuracy', label: 'Inaccuracies' },
	{ key: 'mistake', label: 'Mistakes' },
	{ key: 'blunder', label: 'Blunders' },
	{ key: 'acpl', label: 'Avg. cp loss' },
];

// Initialization -----------------------------------------------------------------------

/** Wires the game review UI and honors `/analysis/:id?review=1`. */
function init(): void {
	gamereview.onProgress(() => {
		updateProgress();
		updateStats();
		if (isGraphVisible()) drawGraph();
	});
	gamereview.onClassified((review) => {
		updateStats();
		if (review.classification === 'blunder') guimovetree.addBlunderVariation(review);
		if (isGraphVisible()) drawGraph();
	});
	gamereview.onFinished(onReviewFinished);

	window.addEventListener('resize', () => {
		if (isGraphVisible()) drawGraph();
	});
	// The eval line's color is read from the canvas's CSS `color` at draw time, so a light/dark
	// switch needs an explicit redraw — nothing else touches the graph until the next interaction.
	// 'theme-change' is the BOARD tile color event; the site-wide light/dark switch fires
	// 'color-scheme-change' instead (see appearancedropdown.ts).
	document.addEventListener('color-scheme-change', () => {
		if (isGraphVisible()) drawGraph();
	});
	GameBus.addEventListener('view-move', () => {
		if (isGraphVisible()) drawGraph();
	});
	if (element_GraphCanvas) initGraphInteraction(element_GraphCanvas);

	if (docutil.getQueryParam('review') === '1') {
		GameBus.addEventListener('game-loaded', () => startRequestedReview(), { once: true });
	}
}

function startRequestedReview(attempt = 0): void {
	// `game-loaded` is logical; wait for the graphical load to finish before replacing
	// sidebar DOM or generating variations. Give up silently if the page load failed.
	if (gamesession.isLoading()) {
		if (attempt < 200) setTimeout(() => startRequestedReview(attempt + 1), 50);
		return;
	}
	if (!gamereview.canStart()) return;

	gamereview.start();

	buildStatsColumns();
	if (gamereview.getStatus() === 'running') element_Progress?.classList.remove('hidden');
	element_Graph?.classList.remove('hidden');
	element_PhaseMarkers?.replaceChildren();
	updateProgress();
	updateStats();
	drawGraph();
}

// Progress --------------------------------------------------------------------------------

function updateProgress(): void {
	if (!element_Progress || element_Progress.classList.contains('hidden')) return;
	const { evaluated, total, depth } = gamereview.getSummary();
	const pct = total > 0 ? (evaluated / total) * 100 : 0;
	element_ProgressFill!.style.width = `${pct}%`;
	element_ProgressText!.textContent = `Evaluating position ${Math.min(evaluated + 1, total)} of ${total} · depth ${depth}`;
}

function onReviewFinished(): void {
	const status = gamereview.getStatus();
	element_Progress?.classList.add('hidden');

	if (status === 'done') {
		drawGraph();
		updateStats();
	} else if (status === 'failed') {
		toast.show('Game review failed. Please try again.', { error: true });
	}
}

// Stats columns ------------------------------------------------------------------------------

/**
 * Swaps the meta panel's participant rows + result banner for the two-column
 * per-player stats. The existing `.meta-player` rows (side dot + username embed)
 * move in as the column headers, so nothing is duplicated.
 */
function buildStatsColumns(): void {
	if (!element_Stats || !element_Stats.classList.contains('hidden')) return;

	const metaPlayers = document.querySelector('.game-meta .meta-players');
	const resultBanner = document.querySelector('.game-meta .result-banner');
	const playerRows = [...(metaPlayers?.querySelectorAll('.meta-player') ?? [])];

	for (const [column, color] of [
		[0, p.WHITE],
		[1, p.BLACK],
	] as const) {
		const col = document.createElement('div');
		col.classList.add('review-stats-col');

		// The player row becomes the column header.
		const header = playerRows[column];
		if (header) col.append(header);

		const accuracy = document.createElement('div');
		accuracy.classList.add('review-accuracy');
		const accuracyValue = document.createElement('span');
		accuracyValue.classList.add('review-accuracy-value');
		accuracyValue.textContent = '—';
		const accuracyLabel = document.createElement('span');
		accuracyLabel.classList.add('review-stat-label');
		accuracyLabel.textContent = 'Accuracy';
		accuracy.append(accuracyValue, accuracyLabel);
		col.append(accuracy);

		statCells[color] = { accuracy: accuracyValue };

		for (const row of STAT_ROWS) {
			const line = document.createElement('div');
			line.classList.add('review-stat-row');
			if (isLapseKey(row.key)) {
				const classification = row.key;
				line.classList.add('review-stat-action');
				line.classList.add('unselectable');
				line.tabIndex = 0;
				line.role = 'button';
				line.title = `Go to next ${row.label.toLowerCase()}`;
				line.addEventListener('click', () => cycleToLapse(color, classification));
				line.addEventListener('keydown', (event) => {
					if (event.key !== 'Enter' && event.key !== ' ') return;
					event.preventDefault();
					cycleToLapse(color, classification);
				});
			}
			const value = document.createElement('span');
			value.classList.add('review-stat-value', `review-stat-${row.key}`);
			value.textContent = '0';
			const label = document.createElement('span');
			label.classList.add('review-stat-label');
			label.textContent = row.label;
			line.append(value, label);
			col.append(line);
			statCells[color]![row.key] = value;
		}

		element_Stats.append(col);
	}

	metaPlayers?.classList.add('hidden');
	resultBanner?.classList.add('hidden');
	element_Stats.classList.remove('hidden');
}

/** Cycles to the next matching lapse after the currently viewed ply, wrapping around. */
function cycleToLapse(color: Player, classification: LapseKey): void {
	const matches = gamereview
		.getReviews()
		.filter((review) => review.color === color && review.classification === classification);
	if (matches.length === 0) return;
	const currentPly = gameslot.getGamefile()?.state.local.moveIndex ?? -1;
	const target = matches.find((review) => review.ply > currentPly) ?? matches[0]!;
	const node = gamereview.getMainlineNodes()[target.ply];
	if (node) guimovetree.navigateToNode(node);
}

/** Repaints both players' stat values from the review's current standing. */
function updateStats(): void {
	if (!element_Stats || element_Stats.classList.contains('hidden')) return;
	const { summaries } = gamereview.getSummary();

	for (const color of [p.WHITE, p.BLACK]) {
		const cells = statCells[color];
		const summary = summaries[color];
		if (!cells || !summary) continue;
		cells.accuracy!.textContent = `${summary.accuracy.toFixed(1)}%`;
		cells.inaccuracy!.textContent = String(summary.counts.inaccuracy);
		cells.mistake!.textContent = String(summary.counts.mistake);
		cells.blunder!.textContent = String(summary.counts.blunder);
		cells.acpl!.textContent = String(Math.round(summary.acpl));
	}
}

// Eval graph ------------------------------------------------------------------------------------

/** Vertical cp range the graph displays; evals are clamped into it. */
const GRAPH_CP_RANGE = 600;
const GRAPH_TOP_PADDING = 24;
const GRAPH_BOTTOM_PADDING = 4;
/** Vertical clearance the tooltip keeps from the graph's top/bottom edges when auto-positioning. */
const TOOLTIP_TOP_MARGIN = 10;
const TOOLTIP_BOTTOM_MARGIN = 6;

let hoveredPosition: number | undefined;

function isGraphVisible(): boolean {
	return element_Graph !== null && !element_Graph.classList.contains('hidden');
}

/** Whether the currently viewed position is on the mainline (not inside a variation). */
function isViewingMainline(): boolean {
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return false;
	const node = movetree.getCurrentNode(gamefile);
	return node !== undefined && movetree.isMainLine(node);
}

/** The x pixel of position `index` (after `index` plies). */
function graphX(index: number, width: number, totalPositions: number): number {
	return (index / Math.max(1, totalPositions - 1)) * width;
}

/** The y pixel of a white-POV cp. */
function graphY(cp: number, height: number): number {
	const normalized = math.clamp(cp, -GRAPH_CP_RANGE, GRAPH_CP_RANGE) / GRAPH_CP_RANGE;
	const plotHeight = height - GRAPH_TOP_PADDING - GRAPH_BOTTOM_PADDING;
	return GRAPH_TOP_PADDING + plotHeight / 2 - normalized * (plotHeight / 2 - 3);
}

/** Draws the white-POV eval line, phase/current/hover lines, and lapse dots. */
function drawGraph(): void {
	const canvas = element_GraphCanvas;
	if (!canvas || !element_Graph) return;

	const dpr = window.devicePixelRatio || 1;
	const width = element_Graph.clientWidth;
	const height = element_Graph.clientHeight;
	if (width <= 0 || height <= 0) return;
	canvas.width = width * dpr;
	canvas.height = height * dpr;
	canvas.style.height = `${height}px`;
	const ctx = canvas.getContext('2d')!;
	ctx.scale(dpr, dpr);

	const styles = getComputedStyle(canvas);
	const lineColor = styles.color; // The canvas's CSS `color` — theme-aware.

	const total = gamereview.getMainlineNodes().length + 1;
	const points: { index: number; cp: number }[] = [];
	for (let i = 0; i < total; i++) {
		const cp = gamereview.getWhiteCpAt(i);
		if (cp !== undefined) points.push({ index: i, cp });
	}
	const segments: (typeof points)[] = [];
	for (const point of points) {
		const last = segments[segments.length - 1];
		if (!last || point.index !== last[last.length - 1]!.index + 1) segments.push([point]);
		else last.push(point);
	}

	// Advantage fills: white above the zero line, black below.
	if (points.length > 0) {
		for (const [clampFn, fill] of [
			[Math.max, 'rgba(255, 255, 255, 0.45)'],
			[Math.min, 'rgba(0, 0, 0, 0.4)'],
		] as const) {
			ctx.fillStyle = fill;
			for (const segment of segments) {
				ctx.beginPath();
				ctx.moveTo(graphX(segment[0]!.index, width, total), graphY(0, height));
				for (const point of segment)
					ctx.lineTo(
						graphX(point.index, width, total),
						graphY(clampFn(0, point.cp), height),
					);
				ctx.lineTo(
					graphX(segment[segment.length - 1]!.index, width, total),
					graphY(0, height),
				);
				ctx.closePath();
				ctx.fill();
			}
		}
	}

	// Zero line.
	ctx.strokeStyle = styles.getPropertyValue('--c-border-muted') || 'rgba(128,128,128,0.4)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(0, graphY(0, height));
	ctx.lineTo(width, graphY(0, height));
	ctx.stroke();

	renderPhaseMarkers(total);

	// The eval line itself, one disconnected subpath per contiguous segment.
	ctx.strokeStyle = lineColor;
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	for (const segment of segments) {
		segment.forEach((point, i) => {
			const x = graphX(point.index, width, total);
			const y = graphY(point.cp, height);
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		});
	}
	ctx.stroke();
	// Isolated positions have no neighbor to draw a line to; mark them with a dot.
	for (const segment of segments) {
		if (segment.length !== 1) continue;
		ctx.beginPath();
		ctx.arc(
			graphX(segment[0]!.index, width, total),
			graphY(segment[0]!.cp, height),
			2,
			0,
			Math.PI * 2,
		);
		ctx.fillStyle = lineColor;
		ctx.fill();
	}

	// Lapse dots, at the position after the classified move.
	for (const review of gamereview.getReviews()) {
		if (!review.classification || !isLapseKey(review.classification)) continue;
		const cp = gamereview.getWhiteCpAt(review.ply + 1);
		if (cp === undefined) continue;
		ctx.beginPath();
		ctx.arc(graphX(review.ply + 1, width, total), graphY(cp, height), 3, 0, Math.PI * 2);
		ctx.fillStyle = styles.getPropertyValue(`--review-${review.classification}`) || '#ca3431';
		ctx.fill();
	}

	// A variation ply shares its parent's global moveIndex numbering with whatever mainline
	// ply sits at that same depth, but it isn't a position the graph/review has any data for
	// — only show the marker while actually viewing the mainline.
	const selected = isViewingMainline() ? gameslot.getGamefile()!.state.local.moveIndex + 1 : -1;
	drawPositionMarker(ctx, selected, width, height, total, 'rgba(160, 160, 160, 0.65)', 1);
	if (hoveredPosition !== undefined) {
		drawPositionMarker(ctx, hoveredPosition, width, height, total, lineColor, 1);
		const cp = gamereview.getWhiteCpAt(hoveredPosition);
		if (cp !== undefined) {
			ctx.beginPath();
			ctx.arc(graphX(hoveredPosition, width, total), graphY(cp, height), 4, 0, Math.PI * 2);
			ctx.fillStyle = lineColor;
			ctx.fill();
		}
	}
}

/** Lila-style opening/middlegame/endgame boundaries and vertical labels. */
function renderPhaseMarkers(total: number): void {
	if (!element_PhaseMarkers || element_PhaseMarkers.childElementCount > 0) return;
	const { middle, end } = gamereview.getDivision();
	const lines: { index: number; label: string }[] = [{ index: 0, label: 'Opening' }];
	if (middle !== undefined) lines.push({ index: middle, label: 'Middlegame' });
	if (end !== undefined) lines.push({ index: end, label: 'Endgame' });

	for (const line of lines) {
		const marker = document.createElement('div');
		marker.classList.add('review-phase-marker');
		marker.style.left = `${(line.index / Math.max(1, total - 1)) * 100}%`;
		const label = document.createElement('span');
		label.textContent = line.label;
		marker.append(label);
		element_PhaseMarkers.append(marker);
	}
}

function drawPositionMarker(
	ctx: CanvasRenderingContext2D,
	index: number,
	width: number,
	height: number,
	total: number,
	color: string,
	lineWidth: number,
): void {
	if (index < 0 || index >= total) return;
	const x = graphX(index, width, total);
	ctx.strokeStyle = color;
	ctx.lineWidth = lineWidth;
	ctx.beginPath();
	ctx.moveTo(x, 0);
	ctx.lineTo(x, height);
	ctx.stroke();
}

/** Wires click-to-jump and the hover readout on the graph. */
function initGraphInteraction(canvas: HTMLCanvasElement): void {
	canvas.style.cursor = 'pointer';

	/** The position index under the cursor. */
	const indexAt = (e: MouseEvent): number => {
		const total = gamereview.getMainlineNodes().length + 1;
		const rect = canvas.getBoundingClientRect();
		const ratio = (e.clientX - rect.left) / Math.max(1, rect.width);
		return Math.round(math.clamp(ratio, 0, 1) * (total - 1));
	};

	canvas.addEventListener('click', (e) => {
		const index = indexAt(e);
		const node = index === 0 ? movetree.getRoot() : gamereview.getMainlineNodes()[index - 1];
		if (node) guimovetree.navigateToNode(node);
	});

	canvas.addEventListener('mousemove', (e) => {
		const index = indexAt(e);
		hoveredPosition = index;
		showGraphTooltip(e, index);
		drawGraph();
	});
	canvas.addEventListener('mouseleave', () => {
		hoveredPosition = undefined;
		element_GraphTooltip?.classList.add('hidden');
		drawGraph();
	});
}

function showGraphTooltip(event: MouseEvent, index: number): void {
	if (!element_Graph || !element_GraphTooltip || !element_GraphTooltipMove || !element_GraphTooltipEval) return; // prettier-ignore
	const cp = gamereview.getWhiteCpAt(index);
	if (cp === undefined) return element_GraphTooltip.classList.add('hidden');

	const node = index > 0 ? gamereview.getMainlineNodes()[index - 1] : undefined;
	const moveNumber = index > 0 ? Math.floor((index - 1) / 2) + 1 : 0;
	const prefix = index === 0 ? '' : `${moveNumber}${(index - 1) % 2 === 0 ? '.' : '...'} `;
	const move = node?.move
		? icnconverter.getShortFormMoveFromMove(node.move, {
				compact: false,
				spaces: false,
				comments: false,
				abbrev: true,
			})
		: 'Starting position';
	const review = node ? gamereview.getReviewForNode(node.id) : undefined;
	const classification = review?.classification
		? ` · ${gamereview.CLASSIFICATION_DISPLAY[review.classification].label}`
		: '';
	element_GraphTooltipMove.textContent = `${prefix}${move}`;
	element_GraphTooltipEval.textContent = `Advantage: ${formatAdvantage(cp)}${classification}`;
	element_GraphTooltip.classList.remove('hidden');

	const rect = element_Graph.getBoundingClientRect();
	const tooltipWidth = element_GraphTooltip.offsetWidth;
	const tooltipHeight = element_GraphTooltip.offsetHeight;
	const localX = event.clientX - rect.left;
	element_GraphTooltip.style.left = `${math.clamp(localX - tooltipWidth / 2, 6, rect.width - tooltipWidth - 6)}px`;

	// Auto-position vertically on whichever side of the hovered point has more room —
	// so the tooltip never sits directly over the very data point it's describing.
	const graphHeight = element_Graph.clientHeight;
	const pointY = graphY(cp, graphHeight);
	element_GraphTooltip.style.top =
		pointY < graphHeight / 2
			? `${Math.max(TOOLTIP_TOP_MARGIN, graphHeight - tooltipHeight - TOOLTIP_BOTTOM_MARGIN)}px` // Point is up top — tooltip goes near the bottom.
			: `${TOOLTIP_TOP_MARGIN}px`; // Point is down low — tooltip goes near the top.
}

function formatAdvantage(cp: number): string {
	return `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(1)}`.replace('-', '−');
}

export default { init };
