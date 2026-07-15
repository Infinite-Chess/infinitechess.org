// src/client/scripts/esm/views/analysis/ceval.ts

/**
 * Client-side engine evaluation controller for the analysis board (lichess "ceval"
 * equivalent). Owns the analysis worker's lifecycle and settings, keeps it pointed
 * at the currently *viewed* position, and streams normalized (white-POV) engine
 * updates to UI subscribers, throttled for rendering.
 */

import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type {
	AnalysisCommand,
	AnalysisInfo,
	AnalysisResponse,
} from './hydrochessanalysis.worker.js';

import math from '../../../../../shared/util/math/math.js';
import moveutil from '../../../../../shared/chess/util/moveutil.js';
import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';
import { players as p } from '../../../../../shared/chess/util/typeutil.js';

import gameslot from '../../game/chess/gameslot.js';
import { GameBus } from '../../game/GameBus.js';
import gamecompressor from '../../game/chess/gamecompressor.js';
import analysisenginebounds from './analysisenginebounds.js';

// Types ------------------------------------------------------------------------

/** Engine settings, persisted to localStorage. */
interface CevalSettings {
	/** Number of engine lines to search & display (1-5). */
	multiPv: number;
	/** Transposition table size in MB. */
	hashMb: number;
	/** Target search depth; the analysis stops here until "go deeper" is pressed. */
	depth: number;
	/** Lazy SMP search threads (1 = single-threaded). */
	threads: number;
}

/** A PV line normalized for the UI. */
interface CevalLine {
	/** Compact ICN move tokens ("x,y>x,y=Q"), from the analyzed position. */
	moves: string[];
	/** Centipawns, white POV. Absent when mating. */
	cp?: number;
	/** Full moves to mate, white POV sign (positive = white mates). */
	mate?: number;
	/** Win probability for white in [-1, 1] (lichess winning-chances sigmoid). */
	winningChances: number;
}

/** A normalized engine update for the UI. */
interface CevalUpdate {
	depth: number;
	seldepth: number;
	nodes: number;
	nps: number;
	hashfull: number;
	lines: CevalLine[];
	/** The MultiPV count this search was run at (lets a cache hit tell if it holds fewer lines than now wanted). */
	multiPv: number;
	/** The depth this analysis is running to (the setting, or {@link MAX_DEPTH} when going deeper). */
	targetDepth: number;
	/** The move index this analysis belongs to (gamefile.state.local.moveIndex). */
	moveIndex: number;
	/** Whether the engine finished this position (reached target depth / mate / terminal). */
	done: boolean;
	/** The viewed position is game-over (no legal moves): no lines will ever come. */
	terminal: boolean;
}

/** Engine lifecycle status, for the UI status row. `crashed` = this position reliably panics the engine. */
type CevalStatus = 'off' | 'loading' | 'computing' | 'idle' | 'failed' | 'blocked' | 'crashed';

interface CevalLegalMovesUpdate {
	requestId: number;
	moves: string[];
}

interface RefreshAnalysisOptions {
	/** Start this same position again from depth 1, keeping the on-screen cache visible. */
	restartSearch?: boolean;
}

// Constants ----------------------------------------------------------------------

/** The engine's maximum search depth — the ceiling that "go deeper" runs toward. */
const MAX_DEPTH = 64;
/** Lowest selectable target depth. */
const MIN_DEPTH = 1;
/** Hash size choices in MB (engine caps its TT at 64MB). */
const HASH_OPTIONS: number[] = [16, 32, 64];
const MAX_MULTI_PV = 5;
/** UI update throttle. */
const THROTTLE_MS = 60;
/** Crashes on the same position before we give up on it (2 = retry once, then flag it un-analyzable). */
const CRASHES_BEFORE_GIVING_UP = 2;
/** Hard cap on Lazy SMP threads: the engine's analysis path uses at most 4. */
const THREAD_CAP = 4;

/**
 * Whether this browser can run WebAssembly threads: needs cross-origin isolation (COOP+COEP)
 * for a shared-memory SharedArrayBuffer. Same feature detection Stockfish/lichess use.
 */
const BROWSER_SUPPORTS_THREADS: boolean = (() => {
	try {
		// crossOriginIsolated gates SharedArrayBuffer in every modern browser.
		if (!globalThis.crossOriginIsolated) return false;
		if (typeof SharedArrayBuffer !== 'function' || typeof Atomics !== 'object') return false;
		if (typeof WebAssembly !== 'object') return false;
		const mem = new WebAssembly.Memory({ shared: true, initial: 1, maximum: 2 });
		return mem.buffer instanceof SharedArrayBuffer;
	} catch {
		return false;
	}
})();

