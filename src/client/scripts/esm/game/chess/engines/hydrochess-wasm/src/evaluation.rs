use wasm_bindgen::prelude::*;
use js_sys::Reflect;
use std::collections::HashMap;
use web_sys::console;
use crate::engine::SearchData;
use crate::js_bridge;

// Constants for piece values from the original JS code
pub const PIECE_VALUES: [i32; 6] = [100, 300, 450, 700, 1200, 20000]; // PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING

const DEVELOPMENT_BONUS: i32 = 6;
const CENTRALITY_BONUS: i32 = 5;
const BACK_RANK_BONUS: i32 = 25;

// Distance bonuses for different pieces
const QUEEN_KNIGHT_PROXIMITY_BONUS: i32 = 30; // Max bonus for queens/knights being close to opponent king

// Pawn advancement bonuses
const PAWN_RANK_BONUS: i32 = 10; // Points per rank advanced
const PASSED_PAWN_RANK_BONUS: i32 = 25; // Points per rank for passed pawns

// King safety bonus
const PAWN_SHIELD_BONUS: i32 = 20; // Points per pawn adjacent to king

// MVV-LVA table - Most Valuable Victim - Least Valuable Aggressor
// The first dimension represents the attacker, the second the captured piece
pub const MVV_LVA: [[i32; 6]; 6] = [
    [105, 205, 305, 405, 505, 605], // Pawn captures
    [104, 204, 304, 404, 504, 604], // Knight captures
    [103, 203, 303, 403, 503, 603], // Bishop captures
    [102, 202, 302, 402, 502, 602], // Rook captures
    [101, 201, 301, 401, 501, 601], // Queen captures
    [100, 200, 300, 400, 500, 600], // King captures
];

// Raw type to index mapping for MVV-LVA table
pub const RAW_TO_INDEX: [usize; 6] = [0, 1, 2, 3, 4, 5]; // PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING

// Raw type constants as provided
const NUM_TYPES: i32 = 22;
const RAW_TYPE_VOID: i32 = 0;
const RAW_TYPE_OBSTACLE: i32 = 1;
const RAW_TYPE_KING: i32 = 2;
const RAW_TYPE_GIRAFFE: i32 = 3;
const RAW_TYPE_CAMEL: i32 = 4;
const RAW_TYPE_ZEBRA: i32 = 5;
const RAW_TYPE_KNIGHTRIDER: i32 = 6;
const RAW_TYPE_AMAZON: i32 = 7;
const RAW_TYPE_QUEEN: i32 = 8;
const RAW_TYPE_ROYALQUEEN: i32 = 9;
const RAW_TYPE_HAWK: i32 = 10;
const RAW_TYPE_CHANCELLOR: i32 = 11;
const RAW_TYPE_ARCHBISHOP: i32 = 12;
const RAW_TYPE_CENTAUR: i32 = 13;
const RAW_TYPE_ROYALCENTAUR: i32 = 14;
const RAW_TYPE_ROSE: i32 = 15;
const RAW_TYPE_KNIGHT: i32 = 16;
const RAW_TYPE_GUARD: i32 = 17;
const RAW_TYPE_HUYGEN: i32 = 18;
const RAW_TYPE_ROOK: i32 = 19;
const RAW_TYPE_BISHOP: i32 = 20;
const RAW_TYPE_PAWN: i32 = 21;

// Piece values for evaluation
const PAWN_VALUE: i32 = 100;
const KNIGHT_VALUE: i32 = 300;
const BISHOP_VALUE: i32 = 450;
const ROOK_VALUE: i32 = 650;
const QUEEN_VALUE: i32 = 1400;
const KING_VALUE: i32 = 20000;

// Players constants for easier code readability
const WHITE: i32 = 1;
const BLACK: i32 = 2;

/// Get raw type from a piece type by doing a modulo with NUM_TYPES
pub fn get_raw_type(piece_type: i32) -> i32 {
    piece_type.rem_euclid(NUM_TYPES)
}

/// Get a history key for move ordering
pub fn get_history_key(piece_type: i32, end_coords: &JsValue) -> String {
    let x = Reflect::get(end_coords, &JsValue::from_str("x"))
        .map(|v| v.as_f64().unwrap_or(0.0) as i32)
        .unwrap_or(0);
        
    let y = Reflect::get(end_coords, &JsValue::from_str("y"))
        .map(|v| v.as_f64().unwrap_or(0.0) as i32)
        .unwrap_or(0);
        
    format!("{:?}_{:?}_{:?}", piece_type, x, y)
}

