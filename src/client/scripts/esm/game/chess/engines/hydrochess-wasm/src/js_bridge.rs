use wasm_bindgen::prelude::*;
use js_sys::{Array, Function, Object, Reflect};
use web_sys::console;
use crate::engine::SearchData;

// ===== External JavaScript function declarations =====
#[wasm_bindgen(module = "/js_bridge.js")]
extern "C" {
    // Board utility functions
    #[wasm_bindgen(js_name = "getPieceFromCoords")]
    pub fn get_piece_from_coords(pieces: &JsValue, coords: &JsValue) -> JsValue;
    
    #[wasm_bindgen(js_name = "getCoordsOfAllPieces")]
    pub fn get_coords_of_all_pieces_external(pieces: &JsValue) -> JsValue;
    
    #[wasm_bindgen(js_name = "getTypeFromCoords")]
    pub fn get_type_from_coords_external(pieces: &JsValue, coords: &JsValue) -> JsValue;
    
    #[wasm_bindgen(js_name = "getPieceCountOfGame")]
    pub fn get_piece_count_of_game(game: &JsValue) -> JsValue;
    
    // Type utility functions
    #[wasm_bindgen(js_name = "getColorFromType")]
    pub fn get_color_from_type_external(piece_type: i32) -> i32;
    
    #[wasm_bindgen(js_name = "getRawType")]
    pub fn get_raw_type(piece_type: i32) -> i32;
    
    #[wasm_bindgen(js_name = "buildType")]
    pub fn build_type(raw_type: i32, player: i32) -> i32;
    
    #[wasm_bindgen(js_name = "invertPlayer")]
    pub fn invert_player(player: i32) -> i32;

    #[wasm_bindgen(js_name = "getLegalMoves")]
    pub fn generate_legal_moves_external(game: &JsValue, player: i32) -> JsValue;

    // Special flag handling
    #[wasm_bindgen(js_name = "transferSpecialFlags")]
    pub fn transfer_special_flags(end_coords: &JsValue, move_draft: &JsValue) -> JsValue;
    
    #[wasm_bindgen(js_name = "ttProbe")]
    pub fn tt_probe(game: &JsValue, tt: &JsValue, alpha: i32, beta: i32, depth: i32, ply: i32) -> JsValue;

    #[wasm_bindgen(js_name = "ttStore")]
    pub fn tt_store(game: &JsValue, tt: &JsValue, depth: i32, ply: i32, flag: i32, score: i32, best_move: &JsValue);

    // Move ordering
    #[wasm_bindgen(js_name = "orderMovesJs")]
    pub fn order_moves_js_import(moves: &JsValue, game: &JsValue, best_move: &JsValue) -> JsValue;
    
    // Capture move filtering
    #[wasm_bindgen(js_name = "filterCaptureMovesJs")]
    pub fn filter_capture_moves_js_import(moves: &JsValue, game: &JsValue) -> JsValue;
    
    // Move generation
    #[wasm_bindgen(js_name = "generateMoveJs")]
    pub fn generate_move_js_import(game: &JsValue, move_draft: &JsValue) -> JsValue;

    // Move making/unmaking
    #[wasm_bindgen(js_name = "makeMove")]
    pub fn make_move_js_import(game: &JsValue, mov: &JsValue) -> JsValue;
    
    #[wasm_bindgen(js_name = "rewindMove")]
    pub fn rewind_move_js_import(game: &JsValue) -> JsValue;

    // Null move functionality
    #[wasm_bindgen(js_name = "makeNullMove")]
    pub fn make_null_move_js_import(game: &JsValue) -> JsValue;

    // History score management
    #[wasm_bindgen(js_name = "decayHistoryScores")]
    pub fn decay_history_scores_external(history_table: &JsValue) -> JsValue;

    // Miscellaneous
    #[wasm_bindgen(js_name = "getPlayerTurn")]
    pub fn get_player_turn(game: &JsValue) -> i32;
}

/// Convert coordinates to a JS array
pub fn coords_to_js(coords: &[i32; 2]) -> JsValue {
    let js_array = js_sys::Array::new();
    js_array.push(&JsValue::from_f64(coords[0] as f64));
    js_array.push(&JsValue::from_f64(coords[1] as f64));
    js_array.into()
}

