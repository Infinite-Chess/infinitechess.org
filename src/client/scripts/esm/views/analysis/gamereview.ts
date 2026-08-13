// src/client/scripts/esm/views/analysis/gamereview.ts

/**
 * Game review controller (chess.com "Game Review" / lichess "Computer analysis"
 * equivalent). Evaluates every mainline position of the loaded game with a pool of
 * single-threaded engine workers, classifies each move by its win-probability loss
 * (Best → Blunder), and streams results to the UI as they land — the move list
 * annotates gradually while the review runs.
 */

import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { MoveFull } from '../../../../../shared/chess/logic/movepiece.js';
import type { MoveEvalLabel } from './moveevals.js';
import type { ReviewDivision } from './reviewdivision.js';
import type { AnalysisMoveNode } from './movetree.js';
import type { Player, PlayerGroup } from '../../../../../shared/chess/util/typeutil.js';
import type { AnalysisWorker, AnalysisWorkerFault } from './analysisworker.js';
import type { AnalysisCommand, AnalysisResponse, AnalysisInfo } from './apeironanalysis.worker.js';

import * as z from 'zod';

import math from '../../../../../shared/util/math/math.js';
import jsutil from '../../../../../shared/util/jsutil.js';
import apeiron_card from '../../../../../shared/chess/engines/apeiron_card.js';
import { players as p } from '../../../../../shared/chess/util/typeutil.js';
import icnconverter, { LongFormatIn } from '../../../../../shared/chess/logic/icn/icnconverter.js';

import ceval from './ceval.js';
import movetree from './movetree.js';
import gameslot from '../../game/chess/gameslot.js';
import moveevals from './moveevals.js';
import { GameBus } from '../../game/GameBus.js';
import LocalStorage from '../../util/LocalStorage.js';
import gamecompressor from '../../game/chess/gamecompressor.js';
import reviewdivision from './reviewdivision.js';
import analysisworker from './analysisworker.js';
import analysisenginebounds from './analysisenginebounds.js';

// Types ------------------------------------------------------------------------

/** A reviewed move's classification tier. Colors live in CSS (`.review-<key>`). */
export type ClassificationKey =
	| 'best'
	| 'excellent'
	| 'good'
	| 'inaccuracy'
	| 'mistake'
	| 'blunder'
	| 'forced';

/** The review of one mainline move. */
export interface MoveReview {
	/** The move-tree node this move belongs to (stable across tree edits). */
	nodeId: number;
	/** 0-based mainline ply. */
	ply: number;
	/** Who played the move. */
	color: Player;
	/** Absent when an engine failure left an endpoint of this move unevaluated. */
	classification?: ClassificationKey;
	/** Win-probability loss [0,1] from the mover's perspective. */
	wpLoss: number;
	/** Per-move accuracy percentage [0,100]. */
	accuracy: number;
	/** The engine's best move token ("x,y>x,y"); absent for forced/unevaluated moves. */
	bestMove?: string;
	/** Best continuation from the position before this move, capped to {@link MAX_PV_PLIES}. */
	pv?: string[];
	/** Whether the played move matches the engine's best move. */
	isBestMove: boolean;
}

/** One side's review summary, updated live as moves classify. */
interface PlayerReviewSummary {
	counts: Record<ClassificationKey, number>;
	/** Blended (harmonic + arithmetic mean) game accuracy [0,100]. */
	accuracy: number;
	/** Average centipawn loss. */
	acpl: number;
}

/** The whole review's current standing, for the UI. */
interface ReviewSummary {
	summaries: PlayerGroup<PlayerReviewSummary>;
	/** Positions evaluated so far / total. */
	evaluated: number;
	total: number;
	/** The per-position search depth this review runs at. */
	depth: number;
}

/**
 * Where the review stands. Only 'idle' allows a new one to start, and a failed review returns
 * there at once so it can be — which is why no failed state is reachable here.
 */
type ReviewStatus = 'idle' | 'running' | 'done';
/**
 * How a review ended. 'unavailable' separates an engine that never loaded from 'failed',
 * where workers ran but couldn't finish the positions — only the latter is worth retrying.
 */
export type ReviewOutcome = 'done' | 'failed' | 'unavailable';

/** The events consumers can subscribe to, and what each hands them. */
interface ReviewListeners {
	/** Fired when a position evaluation lands (progress) or the status changes. */
	progress: () => void;
	/** Fired when a move's classification resolves, in ply order. */
	classified: (review: MoveReview) => void;
	/** Fired once every move is classified, or the review ended without getting there. */
	finished: (outcome: ReviewOutcome) => void;
}

/** Persisted engine output. Classifications are deliberately recomputed on restore. */
interface CachedGameReview {
	schemaVersion: number;
	engineUrl: string;
	workerUrl: string;
	depth: number;
	results: EvaluateResult[];
}

/** One position handed to a worker: its index, plus how the worker should treat it. */
interface ReviewWorkItem {
	index: number;
	/** Searched only to warm the TT for the rest of the chunk; its result isn't reported. */
	warmup?: true;
	/** Starts a fresh chunk: the worker clears its engine state first. */
	newChunk?: true;
}

