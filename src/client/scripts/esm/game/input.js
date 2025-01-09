
// Import Start
import guipause from './gui/guipause.js';
import bufferdata from './rendering/bufferdata.js';
import onlinegame from './misc/onlinegame.js';
import perspective from './rendering/perspective.js';
import movement from './rendering/movement.js';
import options from './rendering/options.js';
import selection from './chess/selection.js';
import camera from './rendering/camera.js';
import board from './rendering/board.js';
import arrows from './rendering/arrows.js';
import { createModel } from './rendering/buffermodel.js';
import jsutil from '../util/jsutil.js';
import space from './misc/space.js';
import frametracker from './rendering/frametracker.js';
import docutil from '../util/docutil.js';
import gameslot from './chess/gameslot.js';
// Import End

"use strict";

/**
 * This script handles all our event listeners for our input actions,
 * and keeps track of what inputs were received every frame.
 */

const overlayElement = document.getElementById('overlay'); // <div> element overtop the canvas. This is what detects all clicks and touches.

const leftMouseKey = 0; // Input key index for when the left mouse button is pressed.
const middleMouseKey = 1; // Input key index for when the left mouse button is pressed.
const rightMouseKey = 2; // Input key index for when the left mouse button is pressed.

/** Touchscreen */
let touchDowns = []; // List of all touch points created this frame. Position is in pixels from screen center.  { id, x, y, changeInX, changeInY }
const touchHelds = []; // List of all currently active touch points.  { id, x, y, changeInX, changeInY }

let touchClicked = false; // Was there a finger tap this frame? Simulates a mouse click if a touch point was released quickly. We need to simulate mouse clicks from taps because on mobile we have to distinguish screen-drags from tapping pieces to select.
const touchClickedDelaySeconds = 0.12; // Time a touch must be lifted within to simulate a mouse click from the tap.
let timeTouchDownSeconds; // Also used to detect quick taps. Records the time when touch was created. If the touch is released before touchClickedDelaySeconds is up, simulate a mouse click from the touch.
let touchClickedTile; // Used to record the board position of the tap to simulate a click.  {id, x, y}
let touchClickedWorld; // Same as above, but records world space instead of tile

/** Mouse */
let mouseDowns = []; // Mouse buttons that were pressed this frame.  0 = Left  1 = Middle  2 = Right
const mouseHelds = []; // Mouse buttons that are currently being held.
let keyDowns = []; // Keyboard keys that were pressed this frame.
const keyHelds = []; // Keyboard keys that are currently being held.
let mouseWheel = 0; // Amount scroll-wheel scrolled this frame.

let mouseClicked = false; // Was there a simulated mouse click?
const mouseClickedDelaySeconds = 0.4; // Default: 0.12   Time the mouse must be lifted within to simulate a mouse click
let timeMouseDownSeconds; // Records the time when mouse down was initiated
let mouseClickedTile; // [x,y]  The tile where the simulated mouse clicked clicked.
let mouseClickedPixels; // [x,y] The screen coords where the simulated mouse clicked clicked.
const pixelDistToCancelClick = 10; // Default: 12   If the mouse moves more than this while down, don't simulate a click

let mousePos = [0,0]; // Current mouse position in pixels relative to the center of the screen.
const mousePosHistory = []; // Mouse position last few frames. Required for mouse velocity calculation.
const mousePosHIstoryWindowMillis = 80; // The amount of seconds to look back into for mouse velocity calculation.
let mouseMoved = true; // Did the mouse move this frame? Helps us detect if the user is afk. (If they are we can save computation)
let mouseVel = [0,0]; // The amount of pixels the mouse moved relative to the last few frames.

let mouseWorldLocation = [0,0]; // Current mouse position in world-space

// This is currently used to prevent board dragging when you click on the navigation bars.
let ignoreMouseDown = false;

let mouseIsSupported = true;

