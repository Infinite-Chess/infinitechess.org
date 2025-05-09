use wasm_bindgen::prelude::*;
use js_sys::Reflect;
use web_sys::console;
use std::collections::HashMap;

use crate::tt::{self, TTFlag};

// Constants matching the TypeScript implementation
pub const MAX_PLY: i32 = 64;
pub const SEARCH_TIMEOUT_MS: f64 = 10000.0;
const INFINITY: i32 = 32000;
const MATE_VALUE: i32 = INFINITY - 150;
pub const MATE_SCORE: i32 = INFINITY - 300;
pub const NO_ENTRY: i32 = INFINITY - 500;
const TIME_UP: i32 = INFINITY + 500;

// Pruning constants
const NMP_R: i32 = 3;            // Null Move Pruning reduction
const LMR_MIN_DEPTH: i32 = 3;    // Late Move Reduction minimum depth
const LMR_MIN_MOVES: i32 = 3;    // Late Move Reduction minimum moves searched
const LMR_REDUCTION: i32 = 1;    // Late Move Reduction amount

// History heuristic constants
pub const HISTORY_MAX: i32 = 10000;    // Maximum history value to prevent overflow
const HISTORY_BONUS_DEPTH: i32 = 2; // Depth factor for history bonus

// Global static variables using thread_local for WASM compatibility
thread_local! {
    pub static STOP: std::cell::RefCell<bool> = std::cell::RefCell::new(false);
    pub static START_TIME: std::cell::RefCell<f64> = std::cell::RefCell::new(0.0);
    pub static TT_HITS: std::cell::RefCell<i32> = std::cell::RefCell::new(0);
    
    pub static KILLER_MOVES: std::cell::RefCell<Vec<Vec<Option<JsValue>>>> = 
        std::cell::RefCell::new(vec![vec![None; MAX_PLY as usize], vec![None; MAX_PLY as usize]]);
    
    pub static HISTORY_HEURISTIC: std::cell::RefCell<HashMap<String, i32>> =
        std::cell::RefCell::new(HashMap::new());
    
    // New counter-move history table
    pub static COUNTER_MOVES: std::cell::RefCell<HashMap<String, Option<JsValue>>> =
        std::cell::RefCell::new(HashMap::new());
        
    // New continuation history table (simplified version)
    pub static CONTINUATION_HISTORY: std::cell::RefCell<HashMap<String, i32>> =
        std::cell::RefCell::new(HashMap::new());
    
    pub static PV_TABLE: std::cell::RefCell<Vec<Vec<Option<JsValue>>>> =
        std::cell::RefCell::new(vec![vec![None; MAX_PLY as usize]; MAX_PLY as usize]);
    
    pub static PV_LENGTH: std::cell::RefCell<Vec<i32>> =
        std::cell::RefCell::new(vec![0; MAX_PLY as usize]);

     pub static TRANSPOSITION_TABLE: std::cell::RefCell<tt::TranspositionTable> =
        std::cell::RefCell::new(tt::TranspositionTable::new(16));
}

// Search data structure matching TypeScript
pub struct SearchData {
    pub nodes: i32,
    pub ply: i32,
    pub best_move: Option<JsValue>,
    pub score_pv: bool,
    pub follow_pv: bool,
}

/// Check if we should stop the search based on time
fn stop_search() -> bool {
    // First check if STOP is already true
    let already_stopped = STOP.with(|stop| *stop.borrow());
    
    if already_stopped {
        return true;
    }
    
    // Then check if we've exceeded the time limit
    let time_exceeded = START_TIME.with(|start_time| {
        let elapsed_time = js_sys::Date::now() - *start_time.borrow();
        elapsed_time > SEARCH_TIMEOUT_MS
    });
    
    // If time limit exceeded, set STOP to true to ensure all future calls also return true
    if time_exceeded {
        STOP.with(|stop| *stop.borrow_mut() = true);
        console::log_1(&JsValue::from_str("[Engine] Search timeout reached, stopping search"));
        return true;
    }
    
    false
}