/** A pooled engine worker and every piece of state scoped to its lifetime. */
interface ReviewWorker {
	/** The supervised worker: its readiness, stop flag and fault classification. */
	engine: AnalysisWorker;
	/** Remaining work held back for this worker, so adjacent positions share its warm TT. */
	chunk: ReviewWorkItem[];
	/** The work item it is currently evaluating; undefined = idle. */
	assignment?: ReviewWorkItem;
	/**
	 * The deepest depth its current search has streamed. THE source of the position's score —
	 * the worker's own final message can't be, since a wedged worker never sends one.
	 */
	lastInfo?: AnalysisInfo;
	/** Stall watchdog over its in-flight search, re-armed on every completed depth. */
	watchdog?: ReturnType<typeof setTimeout>;
	/** Whether its stalled search has already been asked to stop, and ignoring that is fatal. */
	aborting?: true;
}

// Constants ----------------------------------------------------------------------

/** Classification thresholds on win-probability loss [0,1]. */
const THRESHOLDS: { max: number; key: ClassificationKey }[] = [
	{ max: 0.001, key: 'best' },
	{ max: 0.02, key: 'excellent' },
	{ max: 0.05, key: 'good' },
	{ max: 0.1, key: 'inaccuracy' },
	{ max: 0.2, key: 'mistake' },
	{ max: 1, key: 'blunder' },
];

/** Display metadata per classification. Colors live in CSS. */
const CLASSIFICATION_DISPLAY: Record<ClassificationKey, { label: string; symbol: string }> = {
	best: { label: 'Best', symbol: '★' },
	excellent: { label: 'Excellent', symbol: '!' },
	good: { label: 'Good', symbol: '' },
	inaccuracy: { label: 'Inaccuracy', symbol: '?!' },
	mistake: { label: 'Mistake', symbol: '?' },
	blunder: { label: 'Blunder', symbol: '??' },
	forced: { label: 'Forced', symbol: '⇒' },
};

/** The classifications counted as "lapses" — the mistakes a review calls out. */
const LAPSE_KEYS = ['inaccuracy', 'mistake', 'blunder'] as const satisfies readonly ClassificationKey[]; // prettier-ignore
export type LapseKey = (typeof LAPSE_KEYS)[number];

/** Whether a classification is a lapse: glyphed in the move list, clickable in the stats, dotted on the graph. */
function isLapseKey(key: string): key is LapseKey {
	return (LAPSE_KEYS as readonly string[]).includes(key);
}

/** Effective cp a forced mate maps to for win-probability purposes (mate-in-1 equivalent). */
const MATE_CP = 1800;
/** Cp values are clamped to this for average-centipawn-loss, mirroring lichess. */
const ACPL_CLAMP = 1000;
/** How many plies of a position's best line the review keeps, mirroring lichess. */
const MAX_PV_PLIES = 12;
/** How many times a crashed worker's position is retried before being skipped. */
const MAX_POSITION_ATTEMPTS = 2;
/** How long a worker may search without completing a depth before we cut it short. */
const SEARCH_STALL_TIMEOUT_MILLIS = 15_000;
/**
 * How long a stalled search gets to honor its stop flag before the worker is killed instead.
 * The flag is polled every node batch, so a search that can see it at all stops in milliseconds.
 */
const ABORT_GRACE_MILLIS = 2_000;

/** Fishnet-style chunk size: reported positions sharing one overlapping TT warmup. */
const MAX_POSITIONS_PER_CHUNK = 5;
/** Chunk size floor, keeping each warmup amortized. The trailing chunk may still be shorter. */
const MIN_POSITIONS_PER_CHUNK = 2;

/** Depth of a review whose chunks all run in one parallel round. */
const MAX_REVIEW_DEPTH = 15;
/** Depth floor, however many rounds a review takes. */
const MIN_REVIEW_DEPTH = 9;
/**
 * Force-invalidates all persisted reviews. Bump when the stored shape changes in a way
 * zod can't reject (same shape, new meaning), NOT for interpretation changes — the cache
 * holds only raw engine results, and classifications are recomputed on restore.
 */
const REVIEW_CACHE_SCHEMA_VERSION = 2;
const REVIEW_CACHE_KEY_PREFIX = 'game-review-';
/** How long a persisted review survives LocalStorage. */
const REVIEW_CACHE_EXPIRY_MILLIS = 1000 * 60 * 60 * 24 * 365; // 1 year

// Schemas ----------------------------------------------------------------------------

/** The result of a one-shot `evaluate` command (see {@link EvaluateResultSchema}). */
export type EvaluateResult = z.infer<typeof EvaluateResultSchema>;
/**
 * The result of a one-shot `evaluate` command, and the source of truth for the
 * {@link EvaluateResult} type. Score is from the side-to-move's perspective; both
 * absent on a terminal position (no legal moves).
 */
const EvaluateResultSchema = z.object({
	requestId: z.int(),
	/** Centipawns. Absent when mating or terminal. */
	cp: z.number().optional(),
	/** Full moves to mate (negative = getting mated). */
	mate: z.number().optional(),
	/** The engine's best line as compact move tokens ("x,y>x,y=Q"). Absent on terminal positions. */
	pv: z.array(z.string()).optional(),
	/** 0 = terminal (checkmate/stalemate), 1 = forced move (not searched). */
	legalMoveCount: z.int(),
	/** Whether the side to move is in check (distinguishes checkmate from stalemate when terminal). */
	inCheck: z.boolean(),
	/** The deepest depth the search completed (0 for terminal/forced/unevaluated positions). */
	depth: z.int(),
	/** Echoed for an unreported TT-warming search. */
	warmup: z.boolean().optional(),
});

/** Validates a persisted review's shape (see {@link CachedGameReview}). */
const CachedGameReviewSchema = z.object({
	schemaVersion: z.literal(REVIEW_CACHE_SCHEMA_VERSION),
	engineUrl: z.string(),
	workerUrl: z.string(),
	depth: z.int(),
	results: z.array(EvaluateResultSchema),
});