/** Touchscreen and mouse */
/**
 * True if the most recent pointer input was from a touch event.
 * Used on devices that support both touchscreen and mouse to determine which is currently in use. @type {boolean}
*/
let pointerIsTouch;
let pointerWorldLocation = [0,0];

// The cursor that appears on touch screen when you select a piece and zoom out
const dampeningToMoveMouseInTouchMode = 0.5;
const percOfScreenMouseCanGo = 0.4;
const mouseInnerWidth = 0;
const mouseOuterWidth = 6.5;
const mouseOpacity = 0.5;


function getTouchHelds() {
	return touchHelds;
}

function getTouchClicked() {
	return touchClicked;
}

function getTouchClickedTile() {
	return touchClickedTile;
}

function getTouchClickedWorld() {
	return touchClickedWorld;
}

function getMouseWheel() {
	return mouseWheel;
}

function getMouseClickedTile() {
	return mouseClickedTile;
}

function getMouseClicked() {
	return mouseClicked;
}

function getMousePos() {
	return [mousePos[0], mousePos[1]];
}

function getMouseMoved() {
	return mouseMoved;
}

function getMouseWorldLocation() {
	return [mouseWorldLocation[0], mouseWorldLocation[1]];
}

function getPointerDown() {
	return pointerIsTouch ? touchDowns.length === 1 : mouseDowns.includes(leftMouseKey);
}

function getPointerHeld() {
	return pointerIsTouch ? touchHelds.length === 1 : mouseHelds.includes(leftMouseKey);
}

function getPointerClicked() {
	return pointerIsTouch ? touchClicked : mouseClicked;
}

function getPointerClickedTile() {
	return pointerIsTouch ? [touchClickedTile.x, touchClickedTile.y] : mouseClickedTile;
}

function getPointerWorldLocation() {
	return [pointerWorldLocation[0], pointerWorldLocation[1]];
}

function getPointerIsTouch() {
	return pointerIsTouch;
}


// Called within the main() function
function initListeners() {
	initListeners_Touch();
	initListeners_Mouse();
	initListeners_Keyboard();

	overlayElement.addEventListener("contextmenu", (event) => {
		event = event || window.event;
		// Context menu on discord icon doesnt work
		const isOverlay = event.target.id === 'overlay';
		if (isOverlay) event.preventDefault(); // Stop the contextual (right-click) menu from popping up.
	});

	checkIfMouseNotSupported();
}

function checkIfMouseNotSupported() {
	if (docutil.isMouseSupported()) return;
    
	// Mouse not supported
    
	mouseIsSupported = false;
	console.log("Mouse is not supported on this device. Disabling perspective mode.");

	guipause.getelement_perspective().classList.add('opacity-0_5');
}

function initListeners_Touch() {

	overlayElement.addEventListener('touchstart', (event) => {
		if (perspective.getEnabled()) return;
		event = event || window.event;

		// NEED preventDefault() to prevent Chrome swipe down to refresh, swipe from left to go back, and prevent 5fps when pinch zooming!!
		// ... But only preventDefault() if the target is NOT a button!
		// Context menu on discord icon doesnt work
		// const isButton = typeof event.target.className !== 'string' || event.target.className.includes('button');
		const isButton = typeof event.target.className === 'string' && event.target.className.includes('button');
		const clickedOverlay = event.target.id === 'overlay';
		// Can't prevent default if there hasn't been atleast one user gesture,
		// because then the browser never thinks there's been a user gesture,
		// so it never allows the audio context to play sound.
		// if (!isButton && htmlscript.hasUserGesturedAtleastOnce()) event.preventDefault()
		if (clickedOverlay) event.preventDefault();


		if (ignoreMouseDown) return;

		pushTouches(event.changedTouches);

		calcMouseWorldLocation();
		board.recalcTiles_FingersOver();
		initTouchSimulatedClick();
	});

	overlayElement.addEventListener('touchmove', (event) => {
		if (perspective.getEnabled()) return;
		event = event || window.event;
		const touches = event.changedTouches;
		for (let i = 0; i < touches.length; i++) {
			const thisTouch = touches[i];
			const touchCoords = convertCoords_CenterOrigin(thisTouch);
			touchHelds_UpdateTouch(thisTouch.identifier, touchCoords);
		}
		calcMouseWorldLocation();
	});

	overlayElement.addEventListener('touchend', callback_TouchPointEnd);

	overlayElement.addEventListener('touchcancel', callback_TouchPointEnd);
}

