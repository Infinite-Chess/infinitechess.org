// src/client/scripts/esm/views/analysis/gui/guigamereview.ts

/**
 * Game review UI for the analysis page. Owns:
 *
 * * the Game Review button, which starts the review and swaps itself out for the
 *   stats + eval graph; if the pristine mainline has been edited it reloads the
 *   pristine game and auto-opens the review there;
 * * the two-column per-player stats (accuracy, lapses, acpl) that replace the
 *   participant rows + result banner there, filling in live as the review runs;
 * * the progress bar below the moves list, swapped for the clickable eval graph
 *   when the review completes.
 *
 * The move list's per-ply glyphs are guimovetree's job (it owns that DOM).
 */

import type { Player } from '../../../../../../shared/chess/util/typeutil.js';
import type { MoveFull } from '../../../../../../shared/chess/logic/movepiece.js';
import type { LapseKey, MoveReview, ReviewOutcome } from '../gamereview.js';

import math from '../../../../../../shared/util/math/math.js';
import icnmoves from '../../../../../../shared/chess/logic/icn/icnmoves.js';
import { players as p } from '../../../../../../shared/chess/util/typeutil.js';

import toast from '../../../components/toast.js';
import ceval from '../ceval.js';
import movetree from '../movetree.js';
import gameslot from '../../../game/chess/gameslot.js';
import gamereview from '../gamereview.js';
import guimovetree from './guimovetree.js';
import { GameBus } from '../../../board/GameBus.js';
import analysisloader from '../analysisloader.js';
import { SettingsBus } from '../../../util/SettingsBus';

// Elements --------------------------------------------------------------------

const element_GameReviewBtn = document.getElementById('btn-game-review')!;
const element_Stats = document.getElementById('review-stats')!;
const element_Progress = document.getElementById('review-progress')!;
const element_ProgressFill = document.getElementById('review-progress-fill')!;
const element_ProgressText = document.getElementById('review-progress-text')!;
const element_Graph = document.getElementById('review-graph')!;
const element_GraphCanvas = document.getElementById('review-graph-canvas') as HTMLCanvasElement; // prettier-ignore
const element_GraphTooltip = document.getElementById('review-graph-tooltip')!;
const element_GraphTooltipMove = document.getElementById('review-graph-tooltip-move')!;
const element_GraphTooltipEval = document.getElementById('review-graph-tooltip-eval')!;
const element_PhaseMarkers = document.getElementById('review-phase-markers')!;

/** The stat value cells per player, rebuilt when the stats columns are created. */
const statCells: { [player: number]: Partial<Record<StatKey, HTMLElement>> } = {};

type StatKey = 'accuracy' | 'inaccuracy' | 'mistake' | 'blunder' | 'acpl';

/** Plies of the engine's best line grafted as a variation beneath a reviewed blunder. */
const BLUNDER_VARIATION_MAX_PLIES = 6;

/** The loaded game's mainline, snapshotted at load (bar-delimited move tokens) for edit detection. */
let pristineMainline = '';

// Initialization --------------------------------------------------------------

/** Wires the game review UI, including the Game Review button click. */
function init(): void {
	gamereview.onProgress(() => {
		updateProgress();
		updateStats();
		if (isGraphVisible()) drawGraph();
	});
	gamereview.onClassified((review) => {
		updateStats();
		if (review.classification === 'blunder') addBlunderVariation(review);
		if (isGraphVisible()) drawGraph();
	});
	gamereview.onFinished(onReviewFinished);

	window.addEventListener('resize', () => {
		if (isGraphVisible()) drawGraph();
	});
	// The eval line's color is read from the canvas's CSS `color` at draw time, so a light/dark
	// switch needs an explicit redraw — nothing else touches the graph until the next interaction.
	SettingsBus.addEventListener('color-scheme-change', () => {
		if (isGraphVisible()) drawGraph();
	});
	GameBus.addEventListener('view-move', () => {
		if (isGraphVisible()) drawGraph();
	});
	initGraphInteraction(element_GraphCanvas);
	wireStats();

	element_GameReviewBtn.addEventListener('click', onGameReviewClicked);
	GameBus.addEventListener('game-unloaded', closeReview);
	GameBus.addEventListener('game-loaded', snapshotPristineMainline);
	// Deliberately later than the snapshot: the moves list is already interactive during the
	// graphical load, and a review started then silently loses its blunder variations (see
	// guimovetree.addVariation), so the button mustn't be offered until the load is over.
	GameBus.addEventListener('graphical-loaded', revealButtonIfReviewable);
}