// State ----------------------------------------------------------------------------

let status: ReviewStatus = 'idle';
/** The live worker pool. Dropping an entry disposes everything that worker owned. */
let workers: ReviewWorker[] = [];

/** Reverse-analysis chunks waiting for an engine worker. */
let chunkQueue: ReviewWorkItem[][] = [];
/** Attempts already spent per position index (for crash retries). */
const positionAttempts = new Map<number, number>();

/** The mainline nodes captured when the review started (moves[i] = nodes[i].move). */
let mainlineNodes: AnalysisMoveNode[] = [];
/** The mainline moves (nodes' moves), captured at review start for out-of-bounds history re-basing. */
let mainlineMoves: MoveFull[] = [];
/** Safe start ply per position index (analysisenginebounds.getSafeStartPlies); 0 = full history. */
let safeStartByIndex: number[] = [];
/** The game serialized once at review start; `.moves` is re-sliced per position. */
let longformIn: LongFormatIn | undefined;
/** Turn order captured at review start, for mover resolution. */
let turnOrder: Player[] = [];
/** Search depth for this review. */
let reviewDepth = 0;
let division: ReviewDivision = {};

/** Per-position engine results, indexed 0 (start position) … N (final position). */
let results: (EvaluateResult | undefined)[] = [];
/** Effective white-POV cp per position (forced/failed positions carry their neighbor's). */
let effectiveWhiteCp: (number | undefined)[] = [];
let evaluatedCount = 0;
const classifiedMoves = new Set<number>();

/** Reviews by mainline ply, and by node id for the move-tree renderer. */
let reviews: (MoveReview | undefined)[] = [];
const reviewsByNodeId = new Map<number, MoveReview>();
/** Each position's ICN, cached at dispatch (also the ceval position-cache key). */
let icnByPosition: (string | undefined)[] = [];
const listeners: { [K in keyof ReviewListeners]: Set<ReviewListeners[K]> } = {
	progress: new Set(),
	classified: new Set(),
	finished: new Set(),
};

// Events ----------------------------------------------------------------------------

/**
 * Discards the review on game unload, so the next game can be reviewed afresh. Move-tree node
 * ids restart at 1 per game, so the node-keyed reviews MUST be dropped or they'd resurface as
 * another game's glyphs. It also releases the serialized game, which is the module's largest hold.
 */
GameBus.addEventListener('game-unloaded', resetState);

// Win probability & accuracy (lichess formulas) ----------------------------------------

/** Maps a mover-POV cp to a win probability [0,1]. */
function cpToWinProb(cp: number): number {
	// Remap ceval's shared winning-chances sigmoid from [-1, 1] to a probability [0, 1].
	return 0.5 + 0.5 * ceval.cpToWinningChances(cp, MATE_CP);
}

/** Lichess per-move accuracy% from the win probabilities before/after the move. */
function moveAccuracyPercent(wpBefore: number, wpAfter: number): number {
	const wpLossPct = (wpBefore - wpAfter) * 100;
	if (wpLossPct <= 0) return 100;
	return math.clamp(103.1668 * Math.exp(-0.04354 * wpLossPct) - 3.1669, 0, 100);
}

/** Lichess-style game accuracy: blend of harmonic and arithmetic means. */
function gameAccuracy(accuracies: number[]): number {
	if (accuracies.length === 0) return 0;
	let harmonicSum = 0;
	for (const acc of accuracies) harmonicSum += 1 / Math.max(acc, 0.1);
	const harmonic = accuracies.length / harmonicSum;
	const arithmetic = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
	return (harmonic + arithmetic) / 2;
}

// Depth heuristic ---------------------------------------------------------------------

/**
 * Per-position search depth. Each doubling of the chunk-rounds a worker must run serially
 * costs one ply, since a ply roughly doubles a search — so total review time stays bounded
 * regardless of game length or core count.
 */
function pickReviewDepth(totalChunks: number, workerCount: number): number {
	const rounds = Math.ceil(totalChunks / workerCount); // >= 1: pickWorkerCount caps workers at chunks.
	return Math.max(MIN_REVIEW_DEPTH, MAX_REVIEW_DEPTH - Math.ceil(Math.log2(rounds)));
}

/**
 * Fishnet-style chunks: positions run from the game end toward the start. Each chunk
 * begins by searching its immediate child without reporting it, then keeps that warm
 * TT while evaluating its real positions. Chunks shrink when the review is too short
 * to fill every thread, so idle workers take positions instead of one worker taking all.
 */
function buildReverseChunks(totalPositions: number, threads: number): ReviewWorkItem[][] {
	const chunkSize = math.clamp(
		Math.ceil(totalPositions / threads),
		MIN_POSITIONS_PER_CHUNK,
		MAX_POSITIONS_PER_CHUNK,
	);
	const reversed = Array.from({ length: totalPositions }, (_, i) => totalPositions - 1 - i);
	const groups: number[][] = [];
	for (let i = 0; i < reversed.length; i += chunkSize)
		groups.push(reversed.slice(i, i + chunkSize));

	return groups.map((group, index) => {
		const warmupIndex = index === 0 ? group[0]! : groups[index - 1]!.at(-1)!;
		return [
			{ index: warmupIndex, warmup: true, newChunk: true },
			...group.map((positionIndex) => ({ index: positionIndex })),
		];
	});
}

// Mainline capture ----------------------------------------------------------------------