function pushTouches(touches) {
	for (let i = 0; i < touches.length; i++) {
		const thisTouch = touches[i];
		const touchCoords = convertCoords_CenterOrigin(thisTouch);
		const touch = {
			id: thisTouch.identifier,
			x: touchCoords[0],
			y: touchCoords[1],
			changeInX: 0,
			changeInY: 0
		};
		touchDowns.push(touch);
		touchHelds.push(touch);
	}
}

function initTouchSimulatedClick() {
	// If it is the only (first) touch, start the timer of when a simulated click is registered
	if (touchHelds.length === 1 && !touchClicked) {
		timeTouchDownSeconds = new Date().getTime() / 1000;
		const touchTile = board.gtileCoordsOver(touchHelds[0].x, touchHelds[0].y).tile_Int;
		touchClickedTile = { id: touchHelds[0].id, x: touchTile[0], y: touchTile[1] };
		const oneOrNegOne = perspective.getIsViewingBlackPerspective() ? -1 : 1;
		touchClickedWorld = [oneOrNegOne * space.convertPixelsToWorldSpace_Virtual(touchHelds[0].x), oneOrNegOne * space.convertPixelsToWorldSpace_Virtual(touchHelds[0].y)];
		if (!isMouseHeld_Left()) {
			pointerWorldLocation = touchClickedWorld;
			pointerIsTouch = true;
		}
	}
}

// Returns mouse/touch screen coords with the origin in the center instead of the corner.
function convertCoords_CenterOrigin(object) { // object is the event, or touch object
	// From canvas bottom left
	const rawX = object.clientX - camera.getCanvasRect().left;
	const rawY = -(object.clientY - camera.getCanvasRect().top);
	const canvasPixelWidth = camera.canvas.width / window.devicePixelRatio; // In virtual pixels, NOT physical
	const canvasPixelHeight = camera.canvas.height / window.devicePixelRatio; // In virtual pixels, NOT physical
	// in pixels, relative to screen center
	return [rawX - canvasPixelWidth / 2, rawY + canvasPixelHeight / 2];
}

// Events call this when a touch point is lifted or cancelled
function callback_TouchPointEnd(event) {
	event = event || window.event;
	const touches = event.changedTouches;
	for (let i = 0; i < touches.length; i++) {
		touchHelds_DeleteTouch(touches[i].identifier);

		if (ignoreMouseDown) return;

		// If that was the touch we're testing to simulate a click... simulate a click!
		if (touches[i].identifier === touchClickedTile?.id) {
			const nowSeconds = new Date().getTime() / 1000;
			const timePassed = nowSeconds - timeTouchDownSeconds;
			if (timePassed < touchClickedDelaySeconds) {
				touchClicked = true; // Simulate click
				// console.log('simulating click..')
			}
		}
	}
}

// Updates the specified touch's coords in touchHelds
function touchHelds_UpdateTouch(id, touchCoords) {
	for (let i = 0; i < touchHelds.length; i++) {
		const thisTouch = touchHelds[i];
		if (thisTouch.id !== id) continue; // No match, on to the next touch!

		// Increase the changeInXY since the last time we reset them
		thisTouch.changeInX += touchCoords[0] - thisTouch.x;
		thisTouch.changeInY += touchCoords[1] - thisTouch.y;
		thisTouch.x = touchCoords[0];
		thisTouch.y = touchCoords[1];
	}
	if (touchHelds.length === 1 && pointerIsTouch) {
		const oneOrNegOne = perspective.getIsViewingBlackPerspective() ? -1 : 1;
		pointerWorldLocation = [oneOrNegOne * space.convertPixelsToWorldSpace_Virtual(touchHelds[0].x), oneOrNegOne * space.convertPixelsToWorldSpace_Virtual(touchHelds[0].y)];
	}
}

