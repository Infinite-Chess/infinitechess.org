use wasm_bindgen::prelude::*;
use js_sys;
use web_sys::console;
use std::collections::HashMap;
use std::cell::RefCell;

// Evaluation flags
#[derive(Debug, Copy, Clone, PartialEq)]
pub enum TTFlag {
    EXACT = 0,
    LOWER_BOUND = 1, // Fail-low, score is at least this value
    UPPER_BOUND = 2, // Fail-high, score is at most this value
}

// Constants for hashing
const HASH_COORD_BOUND: i32 = 150; // Bound for coordinate normalization in hashing
const HASH_MODULO_BUCKETS: i32 = 8; // Number of buckets for coords outside the bound

// Replacement strategy constants
const DEPTH_PREFERENCE: i32 = 4;  // Prefer entries with deeper searches
const AGE_PREFERENCE: i32 = 2;    // Prefer newer entries
const EXACT_PREFERENCE: i32 = 8;  // Strong preference for exact scores

// Structure for a single TT entry
#[derive(Clone, Debug)]
pub struct TTEntry {
    pub hash: i32,                 // Use a number-based hash derived from board state
    pub depth: i32,
    pub flag: TTFlag,
    pub score: i32,
    pub best_move: Option<JsValue>,
    pub age: i32,                  // For replacement strategy
    pub ply: i32,                  // Ply when entry was stored
}

// Helper Function
/// Normalizes a coordinate for hashing. Keeps values within HASH_COORD_BOUND.
/// Maps values outside the bound into HASH_MODULO_BUCKETS based on
/// their difference from the bound, while *mostly* preserving relative position.
fn normalize_coord_for_hash(coord: i32) -> i32 {
    let abs_coord = coord.abs();
    
    if abs_coord <= HASH_COORD_BOUND {
        coord // Keep coordinates within bounds as they are
    } else {
        let sign = if coord > 0 { 1 } else { -1 }; // 1 or -1
        // Calculate the difference from the bound
        let delta = abs_coord - HASH_COORD_BOUND;
        // Calculate the bucket using modulo
        let bucket = delta % HASH_MODULO_BUCKETS;
        // Map to a value just outside the bound, based on the bucket
        sign * (HASH_COORD_BOUND + bucket)
    }
}

pub struct TranspositionTable {
    table: HashMap<i32, TTEntry>,
    size: usize,
    current_age: i32,
}

// Import JavaScript helper functions
#[wasm_bindgen(module = "/js_bridge.js")]
extern "C" {
    #[wasm_bindgen(js_name = "getCoordsOfAllPieces")]
    fn get_coords_of_all_pieces(pieces: &JsValue) -> js_sys::Array;
    
    #[wasm_bindgen(js_name = "getPieceFromCoords")]
    fn get_piece_from_coords(pieces: &JsValue, coords: &JsValue) -> JsValue;
}

impl TranspositionTable {
    /// Create a new transposition table with the given size in MB
    pub fn new(size_mb: usize) -> Self {
        // Calculate optimal table size based on power of 2
        // This helps with hash distribution and table efficiency
        let size_bytes = size_mb * 1024 * 1024;
        let approx_entry_size = 100; // Estimated bytes per entry
        let optimal_capacity = size_bytes / approx_entry_size;
        
        // Round to next power of 2 for optimal HashMap performance
        let power_of_2 = optimal_capacity.next_power_of_two();
        
        let tt = TranspositionTable {
            table: HashMap::with_capacity(power_of_2),
            size: power_of_2,
            current_age: 0,
        };
        
        console::debug_1(&JsValue::from_str(&format!("[Engine] Initialized TT with estimated capacity: {} entries", power_of_2)));
        
        tt
    }
    
