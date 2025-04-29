
/**
 * This script manages all annotations
 * * Squares
 * * Arrows
 * * Rays
 */

import drawsquares from "./drawsquares";
// @ts-ignore
import input from "../../../input";




function update() {
    drawsquares.update()

	// If middle mouse button is clicked, remove all highlights
    // TODO: Change this to left clicking an empty region of the board
	if (input.isMouseDown_Middle()) Collapse();
}

/**
 * CURRENT:
 * Erases all highlights.
 * 
 * PLANNED:
 * If there are any rays, we collapse their intersections into single highlights.
 */
function Collapse() {
    drawsquares.clearSquares();
}


function render() {
    update();

    drawsquares.render();
}

function onGameUnload() {
    drawsquares.clearSquares();
}



export default {
    render,
    onGameUnload,
}