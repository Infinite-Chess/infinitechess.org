
/*
 * This is the main script. This is where the game begins running when the document calls main()
 * This initiates the gl context, calls for the initiating of the shader programs, camera,
 * and input listeners, and begins the game loop.
 */

"use strict";

const main = (function(){ 

    /**
     * The version of the game code currently running.
     * If this is old, the server will instruct us to refresh.
     * 
     * THIS SHOULD ALWAYS MATCH config/convig/GAME_VERSION
     */
    const GAME_VERSION = "1.4"; // The current version of the game
    const devBuild = true // If true, the time when the main menu background stops moving is 2 seconds.
    const videoMode = false; // If true, doesn't render a few items, making recordings more immersive.

    
    let thisFrameChanged = true // Resets to false every frame. Is set to true if the screen changes at all during updating. This variable is to save cpu rendering when we don't need to redraw the screen. If true we will re-render the screen.
    let forceRender = false

    // Set to true when you need to force-calculate the mesh or legal move searching.
    // This will stop spreading it accross multiple frames and instead do it as fast as possible.
    let forceCalc = false

    /** The next frame will be rendered. Compute can be saved if nothing has visibly changed on-screen. */
    function renderThisFrame() {
        thisFrameChanged = true;
    }

    /** Enables the next render frame which NOTHING can prevent. (The pause menu pauses rendering) */
    function enableForceRender() {
        forceRender = true;
    }

    function gforceCalc() {
        return forceCalc;
    }

    function sforceCalc(value) {
        forceCalc = value;
    }

    // Called after document is loaded. Starts the app.
    function start() {
        guiloading.closeAnimation(); // Stops the loading screen animation
        webgl.init(); // Initiate the WebGL context. This is our web-based render engine.
        shaders.initPrograms(); // Initiates the few shader programs we will be using. The most common we'll be using is the textureProgram, but we also create a shader program for color, and another for tinted textures.
        camera.init(); // Initiates the matrixes (uniforms) of our shader programs: viewMatrix (Camera), projMatrix (Projection), worldMatrix (world translation)

        browsersupport.checkBrowserSupport();

        game.init(); // Initiates textures, buffer models for rendering, and the title screen.

        initListeners()

        onlinegame.askServerIfWeAreInGame();

        localstorage.eraseExpiredItems();

        gameLoop(); // Update & draw the scene repeatedly
    }

    function initListeners() {
        input.initListeners() // Mouse, touch, & key event listeners

        window.addEventListener('beforeunload', function() {
            // console.log('Detecting unload')

            // This allows us to control the reason why the socket was closed.
            // "1000 Closed by client" instead of "1001 Endpoint left"
            websocket.closeSocket();

            memberHeader.deleteToken();
            
            invites.deleteInviteTagInLocalStorage();
            localstorage.eraseExpiredItems();
        });
    }

    function gameLoop() {

        const loop = function (runtime) {
            loadbalancer.update(runtime); // Updates fps, delta time, etc..
    
            game.update(); // Always update the game, even if we're afk. By FAR this is less resource intensive than rendering!
    
            render(); // Render everything
            
            input.resetKeyEvents(); // Key events should be reset as soon as possible after updating, so we don't miss any. Then again, all events are fired at the end of the animation frame anyway.

            loadbalancer.timeAnimationFrame(); // This will time how long this frame took to animate
    
            // Loop again while app is running. This automatically won't be called more times than your screen can refresh per second.
            requestAnimationFrame(loop)
        }
    
        requestAnimationFrame(loop); // Calls the very first frame. Subsequent loops are called in the loop() function
    }

    function render() {
        if (forceRender) thisFrameChanged = true;
        if (!thisFrameChanged) return; // Only render the world though if any visual on the screen changed! This is to save cpu when there's no page interaction or we're afk.
        forceRender = false;

        // console.log("Rendering this frame")

        webgl.clearScreen() // Clear the color buffer and depth buffers
        game.render()

        thisFrameChanged = false; // Reset to false for next frame
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text)
          .then(() => { console.log('Copied to clipboard') })
          .catch((error) => { console.error('Failed to copy to clipboard', error) })
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }


    return Object.freeze({
        GAME_VERSION,
        devBuild,
        videoMode,
        gforceCalc, // get
        renderThisFrame,
        enableForceRender,
        sforceCalc, // set
        start,
        copyToClipboard,
        sleep
    });
})();


/**
 * With a very short and fast-to-type name, prints
 * a deep-cloned copy of the object to the console.
 * @param {string} message - The message to log.
 * @param {*} object - The object to deep clone and print.
 * @throws {Error} Throws an error if the message is not provided.
 */
function a(message, object) {
    if (!message) throw new Error("Cannot log an object without a message");
    console.log(message);
    console.log(math.deepCopyObject(object));
}

/**
 * With a very short and fast-to-type name, prints
 * an error to the console so you can see the trace.
 */
function b() {
    console.error("Generic error")
}
