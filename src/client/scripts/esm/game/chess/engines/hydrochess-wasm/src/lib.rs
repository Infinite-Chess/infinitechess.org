// Main entry point for the WASM chess engine
use wasm_bindgen::prelude::*;

pub mod js_bridge;
pub mod engine;
pub mod evaluation;
pub mod tt;

#[wasm_bindgen(start)]
pub fn start() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

// Export the find_best_move function to JavaScript
#[wasm_bindgen(js_name = "find_best_move")]
pub fn wasm_find_best_move(game_data: JsValue) -> JsValue {
    // Call the internal implementation
    engine::find_best_move(&game_data)
}