function touchHelds_DeleteTouch(id) {

	for (let i = 0; i < touchHelds.length; i++) {
		const thisTouch = touchHelds[i];
		if (thisTouch.id === id) { // Match, update it's position
			touchHelds.splice(i, 1);
			break;
		}
	}
    
	// Also remove it from touchDowns if it exists. Low chance, but on occasion when we add and remove a touch on the same frame, it is left in the touchDowns but is not found in touchHelds which produces errors.
	for (let i = 0; i < touchDowns.length; i++) {
		const thisTouch = touchDowns[i];
		if (thisTouch.id === id) { // Match, update it's position
			touchDowns.splice(i, 1);
			break;
		}
	}
}

function initListeners_Mouse() {

	// While the mouse is moving, this is called ~250 times per second O.O
	// AND SAFARI calls this 600 TIMES! This increases the sensitivity of the mouse in perspective
	window.addEventListener('mousemove', (event) => {
		event = event || window.event;
		// We need to re-render if the mouse ever moves because rendering methods test if the mouse is hovering over
		// pieces to change their opacity. The exception is if we're paused.
		const renderThisFrame = !guipause.areWePaused() && (arrows.getMode() !== 0 || movement.isScaleLess1Pixel_Virtual() || selection.isAPieceSelected() || perspective.getEnabled());
		if (renderThisFrame) frametracker.onVisualChange();
		
		pointerIsTouch = false;
		
		const mouseCoords = convertCoords_CenterOrigin(event);
		mousePos = mouseCoords;
		mouseMoved = true;
		const now = Date.now();
		pushMousePosToHistory(now, mousePos);
		recalcMouseVel(now, mousePos);

		// Now calculate the mouse position in world-space, not just virtual pixels
		calcMouseWorldLocation();
		calcCrosshairWorldLocation();

		// If we're in perspective, mouse movement should rotate the camera
		perspective.update(event.movementX, event.movementY); // Pass in the change in mouse coords

		// This line, whenever the mouse moves offscreen,
		// triggers the board to be dropped, instead of continuously
		// being held and dragged, even when your mouse is off the page.
		// if (isMouseOffScreen(event)) mouseHelds.length = 0;
	});

	overlayElement.addEventListener('wheel', (event) => {
		addMouseWheel(event);
	});

	// This wheel event is ONLY for perspective mode, and it attached to the document instead of overlay, because that is what the mouse is locked to.
	document.addEventListener('wheel', (event) => {
		if (!perspective.getEnabled()) return;
		if (!perspective.isMouseLocked()) return;
		addMouseWheel(event);
	});

	overlayElement.addEventListener("mousedown", (event) => {
		// We clicked with the mouse, so make the simulated touch click undefined.
		// This makes things work with devices that have both a mouse and touch.
		touchClicked = false;
		touchClickedWorld = undefined;

		if (ignoreMouseDown) return;

		if (event.target.id === 'overlay') event.preventDefault();
		// if (clickedOverlay) gui.makeOverlayUnselectable();
        
		pushMouseDown(event);

		// Update mouse world location
		// WE CAN'T WAIT FOR NEXT frame when the 'mousemove' event is fired!
		// WE MUST recalculate it's position when we receive the 'mousedown' event!
		calcMouseWorldLocation();
		calcCrosshairWorldLocation();
		// Update tile mouse over as well!!!
		board.recalcTile_MouseCrosshairOver();

		if (event.button === 0) initMouseSimulatedClick(); // Left mouse button
	});

	// This mousedown event is ONLY for perspective mode, and it attached to the document instead of overlay!
	document.addEventListener("mousedown", (event) => {
		event = event || window.event;
		if (!perspective.getEnabled()) return;
		if (!perspective.isMouseLocked()) return;
		pushMouseDown(event);

		if (event.button === 0) initMouseSimulatedClick(); // Left mouse button
	});

	overlayElement.addEventListener("mouseup", (event) => {
		event = event || window.event;
		// gui.makeOverlaySelectable();
		removeMouseHeld(event);
		setTimeout(perspective.relockMouse, 1); // 1 millisecond, to give time for pause listener to fire

		if (event.button === 0) executeMouseSimulatedClick(); // Left mouse button
	});

	// This mouseup event is ONLY for perspective mode, and it attached to the document instead of overlay!
	document.addEventListener("mouseup", (event) => {
		event = event || window.event;
		if (!perspective.getEnabled()) return;
		if (!perspective.isMouseLocked()) return;
		removeMouseHeld(event);

		executeMouseSimulatedClick();
	});

	// window.addEventListener('blur', function() {
	// 	// Clear all keys being held, as when the window isn't in focus,
	// 	// we don't hear the key-up events.
	// 	// So if we held down the shift key, then click off, then let go,
	// 	// the game would CONTINUOUSLY keep zooming in without you pushing anything,
	// 	// and you'd have to push the shift again to cancel it.
	// 	mouseHelds.length = 0;
	// });
}