/** The node's mainline continuation, or undefined when its first child is forced into a variation. */
function getMainlineChild(node: AnalysisMoveNode): AnalysisMoveNode | undefined {
	const child = node.children[0];
	return child?.forceVariation ? undefined : child;
}

/** Walks the move tree's mainline from the root. */
function captureMainline(): AnalysisMoveNode[] {
	const nodes: AnalysisMoveNode[] = [];
	let node = movetree.getRoot() ? getMainlineChild(movetree.getRoot()!) : undefined;
	while (node) {
		nodes.push(node);
		node = getMainlineChild(node);
	}
	return nodes;
}

// Lifecycle ------------------------------------------------------------------------------

/**
 * Whether a review can start: an idle, engine-supported
 * game with at least one mainline move.
 */
function canStart(): boolean {
	if (status !== 'idle') return false;
	const gamefile = gameslot.getGamefile();
	if (gamefile === undefined || captureMainline().length === 0) return false;
	return apeiron_card.isGameReviewSupported(gamefile).supported;
}

function getStatus(): ReviewStatus {
	return status;
}

/**
 * Clears all review state, returning the controller to idle. The only route back to 'idle'
 * (which {@link canStart} requires), so {@link start} never inherits leftovers — it only sizes
 * its own arrays. `listeners` is exempt: registered once at init, they outlive every game.
 */
function resetState(): void {
	terminateWorkers();
	status = 'idle';
	chunkQueue = [];
	positionAttempts.clear();
	mainlineNodes = [];
	mainlineMoves = [];
	safeStartByIndex = [];
	longformIn = undefined;
	turnOrder = [];
	reviewDepth = 0;
	division = {};
	results = [];
	effectiveWhiteCp = [];
	evaluatedCount = 0;
	classifiedMoves.clear();
	reviews = [];
	reviewsByNodeId.clear();
	icnByPosition = [];
}

/** Starts reviewing the loaded game's mainline. No-op unless idle with moves to review. */
function start(): void {
	if (!canStart()) return;
	const gamefile: GameFile = gameslot.getGamefile()!;

	mainlineNodes = captureMainline();
	mainlineMoves = mainlineNodes.map((node) => node.move!);
	turnOrder = [...gamefile.gameRules.turnOrder];
	// Per position, the ply to restart the encoded game from when earlier history left the engine's
	// safe coordinate range (unreplayable). Precomputed in one pass; 0 = full history (common case).
	safeStartByIndex = analysisenginebounds.getSafeStartPlies(gamefile, mainlineMoves);

	// Serialize the game once; each position re-slices the move list.
	longformIn = gamecompressor.compressGamefile(gamefile);
	delete longformIn.metadata.Result; // Irrelevant to the engine.
	delete longformIn.metadata.Termination;
	// Always hand the engine an explicit world border (its own internal fallback is only 1e15),
	// so every reviewed position is evaluated over the full safe coordinate range. Matches ceval.
	longformIn.gameRules.worldBorder = analysisenginebounds.getEngineWorldBorder(gamefile);
	division = reviewdivision.determineDivision(longformIn.position, mainlineMoves);

	const totalPositions = mainlineNodes.length + 1;
	// All but one hardware thread, leaving the UI responsive.
	const threads = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
	chunkQueue = buildReverseChunks(totalPositions, threads);
	// One worker per thread, never more than there are chunks to hand out.
	const workerCount = math.clamp(threads, 1, chunkQueue.length);
	reviewDepth = pickReviewDepth(chunkQueue.length, workerCount);

	results = new Array(totalPositions).fill(undefined);
	effectiveWhiteCp = new Array(totalPositions).fill(undefined);
	reviews = new Array(mainlineNodes.length).fill(undefined);
	icnByPosition = new Array(totalPositions).fill(undefined);
	status = 'running';

	notifyProgress();
	if (restoreCachedReview()) return;
	spawnWorkers(workerCount);
}

function reviewCacheKey(): string | undefined {
	const gameId = window.analysisPageData.gameId;
	return gameId === null ? undefined : `${REVIEW_CACHE_KEY_PREFIX}${gameId}`;
}

/**
 * Restores a complete compatible review, returning
 * false when there's no review- the engine must run.
 */
function restoreCachedReview(): boolean {
	const key = reviewCacheKey();
	if (!key) return false;

	const raw: unknown = LocalStorage.loadItem(key);
	const cached = parseCompatibleCache(raw);
	if (!cached) {
		if (raw !== undefined) LocalStorage.deleteItem(key);
		return false;
	}

	reviewDepth = cached.depth;
	results = cached.results.map((result) => ({ ...result, pv: result.pv?.slice() }));
	evaluatedCount = results.length;
	for (let index = 0; index < results.length; index++) {
		icnByPosition[index] = serializePosition(index);
		cachePositionEvaluation(index, results[index]!);
	}
	classifyReadyMoves();
	status = 'done';
	notifyProgress();
	for (const listener of listeners.finished) listener('done');
	return true;
}

/**
 * Validates a persisted review and confirms it's compatible with the current engine —
 * same engine/worker URLs, deep enough, and one result per position of the current
 * mainline. Returns undefined when unusable.
 */
