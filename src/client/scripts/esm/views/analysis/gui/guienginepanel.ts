// src/client/scripts/esm/views/analysis/gui/guienginepanel.ts

/**
 * The analysis page's engine panel: the local-evaluation toggle, eval readout,
 * depth/nodes stats, settings drawer (MultiPV / threads / hash / search time),
 * the MultiPV line list (click a move to play the line), the eval gauge beside
 * the board, and the engine's best-move arrows drawn on the board.
 */

import type { Coords } from '../../../../../../shared/chess/util/coordutil.js';
import type { GameFile } from '../../../../../../shared/chess/logic/gamefile.js';
import type { EngineArrow } from '../enginearrows.js';
import type { CevalLine, CevalStatus, CevalUpdate } from '../ceval.js';

import moveutil from '../../../../../../shared/chess/util/moveutil.js';
import movevalidation from '../../../../../../shared/chess/logic/movevalidation.js';
import coordutil, { CoordsKey } from '../../../../../../shared/chess/util/coordutil.js';

import ceval from '../ceval.js';
import toast from '../../../components/toast.js';
import gameslot from '../../../game/chess/gameslot.js';
import gamesession from '../../../game/chess/gamesession.js';
import { GameBus } from '../../../game/GameBus.js';
import enginearrows from '../enginearrows.js';
import movesequence from '../../../game/chess/movesequence.js';
import analysismovetree from '../movetree.js';
import { isTypingTarget } from '../analysis.js';
import enginelegalmovesdebug from '../../../game/misc/enginelegalmovesdebug.js';

// Elements -------------------------------------------------------------------------

const element_Toggle = document.getElementById('engine-toggle') as HTMLInputElement;
const element_Eval = document.getElementById('engine-eval')!;
const element_Stats = document.getElementById('engine-stats')!;
const element_GoDeeper = document.getElementById('btn-go-deeper') as HTMLButtonElement;
const element_SettingsBtn = document.getElementById('btn-engine-settings') as HTMLButtonElement;
const element_Settings = document.getElementById('engine-settings')!;
const element_Progress = document.getElementById('engine-progress')!;
const element_ProgressFill = document.getElementById('engine-progress-fill')!;
const element_Lines = document.getElementById('engine-lines')!;
const element_Gauge = document.getElementById('eval-gauge')!;
const element_GaugeBlack = document.getElementById('gauge-black')!;

const element_MultiPv = document.getElementById('setting-multipv') as HTMLInputElement;
const element_MultiPvValue = document.getElementById('setting-multipv-value')!;
const element_Hash = document.getElementById('setting-hash') as HTMLSelectElement;
const element_Depth = document.getElementById('setting-depth') as HTMLSelectElement;

// Constants ----------------------------------------------------------------------

const ENABLED_STORAGE_KEY = 'ceval.enabled';

// State ----------------------------------------------------------------------------

/** Per-rank (PV line index) window offset into that line's moves, for the '…' pager. Cleared whenever the line set is cleared. */
const lineWindowOffsets = new Map<number, number>();
/** Per-rank snapshot of that line's moves as of the last render, to detect when a deeper search revises earlier moves out from under the page you're viewing. */
const lastSeenLineMoves = new Map<number, string[]>();
/** The moveIndex the above per-rank state belongs to. */
let lineWindowStateMoveIndex: number | undefined;

// Functions -----------------------------------------------------------------------

/** Initializes the engine panel. Called once by the page entry. */
function init(): void {
	ceval.init({ workerUrl: window.analysisPageData.workerUrl });
	enginelegalmovesdebug.init({
		canRequest: () => !ceval.isBlockedByEngineWorldBorder(),
		requestMoves: ({ id, positionIcn }) => ceval.requestLegalMoves(id, positionIcn),
	});

	initSettingsUI();
	initListeners();
	syncSettingsOverlayPosition();

	ceval.onUpdate(onEngineUpdate);
	ceval.onStatus(onEngineStatus);
	ceval.onLegalMoves(({ requestId, moves }) =>
		enginelegalmovesdebug.receiveMoves(requestId, moves),
	);

	// Draw engine arrows on top of the pieces each frame.
	GameBus.addEventListener('render-above-pieces', () => enginearrows.render());

	// Restore the persisted on/off state once the first game finishes loading.
	GameBus.addEventListener('game-loaded', () => {
		const wanted = localStorage.getItem(ENABLED_STORAGE_KEY) !== 'false';
		if (wanted && !ceval.isEnabled()) setEngineEnabled(true);
	});
}

