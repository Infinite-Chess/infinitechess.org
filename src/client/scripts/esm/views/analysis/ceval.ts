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
	/** The depth this analysis is running to (the setting, or {@link MAX_DEPTH} when going deeper). */
	targetDepth: number;
	/** The move index this analysis belongs to (gamefile.state.local.moveIndex). */
	moveIndex: number;
	/** Whether the engine finished this position (reached target depth / mate / terminal). */
	done: boolean;
	/** The viewed position is game-over (no legal moves): no lines will ever come. */
	terminal: boolean;
}

/** Engine lifecycle status, for the UI status row. */
type CevalStatus = 'off' | 'loading' | 'computing' | 'idle' | 'failed' | 'blocked';

interface CevalLegalMovesUpdate {
	requestId: number;
	moves: string[];
}

interface RefreshAnalysisOptions {
	/** Start this same position again from depth 1, keeping the on-screen cache visible. */
	restartSearch?: boolean;
}

// Constants ----------------------------------------------------------------------

/** Target-depth choices for the settings dropdown. */
const DEPTH_OPTIONS: number[] = [8, 10, 12, 13, 14, 16, 18, 20, 25, 30];
/** The engine's maximum search depth — the ceiling that "go deeper" runs toward. */
const MAX_DEPTH = 64;
/** Hash size choices in MB (engine caps its TT at 64MB). */
const HASH_OPTIONS: number[] = [16, 32, 64];
const MAX_MULTI_PV = 5;
/** UI update throttle. */
const THROTTLE_MS = 60;

const STORAGE_PREFIX = 'ceval.';
const DEFAULT_SETTINGS: CevalSettings = {
	multiPv: 1,
	hashMb: 16,
	depth: 13,
};

// State ----------------------------------------------------------------------------

/** Set once by {@link init} with the page-provided worker URL. */
let config: { workerUrl: string } | undefined;

let worker: Worker | undefined;
let workerReady = false;

let enabled = false;
let settings: CevalSettings = loadSettings();

/** The ICN of the position the worker is currently analyzing (undefined once the position is superseded but not yet re-analyzed). */
let lastAnalyzedIcn: string | undefined;
/** Whether the next position command should reset the engine's search state. */
let nextPositionIsNewGame = true;
/** Snapshot of the analyzed position (for POV + staleness checks). */
let analyzed: { requestId: number; icn: string; moveIndex: number; turn: number } | undefined;
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
/** Whether a coalesced 'view-move' refresh is already scheduled for this microtask. */
let refreshQueued = false;

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
	loaded.multiPv = Math.min(Math.max(1, loaded.multiPv), MAX_MULTI_PV);
	if (!HASH_OPTIONS.includes(loaded.hashMb)) loaded.hashMb = DEFAULT_SETTINGS.hashMb;
	if (!DEPTH_OPTIONS.includes(loaded.depth)) loaded.depth = DEFAULT_SETTINGS.depth;
	return loaded;
}

function persistSettings(): void {
	for (const [key, value] of Object.entries(settings)) {
		localStorage.setItem(STORAGE_PREFIX + key, String(value));
	}
}

// Capability queries ----------------------------------------------------------------

// Winning chances (adjusted for infinitechess players) ------------------------------------

/** Maps a white-POV centipawn score to a win probability in [-1, 1]. */
function cpWinningChances(cp: number): number {
	// Clamp to ensure mate always shows higher gauge than any non-mate eval
	const clamped = Math.min(Math.max(-1000, cp), 1000);
	// Shallower curve (0.003) assumes players convert advantages less efficiently
	return 2 / (1 + Math.exp(-0.003 * clamped)) - 1;
}

/** Maps a white-POV centipawn score to a win probability in [-1, 1] without clamping. */
function cpWinningChancesNoClamp(cp: number): number {
	return 2 / (1 + Math.exp(-0.003 * cp)) - 1;
}

/** Maps a white-POV mate distance (full moves) to a win probability in [-1, 1]. */
function mateWinningChances(mate: number): number {
	// Use cp equivalent for ~99% win chance at mate in 1
	const cp = (25 - Math.min(10, Math.abs(mate))) * 75;
	const signed = cp * (mate > 0 ? 1 : -1);
	return cpWinningChancesNoClamp(signed);
}