function parseCompatibleCache(raw: unknown): CachedGameReview | undefined {
	if (raw === undefined) return undefined;
	const parsed = CachedGameReviewSchema.safeParse(raw);
	if (!parsed.success) {
		console.warn('[game review] Could not parse the local review cache:', parsed.error);
		return undefined;
	}
	const cached = parsed.data;

	if (
		cached.engineUrl !== window.analysisPageData.engineUrl ||
		cached.workerUrl !== window.analysisPageData.workerUrl ||
		cached.depth < reviewDepth ||
		// Load-bearing despite the game id key implying it: a mismatch desyncs `results` from
		// the other per-position arrays, which every consumer indexes as parallel.
		cached.results.length !== mainlineNodes.length + 1
	) {
		console.warn('[game review] Local review cache is incompatible with the current game or engine.'); // prettier-ignore
		return undefined;
	}

	return cached;
}

function persistCompletedReview(): void {
	const key = reviewCacheKey();
	if (!key || results.some((result) => result === undefined)) return;
	const cached: CachedGameReview = {
		schemaVersion: REVIEW_CACHE_SCHEMA_VERSION,
		engineUrl: window.analysisPageData.engineUrl,
		workerUrl: window.analysisPageData.workerUrl,
		depth: reviewDepth,
		results: results as EvaluateResult[],
	};
	try {
		LocalStorage.saveItem(key, cached, REVIEW_CACHE_EXPIRY_MILLIS);
	} catch (error) {
		console.warn('[game review] Could not save the local review cache:', error);
	}
}

// Worker pool -----------------------------------------------------------------------------

function spawnWorkers(count: number): void {
	for (let i = 0; i < count; i++) spawnWorker();
}

function spawnWorker(): void {
	// Pool invariant: once the review leaves 'running', no worker is spawned or dispatched to.
	// A caller's own receiveEvaluation() can finish the review synchronously before reaching here.
	if (status !== 'running') return;

	const entry: ReviewWorker = {
		// No `threads`: review workers search single-threaded — parallelism is across positions.
		engine: analysisworker.spawn({
			hashMb: 16,
			onMessage: (msg) => handleWorkerMessage(entry, msg),
			onFault: (fault, reason) => handleWorkerFault(entry, fault, reason),
		}),
		chunk: [],
	};
	workers.push(entry);
}

function terminateWorkers(): void {
	for (const entry of workers) {
		clearStallWatchdog(entry);
		analysisworker.terminate(entry.engine);
	}
	workers = [];
}

function handleWorkerMessage(entry: ReviewWorker, msg: AnalysisResponse): void {
	if (status !== 'running') return;
	switch (msg.type) {
		case 'ready':
			dispatchNext(entry);
			break;
		case 'info':
			entry.lastInfo = msg.info;
			armStallWatchdog(entry); // The search completed a depth: it's making progress.
			break;
		case 'evaluated':
			clearStallWatchdog(entry);
			delete entry.assignment;
			if (!msg.warmup) receiveEvaluation({ ...msg, ...scoreFromInfo(entry.lastInfo) });
			dispatchNext(entry);
			break;
	}
}

/**
 * Handles a dead worker: aborts the whole review when the engine never loaded, else requeues its
 * position (skipping it after {@link MAX_POSITION_ATTEMPTS}) and respawns a replacement with
 * fresh wasm. Also the exit for a stalled worker we kill ourselves ({@link abortStalledSearch}).
 */
function handleWorkerFault(entry: ReviewWorker, fault: AnalysisWorkerFault, reason: string): void {
	console.error(`[game review] Worker ${fault}: ${reason}`);
	const { assignment, chunk, lastInfo } = entry;
	clearStallWatchdog(entry);
	// The entry owns nothing from here on, so a second fault from
	// the same dying worker can't re-queue its work a second time.
	delete entry.assignment;
	entry.chunk = [];
	analysisworker.terminate(entry.engine);
	workers = workers.filter((w) => w !== entry);
	if (status !== 'running') return;

	// The engine glue itself can't load, so this worker was never dispatched to and holds no work.
	// Every worker pulls the same URL, so respawning only loops on the same failure — nothing here
	// consumes a position's attempts, since none was ever attempted.
	if (fault === 'unloadable') return failReview('unavailable');

	// A warmup's result is never reported, so it's pure TT optimization: drop it and let the chunk
	// run cold. Retrying it would loop forever, since warmups consume no position attempts.
	if (assignment === undefined || assignment.warmup) requeueChunk(chunk);
	else if (
		lastInfo === undefined &&
		(positionAttempts.get(assignment.index) ?? 0) < MAX_POSITION_ATTEMPTS
	) {
		// The search died having completed nothing: retry the position on a fresh worker.
		chunkQueue.unshift([{ ...assignment, newChunk: true }, ...chunk]);
	} else {
		// Settle for the depths it did complete, so the review continues. With none, the
		// evaluation is empty: its eval carries over and adjacent moves classify as unknown.
		requeueChunk(chunk);
		receiveEvaluation({ requestId: assignment.index, legalMoveCount: 2, inCheck: false, depth: 0, ...scoreFromInfo(lastInfo) }); // prettier-ignore
	}

	if (chunkQueue.length > 0) {
		// Positions still remain: replace the dead worker to keep the pool full — repeated
		// faults burn through the per-position attempts, so this always terminates.
		spawnWorker();
	} else if (workers.length === 0 && evaluatedCount < results.length) failReview('failed');
}

/**
 * Ends the review without completing it. Returns straight to 'idle' (disposing the pool) rather
 * than parking in a failed state, so the user can start a fresh one — the listeners are told why
 * it ended by argument, not by reading the status back.
 */
function failReview(outcome: 'failed' | 'unavailable'): void {
	resetState();
	for (const listener of listeners.finished) listener(outcome);
}