/// Check if two moves are equal (copied from helpers to avoid circular dependencies)
pub fn moves_are_equal(mov1: &JsValue, mov2: &JsValue) -> bool {
    if mov1.is_null() || mov2.is_null() || mov1.is_undefined() || mov2.is_undefined() {
        return false;
    }
    
    // Get start and end coordinates
    let start1 = Reflect::get(mov1, &JsValue::from_str("startCoords")).unwrap_or(JsValue::UNDEFINED);
    let end1 = Reflect::get(mov1, &JsValue::from_str("endCoords")).unwrap_or(JsValue::UNDEFINED);
    let start2 = Reflect::get(mov2, &JsValue::from_str("startCoords")).unwrap_or(JsValue::UNDEFINED);
    let end2 = Reflect::get(mov2, &JsValue::from_str("endCoords")).unwrap_or(JsValue::UNDEFINED);
    
    if start1.is_undefined() || end1.is_undefined() || start2.is_undefined() || end2.is_undefined() {
        return false;
    }
    
    // Extract x and y from coords
    let start1_x = Reflect::get(&start1, &JsValue::from_str("x"))
        .unwrap_or(JsValue::UNDEFINED);
    let start1_y = Reflect::get(&start1, &JsValue::from_str("y"))
        .unwrap_or(JsValue::UNDEFINED);
    let end1_x = Reflect::get(&end1, &JsValue::from_str("x"))
        .unwrap_or(JsValue::UNDEFINED);
    let end1_y = Reflect::get(&end1, &JsValue::from_str("y"))
        .unwrap_or(JsValue::UNDEFINED);
    
    let start2_x = Reflect::get(&start2, &JsValue::from_str("x"))
        .unwrap_or(JsValue::UNDEFINED);
    let start2_y = Reflect::get(&start2, &JsValue::from_str("y"))
        .unwrap_or(JsValue::UNDEFINED);
    let end2_x = Reflect::get(&end2, &JsValue::from_str("x"))
        .unwrap_or(JsValue::UNDEFINED);
    let end2_y = Reflect::get(&end2, &JsValue::from_str("y"))
        .unwrap_or(JsValue::UNDEFINED);
    
    // Check coords equality
    if start1_x.is_undefined() || start1_y.is_undefined() || end1_x.is_undefined() || end1_y.is_undefined() ||
       start2_x.is_undefined() || start2_y.is_undefined() || end2_x.is_undefined() || end2_y.is_undefined() {
        return false;
    }
    
    let s1x = start1_x.as_f64().unwrap_or(-1.0);
    let s1y = start1_y.as_f64().unwrap_or(-1.0);
    let e1x = end1_x.as_f64().unwrap_or(-1.0);
    let e1y = end1_y.as_f64().unwrap_or(-1.0);
    
    let s2x = start2_x.as_f64().unwrap_or(-2.0);
    let s2y = start2_y.as_f64().unwrap_or(-2.0);
    let e2x = end2_x.as_f64().unwrap_or(-2.0);
    let e2y = end2_y.as_f64().unwrap_or(-2.0);
    
    // Promotion checking
    let promo1 = Reflect::get(mov1, &JsValue::from_str("promotion")).unwrap_or(JsValue::UNDEFINED);
    let promo2 = Reflect::get(mov2, &JsValue::from_str("promotion")).unwrap_or(JsValue::UNDEFINED);
    
    let promo_equal = if !promo1.is_undefined() && !promo2.is_undefined() {
        // If both have promotion, check if they're the same
        promo1.as_f64().unwrap_or(-1.0) == promo2.as_f64().unwrap_or(-2.0)
    } else {
        // If one has promotion and the other doesn't, they're not equal
        promo1.is_undefined() == promo2.is_undefined()
    };
    
    // Return true if all coordinates match and promotion status matches
    s1x == s2x && s1y == s2y && e1x == e2x && e1y == e2y && promo_equal
}