/** Records the game's mainline as loaded, for later edit detection. */
function snapshotPristineMainline(): void {
	pristineMainline = mainlineTokens(gameslot.getGamefile()!.moves);
}

function revealButtonIfReviewable(): void {
	// An empty pristine mainline means the game arrived with no moves — a preset variant or an
	// editor position on the bare /analysis page. Moves played by hand onto one aren't a game
	// to review, so the button stays hidden until an ICN with moves is pasted.
	const reviewable = pristineMainline !== '' && gamereview.canStart();
	element_GameReviewBtn.classList.toggle('hidden', !reviewable);
}

/**
 * Undoes {@link openReview}'s takeover of the panel, leaving the loaded game itself untouched
 * — so a review that failed can be started over from the button.
 */
function hideReviewUI(): void {
	element_Stats.classList.add('hidden');
	element_Progress.classList.add('hidden');
	element_Graph.classList.add('hidden');
	element_PhaseMarkers.replaceChildren();
	hoveredPosition = undefined; // Else a phantom hover dot draws on the next review's first frame.
	element_GraphTooltip.classList.add('hidden');

	// Hand the borrowed participant rows back to the meta panel (see revealStats).
	const metaPlayers = document.querySelector('.meta-players');
	if (!metaPlayers) return;
	metaPlayers.append(...element_Stats.querySelectorAll('.meta-player'));
	metaPlayers.classList.remove('hidden');
	document.querySelector('.game-meta')!.classList.remove('review');
}

/**
 * Closes the outgoing game's review UI, so nothing of it can outlive the
 * game it describes. gamereview discards its own state on the same event.
 */
function closeReview(): void {
	hideReviewUI();
	// Hidden here as well as on load: a load is async, and until the next one lands the button
	// would otherwise still offer a review of the game that just went away.
	element_GameReviewBtn.classList.add('hidden');
	pristineMainline = '';
	// Blanked, not reset to the fallback — the next game's participants aren't known yet.
	setPlayerName(p.WHITE, '');
	setPlayerName(p.BLACK, '');
}

/** Serializes a move list to bar-joined tokens, for cheap comparison. */
function mainlineTokens(moves: MoveFull[]): string {
	return icnmoves.getShortFormMovesFromMoves(moves, { compact: true, spaces: false, comments: false, abbrev: false, move_numbers: false }); // prettier-ignore
}

/** Returns the current mainline as bar-joined move tokens, for cheap comparison. */
function currentMainline(): string {
	const root = movetree.getRoot();
	if (!root) return '';
	return mainlineTokens(movetree.getMovesFromLine(movetree.getLineForNode(root)));
}

/**
 * Handles a Game Review button click. Normally opens the review in place. If the mainline has
 * been edited, instead reloads the pristine game and auto-opens the review once it lands. That
 * reload is destructive to added lines, so confirm first.
 */
function onGameReviewClicked(): void {
	if (currentMainline() === pristineMainline) {
		// Main line preserved, no need to confirm: start review.
		openReview();
	} else {
		// Main line diverged: confirm destructive reload.
		const proceed = confirm("Starting a Game Review will discard the lines you've added and review the game as it was played. Continue?"); // prettier-ignore
		if (!proceed) return;
		// Hidden immediately: the reload only marks the session as loading after an await, so
		// until then the button would still be clickable and could start a second concurrent load.
		element_GameReviewBtn.classList.add('hidden');
		void analysisloader.reloadPristine().then(openReview); // Reload in place
	}
}