/** Whether position `index` is itself within the engine's safe coordinate range (evaluable). */
function positionIsEvaluable(index: number): boolean {
	// safeStartByIndex[index] > index exactly when ply `index` is the latest out-of-bounds position.
	return safeStartByIndex[index]! <= index;
}

/** Returns a partly-worked chunk to the queue, so whichever worker takes it re-warms its own TT. */
function requeueChunk(chunk: ReviewWorkItem[]): void {
	if (chunk.length === 0) return;
	chunkQueue.unshift([{ ...chunk[0]!, newChunk: true }, ...chunk.slice(1)]);
}

/** Hands the worker the next queued position, building its ICN on demand. */
function dispatchNext(entry: ReviewWorker): void {
	if (status !== 'running') return; // Pool invariant — see spawnWorker.

	for (;;) {
		if (entry.chunk.length === 0) {
			const nextChunk = chunkQueue.shift();
			if (!nextChunk) return;
			entry.chunk = nextChunk;
		}
		const work = entry.chunk.shift()!;
		const index = work.index;

		// A position with a piece outside the engine's safe coordinate range can't be evaluated
		// (its coords overflow i64). Skip it — record an empty eval for real positions so it's
		// treated like a failed one: its eval carries over and moves crossing it stay unclassified.
		if (!positionIsEvaluable(index)) {
			if (!work.warmup) receiveEvaluation({ requestId: index, legalMoveCount: 2, inCheck: false, depth: 0 }); // prettier-ignore
			if (status !== 'running') return; // receiveEvaluation may have finished the review.
			continue; // Pull the next work item for this worker.
		}

		entry.assignment = work;
		delete entry.lastInfo;
		if (!work.warmup) positionAttempts.set(index, (positionAttempts.get(index) ?? 0) + 1);

		const icn = serializePosition(index);
		icnByPosition[index] = icn;

		entry.engine.worker.postMessage({
			cmd: 'evaluate',
			requestId: index, // The position index doubles as the request id.
			icn,
			maxDepth: reviewDepth,
			mover: moverAtPly(index),
			...(work.newChunk && { newChunk: true }),
			...(work.warmup && { warmup: true }),
		} satisfies AnalysisCommand);
		armStallWatchdog(entry);
		return;
	}
}

/** Canonical ICN for the position after `index` mainline plies. */
function serializePosition(index: number): string {
	longformIn!.moves = mainlineMoves.slice(0, index);

	// Clamp to `index`: an out-of-bounds position's safe start is index+1 (unrepresentable). It's
	// never dispatched to a worker (dispatchNext skips it), but cache callers still ask
	// for its ICN — clamping keeps GameToPosition within the move list instead of overrunning it.
	const safeStart = Math.min(safeStartByIndex[index]!, index);
	if (safeStart === 0)
		return icnconverter.LongToShort_Format(longformIn!, icnconverter.COMPACT_FORMAT_OPTIONS); // Common path.

	// Earlier history left the engine's safe coordinate range: re-base past it (see
	// analysisenginebounds.getSafeStartPlies). Rare, so we copy onto a fresh longform rather than
	// mutate the shared base — the position/state GameToPosition rewrites must not leak across calls.
	const rebased: LongFormatIn = {
		...longformIn!,
		gameRules: { ...longformIn!.gameRules, turnOrder: [...longformIn!.gameRules.turnOrder] },
		position: jsutil.deepCopyObject(longformIn!.position!),
		state_global: jsutil.deepCopyObject(longformIn!.state_global),
	};
	gamecompressor.rebaseToPly(rebased, mainlineMoves, safeStart, index);
	return icnconverter.LongToShort_Format(rebased, icnconverter.COMPACT_FORMAT_OPTIONS);
}

// Stall watchdog ---------------------------------------------------------------------------

/** (Re)arms the stall watchdog over a worker's in-flight search. */
function armStallWatchdog(entry: ReviewWorker): void {
	clearStallWatchdog(entry);
	entry.watchdog = setTimeout(() => abortStalledSearch(entry), SEARCH_STALL_TIMEOUT_MILLIS);
}

function clearStallWatchdog(entry: ReviewWorker): void {
	if (entry.watchdog !== undefined) clearTimeout(entry.watchdog);
	delete entry.watchdog;
	delete entry.aborting;
}

/**
 * Cuts short a search that hasn't completed a depth in {@link SEARCH_STALL_TIMEOUT_MILLIS}: first by
 * writing the shared stop flag, which lets the worker finish in place and keep its warm TT for the
 * rest of its chunk. A search wedged past the engine's poll point never sees that flag, so ignoring
 * it for {@link ABORT_GRACE_MILLIS} escalates to killing the worker — its position keeps whatever
 * depths it streamed either way.
 */
function abortStalledSearch(entry: ReviewWorker): void {
	delete entry.watchdog;
	const index = entry.assignment?.index;
	if (entry.aborting) return handleWorkerFault(entry, 'crashed', `search at position ${index} ignored its stop flag`); // prettier-ignore
	// A single-threaded build shares no memory to write, so killing it is the only way out.
	if (!analysisworker.interrupt(entry.engine))
		return handleWorkerFault(entry, 'crashed', `search at position ${index} stalled with no shared stop flag`); // prettier-ignore
	entry.aborting = true;
	entry.watchdog = setTimeout(() => abortStalledSearch(entry), ABORT_GRACE_MILLIS);
}

// Result processing --------------------------------------------------------------------------

/** The player to move at position `index` (= the mover of mainline move `index`). */
function moverAtPly(index: number): Player {
	return turnOrder[index % turnOrder.length]!;
}

