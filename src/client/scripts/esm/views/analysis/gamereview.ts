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
import type { CoordsKey } from '../../../../../shared/chess/util/coordutil.js';
import type { AnalysisMoveNode } from './movetree.js';
import type { Player, PlayerGroup, RawType } from '../../../../../shared/chess/util/typeutil.js';
import type {
	AnalysisCommand,
	AnalysisResponse,
	EvaluateResult,
} from './hydrochessanalysis.worker.js';

import math from '../../../../../shared/util/math/math.js';
import coordutil from '../../../../../shared/chess/util/coordutil.js';
import icnconverter, { LongFormatIn } from '../../../../../shared/chess/logic/icn/icnconverter.js';
import typeutil, {
	players as p,
	rawTypes as r,
} from '../../../../../shared/chess/util/typeutil.js';

import ceval from './ceval.js';
import movetree from './movetree.js';
import gameslot from '../../game/chess/gameslot.js';
import moveevals from './moveevals.js';
import analysisenginebounds from './analysisenginebounds.js';
import IndexedDB from '../../util/IndexedDB.js';
import { GameBus } from '../../game/GameBus.js';
import gamecompressor from '../../game/chess/gamecompressor.js';

// Types ------------------------------------------------------------------------

/** A reviewed move's classification tier. Colors live in CSS (`.review-<key>`). */
type ClassificationKey =
	| 'best'
	| 'excellent'
	| 'good'
	| 'inaccuracy'
	| 'mistake'
	| 'blunder'
	| 'forced';

/** The review of one mainline move. */
interface MoveReview {
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
	/** Lichess-style per-move accuracy percentage [0,100]. */
	accuracy: number;
	/** The engine's best move token ("x,y>x,y"); absent for forced/unevaluated moves. */
	bestMove?: string;
	/** Best continuation from the position before this move, capped by the worker. */
	pv?: string[];
	/** Whether the played move matches the engine's best move. */
	isBestMove: boolean;
}

/** A move's displayed evaluation (of the position AFTER it), white POV. */
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

/** Lila-style game-phase boundaries, expressed as position indices. */
interface ReviewDivision {
	middle?: number;
	end?: number;
}

type ReviewStatus = 'idle' | 'running' | 'done' | 'failed';

interface ReviewListeners {
	/** Fired when a position evaluation lands (progress) or the status changes. */
	progress: () => void;
	/** Fired when a move's classification resolves, in ply order. */
	classified: (review: MoveReview) => void;
	/** Fired once every move is classified (or the review failed/was cancelled). */
	finished: () => void;
}

/** Persisted engine output. Classifications are deliberately recomputed on restore. */
interface CachedGameReview {
	schemaVersion: number;
	gameFingerprint: string;
	engineUrl: string;
	workerUrl: string;
	depth: number;
	results: EvaluateResult[];
}

// Constants ----------------------------------------------------------------------

/** Chess.com-style classification thresholds on win-probability loss [0,1]. */
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

/** Effective cp a forced mate maps to for win-probability purposes (mate-in-1 equivalent). */
const MATE_CP = 1800;
/** Cp values are clamped to this for average-centipawn-loss, mirroring lichess. */
const ACPL_CLAMP = 1000;
/** How many times a crashed worker's position is retried before being skipped. */
const MAX_POSITION_ATTEMPTS = 2;
/** Fishnet analyzes five reported positions plus one overlapping TT warmup per chunk. */
const REAL_POSITIONS_PER_CHUNK = 5;
/** Bump whenever review interpretation or the persisted result shape changes. */
const REVIEW_CACHE_SCHEMA_VERSION = 1;
const REVIEW_CACHE_KEY_PREFIX = 'infinitechess-game-review-';

// State ----------------------------------------------------------------------------

let status: ReviewStatus = 'idle';
let workers: Worker[] = [];
interface ReviewWorkItem {
	index: number;
	warmup?: true;
	newChunk?: true;
}