/** Whether the served engine build supports Lazy SMP (a single-threaded build exports no
 * `initThreadPool`). The worker reports it on load; assume true until then. */
let engineSupportsThreads = true;

/** Most threads the user can pick: {@link THREAD_CAP} when threading is usable, else 1 (locked). */
function maxThreads(): number {
	if (!BROWSER_SUPPORTS_THREADS || !engineSupportsThreads) return 1;
	return math.clamp(navigator.hardwareConcurrency || 2, 1, THREAD_CAP);
}

const DEFAULT_THREADS = maxThreads();

const STORAGE_PREFIX = 'ceval.';
const DEFAULT_SETTINGS: CevalSettings = {
	multiPv: 1,
	hashMb: 16,
	depth: 13,
	threads: DEFAULT_THREADS,
};

// State ----------------------------------------------------------------------------

/** Set once by {@link init} with the page-provided worker + engine-glue URLs. */
let config: { engineUrl: string; workerUrl: string } | undefined;

/** The persistent search worker. Kept alive across position switches so its transposition table stays warm. */
let worker: Worker | undefined;
let workerReady = false;
/** An idle helper worker that only answers legal-moves queries, so they never queue behind the search. */
let legalWorker: Worker | undefined;
let legalReady = false;
/**
 * View over the search worker's shared wasm memory + the byte offset of its stop flag. Writing
 * a 1 there aborts the in-flight search within a node batch — instant position switch, warm hash.
 */
let stopFlags: Uint8Array | undefined;
let stopFlagPtr = 0;

let enabled = false;
let settings: CevalSettings = loadSettings();

/** The ICN of the position the worker is currently analyzing (undefined once the position is superseded but not yet re-analyzed). */
let lastAnalyzedIcn: string | undefined;
/** Whether the next position command should reset the engine's search state. */
let nextPositionIsNewGame = true;
/** Snapshot of the analyzed position (for POV + staleness checks). */
let analyzed:
	| { requestId: number; icn: string; moveIndex: number; turn: number; multiPv: number }
	| undefined;
let activeRequestId = 0;
/** Whether "go deeper" is active for the current position (search to {@link MAX_DEPTH}). */
let goDeeperActive = false;
/** The depth the in-flight analysis is running to. */
let currentTargetDepth = DEFAULT_SETTINGS.depth;
/** Allows an intentional same-position restart (e.g. adding PV lines) to repaint lower-depth rows. */
let allowDepthRegressionForCurrentSearch = false;
/** The viewed position has a piece outside HydroChess's safe coordinate range. */
let blockedByEngineWorldBorder = false;

let latestUpdate: CevalUpdate | undefined;
let throttleTimer: ReturnType<typeof setTimeout> | undefined;
/** When the last update was emitted (drives the leading-edge throttle in {@link scheduleEmit}). */
let lastEmitMs = 0;
/** Whether a coalesced 'view-move' refresh is already scheduled for this microtask. */
let refreshQueued = false;
/** The ICN of the position the most recent crash happened on, and how many times it's crashed. */
let lastCrashIcn: string | undefined;
let lastCrashCount = 0;
/** A position (ICN) that has crashed the engine too many times — we stop feeding it to the worker entirely. */
let crashedIcn: string | undefined;
/** Whether the currently-viewed position is the crashed one (drives the 'crashed' status). */
let onCrashedPosition = false;

/** Per-page-session cache of every viewed position's deepest local analysis. */
const positionCache = new Map<string, CevalUpdate>();

const updateListeners = new Set<(update: CevalUpdate | undefined) => void>();
const statusListeners = new Set<(status: CevalStatus) => void>();
const legalMovesListeners = new Set<(update: CevalLegalMovesUpdate) => void>();
const queuedLegalMovesRequests: { requestId: number; icn: string }[] = [];

// Settings persistence ----------------------------------------------------------------

function loadSettings(): CevalSettings {
	const loaded = { ...DEFAULT_SETTINGS };
	for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof CevalSettings)[]) {
		const raw = localStorage.getItem(STORAGE_PREFIX + key);
		if (raw === null) continue;
		const num = Number(raw);
		if (Number.isFinite(num)) loaded[key] = num;
	}
	// Sanitize against the allowed ranges.
	loaded.multiPv = math.clamp(loaded.multiPv, 1, MAX_MULTI_PV);
	if (!HASH_OPTIONS.includes(loaded.hashMb)) loaded.hashMb = DEFAULT_SETTINGS.hashMb;
	loaded.depth = math.clamp(Math.round(loaded.depth), MIN_DEPTH, MAX_DEPTH);
	loaded.threads = math.clamp(Math.round(loaded.threads), 1, maxThreads());
	return loaded;
}