/// Score a move for move ordering
pub fn score_move(move_js: &JsValue, game: &JsValue, data: &mut SearchData, tt_best_move: &JsValue) -> i32 {
    // PV move gets highest priority
    let mut pv_score = 0;
    if data.ply == 0 && data.score_pv {
        // Access PV_TABLE to check if the current move matches
        crate::engine::PV_TABLE.with(|pv_table| {
            let pv_table_borrow = pv_table.borrow();
            if let Some(pv_move) = &pv_table_borrow[0][data.ply as usize] {
                if moves_are_equal(move_js, pv_move) {
                    // Set score_pv to false to only score the first PV move
                    data.score_pv = false;
                    pv_score = 20000; // highest priority
                }
            }
        });
    }
    
    if pv_score > 0 {
        return pv_score;
    }
    
    // TT best move gets second priority
    if moves_are_equal(move_js, tt_best_move) {
        return 16000;
    }
    
    let mut score = 0;
    
    // Extract move information
    let start_coords = Reflect::get(move_js, &JsValue::from_str("startCoords")).unwrap_or(JsValue::NULL);
    let end_coords = Reflect::get(move_js, &JsValue::from_str("endCoords")).unwrap_or(JsValue::NULL);
    let promotion = Reflect::get(move_js, &JsValue::from_str("promotion")).unwrap_or(JsValue::NULL);
    let en_passant = Reflect::get(move_js, &JsValue::from_str("enpassant")).unwrap_or(JsValue::from_bool(false));
    
    // Get piece information using js_bridge helpers
    let pieces = Reflect::get(game, &JsValue::from_str("pieces")).unwrap_or(JsValue::NULL);
    let moved_piece = js_bridge::get_type_from_coords_js(&pieces, &start_coords);
    let captured_piece = js_bridge::get_type_from_coords_js(&pieces, &end_coords);
    
    // Check for captures or en passant
    if en_passant.is_truthy() || (!captured_piece.is_undefined() && !captured_piece.is_null()) {
        score += 8000; // Base score for captures
        
        if en_passant.is_truthy() {
            // Handle en passant capture (capturing a pawn)
            let moved_piece_num = moved_piece.as_f64().unwrap_or(0.0) as i32;
            let moved_raw_type = get_raw_type(moved_piece_num);
            
            // Simplified MVV-LVA calculation for en passant
            score += 1000 - (moved_raw_type % 22); // Lower piece type is better attacker
            return score;
        } else if !captured_piece.is_undefined() && !captured_piece.is_null() {
            // Handle normal capture
            let moved_piece_num = moved_piece.as_f64().unwrap_or(0.0) as i32;
            let captured_piece_num = captured_piece.as_f64().unwrap_or(0.0) as i32;
            
            let moved_raw_type = get_raw_type(moved_piece_num);
            let captured_raw_type = get_raw_type(captured_piece_num);
            
            // MVV-LVA (Most Valuable Victim - Least Valuable Aggressor)
            // Higher victim value, lower attacker value => better score
            match captured_raw_type {
                RAW_TYPE_QUEEN | RAW_TYPE_ROYALQUEEN | RAW_TYPE_AMAZON => score += 5000,
                RAW_TYPE_ROOK | RAW_TYPE_CHANCELLOR => score += 4000,
                RAW_TYPE_BISHOP | RAW_TYPE_ARCHBISHOP => score += 3000,
                RAW_TYPE_KNIGHT | RAW_TYPE_KNIGHTRIDER => score += 2000,
                RAW_TYPE_PAWN => score += 1000,
                _ => score += 500 // Other piece types
            }
            
            // Attacker value (lower is better for same victim)
            score -= moved_raw_type * 10;
            
            // Add promotion bonus if applicable
            if !promotion.is_null() && !promotion.is_undefined() {
                let promotion_num = promotion.as_f64().unwrap_or(0.0) as i32;
                let promotion_raw_type = get_raw_type(promotion_num);
                
                match promotion_raw_type {
                    RAW_TYPE_QUEEN | RAW_TYPE_ROYALQUEEN | RAW_TYPE_AMAZON => score += 4000,
                    RAW_TYPE_ROOK | RAW_TYPE_CHANCELLOR => score += 3000,
                    RAW_TYPE_BISHOP | RAW_TYPE_ARCHBISHOP => score += 2000,
                    RAW_TYPE_KNIGHT | RAW_TYPE_KNIGHTRIDER => score += 1000,
                    _ => {}
                }
            }
            
            return score;
        }
    } else {
        // Check for killer moves directly from KILLER_MOVES
        crate::engine::KILLER_MOVES.with(|killer_moves| {
            let km = killer_moves.borrow();
            if data.ply < crate::engine::MAX_PLY {
                // Check first killer move
                if let Some(km1) = &km[0][data.ply as usize] {
                    if moves_are_equal(move_js, km1) {
                        score += 4000;
                    }
                }
                
                // Check second killer move
                if let Some(km2) = &km[1][data.ply as usize] {
                    if moves_are_equal(move_js, km2) {
                        score += 2500;
                    }
                }
            }
        });
        
        // Check counter moves if we have a previous move
        if data.ply > 0 {
            // Get previous move from PV table
            let prev_move_key = crate::engine::PV_TABLE.with(|pv_table| {
                let pv_table_borrow = pv_table.borrow();
                if let Some(prev_move) = &pv_table_borrow[0][data.ply as usize - 1] {
                    // Create a key from previous move
                    if let (Ok(_start), Ok(_end)) = (
                        js_sys::Reflect::get(prev_move, &JsValue::from_str("startCoords")),
                        js_sys::Reflect::get(prev_move, &JsValue::from_str("endCoords"))
                    ) {
                        Some(get_move_key(prev_move))
                    } else {
                        None
                    }
                } else {
                    None
                }
            });
            
            // Check if this move is a counter move to previous move
            if let Some(ref key) = prev_move_key {
                crate::engine::COUNTER_MOVES.with(|counter_moves| {
                    let counter_moves_borrow = counter_moves.borrow();
                    if let Some(Some(counter_move)) = counter_moves_borrow.get(key) {
                        if moves_are_equal(move_js, counter_move) {
                            score += 3500; // Between killer1 and killer2 priority
                        }
                    }
                });
            }
            
            // Add continuation history bonus
            if let Some(ref key) = prev_move_key {
                let move_key = format!("{}-{}", key, get_move_key(move_js));
                crate::engine::CONTINUATION_HISTORY.with(|cont_history| {
                    let cont_history_borrow = cont_history.borrow();
                    if let Some(&bonus) = cont_history_borrow.get(&move_key) {
                        score += bonus / 32; // Scale down the bonus
                    }
                });
            }
        }
    }
    
    // Add promotion bonus for quiet promotions
    if !promotion.is_null() && !promotion.is_undefined() {
        let promotion_num = promotion.as_f64().unwrap_or(0.0) as i32;
        let promotion_raw_type = get_raw_type(promotion_num);
        
        score += 9000; // Base promotion score
        
        // Bonus based on promoted piece
        match promotion_raw_type {
            RAW_TYPE_QUEEN | RAW_TYPE_ROYALQUEEN | RAW_TYPE_AMAZON => score += 4000,
            RAW_TYPE_ROOK | RAW_TYPE_CHANCELLOR => score += 3000,
            RAW_TYPE_BISHOP | RAW_TYPE_ARCHBISHOP => score += 2000,
            RAW_TYPE_KNIGHT | RAW_TYPE_KNIGHTRIDER => score += 1000,
            _ => {}
        }
        
        return score;
    }
    
    // Add standard history heuristic bonus for quiet moves
    if !en_passant.is_truthy() && (captured_piece.is_undefined() || captured_piece.is_null()) {
        // Get coordinates as string
        let start_x = Reflect::get(&start_coords, &JsValue::from_str("x"))
            .map(|v| v.as_f64().unwrap_or(0.0) as i32)
            .unwrap_or(0);
        let start_y = Reflect::get(&start_coords, &JsValue::from_str("y"))
            .map(|v| v.as_f64().unwrap_or(0.0) as i32)
            .unwrap_or(0);
        let end_x = Reflect::get(&end_coords, &JsValue::from_str("x"))
            .map(|v| v.as_f64().unwrap_or(0.0) as i32)
            .unwrap_or(0);
        let end_y = Reflect::get(&end_coords, &JsValue::from_str("y"))
            .map(|v| v.as_f64().unwrap_or(0.0) as i32)
            .unwrap_or(0);
            
        let key = format!("{},{}-{},{}", start_x, start_y, end_x, end_y);
        
        crate::engine::HISTORY_HEURISTIC.with(|history| {
            let history_borrow = history.borrow();
            if let Some(&hist_score) = history_borrow.get(&key) {
                // Scale the history score logarithmically to prevent over-prioritization
                let scale_factor = crate::engine::HISTORY_MAX;
                let normalized_score = 1500 * hist_score / scale_factor;
                score += normalized_score;
            }
        });
    }
    
    score
}

