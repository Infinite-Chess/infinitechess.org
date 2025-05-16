
/**
 * This script prepares our game.
 * 
 * And contains our main update() and render() methods
 */



import gameloader from './gameloader.js';
import gui from '../gui/gui.js';
import highlights from '../rendering/highlights/highlights.js';
import gameslot from './gameslot.js';
import guinavigation from '../gui/guinavigation.js';
import pieces from '../rendering/pieces.js';
import guititle from '../gui/guititle.js';
import droparrows from '../rendering/dragging/droparrows.js';
import onlinegame from '../misc/onlinegame/onlinegame.js';
import arrows from '../rendering/arrows/arrows.js';
import clock from '../../chess/logic/clock.js';
import animation from '../rendering/animation.js';
import draganimation from '../rendering/dragging/draganimation.js';
import selection from './selection.js';
import arrowlegalmovehighlights from '../rendering/arrows/arrowlegalmovehighlights.js';
import { CreateInputListener, InputListener } from '../input.js';
import boarddrag from '../rendering/boarddrag.js';
import boardpos from '../rendering/boardpos.js';
import controls from '../misc/controls.js';
import frametracker from '../rendering/frametracker.js';
import annotations from '../rendering/highlights/annotations/annotations.js';
import snapping from '../rendering/highlights/snapping.js';
import selectedpiecehighlightline from '../rendering/highlights/selectedpiecehighlightline.js';
// @ts-ignore
import invites from '../misc/invites.js';
// @ts-ignore
import guiclock from '../gui/guiclock.js';
// @ts-ignore
import board from '../rendering/board.js';
// @ts-ignore
import webgl from '../rendering/webgl.js';
// @ts-ignore
import perspective from '../rendering/perspective.js';
// @ts-ignore
import transition from '../rendering/transition.js';
// @ts-ignore
import promotionlines from '../rendering/promotionlines.js';


// Variables -------------------------------------------------------------------------------


const element_overlay: HTMLElement = document.getElementById('overlay')!;
/** The input listener for the overlay element */
let listener_overlay: InputListener;
/** The input listener for the document element */
let listener_document: InputListener;


// Functions -------------------------------------------------------------------------------


function init() {
	listener_overlay = CreateInputListener(element_overlay, { keyboard: false });
	listener_document = CreateInputListener(document);

	board.updateTheme();
	board.recalcVariables(); // Variables dependant on the board position & scale

	gui.prepareForOpen();

	guititle.open();
}