/** Starts the review and swaps the Game Review button out for the live stats + eval graph. */
function openReview(): void {
	if (!gamereview.canStart()) return;

	gamereview.start();

	element_GameReviewBtn.classList.add('hidden');
	revealStats();
	if (gamereview.getStatus() === 'running') element_Progress.classList.remove('hidden');
	element_Graph.classList.remove('hidden');
	element_PhaseMarkers.replaceChildren();
	updateProgress();
	updateStats();
	drawGraph();
}

/** Grafts the engine's best line beneath a classified blunder as a variation. */
function addBlunderVariation(review: MoveReview): void {
	if (!review.pv?.length) return;
	const parent = gamereview.getMainlineNodes()[review.ply]?.parent;
	if (parent) guimovetree.addVariation(parent, review.pv.slice(0, BLUNDER_VARIATION_MAX_PLIES));
}

// Progress --------------------------------------------------------------------

function updateProgress(): void {
	if (element_Progress.classList.contains('hidden')) return;
	const { evaluated, total, depth } = gamereview.getSummary();
	const pct = total > 0 ? (evaluated / total) * 100 : 0;
	element_ProgressFill.style.width = `${pct}%`;
	element_ProgressText.textContent = `Evaluating position ${Math.min(evaluated + 1, total)} of ${total} · depth ${depth}`;
}

function onReviewFinished(outcome: ReviewOutcome): void {
	if (outcome === 'done') {
		element_Progress.classList.add('hidden'); // Swapped out for the eval graph.
		drawGraph();
		updateStats();
		return;
	}
	// Tear the empty stats/graph back down and re-offer the button, so the user can
	// start over — gamereview has already returned itself to 'idle' for exactly that.
	hideReviewUI();
	revealButtonIfReviewable();
	if (outcome === 'failed') toast.show('Game review failed. Please try again.', { error: true });
	else toast.show('The engine failed to load.', { error: true });
}

// Stats columns ---------------------------------------------------------------

/** Writes a column header's name. No-op on /analysis/:id, whose headers are real participant rows. */
function setPlayerName(color: Player, name: string): void {
	const element = element_Stats.querySelector(
		`.review-stats-col[data-player="${color}"] .review-player-name`,
	);
	if (element) element.textContent = name;
}

/** Caches the SSR'd stat cells and wires the clickable lapse rows. The markup is static, so once. */
function wireStats(): void {
	for (const color of [p.WHITE, p.BLACK]) {
		const col = element_Stats.querySelector(`.review-stats-col[data-player="${color}"]`)!;

		statCells[color] = {
			accuracy: col.querySelector<HTMLElement>('.review-accuracy-value')!,
			inaccuracy: col.querySelector<HTMLElement>('.review-stat-value.inaccuracy')!,
			mistake: col.querySelector<HTMLElement>('.review-stat-value.mistake')!,
			blunder: col.querySelector<HTMLElement>('.review-stat-value.blunder')!,
			acpl: col.querySelector<HTMLElement>('.review-stat-value.acpl')!,
		};

		col.querySelectorAll<HTMLElement>('.review-stat-action').forEach((line) => {
			const classification = line.dataset['classification'] as LapseKey;
			line.addEventListener('click', () => cycleToLapse(color, classification));
			line.addEventListener('keydown', (event) => {
				if (event.key !== 'Enter' && event.key !== ' ') return;
				event.preventDefault();
				cycleToLapse(color, classification);
			});
		});
	}
}

/**
 * Reveals the SSR'd two-column per-player stats. On /analysis/:id they replace the meta panel's
 * participant rows + result banner, borrowing the `.meta-player` rows (side dot + username embed)
 * as the column headers so nothing is duplicated. The bare /analysis page has no meta panel — its
 * columns keep the headers they were SSR'd with.
 */
