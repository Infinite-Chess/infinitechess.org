
// src/client/scripts/esm/game/boardeditor/tools/selection.ts

/**
 * The Selection Tool for the Board Editor
 * 
 * Acts similarly to that of Google Sheets
 */

import stoolgraphics from "./stoolgraphics";


function update(): void {

}

function render(): void {
	// For now render the outline of the rank and file hovered over,
	// until we implement state for beginning a selection.
	stoolgraphics.outlineRankAndFile();
}


export default {
	update,
	render,
};