/// Helper function to get a short key for a move
pub fn get_move_key(move_js: &JsValue) -> String {
    let start_coords = Reflect::get(move_js, &JsValue::from_str("startCoords")).unwrap_or(JsValue::NULL);
    let end_coords = Reflect::get(move_js, &JsValue::from_str("endCoords")).unwrap_or(JsValue::NULL);
    
    let start_x = Reflect::get(&start_coords, &JsValue::from_str("x"))
        .map(|v| v.as_f64().unwrap_or(0.0) as i32)
        .unwrap_or(0);
    let start_y = Reflect::get(&start_coords, &JsValue::from_str("y"))
        .map(|v| v.as_f64().unwrap_or(0.0) as i32)
        .unwrap_or(0);
    let end_x = Reflect::get(&end_coords, &JsValue::from_str("x"))
        .map(|v| v.as_f64().unwrap_or(0.0) as i32)
        .unwrap_or(0);
    let end_y = Reflect::get(&end_coords, &JsValue::from_str("y"))
        .map(|v| v.as_f64().unwrap_or(0.0) as i32)
        .unwrap_or(0);
        
    format!("{},{}-{},{}", start_x, start_y, end_x, end_y)
}

/// Helper function to get coordinates from a move
pub fn get_coords_from_move(move_js: &JsValue) -> Option<([i32; 2], [i32; 2])> {
    let start_coords = js_sys::Reflect::get(move_js, &JsValue::from_str("startCoords")).ok()?;
    let end_coords = js_sys::Reflect::get(move_js, &JsValue::from_str("endCoords")).ok()?;
    
    if start_coords.is_null() || end_coords.is_null() {
        return None;
    }
    
    let start_x = js_sys::Reflect::get(&start_coords, &JsValue::from_str("x"))
        .ok()?
        .as_f64()?
        .round() as i32;
    let start_y = js_sys::Reflect::get(&start_coords, &JsValue::from_str("y"))
        .ok()?
        .as_f64()?
        .round() as i32;
    let end_x = js_sys::Reflect::get(&end_coords, &JsValue::from_str("x"))
        .ok()?
        .as_f64()?
        .round() as i32;
    let end_y = js_sys::Reflect::get(&end_coords, &JsValue::from_str("y"))
        .ok()?
        .as_f64()?
        .round() as i32;
    
    Some(([start_x, start_y], [end_x, end_y]))
}