/// Main function to find the best move using iterative deepening (exposed to JavaScript)
pub fn find_best_move(game_data: &JsValue) -> JsValue {
    // Reset global state
    STOP.with(|stop| *stop.borrow_mut() = false);
    
    // Initialize START_TIME with current time
    let _start_time = js_sys::Date::now() as f64;
    START_TIME.with(|st| *st.borrow_mut() = _start_time);
    TT_HITS.with(|tt_hits| *tt_hits.borrow_mut() = 0);
    
    // Initialize search data
    let mut search_data = SearchData {
        nodes: 0,
        ply: 0,
        best_move: None,
        follow_pv: true,
        score_pv: false,
    };
    
    // Clear previous search state within TLS scope
    KILLER_MOVES.with(|km| {
        let mut km_borrow = km.borrow_mut();
        for i in 0..MAX_PLY {
            km_borrow[0][i as usize] = None;
            km_borrow[1][i as usize] = None;
        }
    });
    
    // Reset history heuristic within TLS scope
    HISTORY_HEURISTIC.with(|history| {
        let mut history_borrow = history.borrow_mut();
        history_borrow.clear();
    });
    
    // Reset counter moves within TLS scope
    COUNTER_MOVES.with(|counter_moves| {
        let mut cm = counter_moves.borrow_mut();
        cm.clear();
    });
    
    // Reset continuation history within TLS scope
    CONTINUATION_HISTORY.with(|cont_history| {
        let mut ch = cont_history.borrow_mut();
        ch.clear();
    });
    
    // Reset PV table within TLS scope
    PV_TABLE.with(|pv_table| {
        let mut pv_table_borrow = pv_table.borrow_mut();
        for i in 0..MAX_PLY {
            for j in 0..MAX_PLY {
                pv_table_borrow[i as usize][j as usize] = None;
            }
        }
    });
    
    // Reset PV length within TLS scope
    PV_LENGTH.with(|pv_length| {
        let mut pv_length_borrow = pv_length.borrow_mut();
        for i in 0..MAX_PLY {
            pv_length_borrow[i as usize] = 0;
        }
    });
    
    // Set timeout for search
    let _start_time = js_sys::Date::now() as f64;
    
    let mut best_move = None;
    let mut _best_score = 0;
    
    // Iterative deepening
    for depth in 1..=MAX_PLY {
        // Check if we should stop the search before starting a new depth
        if stop_search() {
            break;
        }
        
        // Set PV length to 0 for this iteration
        PV_LENGTH.with(|pv_length| {
            let mut pv_length_borrow = pv_length.borrow_mut();
            pv_length_borrow[0] = 0;
        });
        
        // Allow PV scoring for move ordering
        search_data.follow_pv = true;
        search_data.score_pv = true;

        // Decay history scores - combine operations to reduce TLS lookups
        HISTORY_HEURISTIC.with(|history_table| {
            // Create a new object instead of modifying the HashMap directly
            let js_history = js_sys::Object::new();
            
            // Convert Rust HashMap to JS object in a single pass
            for (key, &value) in history_table.borrow().iter() {
                js_sys::Reflect::set(
                    &js_history,
                    &JsValue::from_str(key),
                    &JsValue::from_f64(value as f64)
                ).unwrap_or_default();
            }
            
            // Call JS function once
            crate::js_bridge::decay_history_scores_js(&js_history);
            
            // Update the HashMap with decayed values from JS
            let mut history_borrow_mut = history_table.borrow_mut();
            for key in history_borrow_mut.keys().cloned().collect::<Vec<String>>() {
                if let Ok(new_value) = js_sys::Reflect::get(&js_history, &JsValue::from_str(&key)) {
                    if let Some(score) = history_borrow_mut.get_mut(&key) {
                        *score = new_value.as_f64().unwrap_or(0.0) as i32;
                    }
                }
            }
        });

        // Run negamax search
        let score = negamax(game_data, depth, -INFINITY, INFINITY, &mut search_data, true);
        
        // Check if search was interrupted due to timeout
        if score == TIME_UP {
            STOP.with(|stop| *stop.borrow_mut() = true);
            break;
        }
        
        // Check if search was stopped
        if STOP.with(|stop| *stop.borrow()) {
            console::log_1(&JsValue::from_str("[Engine] Search stopped due to timeout"));
            break;
        }
        
        // Get best move from PV
        _best_score = score;
        
        // Get the first move from the PV table within TLS scope
        PV_TABLE.with(|pv_table| {
            let pv_table_borrow = pv_table.borrow();
            if let Some(move_js) = &pv_table_borrow[0][0] {
                best_move = Some(move_js.clone());
                search_data.best_move = Some(move_js.clone());
            }
        });
        
        // Output search info
        let pv_line = PV_LENGTH.with(|pv_length| {
            // Get pv_length within a single access
            let pv_length_ref = pv_length.borrow();
            let pv_len = pv_length_ref[0];
            
            // Collect PV moves with a single PV_TABLE access
            let pv_moves = PV_TABLE.with(|pv_table| {
                let pv_table_ref = pv_table.borrow();
                let mut moves = Vec::new();
                for i in 0..pv_len {
                    if let Some(move_js) = &pv_table_ref[0][i as usize] {
                        moves.push((*move_js).clone());
                    }
                }
                moves
            });
            
            if pv_moves.is_empty() {
                "[empty PV]".to_string()
            } else {
                // Map each move to a string representation
                let pv_strings = pv_moves.iter().map(|m| {
                    let mut start_str = "?".to_string();
                    let mut end_str = "?".to_string();
                    
                    if let Ok(start_js) = js_sys::Reflect::get(m, &JsValue::from_str("startCoords")) {
                        if !start_js.is_null() && !start_js.is_undefined() {
                            if start_js.is_string() {
                                start_str = start_js.as_string().unwrap_or_default();
                            } else {
                                // Handle array format
                                let start_array = js_sys::Array::from(&start_js);
                                if start_array.length() >= 2 {
                                    let x = start_array.get(0).as_f64().unwrap_or(0.0) as i32;
                                    let y = start_array.get(1).as_f64().unwrap_or(0.0) as i32;
                                    start_str = format!("{},{}", x, y);
                                }
                            }
                        }
                    }
                    
                    if let Ok(end_js) = js_sys::Reflect::get(m, &JsValue::from_str("endCoords")) {
                        if !end_js.is_null() && !end_js.is_undefined() {
                            if end_js.is_string() {
                                end_str = end_js.as_string().unwrap_or_default();
                            } else {
                                // Handle array format
                                let end_array = js_sys::Array::from(&end_js);
                                if end_array.length() >= 2 {
                                    let x = end_array.get(0).as_f64().unwrap_or(0.0) as i32;
                                    let y = end_array.get(1).as_f64().unwrap_or(0.0) as i32;
                                    end_str = format!("{},{}", x, y);
                                }
                            }
                        }
                    }
                    
                    format!("[{} to {}]", start_str, end_str)
                }).collect::<Vec<String>>();
                
                pv_strings.join(", ")
            }
        });
        
        // Create a log message with all relevant info
        let log_msg = format!("info depth {} nodes {} score cp {} pv {}", 
            depth, search_data.nodes, _best_score, pv_line);
        console::log_1(&JsValue::from_str(&log_msg));
    }

    // increment tt age
    TRANSPOSITION_TABLE.with(|tt| tt.borrow_mut().increment_age());
    
    match best_move {
        Some(m) => m,
        None => {
            // Fallback: If no best move found, just return the first legal move
            let legal_moves = crate::js_bridge::generate_legal_moves_js(game_data, get_player(game_data));
            let legal_moves_arr = js_sys::Array::from(&legal_moves);
            
            if legal_moves_arr.length() > 0 {
                legal_moves_arr.get(0)
            } else {
                JsValue::NULL
            }
        }
    }
}