    /// Generates an improved hash based on piece positions and turn.
    /// Uses normalized coordinates and bitwise operations for speed.
    pub fn generate_hash(&self, board: &JsValue) -> i32 {
        let mut hash_value: i32 = 0;
        
        // Get the pieces object from the board
        let pieces = js_sys::Reflect::get(board, &JsValue::from_str("pieces")).unwrap_or(JsValue::null());
        if pieces.is_null() || pieces.is_undefined() {
            console::warn_1(&JsValue::from_str("[Engine] Invalid pieces object in generate_hash"));
            return 0;
        }
        
        // Get all piece coordinates using JS helper
        let all_coords = get_coords_of_all_pieces(&pieces);
        let coords_len = all_coords.length();
        
        // Use prime numbers for better hash distribution
        const PRIMES: [i32; 16] = [
            3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59
        ];
        
        // Process each piece
        for i in 0..coords_len {
            let coords = all_coords.get(i);
            
            // Get the piece at these coordinates using JS helper
            let piece = get_piece_from_coords(&pieces, &coords);
            
            if !piece.is_null() && !piece.is_undefined() {
                // Extract piece type from JS object
                let piece_type = js_sys::Reflect::get(&piece, &JsValue::from_str("type"))
                    .unwrap_or(JsValue::from_f64(0.0))
                    .as_f64()
                    .unwrap_or(0.0) as i32;
                
                // Extract coordinates
                let x = js_sys::Reflect::get(&coords, &JsValue::from_f64(0.0))
                    .unwrap_or(JsValue::from_f64(0.0))
                    .as_f64()
                    .unwrap_or(0.0) as i32;
                    
                let y = js_sys::Reflect::get(&coords, &JsValue::from_f64(1.0))
                    .unwrap_or(JsValue::from_f64(0.0))
                    .as_f64()
                    .unwrap_or(0.0) as i32;
                
                // Normalize coordinates before hashing
                let norm_x = normalize_coord_for_hash(x);
                let norm_y = normalize_coord_for_hash(y);
                
                // Use prime multipliers for better distribution
                let prime_idx = (piece_type & 0xF) as usize;
                let prime = PRIMES[prime_idx % PRIMES.len()]; 
                
                // Combine with piece type using rotation and XOR for better bit mixing
                let coord_hash = ((norm_x & 0xFFFF) << 16) | (norm_y & 0xFFFF);
                let piece_hash = piece_type ^ (coord_hash.rotate_left(prime as u32));
                
                // XOR into main hash
                hash_value ^= piece_hash;
            }
        }
        
        // 4. XOR in the Player Turn with a large prime offset
        let whos_turn = js_sys::Reflect::get(board, &JsValue::from_str("whosTurn"))
            .unwrap_or(JsValue::from_f64(1.0))
            .as_f64()
            .unwrap_or(1.0) as i32;
            
        hash_value ^= whos_turn * (0x9E3779B9u32 as i32); // Golden ratio prime for good mixing
        
        // Return as unsigned 32-bit integer
        hash_value
    }
    
    /// Stores an entry in the TT.
    /// Implements an enhanced replacement strategy that considers:
    /// - Depth: Prefer deeper searches
    /// - Age: Prefer newer entries 
    /// - Flag: Prefer exact scores over bounds
    pub fn store(
        &mut self,
        hash: i32,
        depth: i32,
        flag: TTFlag,
        score: i32,
        best_move: Option<JsValue>,
        ply: i32
    ) {
        // Always replace if table is not full
        if self.table.len() < self.size {
            // Adjust mate scores based on ply
            let adjusted_score = if score < -crate::engine::MATE_SCORE {
                score - ply
            } else if score > crate::engine::MATE_SCORE {
                score + ply
            } else {
                score
            };
            
            // Store the entry
            self.table.insert(hash, TTEntry {
                hash,
                depth,
                flag,
                score: adjusted_score,
                best_move,
                age: self.current_age,
                ply
            });
            return;
        }
        
        let existing_entry = self.table.get(&hash).cloned();
        
        // If entry exists with same hash, decide whether to replace
        if let Some(entry) = existing_entry {
            if entry.hash == hash {
                // Same position, more sophisticated replacement strategy
                
                // Prefer exact entries, especially for same or higher depth
                if flag == TTFlag::EXACT && (entry.flag != TTFlag::EXACT || depth >= entry.depth) {
                    // Replace with exact entry
                } else if entry.flag == TTFlag::EXACT && flag != TTFlag::EXACT && entry.depth > depth {
                    // Keep existing exact entry with deeper search
                    return;
                } else if depth >= entry.depth - 1 {
                    // Replace if depth is comparable
                } else if entry.age != self.current_age {
                    // Replace if old age
                } else {
                    // Keep existing entry
                    return;
                }
            } else {
                // Different position hash
                // Calculate replacement value based on weighted factors:
                // - Age (newer is better)
                // - Depth (deeper is better)
                // - Flag (exact is better)
                
                let entry_value = entry.depth * DEPTH_PREFERENCE + 
                                  (if entry.age == self.current_age { AGE_PREFERENCE } else { 0 }) + 
                                  (if entry.flag == TTFlag::EXACT { EXACT_PREFERENCE } else { 0 });
                
                let new_value = depth * DEPTH_PREFERENCE + 
                               AGE_PREFERENCE + 
                               (if flag == TTFlag::EXACT { EXACT_PREFERENCE } else { 0 });
                
                if new_value <= entry_value {
                    // Keep existing entry if it's more valuable
                    return;
                }
            }
        }
        
        // Adjust mate scores based on ply
        let adjusted_score = if score < -crate::engine::MATE_SCORE {
            score - ply
        } else if score > crate::engine::MATE_SCORE {
            score + ply
        } else {
            score
        };
        
        // Store the entry
        self.table.insert(hash, TTEntry {
            hash,
            depth,
            flag,
            score: adjusted_score,
            best_move,
            age: self.current_age,
            ply
        });
    }
    