function revealStats(): void {
	if (!element_Stats.classList.contains('hidden')) return;

	const metaPlayers = document.querySelector('.meta-players');
	if (metaPlayers) {
		const playerRows = [...metaPlayers.querySelectorAll('.meta-player')];
		for (const [column, color] of [
			[0, p.WHITE],
			[1, p.BLACK],
		] as const) {
			// The player row becomes the column header, above the SSR'd accuracy + stat rows.
			const header = playerRows[column];
			if (header)
				element_Stats
					.querySelector(`.review-stats-col[data-player="${color}"]`)!
					.prepend(header);
		}
		metaPlayers.classList.add('hidden');
		document.querySelector('.game-meta')!.classList.add('review');
	} else {
		// No meta panel to donate rows — name the SSR'd headers off the pasted ICN, which
		// carries participants only if it declared them.
		const { White, Black } = analysisloader.getPastedPlayers();
		const guest = t.shared.user_status.guest_indicator;
		setPlayerName(p.WHITE, White || guest);
		setPlayerName(p.BLACK, Black || guest);
	}

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
	if (node) guimovetree.navigateToNode(node, true);
}

/** Repaints both players' stat values from the review's current standing. */
function updateStats(): void {
	if (element_Stats.classList.contains('hidden')) return;
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

// Eval graph ------------------------------------------------------------------

/**
 * Symmetric top/bottom inset so the zero line sits at the exact vertical center (like lila).
 * The phase labels overlap the plot's top rather than reserving a band that would offset zero.
 */
const GRAPH_VERTICAL_PADDING = 4;
/** Vertical clearance the tooltip keeps from the graph's top/bottom edges when auto-positioning. */
const TOOLTIP_TOP_MARGIN = 10;
const TOOLTIP_BOTTOM_MARGIN = 6;
const WHITE_FILL = 'rgba(255, 255, 255, 0.45)';
const BLACK_FILL = 'rgba(0, 0, 0, 0.5)';
/** Lila-style orange for the line marking the currently viewed position. */
const CURRENT_POSITION_COLOR = '#d85000';

let hoveredPosition: number | undefined;

function isGraphVisible(): boolean {
	return !element_Graph.classList.contains('hidden');
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
	const normalized = ceval.cpWinningChances(cp);
	const plotHeight = height - GRAPH_VERTICAL_PADDING * 2;
	return GRAPH_VERTICAL_PADDING + plotHeight / 2 - normalized * (plotHeight / 2 - 3);
}

/**
 * Splits a contiguous run of points into above-zero / below-zero runs for the advantage
 * fill, inserting the true zero-crossing as the shared boundary between adjacent runs — an
 * exact-zero point counts as the end of whichever run it closes.
 */
function splitIntoSignRuns(
	segment: { index: number; cp: number }[],
): { side: 'pos' | 'neg'; points: { index: number; cp: number }[] }[] {
	const runs: { side: 'pos' | 'neg'; points: { index: number; cp: number }[] }[] = [];
	if (segment.length === 0) return runs;

	let side: 'pos' | 'neg' = segment[0]!.cp >= 0 ? 'pos' : 'neg';
	let current: { index: number; cp: number }[] = [segment[0]!];

	for (let i = 1; i < segment.length; i++) {
		const prev = segment[i - 1]!;
		const point = segment[i]!;
		const pointSide: 'pos' | 'neg' = point.cp >= 0 ? 'pos' : 'neg';

		if (pointSide !== side) {
			// Interpolated in winning-chances space, not cp space, since graphY's cp => y curve is a
			// sigmoid — a cp-space crossing lands off the drawn line, kinking it at the zero line.
			const prevChances = ceval.cpWinningChances(prev.cp);
			const pointChances = ceval.cpWinningChances(point.cp);
			const t = prevChances / (prevChances - pointChances);
			const crossingIndex = prev.index + t * (point.index - prev.index);
			current.push({ index: crossingIndex, cp: 0 }); // Closes the run just ended.
			runs.push({ side, points: current });
			side = pointSide;
			current = [{ index: crossingIndex, cp: 0 }]; // Opens the next run at the same x.
		}
		current.push(point);
	}
	runs.push({ side, points: current });
	return runs;
}

/**
 * Flattens sign-split runs back into one ordered vertex list for the eval line stroke —
 * every run after the first repeats the crossing point that closed the previous run, so
 * that shared boundary vertex is skipped to avoid drawing it twice.
 */
function flattenRunsToPolyline(
	runs: { side: 'pos' | 'neg'; points: { index: number; cp: number }[] }[],
): { index: number; cp: number }[] {
	const polyline: { index: number; cp: number }[] = [];
	for (const run of runs) {
		for (const point of run.points) {
			const last = polyline[polyline.length - 1];
			if (last && last.index === point.index && last.cp === point.cp) continue;
			polyline.push(point);
		}
	}
	return polyline;
}

/** Fills a small dot at a graph point (current `ctx.fillStyle`). */
function drawGraphDot(
	ctx: CanvasRenderingContext2D,
	point: { index: number; cp: number },
	width: number,
	height: number,
	total: number,
): void {
	ctx.beginPath();
	ctx.arc(graphX(point.index, width, total), graphY(point.cp, height), 2, 0, Math.PI * 2);
	ctx.fill();
}

/** Draws the white-POV eval line, phase/current/hover lines, and lapse dots. */
function drawGraph(): void {
	const canvas = element_GraphCanvas;

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

	// Computed once and shared by both the fills and the stroke below, so the two can never
	// visually diverge — they're built from the exact same vertices, crossings included.
	const segmentRuns = segments.map(splitIntoSignRuns);

	// Advantage fills: white above the zero line, black below. Split at the true zero-crossing
	// between two points of opposite sign, not at either point's own x — otherwise one side's
	// fill overshoots all the way to the next point's x instead of stopping where the eval
	// line actually crosses zero (how lila's Chart.js area fill splits it).
	if (points.length > 0) {
		for (const runs of segmentRuns) {
			for (const run of runs) {
				if (run.points.length < 2) continue; // Can't fill a lone point.
				ctx.fillStyle = run.side === 'pos' ? WHITE_FILL : BLACK_FILL;
				ctx.beginPath();
				ctx.moveTo(graphX(run.points[0]!.index, width, total), graphY(0, height));
				for (const point of run.points)
					ctx.lineTo(graphX(point.index, width, total), graphY(point.cp, height));
				ctx.lineTo(
					graphX(run.points[run.points.length - 1]!.index, width, total),
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

	// The eval line itself, one disconnected subpath per contiguous segment — traced through
	// the SAME run vertices as the fills (see segmentRuns above) so it exactly follows their
	// boundary, including the zero-crossings, rather than being computed as a separate path
	// that could drift a pixel or two off from what the fill actually drew.
	ctx.strokeStyle = lineColor;
	ctx.lineWidth = 1.5;
	// Round joins: the default miter join projects a sharp peak/valley's outer corner well past
	// the actual vertex, so the stroke visibly spiked beyond the lapse dot drawn there.
	ctx.lineJoin = 'round';
	ctx.beginPath();
	for (const runs of segmentRuns) {
		flattenRunsToPolyline(runs).forEach((point, i) => {
			const x = graphX(point.index, width, total);
			const y = graphY(point.cp, height);
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		});
	}
	ctx.stroke();
	// Dot the endpoints on either side of every gap — where the eval line disconnects because a
	// stretch of positions had out-of-bounds pieces we couldn't evaluate — so the break reads as
	// intentional. Also dots isolated points (no neighbor, so no line was drawn for them at all).
	ctx.fillStyle = lineColor;
	for (const segment of segments) {
		const first = segment[0]!;
		const last = segment[segment.length - 1]!;
		if (first.index > 0 || segment.length === 1) drawGraphDot(ctx, first, width, height, total);
		if (last.index < total - 1) drawGraphDot(ctx, last, width, height, total);
	}

	// Lapse dots, at the position after the classified move.
	for (const review of gamereview.getReviews()) {
		if (!review.classification || !gamereview.isLapseKey(review.classification)) continue;
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
	updateCurrentPhaseMarker(selected);
	drawPositionMarker(ctx, selected, width, height, total, CURRENT_POSITION_COLOR, 1);
	if (hoveredPosition !== undefined) {
		const cp = gamereview.getWhiteCpAt(hoveredPosition);
		if (cp !== undefined) {
			ctx.beginPath();
			ctx.arc(graphX(hoveredPosition, width, total), graphY(cp, height), 4, 0, Math.PI * 2);
			ctx.fillStyle = lineColor;
			ctx.fill();
		}
	}
}

/** Hides a coincident phase line so it cannot double up with the current-position marker. */
function updateCurrentPhaseMarker(selected: number): void {
	element_PhaseMarkers
		?.querySelectorAll<HTMLElement>('.review-phase-marker')
		.forEach((marker) => {
			marker.classList.toggle('current-position', Number(marker.dataset['ply']) === selected);
		});
}

/** Lila-style opening/middlegame/endgame boundaries and vertical labels. */
function renderPhaseMarkers(total: number): void {
	if (element_PhaseMarkers.childElementCount > 0) return;
	const { middle, end } = gamereview.getDivision();
	const lines: { index: number; label: string }[] = [{ index: 0, label: 'Opening' }];
	if (middle !== undefined) lines.push({ index: middle, label: 'Middlegame' });
	if (end !== undefined) lines.push({ index: end, label: 'Endgame' });

	for (const line of lines) {
		const marker = document.createElement('div');
		marker.classList.add('review-phase-marker');
		marker.dataset['ply'] = String(line.index);
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
		if (node) guimovetree.navigateToNode(node, true);
	});

	canvas.addEventListener('mousemove', (e) => {
		const index = indexAt(e);
		hoveredPosition = index;
		showGraphTooltip(e, index);
		drawGraph();
	});
	canvas.addEventListener('mouseleave', () => {
		hoveredPosition = undefined;
		element_GraphTooltip.classList.add('hidden');
		drawGraph();
	});
}

function showGraphTooltip(event: MouseEvent, index: number): void {
	const cp = gamereview.getWhiteCpAt(index);
	const outOfBounds = cp === undefined && !gamereview.positionIsEvaluable(index);
	// A gap that isn't out of bounds is a position still being evaluated — nothing to show yet.
	if (cp === undefined && !outOfBounds) return element_GraphTooltip.classList.add('hidden');

	const node = index > 0 ? gamereview.getMainlineNodes()[index - 1] : undefined;
	const moveNumber = index > 0 ? Math.floor((index - 1) / 2) + 1 : 0;
	const prefix = index === 0 ? '' : `${moveNumber}${(index - 1) % 2 === 0 ? '.' : '...'} `;
	const move = node?.move
		? icnmoves.getShortFormMoveFromMove(node.move, {
				compact: false,
				spaces: false,
				comments: false,
				abbrev: true,
			})
		: 'Starting position';
	element_GraphTooltipMove.textContent = `${prefix}${move}`;

	if (outOfBounds) {
		element_GraphTooltipEval.textContent = 'Out of bounds — not evaluated';
	} else {
		const review = node ? gamereview.getReviewForNode(node.id) : undefined;
		const classification = review?.classification
			? ` · ${gamereview.CLASSIFICATION_DISPLAY[review.classification].label}`
			: '';
		element_GraphTooltipEval.textContent = `Advantage: ${formatAdvantage(cp!)}${classification}`;
	}
	element_GraphTooltip.classList.remove('hidden');

	const rect = element_Graph.getBoundingClientRect();
	const tooltipWidth = element_GraphTooltip.offsetWidth;
	const tooltipHeight = element_GraphTooltip.offsetHeight;
	const localX = event.clientX - rect.left;
	element_GraphTooltip.style.left = `${math.clamp(localX - tooltipWidth / 2, 6, rect.width - tooltipWidth - 6)}px`;

	// Auto-position vertically on whichever side of the hovered point has more room — so the
	// tooltip never sits over the point it describes. An out-of-bounds gap has no point; treat it
	// as centered, which sends the tooltip to the top.
	const graphHeight = element_Graph.clientHeight;
	const pointY = cp !== undefined ? graphY(cp, graphHeight) : graphHeight / 2;
	element_GraphTooltip.style.top =
		pointY < graphHeight / 2
			? `${Math.max(TOOLTIP_TOP_MARGIN, graphHeight - tooltipHeight - TOOLTIP_BOTTOM_MARGIN)}px` // Point is up top — tooltip goes near the bottom.
			: `${TOOLTIP_TOP_MARGIN}px`; // Point is down low — tooltip goes near the top.
}

function formatAdvantage(cp: number): string {
	return `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(1)}`.replace('-', '−');
}

export default { init };