/**
 * Detects if, by the provided 'mousemove' event,
 * whether the mouse is now offscreen.
 * @param {Event} mouseMoveEvent - The event fired from a 'mousemove' event listener.
 * @returns {boolean} true if the mouse is now off the screen.
 */
function isMouseOffScreen(mouseMoveEvent) {
	const mouseX = mouseMoveEvent.clientX;
	const mouseY = mouseMoveEvent.clientY;
	return mouseX < 0 || mouseX > window.innerWidth || mouseY < 0 || mouseY > window.innerHeight;
}

function initMouseSimulatedClick() {
	if (mouseClicked) return;
	if (guipause.areWePaused()) return;
	if (perspective.getEnabled() && !perspective.isMouseLocked()) return;

	// Start the timer of when a simulated click is registered
    
	timeMouseDownSeconds = new Date().getTime() / 1000;
	mouseClickedTile = space.convertWorldSpaceToCoords_Rounded(mouseWorldLocation);
	mouseClickedPixels = mousePos;
}

function executeMouseSimulatedClick() {
	if (!timeMouseDownSeconds || !mouseIsSupported) return;
	// THIS PREVENTS A BUG THAT RANDOMLY SELECTS A PIECE AS SOON AS YOU START A GAME
	if (gameslot.areWeLoading()) return;

	// See if the mouse was released fast enough to simulate a click!
	const nowSeconds = new Date().getTime() / 1000;
	const timePassed = nowSeconds - timeMouseDownSeconds;
	if (timePassed > mouseClickedDelaySeconds) return; // Don't simulate click

	// Is the mouse too far away from it's starting click position?

	const dx = mousePos[0] - mouseClickedPixels[0];
	const dy = mousePos[1] - mouseClickedPixels[1];
	const d = Math.hypot(dx, dy);
	if (d > pixelDistToCancelClick) return; // Don't simulate click
    
	mouseClicked = true; // Simulate click
}

function calcMouseWorldLocation() {
	if (perspective.isMouseLocked()) return;

	// I NEED isMouseDown_Left() here because EVEN IF WE'RE ON touchscreen,
	// tapping buttons will trigger the document to fire the mouse down event!!!
	// So even with a touchscreen, we still need to calculate the position of the MOUSE event, not finger!
	if (isMouseSupported() || isMouseDown_Left()) calcMouseWorldLocation_Mouse();
	else calcMouseWorldLocation_Touch();
}