    /// Probes the TT for a given hash. Returns value based on the entry if found, otherwise NO_ENTRY.
    /// For move ordering, also returns the best move separately via getBestMove.
    /// Implements a simple approach to probe with alpha-beta bounds.
    pub fn probe(&self, hash: i32, alpha: i32, beta: i32, depth: i32, ply: i32) -> JsValue {
        if let Some(entry) = self.table.get(&hash) {
            // Check if entry exists and if the hash matches
            if entry.hash == hash {
                // Always return the best move if it exists, regardless of depth
                // This helps with move ordering even if we can't use the score
                if let Some(best_move) = &entry.best_move {
                    if entry.depth < depth {
                        // Return the move but not the score if depth is insufficient
                        return best_move.clone();
                    }
                    
                    // Otherwise, proceed with regular score retrieval
                    // Init score
                    let mut score = entry.score;
                    
                    // Adjust mating scores
                    if score < -crate::engine::MATE_SCORE {
                        score += ply;
                    } else if score > crate::engine::MATE_SCORE {
                        score -= ply;
                    }
                    
                    // Match hash flag
                    if entry.flag == TTFlag::EXACT {
                        return JsValue::from_f64(score as f64);
                    } else if entry.flag == TTFlag::LOWER_BOUND && score >= beta {
                        return JsValue::from_f64(beta as f64);
                    } else if entry.flag == TTFlag::UPPER_BOUND && score <= alpha {
                        return JsValue::from_f64(alpha as f64);
                    }
                    
                    // If score doesn't cause a cutoff, return the move
                    return best_move.clone();
                } else if entry.depth >= depth {
                    // We have an entry with sufficient depth but no best move
                    // Init score
                    let mut score = entry.score;
                    
                    // Adjust mating scores
                    if score < -crate::engine::MATE_SCORE {
                        score += ply;
                    } else if score > crate::engine::MATE_SCORE {
                        score -= ply;
                    }
                    
                    // Match hash flag
                    if entry.flag == TTFlag::EXACT {
                        return JsValue::from_f64(score as f64);
                    } else if entry.flag == TTFlag::LOWER_BOUND && score >= beta {
                        return JsValue::from_f64(beta as f64);
                    } else if entry.flag == TTFlag::UPPER_BOUND && score <= alpha {
                        return JsValue::from_f64(alpha as f64);
                    }
                }
            }
        }
        
        // If hash entry doesn't exist or insufficient depth, return NO_ENTRY
        JsValue::from_f64(crate::engine::NO_ENTRY as f64)
    }
    
    /// Get the best move from an entry if it exists
    pub fn get_best_move(&self, hash: i32) -> Option<JsValue> {
        if let Some(entry) = self.table.get(&hash) {
            if entry.hash == hash {
                return entry.best_move.clone();
            }
        }
        None
    }
    
    /// Clears the Transposition Table.
    pub fn clear(&mut self) {
        self.table.clear();
        self.current_age = 0;
        console::debug_1(&JsValue::from_str("[Engine] TT cleared."));
    }
    
    /// Increments the age counter
    pub fn increment_age(&mut self) {
        self.current_age += 1;
    }
    
    // Add methods for getting statistics
    pub fn get_entry_count(&self) -> usize {
        self.table.len()
    }
    
    /// Get the size of the table
    pub fn size(&self) -> usize {
        self.size
    }
}
