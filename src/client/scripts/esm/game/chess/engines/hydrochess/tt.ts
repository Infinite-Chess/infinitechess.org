// @ts-ignore
import type { gamefile } from "../../../../chess/logic/gamefile.js";
// @ts-ignore
import type { MoveDraft } from "../../../../chess/logic/movepiece.js";
import boardutil from "../../../../chess/util/boardutil.js";
import { MATE_SCORE, NO_ENTRY } from "./engine.js";


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

// Helper Functions
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

/**
 * Enhanced bit mixing for hash values to improve distribution.
 * Based on Thomas Wang's 32-bit mix function.
 */
function mixBits(n: number): number {
	n = ((n >> 16) ^ n) * 0x45d9f3b;
	n = ((n >> 16) ^ n) * 0x45d9f3b;
	n = (n >> 16) ^ n;
	return n >>> 0; // Convert to unsigned 32-bit
}

/**
 * Find next power of 2 that is >= the input value
 */
function nextPowerOfTwo(n: number): number {
	--n;
	n |= n >>> 1;
	n |= n >>> 2;
	n |= n >>> 4;
	n |= n >>> 8;
	n |= n >>> 16;
	return n + 1;
}

export class TranspositionTable {
	private table: Map<number, TTEntry>;
	private size: number;
	private mask: number; // Bit mask for power-of-2 size
	private currentAge: number;

	constructor(sizeInMB: number = 64) {
		// Estimate size: Assume an entry is roughly 100 bytes (adjust as needed)
		// Calculate raw size based on memory allocation
		const rawSize = Math.floor((sizeInMB * 1024 * 1024) / 100);
		
		// Round to next power of 2 for optimal hash distribution
		this.size = nextPowerOfTwo(rawSize);
		this.mask = this.size - 1; // For optimized modulo with bitwise AND
		this.table = new Map<number, TTEntry>();
		this.currentAge = 0;
		console.debug(`[Engine] Initialized TT with capacity: ${this.size} entries (power of 2)`);
	}

	/**
	 * Generates an enhanced hash based on piece positions and turn.
	 * Uses normalized coordinates, bitwise operations, and bit mixing for improved distribution.
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

			// 1. Hash Normalized Coordinates with improved bit mixing:
			// Combine x and y using bitwise operations with better distribution
			const coordHash = (normX & 0xFFFF) ^ ((normY & 0xFFFF) << 16);

			// 2. Combine Piece Type and Coordinate Hash with further mixing:
			const pieceHash = mixBits(piece.type ^ coordHash);

			// 3. XOR into the Main Hash:
			hashValue ^= pieceHash;
		}

		// 4. XOR in the Player Turn and apply final mixing:
		hashValue ^= board.whosTurn;
		return mixBits(hashValue);
	}

	/**
	 * Stores an entry in the TT.
	 * Implements an enhanced replacement strategy considering depth, age, and node type.
	 */
	public store(
		hash: number,
		depth: number,
		flag: TTFlag,
		score: number,
		bestMove: MoveDraft | null,
		ply: number
	): void {
		// Use masked hash for improved distribution with power-of-2 size
		const maskedHash = hash & this.mask;
		const existingEntry = this.table.get(maskedHash);
		let replace = false;

		// Determine if we should replace the existing entry
		if (!existingEntry) {
			// No existing entry, always replace
			replace = true;
		} else if (existingEntry.hash === hash) {
			// Same position, prioritize deeper searches and exact scores
			if (flag === TTFlag.EXACT) {
				replace = true; // Always replace with exact scores
			} else if (existingEntry.flag !== TTFlag.EXACT) {
				// If current entry is not exact, prioritize deeper searches
				replace = depth >= existingEntry.depth;
			}
		} else {
			// Different position (hash collision), use a more sophisticated replacement strategy
			// Consider: age, depth, and node type
			const ageDiff = this.currentAge - existingEntry.age;
			const depthDiff = depth - existingEntry.depth;
			
			// Replace if: 
			// 1. Older entry by at least 2 ages, or
			// 2. Similar age but deeper search, or
			// 3. Much deeper search regardless of age
			replace = (ageDiff >= 2) || 
				       (ageDiff >= 1 && depthDiff >= 0) ||
				       (depthDiff >= 3);
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
			this.table.set(maskedHash, {
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
	 * For move ordering, also returns the best move separately via getBestMove.
	 * Implements a simple approach to probe with alpha-beta bounds.
	 */
	public probe(hash: number, alpha: number, beta: number, depth: number, ply: number): number | MoveDraft {
		const maskedHash = hash & this.mask;
		const entry = this.table.get(maskedHash);

		// Check if entry exists and if the hash matches
		if (entry && entry.hash === hash) {
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

			return entry.bestMove ?? NO_ENTRY;
		}

		// If hash entry doesn't exist or insufficient depth, return NO_ENTRY
		return NO_ENTRY;
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
		
		// Periodic cleanup of old entries to avoid excessive memory usage
		if (this.currentAge % 20 === 0 && this.table.size > this.size * 0.9) {
			this.agePruning();
		}
	}
	
	/**
	 * Removes entries that are too old to be useful
	 */
	private agePruning(): void {
		const keysToDelete: number[] = [];
		
		this.table.forEach((entry, key) => {
			// Remove entries that are at least 5 ages old
			if (this.currentAge - entry.age >= 5) {
				keysToDelete.push(key);
			}
		});
		
		keysToDelete.forEach(key => {
			this.table.delete(key);
		});
		
		console.debug(`[Engine] TT age pruning: removed ${keysToDelete.length} old entries`);
	}
}