function setEngineEnabled(value: boolean): void {
	element_Toggle.checked = value;
	localStorage.setItem(ENABLED_STORAGE_KEY, String(value));
	ceval.setEnabled(value);
	element_Gauge.classList.toggle('hidden', !value);
	if (!value) {
		resetLineWindowState();
		enginearrows.clearArrows();
		renderLines([]);
		element_Eval.textContent = '-';
		element_Stats.textContent = 'Local evaluation off';
		updateProgress(undefined);
	}
}

// Settings UI ------------------------------------------------------------------------

function initSettingsUI(): void {
	const settings = ceval.getSettings();

	element_MultiPv.max = String(ceval.MAX_MULTI_PV);
	element_MultiPv.value = String(settings.multiPv);
	element_MultiPvValue.textContent = String(settings.multiPv);

	element_Hash.value = String(settings.hashMb);
	element_Depth.value = String(settings.depth);
}

function initListeners(): void {
	element_Toggle.addEventListener('change', () => setEngineEnabled(element_Toggle.checked));

	element_SettingsBtn.addEventListener('click', () => {
		const open = element_Settings.classList.toggle('hidden') === false;
		if (open) syncSettingsOverlayPosition();
		element_SettingsBtn.classList.toggle('active', open);
	});

	window.addEventListener('resize', syncSettingsOverlayPosition);

	element_MultiPv.addEventListener('input', () => {
		element_MultiPvValue.textContent = element_MultiPv.value;
	});
	element_MultiPv.addEventListener('change', () => {
		ceval.updateSettings({ multiPv: Number(element_MultiPv.value) });
	});

	element_Hash.addEventListener('change', () => {
		ceval.updateSettings({ hashMb: Number(element_Hash.value) });
	});

	element_Depth.addEventListener('change', () => {
		ceval.updateSettings({ depth: Number(element_Depth.value) });
	});

	element_GoDeeper.addEventListener('click', () => {
		element_GoDeeper.classList.add('hidden');
		// ceval.goDeeper() re-emits immediately with the deeper target, which drives
		// onEngineUpdate → the stats text and progress bar both update right away.
		ceval.goDeeper();
	});

	// Keyboard shortcut: l = toggle local evaluation (ignored while typing).
	document.addEventListener('keydown', (e) => {
		if (isTypingTarget(e.target)) return;
		if (e.key === 'l' && !e.ctrlKey && !e.metaKey && !e.altKey)
			setEngineEnabled(!element_Toggle.checked);
	});
}

function syncSettingsOverlayPosition(): void {
	element_Settings.style.setProperty('--engine-settings-top', `${element_Lines.offsetTop}px`);
}

// Engine output rendering ------------------------------------------------------------

function onEngineStatus(status: CevalStatus): void {
	if (status === 'loading') {
		element_Stats.textContent = 'Loading engine…';
		updateProgress(ceval.getLatestUpdate());
	} else if (status === 'failed') {
		element_Toggle.checked = false;
		element_Gauge.classList.add('hidden');
		element_Stats.textContent = 'Engine failed to load';
		updateProgress(undefined);
		toast.show('The analysis engine failed to load.', { error: true });
	} else if (status === 'blocked') {
		enginelegalmovesdebug.disable();
		resetLineWindowState();
		element_Eval.textContent = '-';
		element_Stats.textContent = 'Outside world border';
		element_GoDeeper.classList.add('hidden');
		enginearrows.clearArrows();
		renderLines([]);
		updateGauge(undefined);
		updateProgress(undefined);
	}
}