/** The work item each worker is currently evaluating (undefined = idle). */
const workerAssignment = new Map<Worker, ReviewWorkItem>();
/** Reverse-analysis chunks waiting for an engine worker. */
let chunkQueue: ReviewWorkItem[][] = [];
/** Remaining work kept on one worker so adjacent positions share its TT. */
const workerChunk = new Map<Worker, ReviewWorkItem[]>();
/** Attempts already spent per position index (for crash retries). */
const positionAttempts = new Map<number, number>();

/** The mainline nodes captured when the review started (moves[i] = nodes[i].move). */
let mainlineNodes: AnalysisMoveNode[] = [];
/** The game serialized once at review start; `.moves` is re-sliced per position. */
let longformIn: LongFormatIn | undefined;
/** Turn order captured at review start, for mover resolution. */
let turnOrder: Player[] = [];
/** Search depth for this review. */
let reviewDepth = 0;
let division: ReviewDivision = {};
let gameFingerprint = '';
/** Invalidates an IndexedDB read if the loaded game changes while it is pending. */
let reviewRunId = 0;

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

// Events -----------------------------------------------------------------------------

GameBus.addEventListener('game-unloaded', () => reset());

// Win probability & accuracy (lichess formulas, ceval-consistent sigmoid) --------------

/** Maps a mover-POV cp to a win probability [0,1]. */
function cpToWinProb(cp: number): number {
	const clamped = math.clamp(cp, -MATE_CP, MATE_CP);
	return 0.5 + 0.5 * (2 / (1 + Math.exp(-0.003 * clamped)) - 1);
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
 * Per-position search depth: shorter games are analyzed deeper, and positions
 * with many pieces (huge variants) shallower — total review time stays bounded.
 */
function pickReviewDepth(plies: number, workerCount: number): number {
	let depth: number;
	if (plies <= 30) depth = 15;
	else if (plies <= 60) depth = 14;
	else if (plies <= 100) depth = 13;
	else if (plies <= 160) depth = 12;
	else depth = 11;

	// Few cores mean positions are mostly searched serially, so reduce the per-position
	// budget sharply. Larger pools recover the deeper short-game targets above.
	if (workerCount <= 2) depth = Math.min(depth, 11);
	else if (workerCount <= 4) depth = Math.min(depth, 13);
	else if (workerCount <= 6) depth = Math.min(depth, 14);

	return Math.max(9, depth);
}

/** Engine workers to spawn: one per hardware thread minus one, leaving the UI responsive. */
function pickWorkerCount(totalChunks: number): number {
	const hw = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
	return Math.max(1, Math.min(hw, totalChunks));
}

/**
 * Fishnet-style chunks: positions run from the game end toward the start. Each
 * chunk begins by searching its immediate child without reporting it, then keeps
 * that warm TT while evaluating up to five real positions.
 */
function buildReverseChunks(totalPositions: number): ReviewWorkItem[][] {
	const reversed = Array.from({ length: totalPositions }, (_, i) => totalPositions - 1 - i);
	const groups: number[][] = [];
	for (let i = 0; i < reversed.length; i += REAL_POSITIONS_PER_CHUNK)
		groups.push(reversed.slice(i, i + REAL_POSITIONS_PER_CHUNK));

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

/** Whether a review can start: a loaded game with at least one mainline move. */
function canStart(): boolean {
	return status === 'idle' && gameslot.getGamefile() !== undefined && captureMainline().length > 0; // prettier-ignore
}

function getStatus(): ReviewStatus {
	return status;
}

/** Starts reviewing the loaded game's mainline. No-op unless idle with moves to review. */
function start(): void {
	if (!canStart()) return;
	const gamefile: GameFile = gameslot.getGamefile()!;

	mainlineNodes = captureMainline();
	turnOrder = [...gamefile.gameRules.turnOrder];

	// Serialize the game once; each position re-slices the move list.
	longformIn = gamecompressor.compressGamefile(gamefile);
	delete longformIn.metadata.Result; // Irrelevant to the engine.
	delete longformIn.metadata.Termination;
	// Always hand the engine an explicit world border (its own internal fallback is only 1e15),
	// so every reviewed position is evaluated over the full safe coordinate range. Matches ceval.
	longformIn.gameRules.worldBorder = analysisenginebounds.getEngineWorldBorder(gamefile);
	gameFingerprint = serializePosition(mainlineNodes.length);
	division = {};
	division = determineDivision(
		longformIn.position,
		mainlineNodes.map((node) => node.move!),
	);

	const totalPositions = mainlineNodes.length + 1;
	chunkQueue = buildReverseChunks(totalPositions);
	const workerCount = pickWorkerCount(chunkQueue.length);
	reviewDepth = pickReviewDepth(mainlineNodes.length, workerCount);

	results = new Array(totalPositions).fill(undefined);
	effectiveWhiteCp = new Array(totalPositions).fill(undefined);
	positionAttempts.clear();
	evaluatedCount = 0;
	classifiedMoves.clear();
	reviews = new Array(mainlineNodes.length).fill(undefined);
	reviewsByNodeId.clear();
	icnByPosition = new Array(totalPositions).fill(undefined);
	status = 'running';

	notifyProgress();
	const runId = ++reviewRunId;
	void restoreCachedReview(runId).then((restored) => {
		if (restored || status !== 'running' || runId !== reviewRunId) return;
		spawnWorkers(workerCount);
	});
}

function reviewCacheKey(): string | undefined {
	const gameId = window.analysisPageData.gameId;
	return gameId === null ? undefined : `${REVIEW_CACHE_KEY_PREFIX}${gameId}`;
}

/** Restores a complete compatible review, returning false when the engine must run. */
async function restoreCachedReview(runId: number): Promise<boolean> {
	const key = reviewCacheKey();
	if (!key) return false;

	let cached: CachedGameReview | undefined;
	try {
		cached = await IndexedDB.loadItem<CachedGameReview>(key);
	} catch (error) {
		console.warn('[Game Review] Could not read the local review cache:', error);
		return false;
	}
	if (status !== 'running' || runId !== reviewRunId) return true;
	if (!isCompatibleCache(cached)) {
		if (cached !== undefined) void IndexedDB.deleteItem(key).catch(() => undefined);
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
	for (const listener of listeners.finished) listener();
	return true;
}

function isCompatibleCache(cached: CachedGameReview | undefined): cached is CachedGameReview {
	if (
		cached === undefined ||
		cached.schemaVersion !== REVIEW_CACHE_SCHEMA_VERSION ||
		cached.gameFingerprint !== gameFingerprint ||
		cached.engineUrl !== window.analysisPageData.engineUrl ||
		cached.workerUrl !== window.analysisPageData.workerUrl ||
		!Number.isInteger(cached.depth) ||
		cached.depth < reviewDepth ||
		!Array.isArray(cached.results) ||
		cached.results.length !== results.length
	)
		return false;

	return cached.results.every((result, index) => isCachedEvaluation(result, index));
}

function isCachedEvaluation(value: unknown, index: number): value is EvaluateResult {
	if (typeof value !== 'object' || value === null) return false;
	const result = value as Partial<EvaluateResult>;
	return (
		result.requestId === index &&
		Number.isInteger(result.legalMoveCount) &&
		typeof result.inCheck === 'boolean' &&
		Number.isInteger(result.depth) &&
		(result.cp === undefined || typeof result.cp === 'number') &&
		(result.mate === undefined || typeof result.mate === 'number') &&
		(result.pv === undefined ||
			(Array.isArray(result.pv) && result.pv.every((move) => typeof move === 'string')))
	);
}

async function persistCompletedReview(): Promise<void> {
	const key = reviewCacheKey();
	if (!key || results.some((result) => result === undefined)) return;
	const cached: CachedGameReview = {
		schemaVersion: REVIEW_CACHE_SCHEMA_VERSION,
		gameFingerprint,
		engineUrl: window.analysisPageData.engineUrl,
		workerUrl: window.analysisPageData.workerUrl,
		depth: reviewDepth,
		results: results as EvaluateResult[],
	};
	try {
		await IndexedDB.saveItem(key, cached);
	} catch (error) {
		console.warn('[Game Review] Could not save the local review cache:', error);
	}
}

// Game phases (ported from scalachess Divider) -------------------------------------------

/** Finds opening/middlegame/endgame boundaries from each replayed board position. */
function determineDivision(
	initial: Map<CoordsKey, number> | undefined,
	moves: MoveFull[],
): ReviewDivision {
	if (!initial?.size) return {};
	const position = new Map(initial);
	const homeRanks = getHomeRanks(position);
	const profile = buildPhaseProfile(initial);
	if (!profile) return {};
	const initialMixedness = mixedness(position, homeRanks);
	let middle: number | undefined;
	let end: number | undefined;

	for (let index = 0; index <= moves.length; index++) {
		const metrics = phaseMetrics(position, profile);
		const enoughOpening = index >= profile.minimumMiddlePly;
		const mixednessGain = Math.max(0, mixedness(position, homeRanks) - initialMixedness);
		const developed =
			metrics.development >= 0.24 &&
			(metrics.penetrationGain >= 0.06 ||
				metrics.captureRatio >= 0.04 ||
				metrics.development >= 0.38);
		const setupDispersed =
			backrankSparse(position, homeRanks) &&
			metrics.development >= 0.18 &&
			mixednessGain >= Math.max(30, profile.initialPieces * 0.75);
		const engaged =
			metrics.captureRatio >= metrics.captureTrigger || metrics.combatLoss >= 0.18;
		if (middle === undefined && enoughOpening && (developed || setupDispersed || engaged))
			middle = index;

		const endGap = Math.max(6, Math.round(profile.minimumMiddlePly / 2));
		if (
			middle !== undefined &&
			end === undefined &&
			index >= middle + endGap &&
			(metrics.combatRemaining <= 0.43 || metrics.piecesRemaining <= 0.35)
		)
			end = index;
		if (index < moves.length) applyMoveToPosition(position, moves[index]!);
	}

	return { ...(middle !== undefined && { middle }), ...(end !== undefined && { end }) };
}

function getHomeRanks(position: Map<CoordsKey, number>): { white?: bigint; black?: bigint } {
	let white: bigint | undefined;
	let black: bigint | undefined;
	for (const [key, type] of position) {
		const color = typeutil.getColorFromType(type);
		const y = coordutil.getCoordsFromKey(key)[1];
		if (color === p.WHITE && (white === undefined || y < white)) white = y;
		if (color === p.BLACK && (black === undefined || y > black)) black = y;
	}
	return { white, black };
}

/** Non-pawn, non-royal material for the two chess players. */
function majorsAndMinors(position: Map<CoordsKey, number>): number {
	let count = 0;
	for (const type of position.values()) {
		const color = typeutil.getColorFromType(type);
		const raw = typeutil.getRawType(type);
		if (
			(color === p.WHITE || color === p.BLACK) &&
			raw !== r.PAWN &&
			!typeutil.royals.includes(raw)
		)
			count++;
	}
	return count;
}

/** Sparse original home ranks indicate enough development to leave the opening. */
function backrankSparse(
	position: Map<CoordsKey, number>,
	home: { white?: bigint; black?: bigint },
): boolean {
	let white = 0;
	let black = 0;
	for (const [key, type] of position) {
		const color = typeutil.getColorFromType(type);
		const y = coordutil.getCoordsFromKey(key)[1];
		if (color === p.WHITE && y === home.white) white++;
		if (color === p.BLACK && y === home.black) black++;
	}
	return (home.white !== undefined && white < 4) || (home.black !== undefined && black < 4);
}

/**
 * Scalaches's 2×2-region mixedness score, generalized from ranks 1–8 to the
 * players' detected home ranks. Empty regions are irrelevant, so only windows
 * touching an occupied square are enumerated.
 */
function mixedness(
	position: Map<CoordsKey, number>,
	home: { white?: bigint; black?: bigint },
): number {
	if (home.white === undefined || home.black === undefined || home.white === home.black) return 0;
	const regions = new Set<CoordsKey>();
	for (const key of position.keys()) {
		const [x, y] = coordutil.getCoordsFromKey(key);
		for (const dx of [-1n, 0n])
			for (const dy of [-1n, 0n]) regions.add(coordutil.getKeyFromCoords([x + dx, y + dy]));
	}

	let total = 0;
	for (const key of regions) {
		const [x, y] = coordutil.getCoordsFromKey(key);
		let white = 0;
		let black = 0;
		for (const dx of [0n, 1n]) {
			for (const dy of [0n, 1n]) {
				const type = position.get(coordutil.getKeyFromCoords([x + dx, y + dy]));
				if (type === undefined) continue;
				const color = typeutil.getColorFromType(type);
				if (color === p.WHITE) white++;
				else if (color === p.BLACK) black++;
			}
		}
		const rank = normalizedRegionRank(y, home.white, home.black);
		total += mixednessScore(rank, white, black);
	}
	return total;
}

function normalizedRegionRank(y: bigint, whiteHome: bigint, blackHome: bigint): number {
	const span = blackHome - whiteHome;
	const rank = Number(((y - whiteHome) * 7n) / span) + 1;
	return math.clamp(rank, 1, 7);
}

/** Exact score table used by scalachess Divider for a 2×2 region. */
function mixednessScore(y: number, white: number, black: number): number {
	const key = `${white},${black}`;
	switch (key) {
		case '0,0':
			return 0;
		case '1,0':
			return 1 + (8 - y);
		case '2,0':
			return y > 2 ? 2 + (y - 2) : 0;
		case '3,0':
			return y > 1 ? 3 + (y - 1) : 0;
		case '4,0':
			return y > 1 ? 3 + (y - 1) : 0;
		case '0,1':
			return 1 + y;
		case '1,1':
			return 5 + Math.abs(4 - y);
		case '2,1':
			return 4 + (y - 1);
		case '3,1':
			return 5 + (y - 1);
		case '0,2':
			return y < 6 ? 2 + (6 - y) : 0;
		case '1,2':
			return 4 + (7 - y);
		case '2,2':
			return 7;
		case '0,3':
			return y < 7 ? 3 + (7 - y) : 0;
		case '1,3':
			return 5 + (7 - y);
		case '0,4':
			return y < 7 ? 3 + (7 - y) : 0;
		default:
			return 0;
	}
}

type Point = readonly [number, number];

interface ProfilePiece {
	key: CoordsKey;
	type: number;
	coords: Point;
	raw: RawType;
}

interface PhaseSideProfile {
	anchor: Point;
	forward: Point;
	boardSpan: number;
	developmentSquares: Map<CoordsKey, number>;
	initialPenetration: number;
}

interface PhaseProfile {
	sides: PlayerGroup<PhaseSideProfile>;
	initialPieces: number;
	initialCombat: number;
	minimumMiddlePly: number;
}

/** Builds thresholds and movement axes from the actual starting armies. */
function buildPhaseProfile(initial: Map<CoordsKey, number>): PhaseProfile | undefined {
	const pieces = {
		[p.WHITE]: collectPlayerPieces(initial, p.WHITE),
		[p.BLACK]: collectPlayerPieces(initial, p.BLACK),
	};
	if (pieces[p.WHITE].length === 0 || pieces[p.BLACK].length === 0) return undefined;

	const centers = {
		[p.WHITE]: preferredAnchor(pieces[p.WHITE]),
		[p.BLACK]: preferredAnchor(pieces[p.BLACK]),
	};
	const sides: PlayerGroup<PhaseSideProfile> = {};
	for (const color of [p.WHITE, p.BLACK]) {
		const opponent = color === p.WHITE ? p.BLACK : p.WHITE;
		const dx = centers[opponent][0] - centers[color][0];
		const dy = centers[opponent][1] - centers[color][1];
		const span = Math.max(1, Math.hypot(dx, dy));
		const forward: Point = [dx / span, dy / span];
		const candidates = developmentCandidates(pieces[color]);
		sides[color] = {
			anchor: centers[color],
			forward,
			boardSpan: span,
			developmentSquares: new Map(candidates.map(({ key, type }) => [key, type])),
			initialPenetration: penetration(pieces[color], centers[color], forward, span),
		};
	}

	const initialPieces = pieces[p.WHITE].length + pieces[p.BLACK].length;
	return {
		sides,
		initialPieces,
		initialCombat: majorsAndMinors(initial),
		// Classical gets an eleven-ply opening floor. Huge and repeated-dimensional
		// setups receive up to twenty-four plies before a phase transition is possible.
		minimumMiddlePly: math.clamp(Math.round(Math.sqrt(initialPieces) * 2), 10, 24),
	};
}

function collectPlayerPieces(position: Map<CoordsKey, number>, color: Player): ProfilePiece[] {
	const pieces: ProfilePiece[] = [];
	for (const [key, type] of position) {
		if (typeutil.getColorFromType(type) !== color) continue;
		const [x, y] = coordutil.getCoordsFromKey(key);
		pieces.push({ key, type, coords: [Number(x), Number(y)], raw: typeutil.getRawType(type) });
	}
	return pieces;
}

/** Royal center when present; army centroid for kingless and multi-royal setups. */
function preferredAnchor(pieces: ProfilePiece[]): Point {
	const royals = pieces.filter((piece) => typeutil.royals.includes(piece.raw));
	return centroid(royals.length > 0 ? royals : pieces);
}

function centroid(pieces: ProfilePiece[]): Point {
	let x = 0;
	let y = 0;
	for (const piece of pieces) {
		x += piece.coords[0];
		y += piece.coords[1];
	}
	return [x / pieces.length, y / pieces.length];
}

/** Pawn-only/horde armies fall back to all non-royal starting pieces. */
function developmentCandidates(pieces: ProfilePiece[]): ProfilePiece[] {
	const officers = pieces.filter(
		(piece) => piece.raw !== r.PAWN && !typeutil.royals.includes(piece.raw),
	);
	if (officers.length >= 2) return officers;
	return pieces.filter((piece) => !typeutil.royals.includes(piece.raw));
}

function penetration(pieces: ProfilePiece[], anchor: Point, forward: Point, span: number): number {
	if (pieces.length === 0) return 0;
	let advanced = 0;
	for (const piece of pieces) {
		const dx = piece.coords[0] - anchor[0];
		const dy = piece.coords[1] - anchor[1];
		if ((dx * forward[0] + dy * forward[1]) / span >= 0.28) advanced++;
	}
	return advanced / pieces.length;
}

function phaseMetrics(
	position: Map<CoordsKey, number>,
	profile: PhaseProfile,
): {
	development: number;
	penetrationGain: number;
	captureRatio: number;
	captureTrigger: number;
	combatLoss: number;
	combatRemaining: number;
	piecesRemaining: number;
} {
	let currentPieces = 0;
	let developed = 0;
	let developmentTotal = 0;
	let penetrationGain = 0;
	for (const color of [p.WHITE, p.BLACK]) {
		const pieces = collectPlayerPieces(position, color);
		const side = profile.sides[color]!;
		currentPieces += pieces.length;
		for (const [key, type] of side.developmentSquares) {
			developmentTotal++;
			if (position.get(key) !== type) developed++;
		}
		penetrationGain += Math.max(
			0,
			penetration(pieces, side.anchor, side.forward, side.boardSpan) -
				side.initialPenetration,
		);
	}
	const combat = majorsAndMinors(position);
	const captureRatio = 1 - currentPieces / profile.initialPieces;
	return {
		development: developmentTotal > 0 ? developed / developmentTotal : 0,
		penetrationGain: penetrationGain / 2,
		captureRatio,
		captureTrigger: Math.max(0.08, 4 / profile.initialPieces),
		combatLoss: profile.initialCombat > 0 ? 1 - combat / profile.initialCombat : 0,
		combatRemaining: profile.initialCombat > 0 ? combat / profile.initialCombat : 1,
		piecesRemaining: currentPieces / profile.initialPieces,
	};
}

function applyMoveToPosition(position: Map<CoordsKey, number>, move: MoveFull): void {
	for (const change of move.changes) {
		const start = coordutil.getKeyFromCoords(change.piece.coords);
		switch (change.action) {
			case 'capture':
			case 'delete':
				position.delete(start);
				break;
			case 'add':
				position.set(start, change.piece.type);
				break;
			case 'move':
				position.delete(start);
				position.set(coordutil.getKeyFromCoords(change.endCoords), change.piece.type);
				break;
		}
	}
}

/** Cancels a running review, keeping any classifications already made. */
function cancel(): void {
	if (status !== 'running') return;
	terminateWorkers();
	status = 'idle';
	notifyProgress();
	for (const listener of listeners.finished) listener();
}

/** Fully clears the review (new game loaded / page reset). */
function reset(): void {
	terminateWorkers();
	reviewRunId++;
	status = 'idle';
	mainlineNodes = [];
	longformIn = undefined;
	gameFingerprint = '';
	results = [];
	effectiveWhiteCp = [];
	chunkQueue = [];
	positionAttempts.clear();
	evaluatedCount = 0;
	classifiedMoves.clear();
	reviews = [];
	reviewsByNodeId.clear();
	icnByPosition = [];
}

// Worker pool -----------------------------------------------------------------------------

function spawnWorkers(count: number): void {
	for (let i = 0; i < count; i++) spawnWorker();
}

function spawnWorker(): void {
	const worker = new Worker(window.analysisPageData.workerUrl, { type: 'module' });
	workers.push(worker);
	worker.onmessage = (e: MessageEvent<AnalysisResponse>) => handleWorkerMessage(worker, e.data);
	worker.onerror = (e: ErrorEvent) => {
		console.error(`[Game Review] Worker crashed: ${e.message || '(no message)'}`);
		handleWorkerFault(worker);
	};
	// No `threads`: review workers search single-threaded — parallelism is across positions.
	worker.postMessage({
		cmd: 'init',
		hashMb: 16,
		engineUrl: window.analysisPageData.engineUrl,
	} satisfies AnalysisCommand);
}

function terminateWorkers(): void {
	for (const worker of workers) worker.terminate();
	workers = [];
	workerAssignment.clear();
	workerChunk.clear();
}

function handleWorkerMessage(worker: Worker, msg: AnalysisResponse): void {
	if (status !== 'running') return;
	switch (msg.type) {
		case 'ready':
			dispatchNext(worker);
			break;
		case 'initerror':
			handleWorkerFault(worker);
			break;
		case 'evaluated':
			workerAssignment.delete(worker);
			if (!msg.warmup) receiveEvaluation(msg);
			dispatchNext(worker);
			break;
		case 'searcherror':
			// The wasm module is poisoned — respawn the worker; its position retries.
			handleWorkerFault(worker);
			break;
	}
}

/**
 * Handles a crashed/failed worker: requeues its position (skipping it after
 * {@link MAX_POSITION_ATTEMPTS}) and respawns a replacement with fresh wasm.
 */
function handleWorkerFault(worker: Worker): void {
	const assigned = workerAssignment.get(worker);
	const remaining = workerChunk.get(worker) ?? [];
	workerAssignment.delete(worker);
	workerChunk.delete(worker);
	worker.terminate();
	workers = workers.filter((w) => w !== worker);
	if (status !== 'running') return;

	if (assigned !== undefined) {
		if (
			assigned.warmup ||
			(positionAttempts.get(assigned.index) ?? 0) < MAX_POSITION_ATTEMPTS
		) {
			chunkQueue.unshift([{ ...assigned, newChunk: true }, ...remaining]);
		} else {
			// Give up on this position: record an empty evaluation so the review continues
			// (its eval carries over; adjacent moves classify as unknown).
			if (remaining.length > 0)
				chunkQueue.unshift([{ ...remaining[0]!, newChunk: true }, ...remaining.slice(1)]);
			receiveEvaluation({ requestId: assigned.index, legalMoveCount: 2, inCheck: false, depth: 0 }); // prettier-ignore
		}
	} else if (remaining.length > 0) {
		chunkQueue.unshift([{ ...remaining[0]!, newChunk: true }, ...remaining.slice(1)]);
	}

	if (chunkQueue.length > 0) {
		// The last worker died. If positions remain, try one fresh worker — repeated
		// faults burn through the per-position attempts, so this always terminates.
		spawnWorker();
	} else if (workers.length === 0 && evaluatedCount < results.length) failReview();
}

function failReview(): void {
	terminateWorkers();
	status = 'failed';
	notifyProgress();
	for (const listener of listeners.finished) listener();
}

/** Hands the worker the next queued position, building its ICN on demand. */
function dispatchNext(worker: Worker): void {
	let localChunk = workerChunk.get(worker);
	if (!localChunk || localChunk.length === 0) {
		localChunk = chunkQueue.shift();
		if (!localChunk) return;
		workerChunk.set(worker, localChunk);
	}
	const work = localChunk.shift()!;
	const index = work.index;

	workerAssignment.set(worker, work);
	if (!work.warmup) positionAttempts.set(index, (positionAttempts.get(index) ?? 0) + 1);

	const icn = serializePosition(index);
	icnByPosition[index] = icn;

	worker.postMessage({
		cmd: 'evaluate',
		requestId: index, // The position index doubles as the request id.
		icn,
		maxDepth: reviewDepth,
		...(work.newChunk && { newChunk: true }),
		...(work.warmup && { warmup: true }),
	} satisfies AnalysisCommand);
}

/** Canonical ICN for the position after `index` mainline plies. */
function serializePosition(index: number): string {
	longformIn!.moves = mainlineNodes.slice(0, index).map((node) => node.move!);
	return icnconverter.LongToShort_Format(longformIn!, {
		compact: true,
		skipPosition: false,
		spaces: false,
		comments: false,
		make_new_lines: false,
		move_numbers: false,
	});
}

// Result processing --------------------------------------------------------------------------

/** The player to move at position `index` (= the mover of mainline move `index`). */
function moverAtPly(index: number): Player {
	return turnOrder[index % turnOrder.length]!;
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
	let label: import('./moveevals.js').MoveEvalLabel | undefined;
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
	const label: import('./moveevals.js').MoveEvalLabel = {
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
		pv: before.pv ? before.pv.slice(0, 12) : undefined,
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
	for (const listener of listeners.finished) listener();
	void persistCompletedReview();
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
	start,
	cancel,
	reset,
	canStart,
	getStatus,
	getSummary,
	getReviews,
	getReviewForNode,
	getMainlineNodes,
	getDivision,
	getWhiteCpAt,
	onProgress,
	onClassified,
	onFinished,
	CLASSIFICATION_DISPLAY,
};

export type { ClassificationKey, MoveReview, PlayerReviewSummary, ReviewSummary, ReviewDivision }; // prettier-ignore