function persistSettings(): void {
	for (const [key, value] of Object.entries(settings)) {
		localStorage.setItem(STORAGE_PREFIX + key, String(value));
	}
}

// Winning chances (adjusted for infinitechess players) ------------------------------------

/**
 * Maps a centipawn score to winning chances in [-1, 1], from that score's POV.
 * Clamps to ±`clampCp` first, so a caller's mate sentinel can sit at the extreme.
 */
function cpToWinningChances(cp: number, clampCp: number): number {
	const clamped = math.clamp(cp, -clampCp, clampCp);
	// Shallow curve (0.003) assumes players convert
	// advantages less efficiently than a perfect engine would.
	return 2 / (1 + Math.exp(-0.003 * clamped)) - 1;
}

/** White-POV cp → winning chances for the eval gauge. */
function cpWinningChances(cp: number): number {
	// Clamp at ±1200 so a mate (±1) always shows a higher gauge than any non-mate eval.
	return cpToWinningChances(cp, 1200);
}

/**
 * A white-POV forced mate maps to a full win probability (±1),
 * filling the gauge completely with the winner's color.
 */
function mateWinningChances(mate: number): number {
	return mate > 0 ? 1 : -1;
}

/** Winning chances for a line's eval — mate takes precedence over cp. */
function lineWinningChances(cp: number | undefined, mate: number | undefined): number {
	return mate !== undefined ? mateWinningChances(mate) : cpWinningChances(cp ?? 0);
}

// Worker lifecycle -----------------------------------------------------------------------

/** Wires an active worker's responses into the main message + crash handlers. */
function attachActiveWorkerHandlers(w: Worker): void {
	w.onmessage = (e: MessageEvent<AnalysisResponse>) => handleWorkerMessage(e.data);
	w.onerror = (e: ErrorEvent) => {
		console.error(
			`[ceval] Analysis worker crashed: ${e.message || '(no message)'} @ ${e.filename}:${e.lineno}:${e.colno}`,
			e.error,
		);
		handleWorkerFailure();
	};
}

/** Spawns (or respawns) the search worker with the current settings and Lazy SMP thread count. */
function spawnWorker(): void {
	if (!config) throw Error('ceval.init() must be called before enabling analysis.');
	terminateWorker();

	workerReady = false;
	notifyStatus();

	worker = new Worker(config.workerUrl, { type: 'module' });
	attachActiveWorkerHandlers(worker);
	send({
		cmd: 'init',
		hashMb: settings.hashMb,
		threads: settings.threads,
		engineUrl: config.engineUrl,
	});
}

function terminateWorker(): void {
	worker?.terminate();
	worker = undefined;
	workerReady = false;
	stopFlags = undefined; // Points into the terminated worker's memory; the respawn posts a fresh one.
	// Keep lastAnalyzedIcn: a respawn (e.g. hash change) re-sends the same position
	// via a forced refresh, so the on-screen eval shouldn't blank.
}

/** Aborts the search worker's in-flight slice instantly (the search polls this shared flag every node batch). */
function interruptSearch(): void {
	if (stopFlags) stopFlags[stopFlagPtr] = 1;
}

// Legal-moves helper worker --------------------------------------------------------------

/** Warms the idle helper worker that answers legal-moves queries (no thread pool — it never searches). */
function ensureLegalWorker(): void {
	if (legalWorker || !config) return;
	const w = new Worker(config.workerUrl, { type: 'module' });
	legalReady = false;
	w.onmessage = (e: MessageEvent<AnalysisResponse>) => {
		if (legalWorker !== w) return; // Superseded; ignore late messages.
		switch (e.data.type) {
			case 'ready':
				legalReady = true;
				flushQueuedLegalMovesRequests();
				break;
			case 'initerror':
				terminateLegalWorker();
				break;
			case 'legalmoves':
				receiveLegalMoves(e.data);
				break;
		}
	};
	w.onerror = () => {
		if (legalWorker === w) terminateLegalWorker();
	};
	legalWorker = w;
	w.postMessage({
		cmd: 'init',
		hashMb: settings.hashMb,
		engineUrl: config.engineUrl,
	} satisfies AnalysisCommand);
}

function terminateLegalWorker(): void {
	legalWorker?.terminate();
	legalWorker = undefined;
	legalReady = false;
}

// Fault recovery -------------------------------------------------------------------------

