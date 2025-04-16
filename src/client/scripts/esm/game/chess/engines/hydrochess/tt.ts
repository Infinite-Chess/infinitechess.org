// @ts-ignore
import type { gamefile } from "../../../../chess/logic/gamefile.js";
// @ts-ignore
import type { MoveDraft } from "../../../../chess/logic/movepiece.js";
import boardutil from "../../../../chess/util/boardutil.js";
import { MATE_SCORE, NO_ENTRY } from "../hydrochess.js";


// Evaluation flags
export enum TTFlag {
	EXACT,
	LOWER_BOUND, // Fail-low, score is at least this value
	UPPER_BOUND, // Fail-high, score is at most this value
}

const HASH_COORD_BOUND = 150; // Bound for coordinate normalization in hashing
const HASH_MODULO_BUCKETS = 8; // Number of buckets for coords outside the bound

// Structure for a single TT entry
interface TTEntry {
	hash: number; // Use a number-based hash derived from board state
	depth: number;
	flag: TTFlag;
	score: number;
	bestMove: MoveDraft | null;
	age: number; // For replacement strategy
	ply: number; // Ply when entry was stored
}

// Helper Function
/**
 * Normalizes a coordinate for hashing. Keeps values within HASH_COORD_BOUND.
 * Maps values outside the bound into HASH_MODULO_BUCKETS based on
 * their difference from the bound, while *mostly* preserving relative position.
 */
function normalizeCoordForHash(coord: number): number {
	const absCoord = Math.abs(coord);

	if (absCoord <= HASH_COORD_BOUND) {
		return coord; // Keep coordinates within bounds as they are
	} else {
		const sign = Math.sign(coord); // 1 or -1
		// Calculate the difference from the bound
		const delta = coord - (sign * HASH_COORD_BOUND);
		// Calculate the bucket using modulo
		const bucket = delta % HASH_MODULO_BUCKETS;
		// Map to a value just outside the bound, based on the bucket
		return sign * HASH_COORD_BOUND + bucket;
	}
}

export class TranspositionTable {
	private table: Map<number, TTEntry>;
	private size: number;
	private currentAge: number;

	constructor(sizeInMB: number = 64) {
		// Estimate size: Assume an entry is roughly 100 bytes (adjust as needed)
		// This is a very rough estimate, should consider profiling later.
		// hash (number, 4), depth (4), flag (1), score (4), bestMove (~10-20?), age (4)
		this.size = Math.floor((sizeInMB * 1024 * 1024) / 100);
		this.table = new Map<number, TTEntry>();
		this.currentAge = 0;
		console.debug(`[Engine] Initialized TT with estimated capacity: ${this.size} entries`);
	}

	/**
	 * Generates a simple hash based on piece positions and turn.
	 * Uses normalized coordinates and bitwise operations for speed.
	 * Ignores special moves for simplicity/speed.
	 */
	public static generateHash(board: gamefile): number {
		let hashValue = 0;

		// Iterate using the boardutil helper
		const allCoords = boardutil.getCoordsOfAllPieces(board.pieces);
		for (const coords of allCoords) {
			const piece = boardutil.getPieceFromCoords(board.pieces, coords)!;

			// Normalize coordinates before hashing
			const normX = normalizeCoordForHash(coords[0]);
			const normY = normalizeCoordForHash(coords[1]);

			// 1. Hash Normalized Coordinates:
			// Combine x and y using bitwise operations.
			// Shift normY to avoid simple collisions between (x, y) and (y, x).
			// Use bitwise AND with 0xFFFF for safety/consistency, although normalized values are small.
			const coordHash = (normX & 0xFFFF) ^ ((normY & 0xFFFF) << 16);

			// 2. Combine Piece Type and Coordinate Hash:
			const pieceHash = piece.type ^ coordHash;

			// 3. XOR into the Main Hash:
			hashValue ^= pieceHash;
		}

		// 4. XOR in the Player Turn:
		hashValue ^= board.whosTurn;
		return hashValue >>> 0; // Return as unsigned 32-bit integer
	}

	/**
	 * Stores an entry in the TT.
	 * Implements a simple replacement strategy.
	 */
	public store(
		hash: number,
		depth: number,
		flag: TTFlag,
		score: number,
		bestMove: MoveDraft | null,
		ply: number
	): void {
		const existingEntry = this.table.get(hash);
		let replace = false;

		// Determine if we should replace the existing entry
		if (!existingEntry) {
			// No existing entry, always replace
			replace = true;
		} else if (existingEntry.hash === hash) {
			// Same position hash, replace if depth is comparable or exact flag
			replace = (existingEntry.depth >= 3 && depth >= existingEntry.depth - 3) || flag === TTFlag.EXACT;
		} else {
			// Different position hash, replace if old age or better depth
			replace = existingEntry.age !== this.currentAge || depth >= existingEntry.depth;
		}

		if (replace) {
			// Adjust mate scores based on ply
			let adjustedScore = score;
			if (score < -MATE_SCORE) {
				adjustedScore -= ply;
			} else if (score > MATE_SCORE) {
				adjustedScore += ply;
			}

			// Store the entry
			this.table.set(hash, {
				hash,
				depth,
				flag,
				score: adjustedScore,
				bestMove,
				age: this.currentAge,
				ply
			});
		}
	}

	/**
	 * Probes the TT for a given hash. Returns value based on the entry if found, otherwise NO_ENTRY.
	 * Implements a simple approach to probe with alpha-beta bounds.
	 */
	public probe(hash: number, alpha: number, beta: number, depth: number, ply: number): number {
		const entry = this.table.get(hash);

		// Check if entry exists and if the hash matches
		if (entry && entry.hash === hash) {
			// Return best move for move ordering regardless of depth
			// (Note: We're assuming bestMove is handled by the caller, which may need to be adjusted)

			if (entry.depth >= depth) {
				// Init score
				let score = entry.score;

				// Adjust mating scores
				if (score < -MATE_SCORE) {
					score += ply;
				} else if (score > MATE_SCORE) {
					score -= ply;
				}

				// Match hash flag
				if (entry.flag === TTFlag.EXACT) {
					return score;
				} else if (entry.flag === TTFlag.LOWER_BOUND && score <= alpha) {
					return alpha;
				} else if (entry.flag === TTFlag.UPPER_BOUND && score >= beta) {
					return beta;
				}
			}
		}

		// If hash entry doesn't exist or insufficient depth, return NO_ENTRY
		return NO_ENTRY;
	}

	/**
	 * Retrieves the best move from a TT entry if available.
	 */
	public getBestMove(hash: number): MoveDraft | null {
		const entry = this.table.get(hash);
		return entry ? entry.bestMove : null;
	}

	/**
	 * Clears the Transposition Table.
	 */
	public clear(): void {
		this.table.clear();
		this.currentAge = 0;
		console.debug('[Engine] TT cleared.');
	}

	/**
	 * Increments the age counter, typically called before each search.
	 */
	public incrementAge(): void {
		this.currentAge++;
	}

	// Add methods for getting statistics if needed (e.g., hit rate)
	public getEntryCount(): number {
		return this.table.size;
	}
}