function onEngineUpdate(update: CevalUpdate | undefined): void {
	if (!ceval.isEnabled()) return;

	if (!update) {
		// Position changed; awaiting the first info of the new search.
		resetLineWindowState();
		element_Eval.textContent = '…';
		element_Stats.textContent = 'Starting analysis';
		element_GoDeeper.classList.add('hidden');
		enginearrows.clearArrows();
		renderLines([]);
		updateProgress(undefined);
		return;
	}

	// A cached position renders its lines immediately (no intervening empty-lines update
	// to clear the maps above), so detect the position change here too.
	if (update.moveIndex !== lineWindowStateMoveIndex) resetLineWindowState();
	lineWindowStateMoveIndex = update.moveIndex;

	if (update.terminal) {
		element_Eval.textContent = '-';
		element_Stats.textContent = 'Game over at this position';
		enginearrows.clearArrows();
		renderLines([]);
		updateGauge(undefined);
		updateProgress(update);
		return;
	}

	const best = update.lines[0];
	element_Eval.textContent = best ? formatEval(best) : '…';
	element_Stats.textContent = formatStats(update);
	// Offer "go deeper" once the target depth is reached and there's still room to go.
	// Show if at least one PV line is non-terminal (not mate/game end).
	const hasNonTerminalLine = update.lines.some((line) => line.mate === undefined);
	const canDeepen = update.done && update.depth < ceval.MAX_DEPTH && hasNonTerminalLine;
	element_GoDeeper.classList.toggle('hidden', !canDeepen);

	updateGauge(best);
	updateProgress(update);
	renderLines(update.lines);
	updateArrows(update);
}

/** Formats a white-POV line eval for display, e.g. "+1.4", "-0.3", "#5", "#-3". */
function formatEval(line: CevalLine): string {
	if (line.mate !== undefined) return line.mate > 0 ? `#${line.mate}` : `#-${Math.abs(line.mate)}`; // prettier-ignore
	const pawns = (line.cp ?? 0) / 100;
	return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
}

function formatStats(update: CevalUpdate): string {
	// Guard against a stale target briefly lagging the reached depth (e.g. right after
	// "go deeper") — never show something like "15/13".
	const depth = `Depth ${update.depth}/${Math.max(update.targetDepth, update.depth)}`;
	const nps =
		update.nps >= 1_000_000
			? `${(update.nps / 1_000_000).toFixed(1)} Mn/s`
			: `${Math.round(update.nps / 1000)} kn/s`;
	return `${depth} · ${nps}`;
}

function updateProgress(update: CevalUpdate | undefined): void {
	const active = ceval.isEnabled() && !ceval.isBlockedByEngineWorldBorder();
	const computing = active && (!update || (!update.done && !update.terminal));
	const targetDepth = update?.targetDepth ?? ceval.getSettings().depth;
	const progress = update ? Math.min(update.depth / Math.max(targetDepth, 1), 1) : 0;
	// While computing, keep a small minimum so the animated bar is visible immediately
	// (e.g. at depth 0 right after a move or on "go deeper"), not a zero-width sliver.
	const width = computing ? Math.max(progress, 0.05) : progress;
	element_ProgressFill.style.width = `${Math.round(width * 100)}%`;
	element_Progress.classList.toggle('computing', computing);
}

/** Moves the eval gauge to the given best line's win probability (white POV). */
function updateGauge(best: CevalLine | undefined): void {
	const chances = best?.winningChances ?? 0;
	// chances=+1 (white winning) → black bar 0%; chances=-1 → 100%.
	element_GaugeBlack.style.height = `${50 - chances * 50}%`;
}

// PV lines ----------------------------------------------------------------------------

function renderLines(lines: CevalLine[]): void {
	element_Lines.replaceChildren();
	if (lines.length === 0) resetLineWindowState();

	const rerender = (): void => renderLines(lines);

	lines.forEach((line, rank) => {
		reconcileWindowOffsetForChange(rank, line.moves);

		const row = document.createElement('div');
		row.className = 'engine-line';

		const evalSpan = document.createElement('span');
		evalSpan.className = 'line-eval';
		evalSpan.textContent = formatEval(line);

		const movesSpan = document.createElement('span');
		movesSpan.className = 'line-moves';

		row.append(evalSpan, movesSpan);
		// Attach to the live DOM BEFORE fitting: fitLineMovesWindow measures real layout
		// widths (scrollWidth/clientWidth), which are meaningless on a detached element.
		element_Lines.append(row);

		fitLineMovesWindow(movesSpan, line, rank, rerender);
	});
}