/**
 * Handles a worker crash. Counts crashes per position by ICN — NOT reset by search progress,
 * since a crash can arrive after several depths stream in. Once the same position has crashed
 * {@link CRASHES_BEFORE_GIVING_UP} times, flags it un-analyzable so we stop feeding it in and
 * looping. The respawn still happens so other positions keep working.
 */
function recoverFromEngineFault(): void {
	const icn = analyzed?.icn ?? lastAnalyzedIcn;
	if (icn !== undefined && icn === lastCrashIcn) lastCrashCount++;
	else {
		lastCrashIcn = icn;
		lastCrashCount = 1;
	}

	if (lastCrashCount >= CRASHES_BEFORE_GIVING_UP) {
		console.error(
			'[ceval] Analysis engine crashed repeatedly on this position; giving up on it.',
		);
		crashedIcn = icn;
	} else {
		console.warn(`[ceval] Analysis worker crashed; restarting (crash ${lastCrashCount}).`);
	}
	restartWorkerForSearch(); // A fresh worker either retries (under the limit) or stays warm for OTHER positions.
}

/** Fully clears engine runtime state that cannot safely cross game/variant boundaries. */
function resetEngineSession(): void {
	terminateWorker();
	terminateLegalWorker();
	latestUpdate = undefined;
	analyzed = undefined;
	activeRequestId++;
	lastAnalyzedIcn = undefined;
	nextPositionIsNewGame = true;
	goDeeperActive = false;
	currentTargetDepth = settings.depth;
	allowDepthRegressionForCurrentSearch = false;
	blockedByEngineWorldBorder = false;
	lastCrashIcn = undefined;
	lastCrashCount = 0;
	crashedIcn = undefined;
	onCrashedPosition = false;
	positionCache.clear();
	queuedLegalMovesRequests.length = 0;
	emitNow();
	notifyStatus();
}

function send(command: AnalysisCommand): void {
	worker?.postMessage(command);
}

/** Sends any legal-move requests that were queued while the helper worker was still spinning up. */
function flushQueuedLegalMovesRequests(): void {
	if (!legalReady || !legalWorker) return;
	for (const request of queuedLegalMovesRequests.splice(0)) {
		legalWorker.postMessage({
			cmd: 'legalmoves',
			requestId: request.requestId,
			icn: request.icn,
		} satisfies AnalysisCommand);
	}
}

function handleWorkerFailure(): void {
	terminateWorker();
	terminateLegalWorker();
	enabled = false;
	queuedLegalMovesRequests.length = 0;
	notifyStatus('failed');
}

function handleWorkerMessage(msg: AnalysisResponse): void {
	switch (msg.type) {
		case 'ready':
			workerReady = true;
			// A single-threaded engine build locks the thread setting to 1 (panel disables the slider).
			if (!msg.mt && engineSupportsThreads) {
				engineSupportsThreads = false;
				if (settings.threads > 1) {
					settings = { ...settings, threads: 1 };
					persistSettings();
				}
			}
			refreshAnalysis(true); // Fresh wasm module, so this always restarts from depth 1.
			ensureLegalWorker();
			notifyStatus();
			break;
		case 'initerror':
			handleWorkerFailure();
			break;
		case 'sharedmem':
			stopFlags = new Uint8Array(msg.buffer);
			stopFlagPtr = msg.stopFlagPtr;
			break;
		case 'info':
			// NOTE: deliberately does NOT reset the crash counter — a crash can arrive after
			// several depths stream in, so progress must not clear the per-position count.
			receiveInfo(msg.requestId, msg.info, false);
			break;
		case 'done':
			receiveInfo(msg.requestId, msg.info, true, msg.reason === 'terminal');
			notifyStatus();
			break;
		case 'searcherror':
			console.error('[ceval] Analysis search crashed:', msg.message);
			recoverFromEngineFault();
			break;
		case 'legalmoves':
			receiveLegalMoves(msg);
			break;
	}
}

// Position tracking --------------------------------------------------------------------

/**
 * The compact ICN of the position under analysis, built with the same
 * `compressGamefile` + `LongToShort_Format` machinery the gameplay engine worker
 * (hydrochess.ts) uses. It carries the FULL move list (not just a single position)
 * so the engine replays the game and has the history it needs to detect threefold
 * repetition and the fifty-move rule. The moves are truncated to the ply currently
 * being viewed, so navigating back analyzes that earlier position with its own history.
 */