/// The main negamax search function with alpha-beta pruning
fn negamax(lf: &JsValue, mut depth: i32, mut alpha: i32, mut beta: i32, data: &mut SearchData, null_move: bool) -> i32 {
    let pv_node = beta.wrapping_sub(alpha) > 1;
    let mut best_move: Option<JsValue> = None;
    let mut score: i32;
    let mut hash_flag = tt::TTFlag::LOWER_BOUND;
    let is_root = data.ply == 0;

    // Increment the node counter
    data.nodes += 1;

    // Check if we reached maximum search depth
    if data.ply >= MAX_PLY {
        return crate::evaluation::evaluate_position(lf);
    }

    // Fifty-move rule and threefold repetition would be checked here

    // Initialize PV length for this ply
    PV_LENGTH.with(|pv_length| {
        let mut pv_length_borrow = pv_length.borrow_mut();
        pv_length_borrow[data.ply as usize] = data.ply;
    });

    if !is_root {
        // Mate distance pruning
        if alpha < -MATE_VALUE { 
            alpha = -MATE_VALUE
        }
        if beta > MATE_VALUE - 1{ 
            beta = MATE_VALUE - 1
        }
        if alpha >= beta {
            return alpha;
        }
    }

    // Base case: Depth reached or terminal node
    if depth <= 0 {
        return quiescence_search(lf, alpha, beta, data);
    }

    // Get opponent and check status
    let is_in_check = if let Ok(in_check_js) = Reflect::get(lf, &JsValue::from_str("inCheck")) {
        in_check_js.as_bool().unwrap_or(false)
    } else {
        false
    };

    // Check extension: increase depth if the side to move is in check
    if is_in_check {
        // debug log
        console::log_1(&JsValue::from_str("[Engine] In check, increasing search depth"));
        depth += 1;
    }

    // Generate hash for the current position
    let hash = TRANSPOSITION_TABLE.with(|tt| tt.borrow().generate_hash(lf));

    // Transposition Table Probe
    if !is_root && !pv_node {
        let tt_result = TRANSPOSITION_TABLE.with(|tt| tt.borrow().probe(hash, alpha, beta, depth, data.ply));
        
        // Check if it's a score (number) or a move (object)
        if tt_result.is_object() {
            // It's a move object
            best_move = Some(tt_result);
        } else {
            // It's a score
            score = tt_result.as_f64().unwrap_or(NO_ENTRY as f64) as i32;
            if score != NO_ENTRY {
                // TT hit, return the score from the transposition table
                TT_HITS.with(|hits| {
                    *hits.borrow_mut() += 1;
                });
                return score;
            }
        }
    }

    // Check for timeout
    if data.nodes % 2047 == 0 && stop_search() {
        return TIME_UP; // Return TIME_UP instead of 0 to properly propagate timeout
    }

    // Static evaluation
    let eval_score = crate::evaluation::evaluate_position(lf);

    if !is_in_check && !pv_node {
        // Reverse futility pruning
        if depth < 3 && (beta.abs() < MATE_SCORE) {
            let margin = 120 * depth;
            if eval_score - margin >= beta {
                return eval_score.min(beta);
            }
        }

        // Enhanced futility pruning with dynamic margin
        if depth < 3 && (alpha.abs() < MATE_SCORE) {
            let margin = 120 * depth;
            if eval_score + margin <= alpha {
                // Do quiescence to avoid horizon effect when pruning
                let q_score = quiescence_search(lf, alpha, beta, data);
                if q_score <= alpha {
                    return q_score;
                }
            }
        }

        // Null move pruning
        if null_move && depth >= 3 {
            // Check if player has non-pawn, non-king pieces for simplified zugzwang detection
            let has_major_or_minor_pieces = true; // Simplified check - should use actual boardutil.getPieceCountOfGame

            if has_major_or_minor_pieces {
                data.ply += 1;

                // Make a null move (just switch turn) using our wrapper function
                crate::js_bridge::make_null_move(lf);
                
                // Use R=2 for shallower depths and R=3 for deeper searches
                let r = if depth > 6 { NMP_R } else { 2 };

                let null_score = -negamax(lf, depth - 1 - r, -beta, -beta + 1, data, false);

                // Undo null move
                crate::js_bridge::rewind_move_js(lf);
                data.ply -= 1;

                if STOP.with(|stop| *stop.borrow()) {
                    return TIME_UP;
                }

                if null_score >= beta {
                    // Verification search at reduced depth to avoid zugzwang issues
                    if depth > 6 && null_score >= MATE_SCORE {
                        // This could be a mate, verify with a reduced depth search
                        let verif_score = negamax(lf, depth - 4, alpha, beta, data, false);
                        if verif_score >= beta {
                            return beta;
                        }
                    } else {
                        return beta;
                    }
                }
            }
        }

        // Razoring (Static Futility Pruning)
        let razor_score = eval_score + 100;
        if depth == 1 && razor_score < beta {
            let new_score = quiescence_search(lf, alpha, beta, data);
            if new_score < beta {
                return new_score.max(razor_score);
            }
        }
    }

    if !is_in_check && eval_score >= beta {
        return beta;
    } else if eval_score > alpha {
        alpha = eval_score;
    }

    if data.ply >= MAX_PLY {
        return eval_score;
    }

    // Debug the number of legal moves available
    let legal_moves_js = crate::js_bridge::generate_legal_moves_js(lf, get_player(lf));
    let legal_moves_arr = js_sys::Array::from(&legal_moves_js);

    // If no legal moves, return checkmate or stalemate score
    if legal_moves_arr.length() == 0 {
        if is_in_check {
            // Checkmate: return score based on ply depth for mate-in-N
            return -MATE_VALUE + data.ply;
        } else {
            // Stalemate: return draw score
            return 0;
        }
    }

    // Order moves for better pruning
    let ordered_moves = crate::js_bridge::order_moves_js(&legal_moves_arr, lf, data, &best_move.clone().unwrap_or(JsValue::NULL));

    // Initialize variables for move search
    let mut best_score = -INFINITY;
    let mut skip_quiet = false;
    let mut moves_searched = 0;
    let mut prev_quiet_moves = Vec::new();

    // Search loop (PVS)
    for i in 0..ordered_moves.length() {
        let current_move = ordered_moves.get(i);

        // Skip invalid moves
        if current_move.is_null() || current_move.is_undefined() {
            continue;
        }

        // Generate full move information
        let full_move = crate::js_bridge::generate_move(lf, &current_move);
        if full_move.is_null() || full_move.is_undefined() {
            continue;
        }

        let is_quiet = !is_capture(&full_move);
        if is_quiet && skip_quiet {
            continue;
        }

        let is_killer = KILLER_MOVES.with(|killer_moves| {
            let km = killer_moves.borrow();
            if data.ply < MAX_PLY {
                // Check first killer move
                if let Some(km1) = &km[0][data.ply as usize] {
                    if let (Ok(start1), Ok(end1), Ok(start2), Ok(end2)) = (
                        js_sys::Reflect::get(km1, &JsValue::from_str("startCoords")),
                        js_sys::Reflect::get(km1, &JsValue::from_str("endCoords")),
                        js_sys::Reflect::get(&current_move, &JsValue::from_str("startCoords")),
                        js_sys::Reflect::get(&current_move, &JsValue::from_str("endCoords"))
                    ) {
                        if start1.as_string() == start2.as_string() && end1.as_string() == end2.as_string() {
                            return true;
                        }
                    }
                }

                // Check second killer move
                if let Some(km2) = &km[1][data.ply as usize] {
                    if let (Ok(start1), Ok(end1), Ok(start2), Ok(end2)) = (
                        js_sys::Reflect::get(km2, &JsValue::from_str("startCoords")),
                        js_sys::Reflect::get(km2, &JsValue::from_str("endCoords")),
                        js_sys::Reflect::get(&current_move, &JsValue::from_str("startCoords")),
                        js_sys::Reflect::get(&current_move, &JsValue::from_str("endCoords"))
                    ) {
                        if start1.as_string() == start2.as_string() && end1.as_string() == end2.as_string() {
                            return true;
                        }
                    }
                }
            }
            false
        });

        if !is_root && best_score > -INFINITY {
            // Improved late move pruning with dynamic depth adjustment
            if depth < 8 && is_quiet && !is_killer && alpha + 97 * depth <= beta && (alpha.abs() < INFINITY - 100) {
                // More aggressive pruning for deeper nodes
                if moves_searched > (4 + depth * 2) {
                    skip_quiet = true;
                    continue;
                }
            }
        }

        // Store quiet move for history updating
        if is_quiet {
            prev_quiet_moves.push(full_move.clone());
        }

        // Make the move - directly modifies lf in place
        crate::js_bridge::make_move_js(lf, &full_move);
        data.ply += 1;

        // PVS Search
        if moves_searched == 0 {
            score = -negamax(lf, depth - 1, -beta, -alpha, data, true);
        } else {
            // Late Move Reduction - search with reduced depth first
            // Enhanced LMR with more dynamic reduction
            let do_lmr = moves_searched >= LMR_MIN_MOVES && 
                          depth >= LMR_MIN_DEPTH && 
                          !is_in_check && 
                          is_quiet && 
                          !is_promotion(&full_move);
                    
            // Calculate reduction based on move number and depth
            let r = if do_lmr {
                // Base reduction
                let base_r = LMR_REDUCTION;
                
                // Additional reduction for later moves
                let move_r = (moves_searched as f32).ln().floor() as i32 / 2;
                
                // Clamp total reduction
                (base_r + move_r).min(depth - 1)
            } else {
                0
            };
            
            // More granular handling of reductions
            if r > 0 {
                score = -negamax(lf, depth - 1 - r, -alpha - 1, -alpha, data, true);
            } else {
                score = alpha + 1; // Force a full search
            }

            // If the reduced search exceeded alpha, do a normal search
            if r > 0 && score > alpha {
                // Null window search first
                score = -negamax(lf, depth - 1, -alpha - 1, -alpha, data, true);
            }
            
            // If good move found but didn't exceed beta, do a full-window search (only for PV nodes)
            if score > alpha && score < beta && pv_node {
                score = -negamax(lf, depth - 1, -beta, -alpha, data, true);
            }
        }

        // Undo the move - directly modifies lf in place
        crate::js_bridge::rewind_move_js(lf);
        data.ply -= 1;

        if STOP.with(|stop| *stop.borrow()) {
            return TIME_UP;
        }

        moves_searched += 1;

        if score > best_score {
            best_score = score;
        }

        // If score exceeds alpha, update alpha and best move
        if score > alpha {
            hash_flag = tt::TTFlag::EXACT;
            best_move = Some(full_move.clone());
            best_score = score;
            alpha = score;
            
            // Get move key for counters and continuation history
            let move_key = crate::evaluation::get_move_key(&full_move);

            if is_quiet {
                // Update history score table for quiet moves that cause alpha cutoffs
                HISTORY_HEURISTIC.with(|history| {
                    let mut history_borrow = history.borrow_mut();
                    let score = history_borrow.entry(move_key.clone()).or_insert(0);
                    // Depth^2 bonus is better than linear depth
                    *score += depth * depth * HISTORY_BONUS_DEPTH;
                    // Prevent overflows
                    *score = (*score).min(HISTORY_MAX);
                });
                
                // Update counter moves table
                if data.ply > 0 {
                    // Get previous move key
                    let prev_move = PV_TABLE.with(|pv_table| {
                        let pv_table_borrow = pv_table.borrow();
                        if let Some(prev_move) = &pv_table_borrow[0][data.ply as usize - 1] {
                            Some(crate::evaluation::get_move_key(prev_move))
                        } else {
                            None
                        }
                    });
                    
                    if let Some(prev_key) = prev_move {
                        // Store this move as a counter to the previous move
                        COUNTER_MOVES.with(|counter_moves| {
                            let mut cm = counter_moves.borrow_mut();
                            cm.insert(prev_key.clone(), Some(full_move.clone()));
                        });
                        
                        // Update continuation history
                        let cont_key = format!("{}-{}", prev_key, move_key);
                        CONTINUATION_HISTORY.with(|cont_history| {
                            let mut ch = cont_history.borrow_mut();
                            let score = ch.entry(cont_key).or_insert(0);
                            *score += depth * depth;
                            *score = (*score).min(HISTORY_MAX);
                        });
                    }
                }
            }

            // Update PV table - store this move as first in the PV
            PV_TABLE.with(|pv_table| {
                let mut pv_table_borrow = pv_table.borrow_mut();
                pv_table_borrow[data.ply as usize][data.ply as usize] = Some(full_move.clone());

                // Copy moves from deeper ply's PV table to this ply's PV table
                if data.ply + 1 < MAX_PLY {
                    for next_ply in (data.ply + 1)..MAX_PLY {
                        if let Some(next_move) = &pv_table_borrow[(data.ply + 1) as usize][next_ply as usize] {
                            pv_table_borrow[data.ply as usize][next_ply as usize] = Some(next_move.clone());
                        } else {
                            break;
                        }
                    }
                }
            });

            // Update PV length
            PV_LENGTH.with(|pv_length| {
                let mut pv_length_borrow = pv_length.borrow_mut();
                if data.ply + 1 < MAX_PLY {
                    pv_length_borrow[data.ply as usize] = pv_length_borrow[(data.ply + 1) as usize];
                }
            });

            // If score exceeds beta, we can prune (beta cutoff)
            if score >= beta {
                // Store hash entry for beta cutoff
                TRANSPOSITION_TABLE.with(|tt| tt.borrow_mut().store(hash, depth, tt::TTFlag::UPPER_BOUND, beta, best_move.clone(), data.ply));

                if is_quiet {
                    // Store killer moves
                    KILLER_MOVES.with(|killer_moves| {
                        let mut killer_moves_borrow = killer_moves.borrow_mut();
                        killer_moves_borrow[1][data.ply as usize] = killer_moves_borrow[0][data.ply as usize].clone();
                        killer_moves_borrow[0][data.ply as usize] = Some(full_move.clone());
                    });
                    
                    // Update history scores with depth^2 bonus for quiet beta cutoffs
                    let bonus = depth * depth * HISTORY_BONUS_DEPTH;
                    let key = move_key.clone();
                    
                    HISTORY_HEURISTIC.with(|history| {
                        let mut history_borrow = history.borrow_mut();
                        let score = history_borrow.entry(key).or_insert(0);
                        *score += bonus;
                        *score = (*score).min(HISTORY_MAX);
                    });
                    
                    // Penalize other quiet moves that were tried before this one
                    // This helps converge on the best move ordering more quickly
                    for prev_move in &prev_quiet_moves {
                        let prev_key = crate::evaluation::get_move_key(prev_move);
                        if prev_key != move_key {
                            HISTORY_HEURISTIC.with(|history| {
                                let mut history_borrow = history.borrow_mut();
                                if let Some(score) = history_borrow.get_mut(&prev_key) {
                                    *score -= bonus / 2; // Penalty is half the bonus
                                    *score = (*score).max(0); // Don't go negative
                                }
                            });
                        }
                    }
                }

                return beta; // Beta cutoff
            }
        }
    }

    // Store the position in the transposition table with appropriate flag and best move
    TRANSPOSITION_TABLE.with(|tt| tt.borrow_mut().store(hash, depth, hash_flag, alpha, best_move, data.ply));

    return alpha; // Return the best score found
}