/**
 * A deeper search can revise a PV's earlier moves, not just extend its tail. If that
 * revision lands strictly before the page you're currently viewing, snap the window
 * back to exactly where it diverges (which may be the very start) so you're not left
 * looking at moves that no longer belong to this line. A revision at or after your
 * current page — including the line simply growing longer — leaves your view alone.
 */
function reconcileWindowOffsetForChange(rank: number, moves: string[]): void {
	const previous = lastSeenLineMoves.get(rank);
	lastSeenLineMoves.set(rank, moves.slice());
	if (!previous) return; // First time seeing this rank; nothing to compare against.

	const offset = lineWindowOffsets.get(rank) ?? 0;
	if (offset === 0) return; // Already at the start.

	const divergedAt = firstDivergingIndex(previous, moves);
	if (divergedAt !== undefined && divergedAt < offset) lineWindowOffsets.set(rank, divergedAt);
}

/** The first index at which two move-token sequences differ, or undefined if one is a prefix of the other. */
function firstDivergingIndex(a: string[], b: string[]): number | undefined {
	const sharedLength = Math.min(a.length, b.length);
	for (let i = 0; i < sharedLength; i++) {
		if (a[i] !== b[i]) return i;
	}
	return undefined;
}

/**
 * Clears all per-rank PV pagination/change-tracking state. Must run on every genuine
 * position change — including one that renders a cached result immediately, which
 * skips the empty-lines render that would otherwise catch it — so a rank's leftover
 * page/snapshot from a completely unrelated position never gets reused for a new one.
 */
function resetLineWindowState(): void {
	lineWindowOffsets.clear();
	lastSeenLineMoves.clear();
	lineWindowStateMoveIndex = undefined;
}

/**
 * Renders one PV's moves starting at that line's current window offset, fitting as many
 * as actually fit the line's rendered width — no fixed move count, exactly mirroring how
 * plain CSS ellipsis truncation used to size the line. Once it overflows, shrinks by one
 * move at a time (now reserving room for a '…' pager) until it fits. A '…' on the left
 * once paged forward, and on the right as long as more moves remain, make the pager an
 * actual "show next/previous set of moves" control instead of a dead-end truncation.
 */
function fitLineMovesWindow(
	container: HTMLElement,
	line: CevalLine,
	rank: number,
	rerender: () => void,
): void {
	const total = line.moves.length;
	if (total === 0) return;
	const offset = Math.min(lineWindowOffsets.get(rank) ?? 0, total - 1);
	lineWindowOffsets.set(rank, offset);

	const showLeftPager = offset > 0;
	const goBack = (): void => {
		lineWindowOffsets.set(rank, fitBackwardWindowStart(container, line, offset));
		rerender();
	};
	const goForward = (shown: number): void => {
		lineWindowOffsets.set(rank, offset + shown);
		rerender();
	};

	// Try showing everything remaining first — if it fits, no right pager is needed at all.
	let shown = total - offset;
	renderMovesSlice(container, line, offset, shown, showLeftPager, false, goBack, () => {});
	if (shown === 1 || fitsWithinWidth(container)) return;

	// Doesn't all fit: shrink by one, now reserving room for a right pager, until it does.
	shown--;
	while (shown > 1) {
		const forward = (): void => goForward(shown);
		renderMovesSlice(container, line, offset, shown, showLeftPager, true, goBack, forward);
		if (fitsWithinWidth(container)) return;
		shown--;
	}
	renderMovesSlice(container, line, offset, 1, showLeftPager, offset + 1 < total, goBack, () =>
		goForward(1),
	);
}

/**
 * Backward counterpart of the forward fit: finds the start index of the "previous page"
 * — as many moves as fit ending right before `endExclusive` — for the left pager.
 */
function fitBackwardWindowStart(
	container: HTMLElement,
	line: CevalLine,
	endExclusive: number,
): number {
	let count = endExclusive;
	while (count > 1) {
		const start = endExclusive - count;
		renderMovesSlice(
			container,
			line,
			start,
			count,
			start > 0,
			true,
			() => {},
			() => {},
		);
		if (fitsWithinWidth(container)) return start;
		count--;
	}
	return Math.max(0, endExclusive - 1);
}