function getViewedPositionIcn(gamefile: GameFile): string {
	const longformIn = gamecompressor.compressGamefile(gamefile);
	const viewedPlyCount = gamefile.state.local.moveIndex + 1;
	if (longformIn.moves && longformIn.moves.length > viewedPlyCount) {
		longformIn.moves = longformIn.moves.slice(0, viewedPlyCount);
	}
	// Result/Termination are irrelevant to the engine
	delete longformIn.metadata.Result;
	delete longformIn.metadata.Termination;
	// Always hand the engine an explicit world border. Without one it falls back to its own
	// narrow internal default (1e15); the resolved border (the position's own, else ±i64-wiggle)
	// lets it evaluate the full safe coordinate range. compressGamefile deep-copies gameRules,
	// so this doesn't touch the live game.
	longformIn.gameRules.worldBorder = analysisenginebounds.getEngineWorldBorder(gamefile);
	return icnconverter.LongToShort_Format(longformIn, {
		compact: true,
		skipPosition: false,
		spaces: false,
		comments: false,
		make_new_lines: false,
		move_numbers: false,
	});
}

/** Coalesces a burst of synchronous 'view-move' events into one refresh of the final position. */
function scheduleRefresh(): void {
	if (refreshQueued) return;
	refreshQueued = true;
	queueMicrotask(() => {
		refreshQueued = false;
		refreshAnalysis();
	});
}

/**
 * Re-points the engine at the currently viewed position and (re)starts the search.
 * @param force - Resend even if the position is unchanged (used for settings changes
 *   and toggling the engine on). A same-position resend keeps the currently-shown eval
 *   on screen (no blank) and preserves the engine's transposition table, so changing
 *   MultiPV / search time, or toggling the engine off then on, resumes instantly rather
 *   than resetting the analysis.
 */
function refreshAnalysis(force = false, options: RefreshAnalysisOptions = {}): void {
	if (!enabled) return;
	// Note: only the logical gamefile is required — 'game-loaded' fires while
	// graphics are still loading, and analysis shouldn't wait on textures.
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return;

	if (!analysisenginebounds.areAllPiecesInBounds(gamefile)) {
		blockAnalysisForEngineWorldBorder();
		return;
	}

	if (blockedByEngineWorldBorder) {
		blockedByEngineWorldBorder = false;
		lastAnalyzedIcn = undefined;
	}

	if (!worker || !workerReady) return;

	const icn = getViewedPositionIcn(gamefile);

	// This position crashed the engine twice — never send it again (that just re-crashes the worker).
	onCrashedPosition = icn === crashedIcn;
	if (onCrashedPosition) {
		interruptSearch();
		latestUpdate = undefined;
		lastAnalyzedIcn = icn;
		emitNow();
		notifyStatus();
		return;
	}

	const positionChanged = icn !== lastAnalyzedIcn;
	if (!force && !positionChanged) return;

	if (positionChanged) {
		// A cache from a lower MultiPV has too few lines for the current setting — drop it and
		// re-search fresh rather than showing a short list until the engine catches up.
		if ((positionCache.get(icn)?.multiPv ?? Infinity) < settings.multiPv)
			positionCache.delete(icn);
		// "Go deeper" is a one-shot for the position it was pressed on; any new position
		// (cycling moves or making one) reverts to the default target depth.
		goDeeperActive = false;
		allowDepthRegressionForCurrentSearch = false;
	}

	currentTargetDepth = goDeeperActive ? MAX_DEPTH : settings.depth;
	const cached = positionCache.get(icn);

	if (positionChanged) {
		latestUpdate = cached ? retargetCachedUpdate(cached) : undefined;
		emitNow(); // Show cached eval immediately, or clear when this position is new.
	}

	// The cache already reached the current target depth (and has enough lines): show it and skip
	// a fresh cold search entirely, like lichess's doStart early-return. Only "go deeper" (which
	// raises the target to MAX_DEPTH) or a not-yet-finished cache falls through to a real search.
	if (
		cached &&
		cached.multiPv >= settings.multiPv &&
		(cached.terminal || cached.depth >= currentTargetDepth)
	) {
		interruptSearch(); // Abort any prior slice instantly; keep the worker (and its warm hash).
		send({ cmd: 'stop' });
		activeRequestId++; // Drop any tail info from that stopped search.
		analyzed = undefined;
		latestUpdate = retargetCachedUpdate(cached);
		emitNow();
		lastAnalyzedIcn = icn;
		notifyStatus();
		return;
	}

	// ALWAYS interrupt before sending: the worker's search call is unbounded (unsliced), so
	// queued commands are only processed once the shared stop flag aborts the in-flight call
	// (within a node batch). The worker keeps its warm transposition table either way, so
	// re-reaching the prior depth after a position switch is near-instant.
	interruptSearch();

	const moveIndex = gamefile.state.local.moveIndex;
	const requestId = ++activeRequestId;
	analyzed = {
		requestId,
		icn,
		moveIndex,
		turn: moveutil.getWhosTurnAtMoveIndex(gamefile, moveIndex),
		multiPv: settings.multiPv,
	};

	send({
		cmd: 'position',
		icn,
		newGame: nextPositionIsNewGame,
		resetSearch: options.restartSearch,
	});
	send({
		cmd: 'go',
		opts: { multiPv: settings.multiPv, maxDepth: currentTargetDepth, requestId },
	});
	lastAnalyzedIcn = icn;
	nextPositionIsNewGame = false;
	notifyStatus();
}