function calcMouseWorldLocation_Mouse() {
	// Need this for black's perspective to work in orthographic mode?
	const n = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	// const n = 1;
        
	const halfCanvasWidth = camera.getCanvasWidthVirtualPixels() / 2;
	const halfCanvasHeight = camera.getCanvasHeightVirtualPixels() / 2;
	const boundingBoxToUse = options.isDebugModeOn() ? camera.getScreenBoundingBox(true) : camera.getScreenBoundingBox(false);
	const mouseLocationX = (n * mousePos[0] / halfCanvasWidth) * boundingBoxToUse.right;
	const mouseLocationY = (n * mousePos[1] / halfCanvasHeight) * boundingBoxToUse.top;
	mouseWorldLocation = [mouseLocationX, mouseLocationY];
	if (!pointerIsTouch) pointerWorldLocation = mouseWorldLocation;
}

// We're using a touch screen, SETS THE mouse location to [0,0]!!!
function calcMouseWorldLocation_Touch() {
	// By default it's already [0,0]
	// But it will move around by itself if we don't do this
	if (selection.isAPieceSelected() && movement.isScaleLess1Pixel_Virtual()) return;
	mouseWorldLocation = [0,0];
}

// Calculates what square the crosshair is looking at
function calcCrosshairWorldLocation() {
	if (!perspective.isMouseLocked()) return;

	const rotX = (Math.PI / 180) * perspective.getRotX();
	const rotZ = (Math.PI / 180) * perspective.getRotZ();
    
	// Calculate intersection point
	const hyp = -Math.tan(rotX) * camera.getPosition()[2];

	// x^2 + y^2 = hyp^2
	// hyp = sqrt( x^2 + y^2 )

	const x = hyp * Math.sin(rotZ);
	const y = hyp * Math.cos(rotZ);

	mouseWorldLocation = [x, y];
	if (!pointerIsTouch) pointerWorldLocation = mouseWorldLocation;
}

function addMouseWheel(event) {
	mouseWheel += event.deltaY; // Add to amount scroll wheel has scrolled this frame
}

function pushMouseDown(event) {
	const button = event.button;
	mouseDowns.push(button);
	if (mouseHelds.indexOf(button) === -1) mouseHelds.push(button);
}

function removeMouseHeld(event) {
	const index = mouseHelds.indexOf(event.button);
	if (index !== -1) mouseHelds.splice(index, 1); // Removes the key
}

function initListeners_Keyboard() {

	document.addEventListener("keydown", (event) => {
		event = event || window.event;
		const key = event.key.toLowerCase();
		keyDowns.push(key);
		if (keyHelds.indexOf(key) === -1) keyHelds.push(key);
        
		if (event.key === 'Tab') event.preventDefault();
	});

	document.addEventListener("keyup", (event) => {
		event = event || window.event;
		const index = keyHelds.indexOf(event.key.toLowerCase());
		if (index !== -1) keyHelds.splice(index, 1); // Removes the key
	});

	window.addEventListener('blur', function() {
		// Clear all keys being held, as when the window isn't in focus,
		// we don't hear the key-up events.
		// So if we held down the shift key, then click off, then let go,
		// the game would CONTINUOUSLY keep zooming in without you pushing anything,
		// and you'd have to push the shift again to cancel it.
		keyHelds.length = 0;
	});
}

function update() {
	resetKeyEvents();
	recalcMouseVel(Date.now());
}

// Erase all key down events after updating game, called at the end of every frame from the game loop.
function resetKeyEvents() {
	touchDowns = []; // Touch points created this frame
	touchClicked = false; // Tap-simulated click this frame
	mouseDowns = []; // Mouse clicks this frame
	mouseWheel = 0; // Amount scrolled this frame
	mouseClicked = false; // Amount scrolled this frame
	keyDowns = []; // Key presses this frame
	mouseMoved = false; // Has the mouse moved this frame?

	ignoreMouseDown = false;
}