/// Quiescence search to avoid the horizon effect
fn quiescence_search(lf: &JsValue, mut alpha: i32, beta: i32, data: &mut SearchData) -> i32 {
    data.nodes += 1;

    // Get static evaluation
    let eval_score = crate::evaluation::evaluate_position(lf);

    // Stand-pat: If static evaluation exceeds beta, return beta
    if eval_score >= beta {
        return beta;
    } else if eval_score > alpha {
        alpha = eval_score;
    }

    if data.ply >= MAX_PLY {
        return eval_score;
    }

    // Timeout check
    if data.nodes % 2047 == 0 && stop_search() {
        return TIME_UP;
    }

    // Generate all moves
    let all_moves_js = crate::js_bridge::generate_legal_moves_js(lf, get_player(lf));

    // Filter and get only capture moves
    let capture_moves_js = crate::js_bridge::filter_capture_moves_js(&all_moves_js, lf);
    let captures_arr = js_sys::Array::from(&capture_moves_js);

    // Check if we have any captures to analyze
    if captures_arr.length() == 0 {
        // No captures to search, just return the static evaluation
        return eval_score;
    }

    // Order captured moves by score
    let ordered_captures = crate::js_bridge::order_moves_js(&captures_arr, lf, data, &JsValue::NULL);
    let ordered_captures_arr = js_sys::Array::from(&ordered_captures);

    // Early return if ordering somehow resulted in empty array
    if ordered_captures_arr.length() == 0 {
        return eval_score;
    }

    // Explore capture moves
    for i in 0..ordered_captures_arr.length() {
        let move_js = ordered_captures_arr.get(i);

        // Skip invalid moves
        if move_js.is_null() || move_js.is_undefined() {
            continue;
        }

        // Generate full move information
        let full_move = crate::js_bridge::generate_move(lf, &move_js);
        if full_move.is_null() || full_move.is_undefined() {
            continue;
        }

        // Make the move - directly modifies lf in place
        crate::js_bridge::make_move_js(lf, &full_move);
        data.ply += 1;

        let score = -quiescence_search(lf, -beta, -alpha, data);
        data.ply -= 1;

        // Undo the move - directly modifies lf in place
        crate::js_bridge::rewind_move_js(lf);

        if STOP.with(|stop| *stop.borrow()) {
            return TIME_UP;
        }

        if score > alpha {
            alpha = score;
            if score >= beta {
                return beta;
            }
        }
    }

    return alpha;
}