/// Convert JavaScript coordinates to Rust array
pub fn js_to_coords(coords_js: &JsValue) -> Option<[i32; 2]> {
    if coords_js.is_null() || coords_js.is_undefined() {
        return None;
    }
    
    // First try array format [x, y]
    if js_sys::Array::is_array(coords_js) {
        let array = js_sys::Array::from(coords_js);
        if array.length() >= 2 {
            let x_val = array.get(0);
            let y_val = array.get(1);
            
            // Try to convert to numbers
            if let (Some(x), Some(y)) = (x_val.as_f64(), y_val.as_f64()) {
                return Some([x.round() as i32, y.round() as i32]);
            }
        }
    }
    
    // Fallback to object format {x:..., y:...}
    let x_result = Reflect::get(coords_js, &JsValue::from_str("x"));
    let y_result = Reflect::get(coords_js, &JsValue::from_str("y"));
    
    if let (Ok(x_val), Ok(y_val)) = (x_result, y_result) {
        if let (Some(x), Some(y)) = (x_val.as_f64(), y_val.as_f64()) {
            return Some([x.round() as i32, y.round() as i32]);
        }
    }
    
    None
}

/// Evaluate a move (calling the JS function)
pub fn evaluate_move_js(game: &JsValue, move_draft: &JsValue) -> i32 {
    let result = js_sys::Function::new_with_args(
        "game, move",
        r#"
        if (typeof scoreMove === 'function') { 
            return scoreMove(game, move); 
        } else { 
            console.error('scoreMove function not found'); 
            return 0; 
        }
        "#
    ).call2(&JsValue::NULL, game, move_draft)
    .unwrap_or_else(|_| JsValue::from_f64(0.0));
    
    result.as_f64().unwrap_or(0.0) as i32
}

/// Make a null move (just switch player turn)
pub fn make_null_move(game: &JsValue) -> JsValue {
    make_null_move_js_import(game)
}

/// Make a move on the game and return the new game state
pub fn make_move_js(game: &JsValue, mov: &JsValue) -> JsValue {
    make_move_js_import(game, mov)
}

/// Rewind (undo) a move
pub fn rewind_move_js(game: &JsValue) -> JsValue {
    rewind_move_js_import(game)
}

/// Decay history scores, an important part of the search algorithm
pub fn decay_history_scores_js(history_table: &JsValue) -> JsValue {
    decay_history_scores_external(history_table)
}

/// Order moves for better alpha-beta pruning
pub fn order_moves_js(moves: &JsValue, game: &JsValue, data: &mut SearchData, tt_move: &JsValue) -> js_sys::Array {
    // Create a temporary JS object to hold search data
    let js_data = js_sys::Object::new();
    Reflect::set(&js_data, &JsValue::from_str("ply"), &JsValue::from_f64(data.ply as f64)).unwrap();
    
    let follow_pv = if data.follow_pv { JsValue::TRUE } else { JsValue::FALSE };
    let score_pv = if data.score_pv { JsValue::TRUE } else { JsValue::FALSE };
    
    Reflect::set(&js_data, &JsValue::from_str("followPV"), &follow_pv).unwrap();
    Reflect::set(&js_data, &JsValue::from_str("scorePV"), &score_pv).unwrap();
    
    // Convert data to JS values and call the imported JS function
    let result = order_moves_js_import(moves, game, tt_move);
    
    // Update search data from JS
    if let Ok(js_follow_pv) = Reflect::get(&js_data, &JsValue::from_str("followPV")) {
        data.follow_pv = js_follow_pv.is_truthy();
    }
    
    if let Ok(js_score_pv) = Reflect::get(&js_data, &JsValue::from_str("scorePV")) {
        data.score_pv = js_score_pv.is_truthy();
    }
    
    js_sys::Array::from(&result)
}

/// Filter to get only capture moves
pub fn filter_capture_moves_js(moves: &JsValue, game: &JsValue) -> js_sys::Array {
    js_sys::Array::from(&filter_capture_moves_js_import(moves, game))
}

/// Generate a move from a draft - main implementation
pub fn generate_move(game: &JsValue, move_draft: &JsValue) -> JsValue {
    generate_move_js_import(game, move_draft)
}

/// Generate legal moves for the given game and player
pub fn generate_legal_moves_js(game: &JsValue, player: i32) -> JsValue {
    generate_legal_moves_external(game, player)
}

/// Get coordinates of piece at the given coordinates
pub fn get_type_from_coords_js(pieces: &JsValue, coords: &JsValue) -> JsValue {
    get_type_from_coords_external(pieces, coords)
}

/// Get coordinates of all pieces
pub fn get_coords_of_all_pieces(game: &JsValue) -> js_sys::Array {
    // Try with error handling to avoid panics
    match std::panic::catch_unwind(|| {
        get_coords_of_all_pieces_external(game)
    }) {
        Ok(result) => js_sys::Array::from(&result),
        Err(_) => {
            // Return empty array as fallback
            js_sys::Array::new()
        }
    }
}

/// Get the color of a piece from its type
pub fn get_color_from_type(piece_type: i32) -> i32 {
    const NUM_TYPES: i32 = 22;
    
    // Use floor division to exactly match JavaScript's Math.floor behavior
    return ((piece_type as f64) / (NUM_TYPES as f64)).floor() as i32;
}
