// src/client/scripts/esm/views/analysis/gui/guienginepanel.ts

/**
 * The analysis page's engine panel: the local-evaluation toggle, eval readout,
 * depth/nodes stats, settings drawer (MultiPV / threads / hash / search time),
 * the MultiPV line list (click a move to play the line), and the eval gauge beside
 * the board.
 */

import type { GameFile } from '../../../../../../shared/chess/logic/gamefile.js';
import type { AnalysisMoveNode } from '../movetree.js';
import type { CevalLine, CevalStatus, CevalUpdate } from '../ceval.js';

import moveutil from '../../../../../../shared/chess/logic/moveutil.js';
import movevalidation from '../../../../../../shared/chess/logic/movevalidation.js';
import { players as p } from '../../../../../../shared/chess/util/typeutil.js';

import ceval from '../ceval.js';
import toast from '../../../components/toast.js';
import gameslot from '../../../game/chess/gameslot.js';
import movetree from '../movetree.js';
import selection from '../../../game/chess/selection.js';
import animation from '../../../game/rendering/animation.js';
import guimovetree from './guimovetree.js';
import gamesession from '../../../game/chess/gamesession.js';
import { GameBus } from '../../../board/GameBus.js';
import enginearrows from '../rendering/enginearrows.js';
import movesequence from '../../../game/chess/movesequence.js';
import enginelegalmoves from '../../../game/debug/enginelegalmoves.js';
import { listener_document } from '../../../game/listeners.js';

// Elements --------------------------------------------------------------------

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
const element_Threads = document.getElementById('setting-threads') as HTMLInputElement;
const element_ThreadsValue = document.getElementById('setting-threads-value')!;
const element_Hash = document.getElementById('setting-hash') as HTMLInputElement;
const element_HashValue = document.getElementById('setting-hash-value')!;
const element_Depth = document.getElementById('setting-depth') as HTMLInputElement;
const element_DepthValue = document.getElementById('setting-depth-value')!;

// Constants -------------------------------------------------------------------

const ENABLED_STORAGE_KEY = 'ceval.enabled';

// State -----------------------------------------------------------------------

/**
 * Per-rank (PV line index) window offset into that line's moves, for the '…' pager.
 * Cleared whenever the line set is cleared.
 */
const lineWindowOffsets = new Map<number, number>();
/**
 * Per-rank snapshot of that line's moves as of the last render, to detect when
 * a deeper search revises earlier moves out from under the page you're viewing.
 */
const lastSeenLineMoves = new Map<number, string[]>();
/** The moveIndex the above per-rank state belongs to. */
let lineWindowStateMoveIndex: number | undefined;
/** Whether the "report this bug" crash toast has already been shown this session (show it once). */
let crashToastShown = false;
/**
 * The last status kind received, so a status that repeats doesn't
 * re-toast (a genuine retry re-enters 'failed' through 'loading')
 */
let lastStatusKind: CevalStatus['kind'] | undefined;

// Functions -------------------------------------------------------------------

/** Initializes the engine panel. Called once by the page entry. */
function init(): void {
	ceval.init();
	enginelegalmoves.init({
		canRequest: () => {
			const gamefile = gameslot.getGamefile();
			return gamefile !== undefined && ceval.computeBlockReason(gamefile) === undefined;
		},
		requestMoves: ({ id, positionIcn }) => ceval.requestLegalMoves(id, positionIcn),
		release: () => ceval.terminateLegalWorker(),
	});

	initSettingsUI();
	initListeners();

	ceval.onUpdate(onEngineUpdate);
	ceval.onStatus(onEngineStatus);
	ceval.onLegalMoves(({ requestId, moves }) => enginelegalmoves.receiveMoves(requestId, moves));

	// Restore the persisted on/off state once the first game finishes loading.
	GameBus.addEventListener('game-loaded', () => {
		const wanted = localStorage.getItem(ENABLED_STORAGE_KEY) !== 'false';
		if (wanted && !ceval.isEnabled()) setEngineEnabled(true);
	});

	// Draw engine arrows on top of the pieces each frame.
	GameBus.addEventListener('render-above-pieces', () => enginearrows.render());
}