/// Rust implementation of position evaluation - highly optimized for infinite chess
pub fn evaluate_position(game: &JsValue) -> i32 {
    // Get piece and turn data directly from JS with minimal calls
    let pieces = Reflect::get(game, &JsValue::from_str("pieces")).unwrap_or(JsValue::NULL);
    let whos_turn = Reflect::get(game, &JsValue::from_str("whosTurn")).unwrap_or(JsValue::from_f64(1.0));
    
    // Get all piece coordinates
    let all_piece_coords = crate::js_bridge::get_coords_of_all_pieces(game);
    let pieces_array = js_sys::Array::from(&all_piece_coords);
    let pieces_array_length = pieces_array.length();
    
    // Use raw Vec instead of HashMap for better performance when we just need to iterate
    let mut white_pawn_coords = Vec::with_capacity(32);
    let mut black_pawn_coords = Vec::with_capacity(32);
    let mut white_knight_coords = Vec::with_capacity(32);
    let mut black_knight_coords = Vec::with_capacity(32);
    let mut white_bishop_coords = Vec::with_capacity(32);
    let mut black_bishop_coords = Vec::with_capacity(32);
    let mut white_rook_coords = Vec::with_capacity(32);
    let mut black_rook_coords = Vec::with_capacity(32);
    let mut white_queen_coords = Vec::with_capacity(32);
    let mut black_queen_coords = Vec::with_capacity(32);
    let mut white_king_coords = None;
    let mut black_king_coords = None;
    
    // Fast access for piece evaluations by type - using an array large enough for all piece types (NUM_TYPES = 22)
    // This way we can index directly with the raw type value
    let mut white_pieces_by_type = vec![Vec::with_capacity(8); NUM_TYPES as usize];
    let mut black_pieces_by_type = vec![Vec::with_capacity(8); NUM_TYPES as usize];
    
    // Cache king positions for faster access
    let mut material_balance = 0;
    
    // Define this here instead of inside the loop for better performance
    #[inline(always)]
    fn squared_distance(x1: i32, y1: i32, x2: i32, y2: i32) -> i32 {
        let dx = x1 - x2;
        let dy = y1 - y2;
        dx*dx + dy*dy
    }
    
    // Pre-allocated arrays for piece extraction to minimize heap allocations in the loop
    let mut piece_coords = [0i32; 2];
    
    // Pre-compute piece value lookup table - much faster than match statements in a hot loop
    let mut piece_value_lookup = [0i32; NUM_TYPES as usize];
    piece_value_lookup[RAW_TYPE_PAWN as usize] = PAWN_VALUE;
    piece_value_lookup[RAW_TYPE_KNIGHT as usize] = KNIGHT_VALUE;
    piece_value_lookup[RAW_TYPE_BISHOP as usize] = BISHOP_VALUE;
    piece_value_lookup[RAW_TYPE_ROOK as usize] = ROOK_VALUE;
    piece_value_lookup[RAW_TYPE_QUEEN as usize] = QUEEN_VALUE;
    piece_value_lookup[RAW_TYPE_KING as usize] = KING_VALUE;
    
    // First pass: Find kings and classify pieces by type and color
    for i in 0..pieces_array_length {
        let coords_js = pieces_array.get(i);
        if let Some(coords) = crate::js_bridge::js_to_coords(&coords_js) {
            piece_coords = coords; // Store in local variable to avoid repeated dereferencing
            
            let piece_type_js = crate::js_bridge::get_type_from_coords_js(&pieces, &coords_js);
            
            // Check if we got a valid piece type
            if piece_type_js.is_undefined() || piece_type_js.is_null() {
                continue;
            }
            
            // Try to convert to a number safely
            let piece_type = match piece_type_js.as_f64() {
                Some(val) => val as i32,
                None => {
                    continue;
                }
            };
            
            let raw_type = get_raw_type(piece_type);
            let piece_color = crate::js_bridge::get_color_from_type(piece_type);
            
            // Find kings first for faster processing in second pass
            if raw_type == RAW_TYPE_KING {
                if piece_color == WHITE {
                    white_king_coords = Some(piece_coords);
                    // console log position
                } else {
                    black_king_coords = Some(piece_coords);
                }
            }
            
            // Calculate material value in single pass - use lookup table instead of match
            let piece_value = if raw_type < NUM_TYPES {
                piece_value_lookup[raw_type as usize]
            } else {
                0
            };
            
            // Track material balance directly
            if piece_color == WHITE {
                material_balance += piece_value;
                
                // Store piece by type for faster lookups later - using raw_type directly as index
                if raw_type < NUM_TYPES {
                    white_pieces_by_type[raw_type as usize].push(piece_coords);
                }
                
                // Track pawns separately for passed pawn evaluation
                if raw_type == RAW_TYPE_PAWN {
                    white_pawn_coords.push(piece_coords);
                }
                
                if raw_type == RAW_TYPE_KNIGHT {
                    white_knight_coords.push(piece_coords);
                }
                
                if raw_type == RAW_TYPE_BISHOP {
                    white_bishop_coords.push(piece_coords);
                }
                
                if raw_type == RAW_TYPE_ROOK {
                    white_rook_coords.push(piece_coords);
                }
                
                if raw_type == RAW_TYPE_QUEEN {
                    white_queen_coords.push(piece_coords);
                }
            } else {
                material_balance -= piece_value;
                
                if raw_type < NUM_TYPES {
                    black_pieces_by_type[raw_type as usize].push(piece_coords);
                }
                
                if raw_type == RAW_TYPE_PAWN {
                    black_pawn_coords.push(piece_coords);
                }
                
                if raw_type == RAW_TYPE_KNIGHT {
                    black_knight_coords.push(piece_coords);
                }
                
                if raw_type == RAW_TYPE_BISHOP {
                    black_bishop_coords.push(piece_coords);
                }
                
                if raw_type == RAW_TYPE_ROOK {
                    black_rook_coords.push(piece_coords);
                }
                
                if raw_type == RAW_TYPE_QUEEN {
                    black_queen_coords.push(piece_coords);
                }
            }
        }
    }
    
    // Initialize score with material balance
    let mut score = material_balance;
    
    // For infinite chess, centrality is relative to the position of other pieces,
    // not an absolute board center
    
    // Calculate center of mass for pieces to use as relative center
    let mut center_x = 0;
    let mut center_y = 0;
    let mut piece_count = 0;
    
    // Use pre-computed array length to avoid calling .length() in loop
    for i in 0..pieces_array_length {
        let coords_js = pieces_array.get(i);
        if let Some(coords) = crate::js_bridge::js_to_coords(&coords_js) {
            center_x += coords[0];
            center_y += coords[1];
            piece_count += 1;
        }
    }
    
    // Avoid division by zero
    if piece_count > 0 {
        center_x /= piece_count;
        center_y /= piece_count;
    }
    
    // Calculate average distance between pieces for scaling
    let mut sum_dist_sq = 0;
    let mut pair_count = 0;
    
    // Only sample a subset of pieces for performance
    let sample_size = core::cmp::min(20, pieces_array_length as usize);
    
    // Pre-allocate indices to avoid calculating in loop
    let mut sample_indices = [0u32; 20]; // Use fixed-size array on stack
    for j in 0..sample_size {
        sample_indices[j] = (j as u32 * pieces_array_length as u32 / sample_size as u32) as u32;
    }
    
    // Now use pre-computed indices
    for i in 0..sample_size {
        let i_idx = sample_indices[i];
        let coords_i_js = pieces_array.get(i_idx);
        if let Some(coords_i) = crate::js_bridge::js_to_coords(&coords_i_js) {
            for j in i+1..sample_size {
                let j_idx = sample_indices[j];
                let coords_j_js = pieces_array.get(j_idx);
                if let Some(coords_j) = crate::js_bridge::js_to_coords(&coords_j_js) {
                    sum_dist_sq += squared_distance(coords_i[0], coords_i[1], coords_j[0], coords_j[1]);
                    pair_count += 1;
                }
            }
        }
    }
    
    // Use piece density to scale distance-based evaluations
    let avg_dist_sq = if pair_count > 0 { sum_dist_sq / pair_count } else { 100 };
    
    // Second pass with SIMD-friendly approach
    // Process pieces in batches when possible (for CPU cache efficiency)
    
    // Process all knights in one go - using raw type as index
    if let Some(white_king_pos) = white_king_coords {
        if let Some(black_king_pos) = black_king_coords {
            // Knights evaluation
            for &coords in &white_knight_coords {
                let mut piece_score = 0;
                
                // Development bonus
                piece_score += if coords[1] != 1 { DEVELOPMENT_BONUS } else { 0 };
                
                // Centrality bonus - relative to piece center of mass
                let dist_sq_to_center = squared_distance(coords[0], coords[1], center_x, center_y);
                // Scale based on average piece distance
                let centrality_bonus = CENTRALITY_BONUS - (CENTRALITY_BONUS * dist_sq_to_center / (avg_dist_sq * 2));
                piece_score += core::cmp::max(0, centrality_bonus);
                
                // Distance to enemy king
                let dist_sq_to_king = squared_distance(
                    coords[0], coords[1], 
                    black_king_pos[0], black_king_pos[1]
                );
                
                // Better scaling for infinite board
                let dist_scale = core::cmp::min(avg_dist_sq, dist_sq_to_king);
                piece_score += (QUEEN_KNIGHT_PROXIMITY_BONUS / 3) - 
                              ((QUEEN_KNIGHT_PROXIMITY_BONUS / 3) * dist_scale) / avg_dist_sq;
                
                score += piece_score;
            }
            
            // Black knights
            for &coords in &black_knight_coords {
                let mut piece_score = 0;
                
                // Development bonus
                piece_score += if coords[1] != 8 { DEVELOPMENT_BONUS } else { 0 };
                
                // Centrality bonus
                let dist_sq_to_center = squared_distance(coords[0], coords[1], center_x, center_y);
                let centrality_bonus = CENTRALITY_BONUS - (CENTRALITY_BONUS * dist_sq_to_center / (avg_dist_sq * 2));
                piece_score += core::cmp::max(0, centrality_bonus);
                
                // Distance to enemy king
                let dist_sq_to_king = squared_distance(
                    coords[0], coords[1], 
                    white_king_pos[0], white_king_pos[1]
                );
                
                let dist_scale = core::cmp::min(avg_dist_sq, dist_sq_to_king);
                piece_score += (QUEEN_KNIGHT_PROXIMITY_BONUS / 3) - 
                              ((QUEEN_KNIGHT_PROXIMITY_BONUS / 3) * dist_scale) / avg_dist_sq;
                
                score -= piece_score;
            }
            
            // Queens evaluation - using same approach with raw type as index
            for &coords in &white_queen_coords {
                let mut piece_score = 0;
                
                // Development bonus
                piece_score += if coords[1] != 1 { DEVELOPMENT_BONUS } else { 0 };
                
                // Distance to enemy king with scaling for infinite board
                let dist_sq_to_king = squared_distance(
                    coords[0], coords[1], 
                    black_king_pos[0], black_king_pos[1]
                );
                
                let distance_scale = core::cmp::min(avg_dist_sq, dist_sq_to_king);
                piece_score += QUEEN_KNIGHT_PROXIMITY_BONUS - 
                              (QUEEN_KNIGHT_PROXIMITY_BONUS * distance_scale) / avg_dist_sq;
                
                // Back rank bonus - relative to king position
                let enemy_king_rank = black_king_pos[1];
                piece_score += if coords[1] >= enemy_king_rank { BACK_RANK_BONUS } else { 0 };
                
                score += piece_score;
            }
            
            // Black queens
            for &coords in &black_queen_coords {
                let mut piece_score = 0;
                
                // Development bonus
                piece_score += if coords[1] != 8 { DEVELOPMENT_BONUS } else { 0 };
                
                // Distance to enemy king
                let dist_sq_to_king = squared_distance(
                    coords[0], coords[1], 
                    white_king_pos[0], white_king_pos[1]
                );
                
                let distance_scale = core::cmp::min(avg_dist_sq, dist_sq_to_king);
                piece_score += QUEEN_KNIGHT_PROXIMITY_BONUS - 
                              (QUEEN_KNIGHT_PROXIMITY_BONUS * distance_scale) / avg_dist_sq;
                
                // Back rank bonus
                let enemy_king_rank = white_king_pos[1];
                piece_score += if coords[1] <= enemy_king_rank { BACK_RANK_BONUS } else { 0 };
                
                score -= piece_score;
            }
            
            // Development bonus for other pieces (Bishops, Rooks)
            for piece_type in [RAW_TYPE_BISHOP, RAW_TYPE_ROOK] {
                let piece_idx = piece_type as usize;
                
                // White pieces
                for &coords in &white_pieces_by_type[piece_idx] {
                    score += if coords[1] != 1 { DEVELOPMENT_BONUS } else { 0 };
                }
                
                // Black pieces
                for &coords in &black_pieces_by_type[piece_idx] {
                    score -= if coords[1] != 8 { DEVELOPMENT_BONUS } else { 0 };
                }
            }
        }
    }
    
    // Process pawns with advanced SIMD-friendly code
    
    // Evaluate white pawns
    for &pawn_coord in &white_pawn_coords {
        // Pawn advancement relative to starting position
        // For infinite chess, we need to use relative ranks based on kings
        let white_start_rank = if let Some(king) = white_king_coords { king[1] - 1 } else { 2 };
        let ranks_advanced = (pawn_coord[1] - white_start_rank).max(0);
        score += ranks_advanced * PAWN_RANK_BONUS;
        
        // Check if it's a passed pawn
        let is_passed = is_passed_pawn_infinite(pawn_coord, &black_pawn_coords, WHITE);
        score += (ranks_advanced * (PASSED_PAWN_RANK_BONUS - PAWN_RANK_BONUS)) * (is_passed as i32);
    }
    
    // Evaluate black pawns
    for &pawn_coord in &black_pawn_coords {
        let black_start_rank = if let Some(king) = black_king_coords { king[1] + 1 } else { 7 };
        let ranks_advanced = (black_start_rank - pawn_coord[1]).max(0);
        score -= ranks_advanced * PAWN_RANK_BONUS;
        
        // Check if it's a passed pawn
        let is_passed = is_passed_pawn_infinite(pawn_coord, &white_pawn_coords, BLACK);
        score -= (ranks_advanced * (PASSED_PAWN_RANK_BONUS - PAWN_RANK_BONUS)) * (is_passed as i32);
    }
    
    // King safety with pawn shield evaluation
    if let Some(king_pos) = white_king_coords {
        let pawn_shield_count = count_adjacent_pawns_infinite(king_pos, &white_pawn_coords);
        score += pawn_shield_count * PAWN_SHIELD_BONUS;
    }
    
    if let Some(king_pos) = black_king_coords {
        let pawn_shield_count = count_adjacent_pawns_infinite(king_pos, &black_pawn_coords);
        score -= pawn_shield_count * PAWN_SHIELD_BONUS;
    }
    
    // Return score from perspective of player to move with branchless optimization
    let player_turn = whos_turn.as_f64().unwrap_or(1.0) as i32;
    if player_turn == WHITE {
        score
    } else {
        -score
    }
}