function blockAnalysisForEngineWorldBorder(): void {
	interruptSearch();
	send({ cmd: 'stop' });
	blockedByEngineWorldBorder = true;
	goDeeperActive = false;
	analyzed = undefined;
	activeRequestId++;
	lastAnalyzedIcn = undefined;
	latestUpdate = undefined;
	emitNow();
	notifyStatus();
}

function retargetCachedUpdate(update: CevalUpdate): CevalUpdate {
	// Cache held more lines than now wanted (MultiPV was lowered): trim the extras off the end.
	const lines = update.lines.slice(0, settings.multiPv);
	return {
		...update,
		lines,
		targetDepth: currentTargetDepth,
		done: update.terminal || update.depth >= currentTargetDepth || areAllLinesConclusive(lines),
	};
}

function areAllLinesConclusive(lines: CevalLine[]): boolean {
	return lines.length > 0 && lines.every((line) => line.mate !== undefined);
}

/** Stops the engine (keeps the worker warm). */
function stopAnalysis(): void {
	interruptSearch();
	send({ cmd: 'stop' });
	notifyStatus();
}

function restartWorkerForSearch(): void {
	allowDepthRegressionForCurrentSearch = true;
	spawnWorker();
}

// Normalization & emission ----------------------------------------------------------------

function receiveInfo(requestId: number, info: AnalysisInfo, done: boolean, terminal = false): void {
	if (!analyzed) return;
	if (requestId !== activeRequestId || requestId !== analyzed.requestId) return;
	const blackPov = analyzed.turn === p.BLACK;

	// Drop lines that repeat an earlier line's first move. The engine's lines arrive
	// sorted best-first, so the first occurrence of each first move is the strongest
	// continuation for it — this collapses e.g. a forced position down to the single
	// real line instead of padding out to the requested MultiPV count.
	const seenFirstMoves = new Set<string>();
	const uniqueLines = info.lines.filter((line) => {
		const first = line.moves[0];
		if (first === undefined) return true; // Keep an empty/terminal line as-is.
		if (seenFirstMoves.has(first)) return false;
		seenFirstMoves.add(first);
		return true;
	});

	const lines: CevalLine[] = uniqueLines.map((line) => {
		const cp = line.cp !== undefined && line.cp !== null ? (blackPov ? -line.cp : line.cp) : undefined; // prettier-ignore
		const mate = line.mate !== undefined && line.mate !== null ? (blackPov ? -line.mate : line.mate) : undefined; // prettier-ignore
		return {
			moves: line.moves,
			...(cp !== undefined && { cp }),
			...(mate !== undefined && { mate }),
			winningChances: lineWinningChances(cp, mate),
		};
	});

	const update: CevalUpdate = {
		depth: info.depth,
		seldepth: info.seldepth,
		nodes: info.nodes,
		nps: info.nps,
		hashfull: info.hashfull,
		lines,
		multiPv: analyzed.multiPv,
		targetDepth: currentTargetDepth,
		moveIndex: analyzed.moveIndex,
		done,
		terminal,
	};

	const cached = positionCache.get(analyzed.icn);
	if (cached && update.depth < cached.depth && !allowDepthRegressionForCurrentSearch) return;

	latestUpdate = update;
	if (shouldReplaceCachedUpdate(cached, update)) {
		positionCache.set(analyzed.icn, update);
		if (cached && update.depth >= cached.depth) allowDepthRegressionForCurrentSearch = false;
	}

	if (done) emitNow();
	else scheduleEmit();
}

function shouldReplaceCachedUpdate(cached: CevalUpdate | undefined, update: CevalUpdate): boolean {
	if (!cached) return true;
	if (update.terminal || cached.terminal) return true;
	if (update.depth !== cached.depth) return update.depth > cached.depth;
	return update.lines.length >= cached.lines.length;
}

/**
 * Leading-edge throttle: emit immediately when the last emit is older than {@link THROTTLE_MS}
 * (so the first depth of a new search shows instantly, and background tabs — where page timers
 * are heavily throttled — still display progress), else trail with a timer.
 */