function setEngineEnabled(value: boolean): void {
	element_Toggle.checked = value;
	localStorage.setItem(ENABLED_STORAGE_KEY, String(value));
	ceval.setEnabled(value);
	// Only hide here; showing happens in onEngineUpdate, synchronized with the value it displays —
	// showing it eagerly on enable would flash an uninitialized (0%, all-white) bar for a frame.
	if (!value) {
		setGaugeVisible(false);
		clearPanelReadout('Local evaluation off');
	}
}

/** Shows/hides the eval gauge. */
function setGaugeVisible(visible: boolean): void {
	const wasHidden = element_Gauge.classList.contains('hidden');
	element_Gauge.classList.toggle('hidden', !visible);
	// Toggling its visibility affects the canvas's width,
	// emit a 'resize' event so it doesn't get stretched.
	if (wasHidden === visible) window.dispatchEvent(new Event('resize'));
}

// Settings UI -----------------------------------------------------------------

function initSettingsUI(): void {
	const settings = ceval.getSettings();

	element_MultiPv.max = String(ceval.MAX_MULTI_PV);
	element_MultiPv.value = String(settings.multiPv);
	element_MultiPvValue.textContent = String(settings.multiPv);

	// Threads: 1..maxThreads, direct value.
	element_Threads.value = String(settings.threads);
	element_ThreadsValue.textContent = String(settings.threads);
	applyThreadsCap();

	// Hash: index slider over its option array (Memory doubles each step).
	element_Hash.max = String(ceval.HASH_OPTIONS.length - 1);
	element_Hash.value = String(Math.max(0, ceval.HASH_OPTIONS.indexOf(settings.hashMb)));
	element_HashValue.textContent = `${settings.hashMb} MB`;

	// Depth: direct value, step 1.
	element_Depth.min = String(ceval.MIN_DEPTH);
	element_Depth.max = String(ceval.MAX_DEPTH);
	element_Depth.value = String(settings.depth);
	element_DepthValue.textContent = String(settings.depth);
}

/** Enables the threads slider up to {@link ceval.maxThreads}, or locks it to 1 (disabled)
 * when Lazy SMP is unavailable (non-isolated browser or single-threaded engine build). */
function applyThreadsCap(): void {
	const cap = ceval.maxThreads();
	element_Threads.max = String(cap);
	if (cap <= 1) {
		element_Threads.value = '1';
		element_Threads.disabled = true;
		element_ThreadsValue.textContent = '1';
		element_Threads.title =
			'Multithreading unavailable (needs a cross-origin-isolated browser and a threaded engine build).';
	} else {
		element_Threads.disabled = false;
		element_Threads.title = '';
	}
}

function initListeners(): void {
	element_Toggle.addEventListener('change', () => setEngineEnabled(element_Toggle.checked));

	element_SettingsBtn.addEventListener('click', () => {
		const open = element_Settings.classList.toggle('hidden') === false;
		element_SettingsBtn.classList.toggle('active', open);
	});

	// Close the settings drawer when clicking anywhere outside it or its toggle button.
	document.addEventListener('pointerdown', (e) => {
		if (element_Settings.classList.contains('hidden')) return;
		if (!(e.target instanceof Node)) return;
		if (element_SettingsBtn.contains(e.target) || element_Settings.contains(e.target)) return;
		closeSettings();
	});

	// The MultiPV/threads/depth sliders map their raw value straight to the setting; the
	// Hash slider's value is an index into HASH_OPTIONS whose MB is the setting.
	bindSettingSlider(element_MultiPv, element_MultiPvValue, String, (v) => ceval.updateSettings({ multiPv: v })); // prettier-ignore
	bindSettingSlider(element_Threads, element_ThreadsValue, String, (v) => ceval.updateSettings({ threads: v })); // prettier-ignore
	bindSettingSlider(element_Depth, element_DepthValue, String, (v) => {
		ceval.updateSettings({ depth: v });
		// Reshape the progress bar's fill and the "Depth XX/YY" header's target the moment the
		// new target commits, rather than waiting for the engine to finish its next depth.
		if (!ceval.isEnabled()) return;
		const update = ceval.getLatestUpdate();
		if (update) element_Stats.textContent = formatStats(update, v);
		updateProgress(update, v);
	});
	bindSettingSlider(
		element_Hash,
		element_HashValue,
		(v) => `${ceval.HASH_OPTIONS[v]!} MB`,
		(v) => ceval.updateSettings({ hashMb: ceval.HASH_OPTIONS[v]! }),
	);

	element_GoDeeper.addEventListener('click', () => {
		element_GoDeeper.classList.add('hidden');
		// ceval.goDeeper() re-emits immediately with the deeper target, which drives
		// onEngineUpdate → the stats text and progress bar both update right away.
		ceval.goDeeper();
	});
}