/**
 * A searched position's score, taken from the deepest depth its worker streamed.
 * Empty when the search completed none, which leaves the position unevaluated.
 */
function scoreFromInfo(info: AnalysisInfo | undefined): Partial<EvaluateResult> {
	const line = info?.lines[0];
	if (!info || !line) return {};
	return {
		depth: info.depth,
		pv: line.moves.slice(0, MAX_PV_PLIES),
		...(line.cp !== undefined && line.cp !== null && { cp: line.cp }),
		...(line.mate !== undefined && line.mate !== null && { mate: line.mate }),
	};
}

/** The result's score from the side-to-move's perspective, as an effective cp. */
function stmCp(result: EvaluateResult): number | undefined {
	if (result.mate !== undefined) return result.mate > 0 ? MATE_CP : -MATE_CP;
	return result.cp;
}

function receiveEvaluation(result: EvaluateResult): void {
	const index = result.requestId;
	if (results[index] !== undefined) return; // Duplicate (e.g. a retry raced its original).
	results[index] = result;
	evaluatedCount++;
	cachePositionEvaluation(index, result);

	classifyReadyMoves();
	notifyProgress();

	if (evaluatedCount >= results.length) finishReview();
}

/** Stores a review eval for move-list display and seeds ceval's position cache. */
function cachePositionEvaluation(index: number, result: EvaluateResult): void {
	const icn = icnByPosition[index];
	if (!icn) return;

	const mover = moverAtPly(index);
	const sign = mover === p.WHITE ? 1 : -1;
	let label: MoveEvalLabel | undefined;
	if (result.legalMoveCount === 0) {
		label = result.inCheck
			? { mate: mover === p.WHITE ? -1 : 1, depth: result.depth }
			: { cp: 0, depth: result.depth };
	} else if (result.mate !== undefined) {
		label = { mate: sign * result.mate, depth: result.depth };
	} else if (result.cp !== undefined) {
		label = { cp: sign * result.cp, depth: result.depth };
	}
	if (!label) return;

	if (index > 0) {
		const node = mainlineNodes[index - 1];
		if (node) moveevals.store(node.id, label);
	}

	ceval.seedPositionCache({
		icn,
		depth: result.depth,
		moveIndex: index - 1,
		moves: result.pv ?? [],
		...(label.cp !== undefined && { cp: label.cp }),
		...(label.mate !== undefined && { mate: label.mate }),
	});
}

/** Gives a one-legal-move position its carried eval once the in-order pass resolves it. */
function cacheForcedPositionEvaluation(index: number): void {
	const result = results[index];
	const icn = icnByPosition[index];
	if (!result || result.legalMoveCount !== 1 || !icn) return;
	const label: MoveEvalLabel = {
		cp: effectiveWhiteCp[index]!,
		depth: reviewDepth,
	};
	if (index > 0) {
		const node = mainlineNodes[index - 1];
		if (node) moveevals.store(node.id, label);
	}
	ceval.seedPositionCache({
		icn,
		depth: reviewDepth,
		moveIndex: index - 1,
		moves: result.pv ?? [],
		cp: label.cp!,
	});
}

/**
 * Classifies every move whose surrounding positions are now evaluated, strictly in
 * ply order — forced/unevaluated positions carry the previous position's eval, so
 * the left-to-right pass keeps the effective evals consistent.
 */
function classifyReadyMoves(): void {
	for (let index = 0; index < results.length; index++) resolveWhiteCp(index);

	for (let i = 0; i < mainlineNodes.length; i++) {
		if (classifiedMoves.has(i)) continue;
		const before = results[i];
		const after = results[i + 1];
		if (
			before === undefined ||
			after === undefined ||
			effectiveWhiteCp[i] === undefined ||
			effectiveWhiteCp[i + 1] === undefined
		)
			continue;
		cacheForcedPositionEvaluation(i);
		cacheForcedPositionEvaluation(i + 1);

		const review = classifyMove(i, before, after);
		reviews[i] = review;
		reviewsByNodeId.set(review.nodeId, review);
		classifiedMoves.add(i);
		for (const listener of listeners.classified) listener(review);
	}
}

/** The position's white-POV effective cp; forced/terminal/unevaluated positions derive it. */
function resolveWhiteCp(index: number): number | undefined {
	if (effectiveWhiteCp[index] !== undefined) return effectiveWhiteCp[index];
	// Out-of-bounds positions are never evaluated: leave their cp undefined so the eval graph
	// breaks into a disconnected segment here, rather than carrying a neighbor's eval across a
	// region we couldn't analyze. Their moves stay unclassified regardless (see classifyMove).
	if (!positionIsEvaluable(index)) return undefined;
	const result = results[index];
	if (!result) return undefined;
	const mover = moverAtPly(index);

	if (result.legalMoveCount === 0) {
		// Terminal: checkmate is a loss for the side to move; stalemate is a draw.
		effectiveWhiteCp[index] = result.inCheck ? (mover === p.WHITE ? -MATE_CP : MATE_CP) : 0;
		return effectiveWhiteCp[index];
	}

	const cp = stmCp(result);
	// Forced moves aren't searched, and failed positions have no score:
	// carry the previous position's eval (the start position defaults to 0).
	if (result.legalMoveCount === 1 || cp === undefined) {
		effectiveWhiteCp[index] = index > 0 ? resolveWhiteCp(index - 1) : 0;
		return effectiveWhiteCp[index];
	}

	effectiveWhiteCp[index] = mover === p.WHITE ? cp : -cp;
	return effectiveWhiteCp[index];
}

