
/**
 * This script stores an internal variable that keeps track of whether
 * anything visual has changed on-screen in the game this frame.
 * If nothing has, we can save compute by skipping rendering.
 * 
 * ZERO dependancies.
 */
const frametracker = (function() {
    
    /** Whether there has been a visual change on-screen the past frame. */
    let hasBeenVisualChange = true;


    /** The next frame will be rendered. Compute can be saved if nothing has visibly changed on-screen. */
    function onVisualChange() {
        hasBeenVisualChange = true;
    }

    /** true if there has been a visual change on-screen since last frame. */
    function doWeRenderNextFrame() {
        return hasBeenVisualChange;
    }

    /** Resets {@link hasBeenVisualChange} to false, to prepare for next frame. */
    function onFrameRender() {
        hasBeenVisualChange = false;
    }


    return Object.freeze({
        onVisualChange,
        doWeRenderNextFrame,
        onFrameRender,
    });

})();

export default frametracker;