/**
 * Wires a settings slider: 'input' updates its live label as it drags, 'change' commits the
 * value to the engine on release. `format` and `commit` both receive the slider's numeric value.
 */
function bindSettingSlider(
	input: HTMLInputElement,
	label: HTMLElement,
	format: (value: number) => string,
	commit: (value: number) => void,
): void {
	input.addEventListener('input', () => (label.textContent = format(Number(input.value))));
	input.addEventListener('change', () => commit(Number(input.value)));
}

/** Polls this panel's keyboard shortcuts. Called once per frame by the page loop. */
function updateShortcuts(): void {
	// l = toggle local evaluation (the input listener already ignores keys while typing).
	if (listener_document.isKeyDown('KeyL')) setEngineEnabled(!element_Toggle.checked);
}

function closeSettings(): void {
	element_Settings.classList.add('hidden');
	element_SettingsBtn.classList.remove('active');
}

// Engine output rendering -----------------------------------------------------

/**
 * Resets the panel to a no-lines readout: clears the arrows and PV list (which also resets
 * the per-line window state), hides "go deeper", and sets the eval/stats text. Optionally
 * sets the gauge (left untouched when omitted) and drives the progress bar.
 */
function clearPanelReadout(
	statsText: string,
	opts: { evalText?: string; gauge?: number; progress?: CevalUpdate } = {},
): void {
	element_Eval.textContent = opts.evalText ?? '-';
	element_Stats.textContent = statsText;
	element_GoDeeper.classList.add('hidden');
	enginearrows.clearArrows();
	renderLines([]);
	if (opts.gauge !== undefined) updateGauge(opts.gauge);
	updateProgress(opts.progress);
}

function onEngineStatus(status: CevalStatus): void {
	applyThreadsCap(); // Re-evaluate: the engine's threading capability arrives with its status.
	const changed = status.kind !== lastStatusKind;
	lastStatusKind = status.kind;
	if (status.kind === 'loading') {
		element_Stats.textContent = 'Loading engine…';
		updateProgress(ceval.getLatestUpdate());
	} else if (status.kind === 'failed') {
		element_Toggle.checked = false;
		setGaugeVisible(false);
		element_Stats.textContent = 'Engine failed to load';
		updateProgress(undefined);
		if (changed) toast.show('The engine failed to load.', { error: true });
	} else if (status.kind === 'blocked') {
		setGaugeVisible(false);
		clearPanelReadout(t.shared.position_errors.engine[status.reason].label);
	} else if (status.kind === 'crashed') {
		clearPanelReadout('Analysis crashed', { gauge: 0 });
		if (!crashToastShown) {
			toast.show('The engine crashed analyzing this position. Please report this bug!', { error: true }); // prettier-ignore
			crashToastShown = true;
		}
	}
}