/// Optimized passed pawn check for infinite chess
#[inline(always)]
fn is_passed_pawn_infinite(pawn_coords: [i32; 2], opponent_pawns: &[[i32; 2]], pawn_color: i32) -> bool {
    let file = pawn_coords[0];
    
    for &opp_coords in opponent_pawns {
        let opp_file = opp_coords[0];
        let opp_rank = opp_coords[1];
        
        // Same or adjacent file
        if (opp_file - file).abs() <= 1 {
            // Check if opponent pawn is ahead based on color
            if (pawn_color == WHITE && opp_rank > pawn_coords[1]) ||
               (pawn_color == BLACK && opp_rank < pawn_coords[1]) {
                return false;
            }
        }
    }
    true
}

/// Count adjacent pawns for king safety on infinite board
#[inline(always)]
fn count_adjacent_pawns_infinite(king_coords: [i32; 2], pawn_coords: &[[i32; 2]]) -> i32 {
    let mut count = 0;
    for &pawn_coord in pawn_coords {
        // Check if pawn is adjacent to king (max distance of 1 in any direction)
        let dist_x = (pawn_coord[0] - king_coords[0]).abs();
        let dist_y = (pawn_coord[1] - king_coords[1]).abs();
        
        // Branchless counting with boolean arithmetic
        count += (dist_x <= 1 && dist_y <= 1) as i32;
    }
    count
}