function pushMousePosToHistory(now, mousePos) {
	// Store the current mouse position with a timestamp
	const currentMousePosEntry = [jsutil.deepCopyObject(mousePos), now]; // { mousePos, time }
	mousePosHistory.push(currentMousePosEntry); // Deep copy the mouse position to avoid modifying the original
}

/**
 * Calculates the mouse velocity based on recent mouse positions.
 * @param {number[]} mousePos - The current mouse position
 */
function recalcMouseVel(now) {
	// Remove old entries, stop once we encounter recent enough data
	const timeToRemoveEntriesBefore = now - mousePosHIstoryWindowMillis;
	while (mousePosHistory.length > 0 && mousePosHistory[0][1] < timeToRemoveEntriesBefore) mousePosHistory.shift();

	const latestMousePosEntry = mousePosHistory[mousePosHistory.length - 1];

	// Calculate velocity if there are at least two positions
	if (mousePosHistory.length >= 2) {
		const firstMousePosEntry = mousePosHistory[0]; // { mousePos, time }
		const timeDiffBetwFirstAndLastEntryMillis = (latestMousePosEntry[1] - firstMousePosEntry[1]);

		const mVX = (latestMousePosEntry[0][0] - firstMousePosEntry[0][0]) / timeDiffBetwFirstAndLastEntryMillis;
		const mVY = (latestMousePosEntry[0][1] - firstMousePosEntry[0][1]) / timeDiffBetwFirstAndLastEntryMillis;

		mouseVel = [mVX, mVY];
	} else mouseVel = [0, 0];
}

function getMouseVel() {
	return mouseVel;
}

// Returns true if the touch point with specified id exists
function touchHeldsIncludesID(touchID) {
	for (let i = 0; i < touchHelds.length; i++) {
		if (touchHelds[i].id === touchID) return true;
	} return false;
}

// Returns the touch point with specified id in the format: { id, x, y }
function getTouchHeldByID(touchID) {
	for (let i = 0; i < touchHelds.length; i++) {
		if (touchHelds[i].id === touchID) return touchHelds[i];
	}
	console.log('touchHelds does not contain desired touch object!');
}

function atleast1TouchDown() {
	return touchDowns.length > 0;
}

function atleast1TouchHeld() {
	return touchHelds.length > 0;
}

function isMouseDown_Left() {
	return mouseDowns.includes(leftMouseKey);
}

function isMouseDown_Right() {
	return mouseDowns.includes(rightMouseKey);
}

function removeMouseDown_Left() {
	jsutil.removeObjectFromArray(mouseDowns, leftMouseKey);
}

function isMouseHeld_Left() {
	return mouseHelds.includes(leftMouseKey);
}

function isKeyDown(keyName) {
	return keyDowns.includes(keyName);
}

function atleast1KeyDown() {
	return keyDowns.length > 0;
}

function atleast1KeyHeld() {
	return keyHelds.length > 0;
}

function isKeyHeld(keyName) {
	return keyHelds.includes(keyName);
}

function atleast1InputThisFrame() {
	// This is annoying when we accidentally hold a key and unfocus the page, then it remains holding down
	// and I have no clue what key is preventing us from entering AFK mode!
	//return gmouseMoved() || atleast1TouchDown() || atleast1KeyHeld();
	// return getMouseMoved() || atleast1KeyDown();
	return getMouseMoved() || atleast1TouchDown() || atleast1TouchHeld() || atleast1KeyDown();
}

function doIgnoreMouseDown(event) {
	// event = event || window.event;
	ignoreMouseDown = true;
}

function isMouseSupported() {
	return mouseIsSupported;
}