function onEngineUpdate(update: CevalUpdate | undefined): void {
	if (!ceval.isEnabled()) return;

	if (!update) {
		// Position changed; awaiting the first info of the new search.
		clearPanelReadout('Starting analysis', { evalText: '…' });
		return;
	}

	// A cached position renders its lines immediately (no intervening empty-lines update
	// to clear the maps above), so detect the position change here too.
	if (update.moveIndex !== lineWindowStateMoveIndex) resetLineWindowState();
	lineWindowStateMoveIndex = update.moveIndex;

	if (update.terminal) {
		setGaugeVisible(true);
		clearPanelReadout('Game Over', { gauge: terminalGaugeChances(), progress: update });
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

	setGaugeVisible(true);
	updateGauge(best?.winningChances ?? 0);
	updateProgress(update);
	renderLines(update.lines);
	enginearrows.update(update);
}

/** Formats a white-POV line eval for display, e.g. "+1.4", "-0.3", "#5", "#-3". */
function formatEval(line: CevalLine): string {
	if (line.mate !== undefined) return line.mate > 0 ? `#${line.mate}` : `#-${Math.abs(line.mate)}`; // prettier-ignore
	const pawns = (line.cp ?? 0) / 100;
	return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
}

/**
 * Formats the depth and nps stats for display, e.g. "Depth 15/20 · 1.2 Mn/s".
 * @param targetDepthOverride - Lets the depth slider update the "/YY" target
 * before the engine re-emits with it.
 */
function formatStats(update: CevalUpdate, targetDepthOverride?: number): string {
	// Guard against a stale target briefly lagging the reached depth (e.g. right after
	// "go deeper") — never show something like "15/13".
	const target = targetDepthOverride ?? update.targetDepth;
	const depth = `Depth ${update.depth}/${Math.max(target, update.depth)}`;
	// Only show speed while actually searching (like lichess): once finished nps is 0.
	const searching = !update.done && !update.terminal;
	if (!searching || update.nps <= 0) return depth;
	const nps =
		update.nps >= 1_000_000
			? `${(update.nps / 1_000_000).toFixed(1)} Mn/s`
			: `${Math.round(update.nps / 1000)} kn/s`;
	return `${depth} · ${nps}`;
}

/**
 * Drives the progress bar's fill (depth / target).
 * @param targetDepthOverride - Lets the depth slider reshape the bar
 * to a just-committed target before the engine re-emits with it.
 */
function updateProgress(update: CevalUpdate | undefined, targetDepthOverride?: number): void {
	const active = ceval.isEnabled() && !ceval.isBlocked();
	const targetDepth = targetDepthOverride ?? update?.targetDepth ?? ceval.getSettings().depth;
	// Reaching the target depth ALWAYS stops the animation, regardless of `done` — a bar shown
	// fully filled must never keep pulsing, even if the engine's own completion flag lagged.
	const reachedTarget = !!update && update.depth >= targetDepth;
	const computing = active && (!update || (!update.done && !update.terminal && !reachedTarget));
	const progress = update ? Math.min(update.depth / Math.max(targetDepth, 1), 1) : 0;
	// While computing, keep a small minimum so the animated bar is visible immediately
	// (e.g. at depth 0 right after a move or on "go deeper"), not a zero-width sliver.
	const width = computing && update ? Math.max(progress, 0.05) : progress;
	element_ProgressFill.style.width = `${Math.round(width * 100)}%`;
	element_Progress.classList.toggle('computing', computing);
}

/**
 * Positions the eval gauge for a white-POV win probability.
 * @param chances - White's winning chances in [-1, 1] (+1 = white fully winning, -1 = black).
 */
function updateGauge(chances: number): void {
	// chances=+1 (white winning) → black bar 0%; chances=-1 → 100%.
	element_GaugeBlack.style.height = `${50 - chances * 50}%`;
}

/**
 * White-POV gauge fill for a game-over position: +1/-1 for a decisive winner, 0 for a draw.
 * A terminal position is always the front of its line, where gamefile.gameConclusion holds
 * that branch's own conclusion (each branch restores its conclusion when reselected).
 */
function terminalGaugeChances(): number {
	const gamefile = gameslot.getGamefile();
	if (!gamefile || !moveutil.areWeViewingLatestMove(gamefile)) return 0; // Stale update | not on the front.
	const victor = gamefile.gameConclusion?.victor;
	return victor === p.WHITE ? 1 : victor === p.BLACK ? -1 : 0;
}

// PV lines --------------------------------------------------------------------

function renderLines(lines: CevalLine[]): void {
	element_Lines.replaceChildren();
	if (lines.length === 0) resetLineWindowState();

	// Reserve the configured MultiPV row count (only while the engine is on) so the panel
	// height doesn't change as the search collapses/expands lines — see the CSS.
	element_Lines.style.setProperty(
		'--pv-rows',
		String(ceval.isEnabled() ? ceval.getSettings().multiPv : 0),
	);

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
		// Use 'pointerdown', as with 'click' the line changing mid-click cancels the click.
		moveSpan.addEventListener('pointerdown', () => playLine(line.moves, i));
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
	// The line's opening moves may already exist as a branch (e.g. a game review's suggested
	// line). Swap onto it rather than grafting a duplicate, so its continuation stays navigable.
	const start = enterExistingBranch(gamefile, tokens, untilIndex);

	if (start <= untilIndex) {
		if (!moveutil.areWeViewingLatestMove(gamefile)) branchFromViewedPosition(gamefile);
		// Board moveIndex where the line's first uncommitted token applies. Used for debugging.
		const startMoveIndex = gamefile.state.local.moveIndex;
		for (let i = start; i <= untilIndex; i++) {
			const result = movevalidation.isTokenMoveLegal(gamefile, tokens[i]!);
			if (!result.valid) {
				console.error(`Engine line move "${tokens[i]}" (token index ${i}) at moveIndex ${gamefile.state.local.moveIndex} is not legal to apply here: ${result.reason}`); // prettier-ignore
				console.error(`Full line (starting at moveIndex ${startMoveIndex}):`, tokens);
				break;
			}
			// Animate only the final move of the sequence.
			if (i === untilIndex) movesequence.makeMoveAndAnimate(gamefile, mesh, result.tagged);
			else movesequence.makeMove(gamefile, mesh, result.tagged);
			if (gamefile.gameConclusion) break; // The line ended the game.
		}
	}

	selection.reselectPiece();
}

/**
 * Walks `tokens` down the branches that already exist beneath the viewed move, navigating once to
 * the deepest node reached. Returns the index of the first token with no matching branch — where
 * committing must resume — which is `untilIndex + 1` when the whole clicked line already existed.
 */
function enterExistingBranch(gamefile: GameFile, tokens: string[], untilIndex: number): number {
	let node = movetree.getCurrentNode(gamefile);
	let deepest: AnalysisMoveNode | undefined;
	let i = 0;
	while (node && i <= untilIndex) {
		const child = node.children.find((candidate) => candidate.move!.token === tokens[i]);
		if (!child) break;
		node = deepest = child;
		i++;
	}
	if (deepest) guimovetree.navigateToNode(deepest);
	return i;
}

/**
 * Truncates the analysis game to the currently-viewed ply so a new move can branch from it:
 * trims the move tree's active line and slices the flat move list to the viewed index, leaving
 * the gamefile genuinely at that position (board, turn, and global state all consistent).
 *
 * Deliberately does NOT dispatch 'moves-changed'. This is only ever a prelude to a move commit,
 * whose own dispatch reconciles the final state. Don't trigger the move list to re-render twice over.
 */
function branchFromViewedPosition(gamefile: GameFile): void {
	movetree.beginBranchFromViewedPosition(gamefile);
	// Slice all moves off the gamefile after the current ply.
	gamefile.moves.length = gamefile.state.local.moveIndex + 1;
	// Has a chance of being wrong. We would otherwise have to perform game-over
	// checks again. We don't store gameConclusion as a global state change per move.
	gamefile.gameConclusion = undefined;
	animation.clearAnimations();
}

// Registration ----------------------------------------------------------------

// Tell selection.ts to branch from the viewed ply (instead of forwarding to the front)
// when a piece is selected mid-game, so a new continuation can be played from there.
selection.setViewedPositionBrancher(branchFromViewedPosition);

// Exports ---------------------------------------------------------------------

export default {
	init,
	updateShortcuts,
};
