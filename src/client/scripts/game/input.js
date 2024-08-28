
// This script handles all our event listeners for our input actions,
// and keeps track of what inputs were received every frame.

"use strict";

const input = (function() {

    const overlayElement = document.getElementById('overlay'); // <div> element overtop the canvas. This is what detects all clicks and touches.

    const leftMouseKey = 0; // Input key index for when the left mouse button is pressed.
    const middleMouseKey = 1; // Input key index for when the left mouse button is pressed.
    const rightMouseKey = 2; // Input key index for when the left mouse button is pressed.

    let touchDowns = []; // List of all touch points created this frame. Position is in pixels from screen center.  { id, x, y, changeInX, changeInY }
    const touchHelds = []; // List of all currently active touch points.  { id, x, y, changeInX, changeInY }

    let touchClicked = false; // Was there a finger tap this frame? Simulates a mouse click if a touch point was released quickly. We need to simulate mouse clicks from taps because on mobile we have to distinguish screen-drags from tapping pieces to select.
    const touchClickedDelaySeconds = 0.12; // Time a touch must be lifted within to simulate a mouse click from the tap.
    let timeTouchDownSeconds; // Also used to detect quick taps. Records the time when touch was created. If the touch is released before touchClickedDelaySeconds is up, simulate a mouse click from the touch.
    let touchClickedTile; // Used to record the board position of the tap to simulate a click.  {id, x, y}
    let touchClickedWorld; // Same as above, but records world space instead of tile

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
    let mouseMoved = true; // Did the mouse move this frame? Helps us detect if the user is afk. (If they are we can save computation)

    let mouseWorldLocation = [0,0]; // Current mouse position in world-space

    // This is currently used to prevent board dragging when you click on the navigation bars.
    let ignoreMouseDown = false;

    let mouseIsSupported = true;

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


    // Called within the main() function
    function initListeners() {

        window.addEventListener("resize", camera.onScreenResize );

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
        // "pointer: coarse" are devices will less pointer accuracy (not "fine" like a mouse)
        // See W3 documentation: https://www.w3.org/TR/mediaqueries-4/#mf-interaction
        if (window.matchMedia("(pointer: fine)").matches) return;
        
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
            touchClickedWorld = [oneOrNegOne * math.convertPixelsToWorldSpace_Virtual(touchHelds[0].x), oneOrNegOne * math.convertPixelsToWorldSpace_Virtual(touchHelds[0].y)];
        }
    }

    // Returns mouse/touch screen coords with the origin in the center instead of the corner.
    function convertCoords_CenterOrigin(object) { // object is the event, or touch object
        // From canvas bottom left
        const rawX = object.clientX - camera.getCanvasRect().left;
        const rawY = -(object.clientY - camera.getCanvasRect().top);
        const canvasPixelWidth = camera.canvas.width / camera.getPixelDensity(); // In virtual pixels, NOT physical
        const canvasPixelHeight = camera.canvas.height / camera.getPixelDensity(); // In virtual pixels, NOT physical
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
            if (renderThisFrame) main.renderThisFrame();
            
            const mouseCoords = convertCoords_CenterOrigin(event);
            mousePos = mouseCoords;
            mouseMoved = true;

            // Now calculate the mouse position in world-space, not just virtual pixels
            calcMouseWorldLocation();
            calcCrosshairWorldLocation();

            // If we're in perspective, mouse movement should rotate the camera
            perspective.update(event.movementX, event.movementY); // Pass in the change in mouse coords
        });

        overlayElement.addEventListener('wheel', (event) => {
            event = event || window.event;
            addMouseWheel(event);
        });

        // This wheel event is ONLY for perspective mode, and it attached to the document instead of overlay!
        document.addEventListener('wheel', (event) => {
            event = event || window.event;
            if (!perspective.getEnabled()) return;
            if (!perspective.isMouseLocked()) return;
            addMouseWheel(event);
        });

        overlayElement.addEventListener("mousedown", (event) => {
            event = event || window.event;
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
    }

    function initMouseSimulatedClick() {
        if (mouseClicked) return;
        if (guipause.areWePaused()) return;
        if (perspective.getEnabled() && !perspective.isMouseLocked()) return;

        // Start the timer of when a simulated click is registered
        
        timeMouseDownSeconds = new Date().getTime() / 1000;
        mouseClickedTile = math.convertWorldSpaceToCoords_Rounded(mouseWorldLocation);
        mouseClickedPixels = mousePos;
    }

    function executeMouseSimulatedClick() {
        if (!timeMouseDownSeconds) return;
        if (!mouseIsSupported) return;

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
        if (input.isMouseSupported() || input.isMouseDown_Left()) calcMouseWorldLocation_Mouse();
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
        math.removeObjectFromArray(mouseDowns, leftMouseKey);
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

        const mouseInnerWidthWorld = math.convertPixelsToWorldSpace_Virtual(mouseInnerWidth);
        const mouseOuterWidthWorld = math.convertPixelsToWorldSpace_Virtual(mouseOuterWidth);

        const mouseData = bufferdata.getDataRingSolid(x, y, mouseInnerWidthWorld, mouseOuterWidthWorld, 32, 0, 0, 0, mouseOpacity);
        const data32 = new Float32Array(mouseData);

        const model = buffermodel.createModel_Colored(data32, 2, "TRIANGLES");

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

        let touchMovementX = math.convertPixelsToWorldSpace_Virtual(touch1.changeInX);
        let touchMovementY = math.convertPixelsToWorldSpace_Virtual(touch1.changeInY);

        if (touch2) {
            const touch2movementX = math.convertPixelsToWorldSpace_Virtual(touch2.changeInX);
            const touch2movementY = math.convertPixelsToWorldSpace_Virtual(touch2.changeInY);
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

    return Object.freeze({
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
        resetKeyEvents,
        touchHeldsIncludesID,
        getTouchHeldByID,
        getMouseWorldLocation,
        atleast1InputThisFrame,
        renderMouse,
        moveMouse
    });

})();