function renderMouse() {
	if (mouseIsSupported) return;
	if (!selection.isAPieceSelected()) return;
	if (!movement.isScaleLess1Pixel_Virtual()) return; // Not zoomed out, don't render the mouse!
	const [ x, y ] = mouseWorldLocation;

	const mouseInnerWidthWorld = space.convertPixelsToWorldSpace_Virtual(mouseInnerWidth);
	const mouseOuterWidthWorld = space.convertPixelsToWorldSpace_Virtual(mouseOuterWidth);

	const mouseData = bufferdata.getDataRingSolid(x, y, mouseInnerWidthWorld, mouseOuterWidthWorld, 32, [0,0,0,mouseOpacity]);

	const model = createModel(mouseData, 2, "TRIANGLES", true);

	model.render();
}

// Call when using a touch-screen and we are panning, have a piece selected, and we're zoomed out.
// This adjusts the position of the virtual mouse
function moveMouse(touch1, touch2) { // touch2 optional. If provided, will take the average movement
	if (!selection.isAPieceSelected() || !movement.isScaleLess1Pixel_Virtual()) {
		// We're not zoomed out and we don't have a piece selected,
		// DON'T MOVE the virtual mouse off [0,0]!
		setTouchesChangeInXYTo0(touch1);
		if (touch2) setTouchesChangeInXYTo0(touch2);
		return;
	}

	let touchMovementX = space.convertPixelsToWorldSpace_Virtual(touch1.changeInX);
	let touchMovementY = space.convertPixelsToWorldSpace_Virtual(touch1.changeInY);

	if (touch2) {
		const touch2movementX = space.convertPixelsToWorldSpace_Virtual(touch2.changeInX);
		const touch2movementY = space.convertPixelsToWorldSpace_Virtual(touch2.changeInY);
		touchMovementX = (touchMovementX + touch2movementX) / 2;
		touchMovementY = (touchMovementY + touch2movementY) / 2;
		setTouchesChangeInXYTo0(touch2);
	}

	const oneOrNegOne = onlinegame.areInOnlineGame() && onlinegame.areWeColor('black') ? -1 : 1;

	mouseWorldLocation[0] -= touchMovementX * dampeningToMoveMouseInTouchMode * oneOrNegOne;
	mouseWorldLocation[1] -= touchMovementY * dampeningToMoveMouseInTouchMode * oneOrNegOne;
	setTouchesChangeInXYTo0(touch1);
	capMouseDistance();
}

// On touchscreens, makes sure the cursor doesn't move outside a ring
function capMouseDistance() {
	// const distance = 3;
	const distance = camera.getScreenBoundingBox().right * percOfScreenMouseCanGo;

	const hyp = Math.hypot(mouseWorldLocation[0], mouseWorldLocation[1]);

	if (hyp < distance) return;

	const ratio = distance / hyp;

	mouseWorldLocation[0] *= ratio;
	mouseWorldLocation[1] *= ratio;
}

function setTouchesChangeInXYTo0(touch) {
	touch.changeInX = 0;
	touch.changeInY = 0;
}

export default {
	getTouchHelds,
	atleast1TouchDown,
	getTouchClicked,
	isMouseDown_Left,
	isMouseDown_Right,
	removeMouseDown_Left,
	getTouchClickedTile,
	getTouchClickedWorld,
	isMouseHeld_Left,
	isKeyDown,
	atleast1KeyHeld,
	isKeyHeld,
	getMouseWheel,
	getMouseClickedTile,
	getMouseClicked,
	getMousePos,
	getMouseMoved,
	doIgnoreMouseDown,
	isMouseSupported,
	initListeners,
	update,
	getMouseVel,
	touchHeldsIncludesID,
	getTouchHeldByID,
	getMouseWorldLocation,
	atleast1InputThisFrame,
	renderMouse,
	moveMouse,
	getPointerDown,
	getPointerHeld,
	getPointerClicked,
	getPointerClickedTile,
	getPointerWorldLocation,
	getPointerIsTouch
};