// Worker lifecycle -----------------------------------------------------------------------

/** Spawns (or respawns) the analysis worker with the current settings. */
function spawnWorker(): void {
	if (!config) throw Error('ceval.init() must be called before enabling analysis.');
	terminateWorker();

	workerReady = false;
	notifyStatus();

	worker = new Worker(config.workerUrl, { type: 'module' });
	worker.onmessage = (e: MessageEvent<AnalysisResponse>) => handleWorkerMessage(e.data);
	worker.onerror = (e: ErrorEvent) => {
		console.error('[ceval] Analysis worker crashed:', e.message);
		handleWorkerFailure();
	};
	send({ cmd: 'init', hashMb: settings.hashMb });
}

function terminateWorker(): void {
	worker?.terminate();
	worker = undefined;
	workerReady = false;
	// Keep lastAnalyzedIcn: a respawn (e.g. hash change) re-sends the same position
	// via a forced refresh, so the on-screen eval shouldn't blank.
}

/** Fully clears engine runtime state that cannot safely cross game/variant boundaries. */
function resetEngineSession(): void {
	terminateWorker();
	latestUpdate = undefined;
	analyzed = undefined;
	activeRequestId++;
	lastAnalyzedIcn = undefined;
	nextPositionIsNewGame = true;
	goDeeperActive = false;
	currentTargetDepth = settings.depth;
	allowDepthRegressionForCurrentSearch = false;
	blockedByEngineWorldBorder = false;
	positionCache.clear();
	queuedLegalMovesRequests.length = 0;
	emitNow();
	notifyStatus();
}

function send(command: AnalysisCommand): void {
	worker?.postMessage(command);
}

/** Sends any legal-move requests that were queued while the worker was still spinning up. */
function flushQueuedLegalMovesRequests(): void {
	if (!workerReady) return;
	for (const request of queuedLegalMovesRequests.splice(0)) {
		send({ cmd: 'legalmoves', requestId: request.requestId, icn: request.icn });
	}
}

function handleWorkerFailure(): void {
	terminateWorker();
	enabled = false;
	queuedLegalMovesRequests.length = 0;
	notifyStatus('failed');
}