// Update the game every single frame
function update() {
	controls.testOutGameToggles();
	invites.update();
	// Any input should trigger the next frame to render.
	if (listener_document.atleastOneInput() || listener_overlay.atleastOneInput()) frametracker.onVisualChange();
	if (gameloader.areWeLoadingGame()) return; // If the game isn't totally finished loading, nothing is visible, only the loading animation.

	const gamefile = gameslot.getGamefile();
	const mesh = gameslot.getMesh();
	if (!gamefile) return boardpos.update(); // On title screen. Updates the board's position and scale according to its velocity; // 

	// There is a gamefile, update everything board-related...

	controls.testInGameToggles(gamefile, mesh);

	perspective.update(); // Update perspective camera according to mouse movement

	const timeWinner = clock.update(gamefile);
	if (timeWinner && !onlinegame.areInOnlineGame()) { // undefined if no clock has ran out
		gamefile.gameConclusion = `${timeWinner} time`;
		gameslot.concludeGame();
	}
	guiclock.update(gamefile);

	controls.updateNavControls(); // Update board dragging, and WASD to move, scroll to zoom
	boardpos.update(); // Updates the board's position and scale according to its velocity

	boarddrag.dragBoard(); // Calculate new board position if it's being dragged. After updateNavControls(), executeArrowShifts(), boardpos.update
	// BEFORE board.recalcVariables(), as that needs to be called after the board position is updated.
	transition.update();
	// AFTER boarddrag.dragBoard() or picking up the board has a spring back effect to it
	// AFTER:transition.update() since that updates the board position
	board.recalcVariables();

	// NEEDS TO BE AFTER animation.update() because this updates droparrows.ts and that needs to overwrite animations.
	// BEFORE selection.update(), since this may forward to front, which changes all arrows visible.
	selection.update();
	// NEEDS TO BE AFTER guinavigation.update(), because otherwise arrows.js may think we are hovering
	// over a piece from before forwarding/rewinding a move, causing a crash.
	arrows.update();
	// NEEDS TO BE AFTER arrows.update() !!! Because this modifies the arrow indicator list.
	// NEEDS TO BE BEFORE boarddrag.checkIfBoardGrabbed() because that shift arrows needs to overwrite this.
	animation.update();
	draganimation.updateDragLocation(); // BEFORE droparrows.shiftArrows() so that can overwrite this.
	droparrows.shiftArrows(); // Shift the arrows of the dragged piece AFTER selection.update() makes any moves made!
	arrows.executeArrowShifts(); // Execute any arrow modifications made by animation.js or arrowsdrop.js. Before arrowlegalmovehighlights.update(), dragBoard()
	
	arrowlegalmovehighlights.update(); // After executeArrowShifts()

	// BEFORE annotations.update() since adding new highlights snaps to what mini image is being hovered over.
	// NEEDS TO BE BEFORE checkIfBoardDragged(), because clicks should prioritize teleporting to miniimages over dragging the board!
	// AFTER: boardpos.dragBoard(), because whether the miniimage are visible or not depends on our updated board position and scale.
	snapping.teleportToEntitiesIfClicked(); // AFTER snapping.updateEntitiesHovered()
	snapping.teleportToSnapIfClicked();
	// AFTER snapping.updateEntitiesHovered(), since adding/removing depends on current hovered entities.
	annotations.update();

	// AFTER snapping.updateSnapping(), since clicking on a highlight line should claim the click that would other wise collapse all annotations.
	annotations.testIfCollapsed();
	// AFTER: selection.update(), animation.update() because shift arrows needs to overwrite that.
	// After entities.updateEntitiesHovered() because clicks prioritize those.
	boarddrag.checkIfBoardGrabbed();

	gameloader.update(); // Updates whatever game is currently loaded.

	guinavigation.updateElement_Coords(); // Update the division on the screen displaying your current coordinates

	// preferences.update(); // ONLY USED for temporarily micro adjusting theme properties & colors
}

function render() {
	if (gameloader.areWeLoadingGame()) return; // If the game isn't totally finished loading, nothing is visible, only the loading animation.

	board.render(); // Renders the infinite checkerboard

	const gamefile = gameslot.getGamefile();
	const mesh = gameslot.getMesh();
	if (!gamefile) return; // No gamefile, on the selection menu. Only render the checkerboard and nothing else.

	/**
	 * What is the order of rendering?
	 * 
	 * Board tiles
	 * Highlights
	 * Pieces
	 * Arrows
	 * Crosshair
	 */

	// Using depth function "ALWAYS" means we don't have to render with a tiny z offset
	webgl.executeWithDepthFunc_ALWAYS(() => {
		selectedpiecehighlightline.render();
		highlights.render(gamefile);
		snapping.render(); // Renders ghost image or glow dot over snapped point on highlight lines.
		animation.renderTransparentSquares(); // Required to hide the piece currently being animated
		draganimation.renderTransparentSquare(); // Required to hide the piece currently being animated
	});
    
	// The rendering of the pieces needs to use the normal depth function, because the
	// rendering of currently-animated pieces needs to be blocked by animations.
	pieces.renderPiecesInGame(gamefile, mesh);
	
	// Using depth function "ALWAYS" means we don't have to render with a tiny z offset
	webgl.executeWithDepthFunc_ALWAYS(() => {
		animation.renderAnimations();
		promotionlines.render();
		selection.renderGhostPiece(); // If not after pieces.renderPiecesInGame(), wont render on top of existing pieces
		draganimation.renderPiece();
		arrows.render();
		annotations.render_abovePieces();
		perspective.renderCrosshair();
	});
}



export default {
	init,
	update,
	render,
};

export {
	listener_overlay,
	listener_document,
};