function fitsWithinWidth(container: HTMLElement): boolean {
	return container.scrollWidth <= container.clientWidth;
}

/** Renders a specific slice of a PV line's moves (with optional pagers) into `container`. */
function renderMovesSlice(
	container: HTMLElement,
	line: CevalLine,
	start: number,
	count: number,
	showLeftPager: boolean,
	showRightPager: boolean,
	onGoBack: () => void,
	onGoForward: () => void,
): void {
	container.replaceChildren();
	if (showLeftPager) {
		container.append(createLinePagerButton('Show earlier moves in this line', onGoBack));
		container.append(' ');
	}
	for (let k = 0; k < count; k++) {
		const i = start + k;
		const moveSpan = document.createElement('span');
		moveSpan.className = 'line-move';
		moveSpan.textContent = line.moves[i]!;
		moveSpan.title = 'Play the line up to this move';
		moveSpan.addEventListener('click', () => playLine(line.moves, i));
		container.append(moveSpan);
		if (k < count - 1) container.append(' ');
	}
	if (showRightPager) {
		container.append(' ');
		container.append(createLinePagerButton('Show more moves in this line', onGoForward));
	}
}

function createLinePagerButton(title: string, onClick: () => void): HTMLSpanElement {
	const pager = document.createElement('span');
	pager.className = 'line-move line-pager';
	pager.textContent = '…';
	pager.title = title;
	pager.addEventListener('click', onClick);
	return pager;
}

/** Plays the PV's moves up to and including `untilIndex` onto the board. */
function playLine(tokens: string[], untilIndex: number): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile || gamesession.isLoading()) return;

	const mesh = gameslot.getMesh();
	if (!moveutil.areWeViewingLatestMove(gamefile)) branchFromViewedPosition(gamefile, mesh);
	for (let i = 0; i <= untilIndex; i++) {
		const result = movevalidation.isTokenMoveLegal(gamefile, tokens[i]!);
		if (!result.valid) {
			console.warn(`Engine line move "${tokens[i]}" is not legal here: ${result.reason}`);
			break;
		}
		// Animate only the final move of the sequence.
		if (i === untilIndex) movesequence.makeMoveAndAnimate(gamefile, mesh, result.tagged);
		else movesequence.makeMove(gamefile, mesh, result.tagged);
		if (gamefile.gameConclusion) break; // The line ended the game.
	}
}

function branchFromViewedPosition(
	gamefile: GameFile,
	mesh: ReturnType<typeof gameslot.getMesh>,
): void {
	const target = gamefile.state.local.moveIndex;
	analysismovetree.beginBranchFromViewedPosition(gamefile);
	movesequence.viewFront(gamefile, mesh);
	while (gamefile.state.local.moveIndex > target) movesequence.rewindMove(gamefile, mesh);
}

// Engine arrows -------------------------------------------------------------------------

/** Points the board arrows at each line's first move (only for the viewed position). */
function updateArrows(update: CevalUpdate): void {
	const gamefile = gameslot.getGamefile();
	// Stale analysis (user already navigated elsewhere): don't draw wrong-position arrows.
	if (!gamefile || gamefile.state.local.moveIndex !== update.moveIndex)
		return enginearrows.clearArrows();

	const arrows: EngineArrow[] = [];
	update.lines.forEach((line, rank) => {
		const parsed = parseFirstMove(line);
		if (parsed) arrows.push({ start: parsed.start, end: parsed.end, rank });
	});
	enginearrows.setArrows(arrows);
}

/** Parses a compact move token "x,y>x,y=Q" into start/end coords. */
function parseFirstMove(line: CevalLine): { start: Coords; end: Coords } | undefined {
	const token = line.moves[0];
	if (!token) return undefined;
	const [fromStr, toStr] = token.split('>');
	if (!fromStr || !toStr) return undefined;
	const endStr = toStr.split('=')[0]!;
	try {
		return {
			start: coordutil.getCoordsFromKey(fromStr as CoordsKey),
			end: coordutil.getCoordsFromKey(endStr as CoordsKey),
		};
	} catch {
		return undefined;
	}
}

export default { init };