function scheduleEmit(): void {
	const elapsed = Date.now() - lastEmitMs;
	if (elapsed >= THROTTLE_MS) return emitNow();
	if (throttleTimer === undefined) throttleTimer = setTimeout(emitNow, THROTTLE_MS - elapsed);
}

function emitNow(): void {
	if (throttleTimer !== undefined) {
		clearTimeout(throttleTimer);
		throttleTimer = undefined;
	}
	lastEmitMs = Date.now();
	for (const listener of updateListeners) listener(latestUpdate);
}

/**
 * Immediately re-pushes the retained eval to the UI, trimmed to the current MultiPV
 * count. Used on engine-enable and on a MultiPV change so the display reflects the
 * change at once (old eval on resume, fewer lines on a MultiPV decrease) instead of
 * blanking until the engine's next update arrives.
 */
function reemitCurrent(): void {
	if (latestUpdate) {
		latestUpdate = { ...latestUpdate, lines: latestUpdate.lines.slice(0, settings.multiPv) };
	}
	emitNow();
}

/**
 * Seeds the position cache with an externally-computed evaluation (the game review).
 * Ignored when something at least as deep is already cached. Once seeded, the shown
 * eval only changes when a manual search reaches this depth — the same depth guards
 * that protect any cached analysis ({@link receiveInfo}, {@link refreshAnalysis}).
 */
function seedPositionCache(seed: {
	icn: string;
	depth: number;
	/** The move index (`gamefile.state.local.moveIndex`) at which this position is viewed. */
	moveIndex: number;
	/** The line's compact move tokens, from the seeded position. */
	moves: string[];
	/** Centipawns, white POV. Absent when mating. */
	cp?: number;
	/** Full moves to mate, white POV sign. */
	mate?: number;
}): void {
	const cached = positionCache.get(seed.icn);
	if (cached && cached.depth >= seed.depth) return;

	const line: CevalLine = {
		moves: seed.moves,
		...(seed.cp !== undefined && { cp: seed.cp }),
		...(seed.mate !== undefined && { mate: seed.mate }),
		winningChances: lineWinningChances(seed.cp, seed.mate),
	};
	positionCache.set(seed.icn, {
		depth: seed.depth,
		seldepth: seed.depth,
		nodes: 0,
		nps: 0,
		hashfull: 0,
		lines: [line],
		multiPv: 1,
		targetDepth: seed.depth,
		moveIndex: seed.moveIndex,
		done: true,
		terminal: false,
	});
}

/** Requests the legal moves for {@link icn} from the idle helper worker (never blocked by the search). */
function requestLegalMoves(requestId: number, icn: string): void {
	if (blockedByEngineWorldBorder) return;
	ensureLegalWorker();
	if (!legalReady || !legalWorker) {
		queuedLegalMovesRequests.push({ requestId, icn });
		return;
	}
	legalWorker.postMessage({ cmd: 'legalmoves', requestId, icn } satisfies AnalysisCommand);
}

/** Fans a legal-moves response from the worker out to all subscribers. */
function receiveLegalMoves(update: CevalLegalMovesUpdate): void {
	for (const listener of legalMovesListeners) listener(update);
}

function notifyStatus(override?: CevalStatus): void {
	const status = override ?? getStatus();
	for (const listener of statusListeners) listener(status);
}

// Public API --------------------------------------------------------------------------------

/** Provides the engine-glue + page-specific worker URLs. Must be called before {@link setEnabled}. */
function init(options: { workerUrl: string; engineUrl: string }): void {
	config = options;

	// Keep the engine pointed at the viewed position. 'view-move' fires on every
	// board position change, including physical moves. Coalesce them: an operation like
	// branching (viewFront to the game's front, then rewinding back) fires several
	// 'view-move's synchronously, but only the final resting position matters — refreshing
	// per event would restart the search at each intermediate position it passes through.
	GameBus.addEventListener('view-move', scheduleRefresh);
	GameBus.addEventListener('game-loaded', () => {
		nextPositionIsNewGame = true;
		if (enabled && !worker) spawnWorker();
		refreshAnalysis(true);
	});
	GameBus.addEventListener('game-unloaded', () => {
		resetEngineSession();
	});
}

function isEnabled(): boolean {
	return enabled;
}

function isBlockedByEngineWorldBorder(): boolean {
	return blockedByEngineWorldBorder;
}