function classifyMove(i: number, before: EvaluateResult, after: EvaluateResult): MoveReview {
	const node = mainlineNodes[i]!;
	const mover = moverAtPly(i);

	const review: MoveReview = {
		nodeId: node.id,
		ply: i,
		color: mover,
		wpLoss: 0,
		accuracy: 100,
		bestMove: before.pv?.[0],
		pv: before.pv ? before.pv.slice(0, MAX_PV_PLIES) : undefined,
		isBestMove: false,
	};

	if (before.legalMoveCount === 1) {
		// The only legal move: no credit, no blame.
		review.classification = 'forced';
		review.isBestMove = true;
		return review;
	}
	if (stmCp(before) === undefined || (after.legalMoveCount > 1 && stmCp(after) === undefined)) {
		return review; // An endpoint failed to evaluate — leave the move unclassified.
	}

	// Win probabilities from the mover's perspective, before and after their move.
	const moverSign = mover === p.WHITE ? 1 : -1;
	const wpBefore = cpToWinProb(moverSign * effectiveWhiteCp[i]!);
	const wpAfter = cpToWinProb(moverSign * effectiveWhiteCp[i + 1]!);
	review.wpLoss = Math.max(0, wpBefore - wpAfter);
	review.accuracy = moveAccuracyPercent(wpBefore, wpAfter);

	// The engine's best move matches by coordinates (promotion piece ignored).
	const playedCoords = node.move!.token.split('=')[0]!;
	review.isBestMove =
		review.bestMove !== undefined && review.bestMove.split('=')[0] === playedCoords;

	if (review.isBestMove) review.classification = 'best';
	else review.classification = THRESHOLDS.find((t) => review.wpLoss <= t.max)!.key;

	return review;
}

function finishReview(): void {
	terminateWorkers();
	status = 'done';
	notifyProgress();
	for (const listener of listeners.finished) listener('done');
	persistCompletedReview();
}

// Summaries ------------------------------------------------------------------------------------

/** Builds the live review standing from the classifications so far. */
function getSummary(): ReviewSummary {
	const accuracies: PlayerGroup<number[]> = { [p.WHITE]: [], [p.BLACK]: [] };
	const cpLosses: PlayerGroup<number[]> = { [p.WHITE]: [], [p.BLACK]: [] };
	const summaries: PlayerGroup<PlayerReviewSummary> = {};

	for (const color of [p.WHITE, p.BLACK]) {
		summaries[color] = {
			counts: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, forced: 0 }, // prettier-ignore
			accuracy: 0,
			acpl: 0,
		};
	}

	for (const review of reviews) {
		if (!review) continue;
		const summary = summaries[review.color];
		if (!summary) continue; // A color outside white/black (multiplayer variants).
		if (review.classification === undefined) continue;
		summary.counts[review.classification]++;
		if (review.classification === 'forced') continue; // Excluded from accuracy/acpl.

		accuracies[review.color]!.push(review.accuracy);
		const moverSign = review.color === p.WHITE ? 1 : -1;
		const cpBefore = math.clamp(moverSign * effectiveWhiteCp[review.ply]!, -ACPL_CLAMP, ACPL_CLAMP); // prettier-ignore
		const cpAfter = math.clamp(moverSign * effectiveWhiteCp[review.ply + 1]!, -ACPL_CLAMP, ACPL_CLAMP); // prettier-ignore
		cpLosses[review.color]!.push(Math.max(0, cpBefore - cpAfter));
	}

	for (const color of [p.WHITE, p.BLACK]) {
		const losses = cpLosses[color]!;
		summaries[color]!.accuracy = gameAccuracy(accuracies[color]!);
		summaries[color]!.acpl =
			losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
	}

	return { summaries, evaluated: evaluatedCount, total: results.length, depth: reviewDepth };
}

// Queries for the renderers -----------------------------------------------------------------------

/** The review of the move at the given move-tree node, if classified. */
function getReviewForNode(nodeId: number): MoveReview | undefined {
	return reviewsByNodeId.get(nodeId);
}

/** All classifications so far, in ply order. */
function getReviews(): MoveReview[] {
	return reviews.filter((review): review is MoveReview => review !== undefined);
}

/** The mainline nodes the review runs over (for graph click-to-jump). */
function getMainlineNodes(): AnalysisMoveNode[] {
	return mainlineNodes;
}

function getDivision(): ReviewDivision {
	return division;
}

/** White-POV effective cp of position `index` (after `index` plies), if resolved. */
function getWhiteCpAt(index: number): number | undefined {
	return effectiveWhiteCp[index];
}

// Subscriptions ---------------------------------------------------------------------------------

function notifyProgress(): void {
	for (const listener of listeners.progress) listener();
}

function onProgress(listener: ReviewListeners['progress']): void {
	listeners.progress.add(listener);
}
function onClassified(listener: ReviewListeners['classified']): void {
	listeners.classified.add(listener);
}
function onFinished(listener: ReviewListeners['finished']): void {
	listeners.finished.add(listener);
}

export default {
	// Constants
	CLASSIFICATION_DISPLAY,
	isLapseKey,
	// Lifecycle
	canStart,
	getStatus,
	start,
	// Worker pool
	positionIsEvaluable,
	// Summaries
	getSummary,
	// Queries for the renderers
	getReviewForNode,
	getReviews,
	getMainlineNodes,
	getDivision,
	getWhiteCpAt,
	// Subscriptions
	onProgress,
	onClassified,
	onFinished,
};
