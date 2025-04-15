// @ts-ignore
import type { gamefile } from "../../../../chess/logic/gamefile.js";
// @ts-ignore
import type { MoveDraft } from "../../../../chess/logic/movepiece.js";
import boardutil from "../../../../chess/util/boardutil.js";

// Evaluation flags
export enum TTFlag {
	EXACT,
	LOWER_BOUND, // Fail-low, score is at least this value
	UPPER_BOUND, // Fail-high, score is at most this value
}

const MIN_MATE_SCORE = 40000;
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
 * Maps values outside the bound into HASH_MODULO_BUCKETS buckets based on
 * their difference from the bound, preserving relative position modulo BUCKETS.
 */
function normalizeCoordForHash(coord: number): number {
	const absCoord = Math.abs(coord);

	if (absCoord <= HASH_COORD_BOUND) {
		return coord; // Keep coordinates within bounds as they are
	} else {
		const sign = Math.sign(coord); // 1 or -1
		// Calculate the difference from the bound
		const delta = coord - (sign * HASH_COORD_BOUND);
		// Calculate the bucket using modulo. JS % operator preserves sign.
		const bucket = delta % HASH_MODULO_BUCKETS;
		// Map to a value just outside the bound, based on the bucket.
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
		let hashValue = 0; // Initialize as a number

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

		// console.debug("Modulo Normalized Hash: ", hashValue >>> 0);
		return hashValue >>> 0; // Return as unsigned 32-bit integer
	}

	/**
	 * Stores an entry in the TT.
	 * Uses a simple replacement strategy: replace if new entry is deeper or if the slot is empty/older.
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

		// Adjust score back to raw mate score if necessary before storing
		let storeScore = score;
		if (Math.abs(score) >= MIN_MATE_SCORE) {
			storeScore = score > 0 ? score + ply : score - ply; // Reverse the ply adjustment
		}

		// Replacement strategy: Always replace, or replace deeper/newer entries
		// Simple strategy: Replace if new entry is deeper or if same depth, replace
		if (!existingEntry || depth >= existingEntry.depth) {
			this.table.set(hash, {
				hash, // Store hash for collision checks
				depth,
				flag,
				score: storeScore, // Store the (potentially raw) mate score
				bestMove,
				age: this.currentAge, // For aging/replacement strategies
				ply, // Store ply for later adjustment
			});
		}
	}

	/**
	 * Probes the TT for a given hash. Returns the entry if hash matches.
	 * Score is ply-adjusted only if depth is sufficient.
	 */
	public probe(hash: number, depth: number, ply: number): TTEntry | null {
		const entry = this.table.get(hash);

		// Check if entry exists and if the hash matches
		if (entry && entry.hash === hash) { 
			// Check if the stored depth is sufficient for a potential score cutoff
			if (entry.depth >= depth) {
				let score = entry.score;
				// Adjust mate scores based on the *current* ply
				if (Math.abs(score) >= MIN_MATE_SCORE) { 
					score = score > 0 ? score - ply : score + ply;
				}
				// console.debug(`[TT Probe] Deep Hit! Hash ${hash}, depth ${entry.depth}>=${depth}, flag ${TTFlag[entry.flag]}, adj score ${score}`); // DEBUG
				// Return a copy with the ply-adjusted score for immediate use by the caller
				return { ...entry, score: score }; 
			} else {
				// Shallow hit - return the original entry, caller can use bestMove for ordering
				// console.debug(`[TT Probe] Shallow Hit. Hash ${hash}, depth ${entry.depth} < ${depth}. Use bestMove for ordering.`); // DEBUG
				return entry; // Return the original entry without score adjustment
			}
		}
		// Miss
		return null;
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