function setEnabled(value: boolean): void {
	if (enabled === value) return;
	enabled = value;
	if (enabled) {
		if (!worker) spawnWorker();
		else ensureLegalWorker(); // Reusing a warm worker: no 'ready' will fire, so warm the helper here.
		refreshAnalysis(true);
		// Show the retained eval right away (refreshAnalysis only blanks it when the
		// position changed while the engine was off) instead of a gap until the resume.
		reemitCurrent();
	} else {
		// Keep latestUpdate so re-enabling can restore it instantly; just stop searching.
		stopAnalysis();
	}
	notifyStatus();
}

function getSettings(): CevalSettings {
	return { ...settings };
}

/**
 * Applies new settings, persisting them and restarting whatever is necessary
 * (a hash change respawns the worker; others just re-issue the search).
 */
function updateSettings(partial: Partial<CevalSettings>): void {
	const previous = settings;
	settings = { ...settings, ...partial };
	// The UI panel feeds valid values
	settings.multiPv = math.clamp(settings.multiPv, 1, MAX_MULTI_PV);
	settings.threads = math.clamp(settings.threads, 1, maxThreads());
	persistSettings();

	if (!enabled || !worker) return;
	// Changing the target depth clears "go deeper" so the new depth setting takes over.
	if (partial.depth !== undefined) goDeeperActive = false;
	if (settings.hashMb !== previous.hashMb || settings.threads !== previous.threads) {
		spawnWorker(); // Hash size & thread pool are fixed per worker; 'ready' re-issues the search.
	} else {
		// Reflect a MultiPV change on screen at once (trim/keep lines) before the engine
		// re-runs, so it isn't stuck showing the old line count until the next update.
		if (partial.multiPv !== undefined) reemitCurrent();
		// Raising MultiPV restarts from depth 1 (warm TT kept); let those lower-depth rows
		// repaint over the deeper cache so the new line appears at once, not on catch-up.
		if (partial.multiPv !== undefined && settings.multiPv > previous.multiPv) {
			allowDepthRegressionForCurrentSearch = true;
		}
		// Same position, new search params: keep the current eval visible while the
		// worker picks up the new target.
		refreshAnalysis(true, { restartSearch: partial.multiPv !== undefined });
		// Raising the depth after the search already finished must visibly resume: reflect
		// the new target and "searching" state now (refreshAnalysis has re-issued the 'go'),
		// so the stats/progress leave "done" instead of waiting on the first deeper info.
		if (
			partial.depth !== undefined &&
			latestUpdate?.done &&
			latestUpdate.depth < currentTargetDepth
		) {
			latestUpdate = { ...latestUpdate, targetDepth: currentTargetDepth, done: false };
			emitNow();
		}
	}
}

/** Deepens the current position's analysis: searches on toward {@link MAX_DEPTH}. */
function goDeeper(): void {
	goDeeperActive = true;
	refreshAnalysis(true); // Same position, so the flag survives the position-change reset.
	// Reflect the new (deeper) target on screen at once — don't wait for the engine's
	// next info, otherwise the stats would keep showing the old "…/13" target.
	if (latestUpdate) {
		latestUpdate = { ...latestUpdate, targetDepth: currentTargetDepth, done: false };
		emitNow();
	}
}

/** The last normalized engine update for the current position, if any. */
function getLatestUpdate(): CevalUpdate | undefined {
	return latestUpdate;
}

function getStatus(): CevalStatus {
	if (!enabled) return 'off';
	if (onCrashedPosition) return 'crashed';
	if (blockedByEngineWorldBorder) return 'blocked';
	if (!worker || !workerReady) return 'loading';
	if (latestUpdate?.done) return 'idle';
	return 'computing';
}

/** Subscribes to throttled engine updates. `undefined` means "eval cleared". */
function onUpdate(listener: (update: CevalUpdate | undefined) => void): void {
	updateListeners.add(listener);
}

/** Subscribes to engine status changes. */
function onStatus(listener: (status: CevalStatus) => void): void {
	statusListeners.add(listener);
}

/** Subscribes to legal-moves responses. */
function onLegalMoves(listener: (update: CevalLegalMovesUpdate) => void): void {
	legalMovesListeners.add(listener);
}

export default {
	maxThreads,
	requestLegalMoves,
	init,
	isEnabled,
	isBlockedByEngineWorldBorder,
	setEnabled,
	getSettings,
	updateSettings,
	goDeeper,
	getLatestUpdate,
	seedPositionCache,
	cpToWinningChances,
	onUpdate,
	onStatus,
	onLegalMoves,
	MAX_DEPTH,
	MIN_DEPTH,
	HASH_OPTIONS,
	MAX_MULTI_PV,
};

export type { CevalSettings, CevalLine, CevalUpdate, CevalStatus, CevalLegalMovesUpdate };