function handleWorkerMessage(msg: AnalysisResponse): void {
	switch (msg.type) {
		case 'ready':
			workerReady = true;
			flushQueuedLegalMovesRequests();
			refreshAnalysis(true); // Flush the desired position now that the engine is up.
			notifyStatus();
			break;
		case 'initerror':
			handleWorkerFailure();
			break;
		case 'info':
			receiveInfo(msg.requestId, msg.info, false);
			break;
		case 'done':
			receiveInfo(msg.requestId, msg.info, true, msg.reason === 'terminal');
			notifyStatus();
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
	return icnconverter.LongToShort_Format(longformIn, {
		compact: true,
		skipPosition: false,
		spaces: false,
		comments: false,
		make_new_lines: false,
		move_numbers: false,
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
/**
 * Coalesces a burst of synchronous 'view-move' events into a single refresh that reads
 * the final resting position, so intermediate positions (e.g. those a branch passes
 * through) never trigger their own search restart.
 */
function scheduleRefresh(): void {
	if (refreshQueued) return;
	refreshQueued = true;
	queueMicrotask(() => {
		refreshQueued = false;
		refreshAnalysis();
	});
}

function refreshAnalysis(force = false, options: RefreshAnalysisOptions = {}): void {
	if (!enabled) return;
	// Note: only the logical gamefile is required — 'game-loaded' fires while
	// graphics are still loading, and analysis shouldn't wait on textures.
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return;

	if (analysisenginebounds.findFirstPieceOutsideEngineWorld(gamefile)) {
		blockAnalysisForEngineWorldBorder();
		return;
	}

	if (blockedByEngineWorldBorder) {
		blockedByEngineWorldBorder = false;
		lastAnalyzedIcn = undefined;
	}

	if (!worker || !workerReady) return;

	const icn = getViewedPositionIcn(gamefile);
	const positionChanged = icn !== lastAnalyzedIcn;
	if (!force && !positionChanged) return;

	if (positionChanged) {
		const cached = positionCache.get(icn);
		// "Go deeper" is a one-shot for the position it was pressed on; any new position
		// (cycling moves or making one) reverts to the default target depth.
		goDeeperActive = false;
		currentTargetDepth = settings.depth;
		allowDepthRegressionForCurrentSearch = false;
		latestUpdate = cached ? retargetCachedUpdate(cached) : undefined;
		emitNow(); // Show cached eval immediately, or clear when this position is new.
	}

	const moveIndex = gamefile.state.local.moveIndex;
	const requestId = ++activeRequestId;
	analyzed = {
		requestId,
		icn,
		moveIndex,
		turn: moveutil.getWhosTurnAtMoveIndex(gamefile, moveIndex),
	};
	currentTargetDepth = goDeeperActive ? MAX_DEPTH : settings.depth;

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
	return {
		...update,
		targetDepth: currentTargetDepth,
		done:
			update.terminal ||
			update.depth >= currentTargetDepth ||
			areAllLinesConclusive(update.lines),
	};
}

function areAllLinesConclusive(lines: CevalLine[]): boolean {
	return lines.length > 0 && lines.every((line) => line.mate !== undefined);
}

/** Stops the engine (keeps the worker warm). */
function stopAnalysis(): void {
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
			winningChances: mate !== undefined ? mateWinningChances(mate) : cpWinningChances(cp ?? 0), // prettier-ignore
		};
	});

	const update: CevalUpdate = {
		depth: info.depth,
		seldepth: info.seldepth,
		nodes: info.nodes,
		nps: info.nps,
		hashfull: info.hashfull,
		lines,
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

function scheduleEmit(): void {
	if (throttleTimer !== undefined) return;
	throttleTimer = setTimeout(emitNow, THROTTLE_MS);
}

function emitNow(): void {
	if (throttleTimer !== undefined) {
		clearTimeout(throttleTimer);
		throttleTimer = undefined;
	}
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

/** Requests the legal moves for {@link icn}, spawning/queuing if the worker isn't ready yet. */
function requestLegalMoves(requestId: number, icn: string): void {
	if (blockedByEngineWorldBorder) return;
	if (!worker) spawnWorker();
	if (!workerReady) {
		queuedLegalMovesRequests.push({ requestId, icn });
		return;
	}
	send({ cmd: 'legalmoves', requestId, icn });
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

/** Provides the page-specific worker URL. Must be called before {@link setEnabled}. */
function init(options: { workerUrl: string }): void {
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
	settings.multiPv = Math.min(Math.max(1, settings.multiPv), MAX_MULTI_PV);
	persistSettings();

	if (!enabled || !worker) return;
	// Changing the target depth clears "go deeper" so the new depth setting takes over.
	if (partial.depth !== undefined) goDeeperActive = false;
	if (settings.hashMb !== previous.hashMb) {
		spawnWorker(); // 'ready' handler re-issues the search with the new hash size.
	} else {
		// Reflect a MultiPV change on screen at once (trim/keep lines) before the engine
		// re-runs, so it isn't stuck showing the old line count until the next update.
		if (partial.multiPv !== undefined) reemitCurrent();
		if (partial.multiPv !== undefined && settings.multiPv > previous.multiPv) {
			restartWorkerForSearch();
		} else {
			// Same position, new search params: keep the current eval visible while the
			// worker picks up the new target.
			refreshAnalysis(true, { restartSearch: partial.multiPv !== undefined });
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
	init,
	isEnabled,
	isBlockedByEngineWorldBorder,
	setEnabled,
	getSettings,
	updateSettings,
	goDeeper,
	getLatestUpdate,
	getStatus,
	requestLegalMoves,
	onUpdate,
	onStatus,
	onLegalMoves,
	DEPTH_OPTIONS,
	MAX_DEPTH,
	HASH_OPTIONS,
	MAX_MULTI_PV,
};

export type { CevalSettings, CevalLine, CevalUpdate, CevalStatus, CevalLegalMovesUpdate };