// Helper functions

/// Get the player (turn) from a game object
fn get_player(game: &JsValue) -> i32 {
    if let Ok(turn_js) = Reflect::get(game, &JsValue::from_str("whosTurn")) {
        return turn_js.as_f64().unwrap_or(1.0) as i32;
    }
    1 // Default to player 1
}

/// Set the player (turn) in a game object
fn set_player(game: &JsValue, player: i32) {
    let _ = Reflect::set(game, &JsValue::from_str("whosTurn"), &JsValue::from_f64(player as f64));
}

/// Check if a move is a capture
fn is_capture(move_js: &JsValue) -> bool {
    if let Ok(flags) = Reflect::get(move_js, &JsValue::from_str("flags")) {
        if let Ok(capture) = Reflect::get(&flags, &JsValue::from_str("capture")) {
            return capture.is_truthy();
        }
    }
    false
}

/// Check if a move is a promotion
fn is_promotion(move_js: &JsValue) -> bool {
    if let Ok(promotion) = Reflect::get(move_js, &JsValue::from_str("promotion")) {
        return !promotion.is_null() && !promotion.is_undefined();
    }
    false
}

/// Get a value from a JavaScript object
fn get_value_from_js(obj: &JsValue, key: &str, index: usize) -> f64 {
    if let Ok(value) = Reflect::get(obj, &JsValue::from_str(key)) {
        if value.is_array() {
            let array = js_sys::Array::from(&value);
            if index < array.length() as usize {
                return array.get(index as u32).as_f64().unwrap_or(0.0);
            }
        }
    }
    0.0
}
